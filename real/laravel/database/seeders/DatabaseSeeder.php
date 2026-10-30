<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Order;
use App\Models\OrderEvent;
use App\Models\Shop;
use App\Models\ShopReceiver;
use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $password = Hash::make('Password@123');

        $vantage = Company::create([
            'name' => 'Vantage Trading Co.', 'code' => 'VNT', 'email' => 'dispatch@vantage.test',
            'phone' => '+91 98765 40000', 'address' => 'Unit 14, Survey 42, Baner MIDC, Baner Road',
            'city' => 'Pune', 'country' => 'India', 'gst_number' => '27AABCV1234M1ZP', 'status' => 'active',
        ]);

        $halcyon = Company::create([
            'name' => 'Halcyon Exports Pvt Ltd', 'code' => 'HEX', 'email' => 'ops@halcyon.test',
            'phone' => '+91 98765 99000', 'address' => 'Plot 7, MIDC Industrial Area, Chakan',
            'city' => 'Pune', 'country' => 'India', 'gst_number' => '27AAHCH5566N1ZQ', 'status' => 'active',
        ]);

        $users = [
            ['company_admin', $vantage->id, 'Ananya Rao', 'admin@vantage.test', '+91 98765 40021'],
            ['company_user', $vantage->id, 'Rahul Menon', 'dispatcher@vantage.test', '+91 98765 40022'],
            ['company_admin', $halcyon->id, 'Priya Desai', 'ops@halcyon.test', '+91 98765 99011'],
            ['admin', null, 'Super Admin', 'superadmin@rnaship.test', '+91 90000 00000'],
            ['driver', null, 'Imran Shaikh', 'imran@drives.test', '+91 90000 11111'],
            ['driver', null, 'Sandeep Patil', 'sandeep@drives.test', '+91 90000 33333'],
        ];

        foreach ($users as [$role, $companyId, $name, $email, $phone]) {
            User::create([
                'company_id' => $companyId, 'name' => $name, 'email' => $email, 'phone' => $phone,
                'role' => $role, 'status' => 'active', 'password' => $password, 'rating' => $role === 'driver' ? 4.6 : null,
            ]);
        }

        $shops = [
            ['RNA-001', 'RNA General Store', 'Shop 12, Shivaji Nagar Main Road, Near Post Office', 'Pune', 18.5308, 73.8475, '+91 20 2545 7788', 'Grocery & General Store', true],
            ['SGT-014', 'Shree Ganesh Traders', '18, Kothrud Depot Road', 'Pune', 18.5074, 73.8077, '+91 20 2521 4490', 'Grocery & Provisions', false],
            ['KMD-207', 'Krishna Medicals', 'Survey 78, Paud Road, Aundh', 'Pune', 18.5590, 73.8070, '+91 20 2588 1200', 'Pharmacy', false],
        ];

        foreach ($shops as [$code, $name, $address, $city, $lat, $lng, $phone, $category, $isDemo]) {
            Shop::create([
                'code' => $code, 'name' => $name, 'address' => $address, 'city' => $city, 'state' => 'Maharashtra',
                'postal_code' => '411005', 'lat' => $lat, 'lng' => $lng, 'phone' => $phone,
                'category' => $category, 'status' => 'active', 'rating' => 4.8, 'is_demo' => $isDemo,
                'notes' => $isDemo ? 'Demonstration destination shop for the sample bag shipment.' : null,
            ]);
        }

        $rna = Shop::where('code', 'RNA-001')->first();
        ShopReceiver::create(['shop_id' => $rna->id, 'name' => 'Rohit Sharma', 'phone' => '+919822011234',
            'email' => 'rohit.sharma@rnageneralstore.test', 'role' => 'Store Owner', 'is_primary' => true]);
        ShopReceiver::create(['shop_id' => $rna->id, 'name' => 'Sneha Kulkarni', 'phone' => '+919822055678',
            'email' => 'sneha.kulkarni@rnageneralstore.test', 'role' => 'Shift Supervisor', 'is_primary' => false]);

        Vehicle::create(['driver_id' => User::where('email', 'imran@drives.test')->value('id'), 'type' => 'Van',
            'model' => 'Toyota Innova Crysta', 'plate' => 'MH 12 AB 4417', 'color' => 'White']);
    }
}
