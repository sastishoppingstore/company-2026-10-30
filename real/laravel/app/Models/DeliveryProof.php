<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DeliveryProof extends Model
{
    use HasFactory;

    protected $fillable = ['order_id', 'company_id', 'kind', 'name', 'mime', 'size', 'storage_key'];

    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
