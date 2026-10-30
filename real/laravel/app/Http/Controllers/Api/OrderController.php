<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreOrderRequest;
use App\Http\Requests\VerifyOtpRequest;
use App\Models\Order;
use App\Models\OrderEvent;
use App\Models\Shop;
use App\Models\ShopReceiver;
use App\Models\User;
use App\Services\OrderWorkflow;
use App\Services\OtpService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

class OrderController extends Controller
{
    public function __construct(private OrderWorkflow $workflow, private OtpService $otps) {}

    public function index(Request $request)
    {
        $user = $request->user();
        $query = Order::query()->forCompany($user->company_id);

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }
        if ($request->filled('priority') && $request->priority !== 'all') {
            $query->where('priority', $request->priority);
        }
        if ($request->filled('shop_id')) {
            $query->where('shop_id', $request->shop_id);
        }
        if ($request->filled('search')) {
            $search = '%'.$request->search.'%';
            $query->where(fn ($q) => $q->where('order_code', 'like', $search)
                ->orWhere('shop_name', 'like', $search)
                ->orWhere('receiver_name', 'like', $search));
        }
        if ($request->filled('from')) {
            $query->where('created_at', '>=', $request->from);
        }
        if ($request->filled('to')) {
            $query->where('created_at', '<=', $request->to.' 23:59:59');
        }

        $page = $query->orderByDesc('created_at')->paginate(min(100, (int) $request->input('per_page', 15)));

