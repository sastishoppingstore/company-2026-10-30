<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Otp extends Model
{
    use HasFactory;

    protected $fillable = ['order_id', 'company_id', 'purpose', 'channel', 'target', 'code_hash', 'expires_at',
        'attempts', 'max_attempts', 'consumed_at', 'verified_at', 'resend_available_at', 'code_cipher'];

    protected $hidden = ['code_hash', 'code_cipher'];

    protected $casts = ['expires_at' => 'datetime', 'verified_at' => 'datetime', 'consumed_at' => 'datetime',
        'resend_available_at' => 'datetime'];

    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
