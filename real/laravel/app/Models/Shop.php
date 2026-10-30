<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Shop extends Model
{
    use HasFactory;

    protected $fillable = ['code', 'name', 'address', 'city', 'state', 'postal_code', 'lat', 'lng', 'phone',
        'category', 'status', 'rating', 'is_demo', 'notes'];

    protected $casts = ['lat' => 'float', 'lng' => 'float', 'rating' => 'float', 'is_demo' => 'boolean'];

    public function receivers()
    {
        return $this->hasMany(ShopReceiver::class);
    }

    public function orders()
    {
        return $this->hasMany(Order::class);
    }
}
