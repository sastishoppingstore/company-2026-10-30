<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\VerifyOtpRequest;
use App\Models\DeliveryProof;
use App\Models\DriverIssue;
use App\Models\DriverLocation;
use App\Models\Order;
use App\Models\User;
use App\Notifications\DeliveryReceivedNotification;
use App\Notifications\OrderStatusNotification;
use App\Services\OrderWorkflow;
use App\Services\OtpService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;

class DriverController extends Controller
{
    public function __construct(private OrderWorkflow $workflow, private OtpService $otps) {}

    public function jobs(Request $request)
    {
        $driver = $request->user();

        return response()->json([
            'offers' => Order::where('status', 'OFFERED')->get()
                ->filter(fn ($o) => in_array($driver->id, $o->offered_driver_ids ?? [], true))->values(),
            'active' => Order::where('assigned_driver_id', $driver->id)
                ->whereIn('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_SHOP', 'OTP_VERIFIED'])->get(),
            'history' => Order::where('assigned_driver_id', $driver->id)
                ->whereIn('status', ['DELIVERED', 'CANCELLED'])->latest()->limit(20)->get(),
        ]);
    }

    public function show(Request $request, Order $order)
    {
        abort_unless($order->isVisibleTo($request->user()), 403);

        return response()->json([
            'order' => $order,
            'shop' => $order->shop,
            'receiver' => $order->receiver,
            'files' => $order->proofs,
            'trail' => $order->locations()->limit(50)->get(),
        ]);
    }

    public function accept(Request $request, Order $order)
    {
        $driver = $request->user();
        abort_unless($order->status === 'OFFERED', 409, 'This job is no longer open.');
        abort_unless(in_array($driver->id, $order->offered_driver_ids ?? [], true), 403, 'This job was not offered to you.');

        $order->forceFill([
            'status' => 'ACCEPTED',
            'assigned_driver_id' => $driver->id,
            'offered_driver_ids' => [$driver->id],
            'accepted_at' => now(),
        ])->save();

        $this->notifyCompany($order, "Driver assigned · {$order->order_code}", "{$driver->name} accepted your delivery to {$order->shop_name}.");

        return response()->json(['order' => $order->fresh(), 'message' => 'Job accepted.']);
    }

    public function decline(Request $request, Order $order)
    {
        $driver = $request->user();
        abort_unless($order->status === 'OFFERED', 409, 'This job can no longer be declined.');

        $remaining = array_values(array_filter($order->offered_driver_ids ?? [], fn ($id) => $id !== $driver->id));
        $order->forceFill([
            'offered_driver_ids' => $remaining,
            'status' => $remaining ? 'OFFERED' : 'PENDING_ASSIGNMENT',
        ])->save();

        return response()->json(['message' => 'Offer declined.']);
    }

    public function pickup(Request $request, Order $order)
    {
        $this->assertAssigned($request, $order);
        abort_unless($order->status === 'ACCEPTED', 409, 'The bag can only be picked up after the job is accepted.');

        $order->forceFill(['status' => 'PICKED_UP', 'picked_up_at' => now()])->save();
        $this->notifyCompany($order, "Bag picked up · {$order->order_code}", "Collected from {$order->pickup_address}.");

        return response()->json(['order' => $order->fresh()]);
    }

    public function startTrip(Request $request, Order $order)
    {
        $this->assertAssigned($request, $order);
        abort_unless($order->status === 'PICKED_UP', 409, 'Start the trip after the bag is picked up.');

        $order->forceFill(['status' => 'IN_TRANSIT', 'departed_at' => now()])->save();
        $this->notifyCompany($order, "On the way · {$order->order_code}", 'Live tracking is active.');

        return response()->json(['order' => $order->fresh()]);
    }

    public function arrive(Request $request, Order $order)
    {
        $this->assertAssigned($request, $order);
        abort_unless($order->status === 'IN_TRANSIT', 409, 'Mark arrival after the trip has started.');

        $order->forceFill(['status' => 'ARRIVED_AT_SHOP', 'arrived_at' => now()])->save();
        $this->otps->issue($order, 'delivery_verification', 'sms', $order->receiver_phone);

        $this->notifyCompany($order, "Driver at shop · {$order->order_code}", 'Waiting for the receiver delivery code.');

        return response()->json(['order' => $order->fresh()]);
    }

    public function location(Request $request, Order $order)
    {
        $this->assertAssigned($request, $order);
        $data = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
            'accuracy' => ['nullable', 'numeric'],
            'heading' => ['nullable', 'numeric'],
            'speed' => ['nullable', 'numeric'],
            'battery' => ['nullable', 'integer'],
        ]);

        DriverLocation::create($data + [
            'order_id' => $order->id,
            'driver_id' => $request->user()->id,
            'recorded_at' => now(),
        ]);

        $order->forceFill(['last_location_at' => now()])->save();

        // Broadcast to the company + admin apps (WebSocket / Pusher / Soketi).
        broadcast(new \App\Events\DriverLocationUpdated($order->id, (float) $data['lat'], (float) $data['lng']));

        return response()->json(['message' => 'Location updated.']);
    }

    public function verifyOtp(VerifyOtpRequest $request, Order $order)
    {
        $this->assertAssigned($request, $order);
        abort_unless($order->status === 'ARRIVED_AT_SHOP', 409, 'Verify the delivery code after arriving at the shop.');

        $otp = $this->otps->verify($order, 'delivery_verification', $request->otp);
        $order->forceFill(['status' => 'OTP_VERIFIED', 'otp_verified_at' => $otp->verified_at])->save();

        return response()->json([
            'order' => $order->fresh(),
            'message' => 'Delivery code verified. Capture the proof to complete the handover.',
        ]);
    }

    public function deliver(Request $request, Order $order)
    {
        $this->assertAssigned($request, $order);
        abort_unless($order->status === 'OTP_VERIFIED', 409, 'Verify the delivery code before completing the handover.');

        $data = $request->validate([
            'receiver_name' => ['required', 'string', 'min:2', 'max:120'],
            'signature' => ['required', 'string', 'min:32'],
            'photo' => ['required', 'string', 'min:32'],
        ]);

        $expiresAt = now()->addHours((int) config('rna.proof_link_ttl_hours', 48));
        $token = hash_hmac('sha256', "proof|{$order->id}|{$expiresAt->toIso8601String()}", config('app.key'));

        DB::transaction(function () use ($order, $data, $expiresAt, $token) {
            foreach (['signature' => 'signature', 'photo' => 'delivery_photo'] as $field => $kind) {
                [$mime, $body] = explode(';', $data[$field], 2);
                $contents = base64_decode(explode(',', $body)[1] ?? '');
                $key = "{$order->id}/{$kind}.png";
                Storage::disk(config('rna.proof_disk'))->put($key, $contents);

                DeliveryProof::create([
                    'order_id' => $order->id, 'company_id' => $order->company_id, 'kind' => $kind,
                    'name' => "{$kind}-{$order->order_code}.png", 'mime' => str_replace('data:', '', $mime),
                    'size' => strlen($contents), 'storage_key' => $key,
                ]);
            }

            $order->forceFill([
                'status' => 'DELIVERED',
                'delivered_at' => now(),
                'receiver_name' => $data['receiver_name'],
                'proof_expires_at' => $expiresAt,
                'proof_token' => $expiresAt->getTimestamp().'.'.$token,
            ])->save();
        });

        $admins = User::where('role', 'admin')->get();
        Notification::send($admins, new DeliveryReceivedNotification($order));
        Notification::send(User::where('company_id', $order->company_id)->get(), new DeliveryReceivedNotification($order));

        return response()->json(['order' => $order->fresh(), 'message' => 'Delivery completed and proof saved.']);
    }

    public function reportIssue(Request $request, Order $order)
    {
        $this->assertAssigned($request, $order);
        $data = $request->validate([
            'type' => ['required', 'in:vehicle_breakdown,traffic,address_issue,receiver_unavailable,damage,other'],
            'description' => ['required', 'string', 'min:5', 'max:500'],
        ]);

        DriverIssue::create($data + [
            'order_id' => $order->id, 'company_id' => $order->company_id,
            'driver_id' => $request->user()->id, 'status' => 'open',
        ]);

        $order->forceFill(['status' => 'ADMIN_REVIEW', 'previous_status' => $order->status])->save();

        return response()->json(['order' => $order->fresh(), 'message' => 'Issue reported.']);
    }

    /** Drivers may never cancel an accepted job. */
    public function cancel(Request $request, Order $order)
    {
        $this->assertAssigned($request, $order);

        return response()->json([
            'message' => 'Drivers cannot cancel an accepted job. Use "Report an issue" and the Super Admin will reassign the delivery.',
            'errors' => ['status' => ['driver cancellation not permitted']],
        ], 409);
    }

    private function assertAssigned(Request $request, Order $order): void
    {
        abort_unless($order->assigned_driver_id === $request->user()->id, 403, 'This job is assigned to another driver.');
    }

    private function notifyCompany(Order $order, string $title, string $body): void
    {
        Notification::send(User::where('company_id', $order->company_id)->get(), new OrderStatusNotification($order, 'status', ['title' => $title, 'body' => $body]));
    }
}
