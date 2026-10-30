<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class User extends Model
{
    use HasFactory;

    protected $fillable = ['company_id', 'name', 'email', 'phone', 'role', 'status', 'password', 'rating', 'last_login_at'];
    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return ['password' => 'hashed', 'last_login_at' => 'datetime'];
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function vehicle()
    {
        return $this->hasOne(Vehicle::class, 'driver_id');
    }

    public static function nextOrderCode(): string
    {
        $year = now()->year;
        $sequence = Order::whereYear('created_at', $year)->count() + 1;

        return sprintf('RN-%d-%04d', $year, $sequence);
    }

    public static function newToken(): string
    {
        return Str::random(64);
    }
}