        return response()->json([
            'data' => $page->items(),
            'meta' => [
                'total' => $page->total(),
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'last_page' => $page->lastPage(),
            ],
        ]);
    }

    public function store(StoreOrderRequest $request)
    {
        $user = $request->user();
        $shop = Shop::findOrFail($request->shop_id);
        $receiver = ShopReceiver::findOrFail($request->receiver_id);

        abort_unless($receiver->shop_id === $shop->id, 422, 'The receiver is not registered for this shop.');
        abort_if($shop->status !== 'active', 422, 'This shop is not accepting deliveries.');

        $pickup = [
            'lat' => (float) ($request->pickup_lat ?? 18.5642),
            'lng' => (float) ($request->pickup_lng ?? 73.7767),
        ];
        $distance = $this->haversine($pickup, ['lat' => $shop->lat, 'lng' => $shop->lng]);

        $order = DB::transaction(function () use ($request, $user, $shop, $receiver, $pickup, $distance) {
            $order = Order::create([
                'order_code' => User::nextOrderCode(),
                'company_id' => $user->company_id,
                'shop_id' => $shop->id,
                'shop_name' => $shop->name,
                'shop_code' => $shop->code,
                'created_by' => $user->id,
                'status' => 'DRAFT',
                'priority' => $request->priority,
                'pickup_address' => $request->pickup_address,
                'pickup_lat' => $pickup['lat'],
                'pickup_lng' => $pickup['lng'],
                'destination_address' => $shop->address,
                'dest_lat' => $shop->lat,
                'dest_lng' => $shop->lng,
                'receiver_id' => $receiver->id,
                'receiver_name' => $receiver->name,
                'receiver_phone' => $receiver->phone,
                'receiver_email' => $receiver->email,
                'item_description' => $request->item_description,
                'quantity' => $request->quantity,
                'weight_kg' => $request->weight_kg,
                'special_instructions' => $request->special_instructions ?? '',
                'requested_delivery_at' => $request->requested_delivery_at,
                'authorized_contact_name' => $request->authorized_contact_name,
                'authorized_contact_phone' => $request->authorized_contact_phone,
                'offered_driver_ids' => [],
                'distance_km' => $distance,
                'eta_minutes' => (int) round($distance * 4.2),
            ]);

            OrderEvent::create([
                'order_id' => $order->id, 'company_id' => $order->company_id, 'type' => 'order_created',
                'actor_id' => $user->id, 'actor_name' => $user->name, 'actor_role' => $user->role,
                'message' => "Order created for {$shop->name}", 'meta' => [],
            ]);

            return $order;
        });

        return response()->json(['order' => $order], 200);
    }

    public function show(Request $request, Order $order)
    {
        abort_unless($order->isVisibleTo($request->user()), 403, 'You are not allowed to access this order.');

        return response()->json([
            'order' => $order,
            'driver' => $order->driver,
            'events' => $order->events,
            'files' => $order->proofs,
            'shop' => $order->shop,
            'receiver' => $order->receiver,
            'permissions' => $this->permissions($request->user(), $order),
        ]);
    }

    public function timeline(Request $request, Order $order)
    {
        abort_unless($order->isVisibleTo($request->user()), 403);

        return response()->json(['data' => $order->events]);
    }

    public function track(Request $request, Order $order)
    {
        abort_unless($order->isVisibleTo($request->user()), 403);
        $location = $order->locations()->latest('recorded_at')->first();

        return response()->json([
            'order' => $order,
            'driver' => $order->driver,
            'location' => $location,
            'gps' => [
                'status' => $location ? 'live' : 'unavailable',
                'last_update' => $location?->recorded_at,
                'accuracy' => $location?->accuracy,
                'permission' => $location ? 'granted' : 'unknown',
            ],
            'route' => [
                'pickup' => ['label' => $order->pickup_address, 'lat' => $order->pickup_lat, 'lng' => $order->pickup_lng],
                'destination' => ['label' => $order->destination_address, 'lat' => $order->dest_lat, 'lng' => $order->dest_lng],
            ],
            'trail' => $order->locations()->limit(50)->get()->map(fn ($l) => ['lat' => $l->lat, 'lng' => $l->lng, 'recorded_at' => $l->recorded_at]),
            'eta_minutes' => $order->eta_minutes,
            'distance_km' => $order->distance_km,
        ]);
    }

    public function proof(Request $request, Order $order)
    {
        abort_unless($order->isVisibleTo($request->user()), 403);
        $token = $order->proof_token ?: ($order->proof_expires_at
            ? hash_hmac('sha256', "proof|{$order->id}|{$order->proof_expires_at->toIso8601String()}", config('app.key'))
            : null);

        return response()->json([
            'order' => $order,
            'files' => $order->proofs()->get()->map(fn ($proof) => [
                ...$proof->toArray(),
                'data_url' => \Storage::disk(config('rna.proof_disk'))->get($proof->storage_key),
            ]),
            'secure_link' => $token ? url("/proof/{$order->id}?token={$token}") : null,
            'delivered_at' => $order->delivered_at,
            'receiver_name' => $order->receiver_name,
        ]);
    }

    public function proofFile(Request $request, Order $order, $proof)
    {
        abort_unless($order->isVisibleTo($request->user()), 403);
        $record = $order->proofs()->findOrFail($proof);

        return response(\Storage::disk(config('rna.proof_disk'))->get($record->storage_key), 200, [
            'Content-Type' => $record->mime,
        ]);
    }

    /** Issue the company confirmation OTP. */
    public function submit(Request $request, Order $order)
    {
        $this->authorizeOrder($request, $order);
        abort_unless($order->status === 'DRAFT', 409, 'Only a draft order can be submitted.');

        $otp = $this->otps->issue($order, 'order_confirmation', 'sms', $order->authorized_contact_phone);

        return response()->json([
            'message' => "Confirmation OTP sent to {$order->authorized_contact_phone}.",
            'otp_required' => true,
            'purpose' => 'order_confirmation',
            'expires_at' => $otp->expires_at,
            'resend_available_at' => $otp->resend_available_at,
        ]);
    }

    /** Verify the company OTP and release the order to the driver network. */
    public function confirm(VerifyOtpRequest $request, Order $order)
    {
        $this->authorizeOrder($request, $order);
        abort_unless($order->status === 'DRAFT', 409, 'This order has already been confirmed.');

        $otp = $this->otps->verify($order, 'order_confirmation', $request->otp);

        $order->forceFill(['status' => 'PENDING_ASSIGNMENT', 'company_otp_verified_at' => $otp->verified_at])->save();

        $drivers = $this->workflow->eligibleDrivers();

        if ($drivers->isNotEmpty()) {
            $order->forceFill([
                'status' => 'OFFERED',
                'offered_driver_ids' => $drivers->pluck('id')->all(),
            ])->save();

            foreach ($drivers as $driver) {
                Notification::send($driver, new \App\Notifications\OrderStatusNotification($order, 'job_offer'));
            }
        }

        Notification::send(User::where('role', 'admin')->get(), new \App\Notifications\OrderStatusNotification($order, 'order_created'));

        return response()->json(['order' => $order->fresh(), 'eligible_drivers' => $drivers->count()]);
    }

    /** Direct cancel — only allowed before a driver accepts the job. */
    public function cancel(Request $request, Order $order)
    {
        $this->authorizeOrder($request, $order);
        $request->validate(['reason' => ['required', 'string', 'min:4']]);
        $this->workflow->assertCompanyMayCancel($order);

        $order->forceFill([
            'status' => 'CANCELLED',
            'cancelled_at' => now(),
            'cancellation_reason' => $request->reason,
        ])->save();

        return response()->json(['order' => $order->fresh(), 'message' => 'Order cancelled.']);
    }

    /** Cancellation request — used once a driver has already accepted the job. */
    public function requestCancellation(Request $request, Order $order)
    {
        $this->authorizeOrder($request, $order);
        $request->validate(['reason' => ['required', 'string', 'min:4']]);
        $this->workflow->assertCompanyMayRequestCancellation($order);

        $order->forceFill([
            'status' => 'CANCELLATION_REQUESTED',
            'previous_status' => $order->status,
            'cancellation_requested_at' => now(),
            'cancellation_reason' => $request->reason,
            'cancellation_status' => 'requested',
        ])->save();

        Notification::send(User::where('role', 'admin')->get(), new \App\Notifications\OrderStatusNotification($order, 'cancellation_requested'));

        return response()->json([
            'order' => $order->fresh(),
            'message' => 'Cancellation request submitted for Super Admin review.',
        ]);
    }

    private function authorizeOrder(Request $request, Order $order): void
    {
        abort_unless($order->company_id === $request->user()->company_id, 403, 'You are not allowed to access this order.');
    }

    private function permissions(User $user, Order $order): array
    {
        $isCompany = in_array($user->role, ['company_admin', 'company_user'], true);

        return [
            'can_cancel' => $isCompany && in_array($order->status, OrderWorkflow::COMPANY_DIRECT_CANCEL, true),
            'can_request_cancellation' => $isCompany && in_array($order->status, OrderWorkflow::COMPANY_REQUEST_CANCEL, true),
            'driver_may_cancel' => false,
        ];
    }

    private function haversine(array $a, array $b): float
    {
        $toRad = fn ($v) => deg2rad((float) $v);
        $dLat = $toRad($b['lat'] - $a['lat']);
        $dLng = $toRad($b['lng'] - $a['lng']);
        $h = sin($dLat / 2) ** 2 + cos($toRad($a['lat'])) * cos($toRad($b['lat'])) * sin($dLng / 2) ** 2;

        return round(2 * 6371 * asin(sqrt($h)), 1);
    }
}
