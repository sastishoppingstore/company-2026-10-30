<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()->role, ['company_admin', 'company_user'], true);
    }

    public function rules(): array
    {
        return [
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'receiver_id' => ['required', 'integer', 'exists:shop_receivers,id'],
            'pickup_address' => ['required', 'string', 'min:8', 'max:240'],
            'pickup_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'pickup_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'item_description' => ['required', 'string', 'min:3', 'max:240'],
            'quantity' => ['required', 'integer', 'min:1', 'max:999'],
            'weight_kg' => ['nullable', 'numeric', 'min:0', 'max:5000'],
            'special_instructions' => ['nullable', 'string', 'max:500'],
            'priority' => ['required', 'in:STANDARD,EXPRESS,CRITICAL'],
            'requested_delivery_at' => ['required', 'date'],
            'authorized_contact_name' => ['required', 'string', 'min:2', 'max:120'],
            'authorized_contact_phone' => ['required', 'string', 'min:8', 'max:24'],
        ];
    }

    public function messages(): array
    {
        return [
            'shop_id.required' => 'A destination shop is required.',
            'receiver_id.exists' => 'The receiver is not registered for this shop.',
            'otp.required' => 'The 6-digit verification code is required.',
        ];
    }
}
