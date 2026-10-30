<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OrderEvent extends Model
{
    use HasFactory;

    protected $fillable = ['order_id', 'company_id', 'type', 'actor_id', 'actor_name', 'actor_role', 'message', 'meta'];

    protected $casts = ['meta' => 'array'];

    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
