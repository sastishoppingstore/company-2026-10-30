<?php

namespace App\Services;

use App\Models\Order;
use App\Models\OrderEvent;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The single place where order status may change.
 * Every transition is validated, recorded as an order event and audited.
 */
class OrderWorkflow
{
    public const FLOW = [
        'DRAFT', 'PENDING_ASSIGNMENT', 'OFFERED', 'ACCEPTED', 'PICKED_UP',
        'IN_TRANSIT', 'ARRIVED_AT_SHOP', 'OTP_VERIFIED', 'DELIVERED',
    ];

    public const COMPANY_DIRECT_CANCEL = ['DRAFT', 'PENDING_ASSIGNMENT', 'OFFERED'];

    public const COMPANY_REQUEST_CANCEL = ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_SHOP', 'OTP_VERIFIED'];

    public function transition(Order $order, string $to, User $actor, string $message, array $meta = []): Order
    {
        $from = $order->status;

        return DB::transaction(function () use ($order, $to, $actor, $message, $meta, $from) {
            $order->status = $to;
            $order->updated_at = now();
            $order->save();

            OrderEvent::create([
                'order_id' => $order->id,
                'company_id' => $order->company_id,
                'type' => strtolower($to),
                'actor_id' => $actor->id,
                'actor_name' => $actor->name,
                'actor_role' => $actor->role,
                'message' => $message,
                'meta' => $meta,
            ]);

            \App\Models\AuditLog::create([
                'actor_id' => $actor->id,
                'actor_name' => $actor->name,
                'actor_role' => $actor->role,
                'company_id' => $order->company_id,
                'action' => "order.{$from}_to_{$to}",
                'entity_type' => 'order',
                'entity_id' => $order->id,
                'meta' => $meta,
                'ip' => request()->ip(),
            ]);

            return $order;
        });
    }

    public function assertCompanyMayCancel(Order $order): void
    {
        abort_unless(in_array($order->status, self::COMPANY_DIRECT_CANCEL, true), 409,
            'This order can only be cancelled by a cancellation request.');
    }

    public function assertCompanyMayRequestCancellation(Order $order): void
    {
        abort_unless(in_array($order->status, self::COMPANY_REQUEST_CANCEL, true), 409,
            'This order cannot be cancelled directly by the company.');
    }

    public function eligibleDrivers(): \Illuminate\Support\Collection
    {
        $busy = Order::whereIn('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_SHOP', 'OTP_VERIFIED'])
            ->whereNotNull('assigned_driver_id')
            ->pluck('assigned_driver_id');

        return User::where('role', 'driver')
            ->where('status', 'active')
            ->whereNotIn('id', $busy)
            ->get();
    }
}
