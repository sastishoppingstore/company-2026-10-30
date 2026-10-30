<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Shop;
use App\Models\ShopReceiver;
use App\Models\User;
use App\Services\OtpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeliveryFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['rna.otp_test_mode' => true]);

        $this->company = User::create(['company_id' => null, 'name' => 'Vantage', 'email' => 'admin@vantage.test',
            'phone' => '+91 98765 40021', 'role' => 'company_admin', 'status' => 'active', 'password' => bcrypt('Password@123')]);
        $this->company->company_id = \App\Models\Company::create(['name' => 'Vantage Trading Co.', 'code' => 'VNT',
            'email' => 'dispatch@vantage.test', 'phone' => '+91 98765 40000', 'address' => 'Baner MIDC',
            'city' => 'Pune'])->id;
        $this->company->save();

        $this->otherUser = User::create(['company_id' => null, 'name' => 'Halcyon', 'email' => 'ops@halcyon.test',
            'phone' => '+91 98765 99011', 'role' => 'company_admin', 'status' => 'active', 'password' => bcrypt('Password@123')]);
        $this->otherUser->company_id = \App\Models\Company::create(['name' => 'Halcyon', 'code' => 'HEX',
            'email' => 'ops2@halcyon.test', 'phone' => '+91 98765 99000', 'address' => 'Chakan', 'city' => 'Pune'])->id;
        $this->otherUser->save();

        $this->driver = User::create(['company_id' => null, 'name' => 'Imran Shaikh', 'email' => 'imran@drives.test',
            'phone' => '+91 90000 11111', 'role' => 'driver', 'status' => 'active', 'password' => bcrypt('Password@123')]);

        $this->shop = Shop::create(['code' => 'RNA-001', 'name' => 'RNA General Store', 'address' => 'Shivaji Nagar',
            'city' => 'Pune', 'lat' => 18.5308, 'lng' => 73.8475, 'phone' => '+91 20 2545 7788',
            'category' => 'Grocery', 'status' => 'active', 'rating' => 4.8, 'is_demo' => true]);
        $this->receiver = ShopReceiver::create(['shop_id' => $this->shop->id, 'name' => 'Rohit Sharma',
            'phone' => '+919822011234', 'email' => 'rohit@example.test', 'role' => 'Store Owner', 'is_primary' => true]);
    }

    public function test_full_delivery_lifecycle(): void
    {
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@vantage.test', 'password' => 'Password@123'])
            ->json('token');

        $response = $this->withToken($token)->postJson('/api/v1/orders', [
            'shop_id' => $this->shop->id,
            'receiver_id' => $this->receiver->id,
            'pickup_address' => 'Unit 14, Baner MIDC, Baner Road, Pune 411045',
            'item_description' => '1 sealed bag — assorted grocery assortment',
            'quantity' => 1,
            'weight_kg' => 12,
            'priority' => 'STANDARD',
            'requested_delivery_at' => now()->addDay()->toIso8601String(),
            'authorized_contact_name' => 'Ananya Rao',
            'authorized_contact_phone' => '+91 98765 40021',
        ]);

        $response->assertOk()->assertJsonPath('order.status', 'DRAFT');
        $orderId = $response->json('order.id');

        // company OTP
        $this->withToken($token)->postJson("/api/v1/orders/{$orderId}/submit")->assertOk();
        $code = $this->withToken($token)->getJson("/api/v1/otp/test-code?order_id={$orderId}&purpose=order_confirmation")->json('code');

        $this->withToken($token)->postJson("/api/v1/orders/{$orderId}/confirm", ['otp' => '000000'])->assertStatus(400);
        $this->withToken($token)->postJson("/api/v1/orders/{$orderId}/confirm", ['otp' => $code])->assertOk();

        $this->assertDatabaseHas('orders', ['id' => $orderId, 'status' => 'OFFERED']);

        // driver accepts and completes
        $driverToken = $this->postJson('/api/v1/auth/login', ['email' => 'imran@drives.test', 'password' => 'Password@123'])->json('token');

        $this->withToken($driverToken)->postJson("/api/v1/driver/jobs/{$orderId}/accept")->assertOk();
        $this->withToken($driverToken)->postJson("/api/v1/driver/orders/{$orderId}/cancel")->assertStatus(409);
        $this->withToken($driverToken)->postJson("/api/v1/driver/orders/{$orderId}/pickup")->assertOk();
        $this->withToken($driverToken)->postJson("/api/v1/driver/orders/{$orderId}/start-trip")->assertOk();
        $this->withToken($driverToken)->postJson("/api/v1/driver/orders/{$orderId}/arrive")->assertOk();

        $deliveryCode = $this->withToken($driverToken)
            ->getJson("/api/v1/otp/test-code?order_id={$orderId}&purpose=delivery_verification")->json('code');

        $this->withToken($driverToken)->postJson("/api/v1/driver/orders/{$orderId}/verify-otp", ['otp' => $deliveryCode])->assertOk();
        $this->withToken($driverToken)->postJson("/api/v1/driver/orders/{$orderId}/deliver", [
            'receiver_name' => 'Rohit Sharma',
            'signature' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
            'photo' => 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
        ])->assertOk();

        $this->assertDatabaseHas('orders', ['id' => $orderId, 'status' => 'DELIVERED']);
    }

    public function test_company_cannot_read_another_companys_order(): void
    {
        $foreignOrder = Order::create([
            'order_code' => 'RN-2026-9999', 'company_id' => $this->otherUser->company_id,
            'shop_id' => $this->shop->id, 'shop_name' => $this->shop->name, 'shop_code' => $this->shop->code,
            'created_by' => $this->otherUser->id, 'status' => 'DRAFT', 'priority' => 'STANDARD',
            'pickup_address' => 'Chakan', 'destination_address' => 'Shivaji Nagar', 'dest_lat' => 18.53, 'dest_lng' => 73.84,
            'receiver_id' => $this->receiver->id, 'receiver_name' => 'Rohit Sharma', 'receiver_phone' => '+919822011234',
            'item_description' => '1 bag', 'quantity' => 1, 'requested_delivery_at' => now()->addDay(),
            'authorized_contact_name' => 'Priya', 'authorized_contact_phone' => '+91 98765 99011',
        ]);

        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@vantage.test', 'password' => 'Password@123'])->json('token');

        $this->withToken($token)->getJson("/api/v1/orders/{$foreignOrder->id}")->assertStatus(403);
    }

    public function test_company_may_only_cancel_before_acceptance(): void
    {
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@vantage.test', 'password' => 'Password@123'])->json('token');

        $orderId = $this->withToken($token)->postJson('/api/v1/orders', [
            'shop_id' => $this->shop->id, 'receiver_id' => $this->receiver->id,
            'pickup_address' => 'Unit 14, Baner MIDC, Pune', 'item_description' => '1 bag', 'quantity' => 1,
            'priority' => 'STANDARD', 'requested_delivery_at' => now()->addDay()->toIso8601String(),
            'authorized_contact_name' => 'Ananya Rao', 'authorized_contact_phone' => '+91 98765 40021',
        ])->json('order.id');

        $this->withToken($token)->postJson("/api/v1/orders/{$orderId}/cancel", ['reason' => 'Duplicate request'])->assertOk();
        $this->assertDatabaseHas('orders', ['id' => $orderId, 'status' => 'CANCELLED']);
    }
}
