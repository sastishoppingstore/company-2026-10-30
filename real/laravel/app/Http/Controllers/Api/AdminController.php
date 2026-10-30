<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Order;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;

class AdminController extends Controller
{
    public function orders(Request $request)
    {
        $query = Order::query();
        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        return response()->json(['data' => $query->orderByDesc('created_at')->limit(200)->get()]);
    }

    public function drivers()
    {
        $drivers = User::where('role', 'driver')->with('vehicle')->get()->map(function (User $driver) {
            $active = Order::where('assigned_driver_id', $driver->id)
                ->whereIn('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_SHOP', 'OTP_VERIFIED'])->count();

            return [
                ...$driver->toArray(),
                'vehicle' => $driver->vehicle,
                'active_jobs' => $active,
                'is_available' => $active === 0 ? 1 : 0,
                'completed_jobs' => Order::where('assigned_driver_id', $driver->id)->where('status', 'DELIVERED')->count(),
            ];
        });

        return response()->json(['data' => $drivers]);
    }

    public function auditLogs()
    {
        return response()->json(['data' => AuditLog::orderByDesc('created_at')->limit(200)->get()]);
    }

    public function reports()
    {
        $orders = Order::all();
        $delivered = $orders->where('status', 'DELIVERED');
        $onTime = $delivered->filter(fn ($o) => $o->delivered_at && $o->delivered_at <= $o->requested_delivery_at)->count();

        return response()->json([
            'total' => $orders->count(),
            'by_status' => $orders->groupBy('status')->map->count(),
            'delivered' => $delivered->count(),
            'cancelled' => $orders->where('status', 'CANCELLED')->count(),
            'on_time_rate' => $delivered->count() ? (int) round($onTime / $delivered->count() * 100) : 0,
            'avg_delivery_minutes' => $delivered->count()
                ? (int) round($delivered->avg(fn ($o) => $o->created_at->diffInMinutes($o->delivered_at)))
                : 0,
            'top_shops' => \App\Models\Shop::all()->map(fn ($shop) => [
                'shop' => $shop->name, 'code' => $shop->code, 'orders' => $shop->orders()->count(),
            ])->sortByDesc('orders')->take(5)->values(),
        ]);
    }

    public function assign(Request $request, Order $order)
    {
        $data = $request->validate(['driver_id' => ['required', 'integer', 'exists:users,id']]);
        $driver = User::findOrFail($data['driver_id']);
        abort_unless($driver->role === 'driver', 422, 'Unknown driver.');
        abort_if(in_array($order->status, ['DELIVERED', 'CANCELLED'], true), 409, 'This order is already closed.');

        $order->forceFill([
            'status' => 'ACCEPTED', 'assigned_driver_id' => $driver->id,
            'offered_driver_ids' => [], 'accepted_at' => now(),
        ])->save();

        AuditLog::create([
            'actor_id' => $request->user()->id, 'actor_name' => $request->user()->name, 'actor_role' => 'admin',
            'company_id' => $order->company_id, 'action' => 'admin.assigned_driver',
            'entity_type' => 'order', 'entity_id' => (string) $order->id, 'ip' => $request->ip(),
        ]);

        return response()->json(['order' => $order->fresh(), 'message' => "{$driver->name} assigned."]);
    }

    public function approveCancellation(Request $request, Order $order)
    {
        abort_unless($order->status === 'CANCELLATION_REQUESTED', 409, 'There is no pending cancellation request on this order.');

        $order->forceFill(['status' => 'CANCELLED', 'cancelled_at' => now(), 'cancellation_status' => 'approved'])->save();

        return response()->json(['order' => $order->fresh(), 'message' => 'Cancellation approved.']);
    }

    public function rejectCancellation(Request $request, Order $order)
    {
        abort_unless($order->status === 'CANCELLATION_REQUESTED', 409, 'There is no pending cancellation request on this order.');

        $order->forceFill([
            'status' => $order->previous_status ?: 'IN_TRANSIT',
            'previous_status' => null,
            'cancellation_status' => 'rejected',
        ])->save();

        return response()->json(['order' => $order->fresh(), 'message' => 'Cancellation rejected — the delivery continues.']);
    }
}
