<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    use BelongsToCompany, HasFactory;

    protected $fillable = [
        'order_code', 'company_id', 'shop_id', 'shop_name', 'shop_code', 'created_by', 'status', 'previous_status',
        'priority', 'pickup_address', 'pickup_lat', 'pickup_lng', 'destination_address', 'dest_lat', 'dest_lng',
        'receiver_id', 'receiver_name', 'receiver_phone', 'receiver_email', 'item_description', 'quantity',
        'weight_kg', 'special_instructions', 'requested_delivery_at', 'authorized_contact_name',
        'authorized_contact_phone', 'assigned_driver_id', 'offered_driver_ids', 'company_otp_verified_at',
        'accepted_at', 'picked_up_at', 'departed_at', 'arrived_at', 'otp_verified_at', 'delivered_at',
        'cancelled_at', 'cancellation_requested_at', 'cancellation_reason', 'cancellation_status',
        'last_location_at', 'proof_token', 'proof_expires_at', 'distance_km', 'eta_minutes',
    ];

    protected $casts = [
        'requested_delivery_at' => 'datetime',
        'accepted_at' => 'datetime',
        'picked_up_at' => 'datetime',
        'departed_at' => 'datetime',
        'arrived_at' => 'datetime',
        'otp_verified_at' => 'datetime',
        'delivered_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'proof_expires_at' => 'datetime',
        'offered_driver_ids' => 'array',
        'quantity' => 'integer',
        'weight_kg' => 'float',
        'distance_km' => 'float',
        'eta_minutes' => 'integer',
    ];

    public function shop()
    {
        return $this->belongsTo(Shop::class);
    }

    public function receiver()
    {
        return $this->belongsTo(ShopReceiver::class, 'receiver_id');
    }

    public function driver()
    {
        return $this->belongsTo(User::class, 'assigned_driver_id');
    }

    public function events()
    {
        return $this->hasMany(OrderEvent::class)->orderBy('created_at');
    }

    public function proofs()
    {
        return $this->hasMany(DeliveryProof::class);
    }

    public function locations()
    {
        return $this->hasMany(DriverLocation::class)->orderBy('recorded_at');
    }

    /** Only the owning company, the assigned driver or an admin may see an order. */
    public function isVisibleTo(User $user): bool
    {
        if ($user->role === 'admin') {
            return true;
        }
        if ($user->role === 'driver') {
            return $this->assigned_driver_id === $user->id || in_array($user->id, $this->offered_driver_ids ?? [], true);
        }

        return $this->company_id === $user->company_id;
    }
}
