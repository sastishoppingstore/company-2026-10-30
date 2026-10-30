<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ShopReceiver extends Model
{
    use HasFactory;

    protected $fillable = ['shop_id', 'name', 'phone', 'email', 'role', 'is_primary', 'status'];

    protected $casts = ['is_primary' => 'boolean'];

    public function shop()
    {
        return $this->belongsTo(Shop::class);
    }
}
