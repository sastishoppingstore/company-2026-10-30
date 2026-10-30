<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('companies', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code')->unique();
            $table->string('email')->unique();
            $table->string('phone');
            $table->string('address');
            $table->string('city');
            $table->string('country')->default('India');
            $table->string('gst_number')->nullable();
            $table->enum('status', ['active', 'suspended'])->default('active');
            $table->string('brand_color')->default('#1E6FFF');
            $table->timestamps();
        });

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->nullable()->constrained('companies')->nullOnDelete();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('phone');
            $table->enum('role', ['company_admin', 'company_user', 'driver', 'admin']);
            $table->enum('status', ['active', 'suspended'])->default('active');
            $table->string('password');
            $table->decimal('rating', 3, 2)->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('shops', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('address');
            $table->string('city');
            $table->string('state')->nullable();
            $table->string('postal_code')->nullable();
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->string('phone');
            $table->string('category')->nullable();
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->decimal('rating', 3, 2)->default(0);
            $table->boolean('is_demo')->default(false);
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('shop_receivers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shop_id')->constrained('shops')->cascadeOnDelete();
            $table->string('name');
            $table->string('phone');
            $table->string('email')->nullable();
            $table->string('role')->default('Receiver');
            $table->boolean('is_primary')->default(false);
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->timestamps();
        });

        Schema::create('vehicles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained('users')->cascadeOnDelete();
            $table->string('type');
            $table->string('model')->nullable();
            $table->string('plate');
            $table->string('color')->nullable();
            $table->timestamps();
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_code')->unique();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('shop_id')->constrained('shops');
            $table->string('shop_name');
            $table->string('shop_code');
            $table->foreignId('created_by')->constrained('users');
            $table->string('status')->default('DRAFT');
            $table->string('previous_status')->nullable();
            $table->enum('priority', ['STANDARD', 'EXPRESS', 'CRITICAL'])->default('STANDARD');
            $table->string('pickup_address');
            $table->decimal('pickup_lat', 10, 7)->nullable();
            $table->decimal('pickup_lng', 10, 7)->nullable();
            $table->string('destination_address');
            $table->decimal('dest_lat', 10, 7);
            $table->decimal('dest_lng', 10, 7);
            $table->foreignId('receiver_id')->constrained('shop_receivers');
            $table->string('receiver_name');
            $table->string('receiver_phone');
            $table->string('receiver_email')->nullable();
            $table->string('item_description');
            $table->unsignedInteger('quantity')->default(1);
            $table->decimal('weight_kg', 8, 2)->nullable();
            $table->text('special_instructions')->nullable();
            $table->timestamp('requested_delivery_at');
            $table->string('authorized_contact_name');
            $table->string('authorized_contact_phone');
            $table->foreignId('assigned_driver_id')->nullable()->constrained('users');
            $table->json('offered_driver_ids')->nullable();
            $table->timestamp('company_otp_verified_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('picked_up_at')->nullable();
            $table->timestamp('departed_at')->nullable();
            $table->timestamp('arrived_at')->nullable();
            $table->timestamp('otp_verified_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('cancellation_requested_at')->nullable();
            $table->text('cancellation_reason')->nullable();
            $table->string('cancellation_status')->default('none');
            $table->timestamp('last_location_at')->nullable();
            $table->string('proof_token')->nullable();
            $table->timestamp('proof_expires_at')->nullable();
            $table->decimal('distance_km', 8, 2)->default(0);
            $table->unsignedInteger('eta_minutes')->default(0);
            $table->timestamps();

            $table->index(['company_id', 'status']);
            $table->index(['assigned_driver_id', 'status']);
        });

        Schema::create('order_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->string('type');
            $table->string('actor_id')->nullable();
            $table->string('actor_name');
            $table->string('actor_role');
            $table->text('message');
            $table->json('meta')->nullable();
            $table->timestamps();
        });

        Schema::create('otps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->enum('purpose', ['order_confirmation', 'delivery_verification']);
            $table->enum('channel', ['sms', 'email']);
            $table->string('target');
            $table->string('code_hash');
            $table->timestamp('expires_at');
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->unsignedTinyInteger('max_attempts')->default(5);
            $table->timestamp('consumed_at')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('resend_available_at');
            $table->string('code_cipher')->nullable(); // encrypted copy, demo test mode only
            $table->timestamps();
            $table->index(['order_id', 'purpose']);
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->nullable()->constrained('companies')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->cascadeOnDelete();
            $table->string('channel'); // in_app | email | sms | push
            $table->string('type');
            $table->string('title');
            $table->text('body');
            $table->json('data')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        Schema::create('emails', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->nullable()->constrained('companies')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->cascadeOnDelete();
            $table->string('to_email');
            $table->string('to_name');
            $table->string('subject');
            $table->longText('html');
            $table->string('status')->default('queued');
            $table->string('provider')->nullable();
            $table->text('error')->nullable();
            $table->string('secure_link')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->string('actor_id')->nullable();
            $table->string('actor_name');
            $table->string('actor_role');
            $table->foreignId('company_id')->nullable()->constrained('companies')->nullOnDelete();
            $table->string('action');
            $table->string('entity_type');
            $table->string('entity_id');
            $table->json('meta')->nullable();
            $table->string('ip')->nullable();
            $table->timestamps();
        });

        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('driver_id')->constrained('users')->cascadeOnDelete();
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->decimal('accuracy', 8, 2)->nullable();
            $table->decimal('heading', 6, 2)->nullable();
            $table->decimal('speed', 6, 2)->nullable();
            $table->unsignedTinyInteger('battery')->nullable();
            $table->timestamp('recorded_at');
            $table->timestamps();
        });

        Schema::create('delivery_proofs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->enum('kind', ['signature', 'delivery_photo', 'document']);
            $table->string('name');
            $table->string('mime');
            $table->unsignedBigInteger('size')->default(0);
            $table->string('storage_key');
            $table->timestamps();
        });

        Schema::create('driver_issues', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('driver_id')->constrained('users')->cascadeOnDelete();
            $table->string('type');
            $table->text('description');
            $table->string('status')->default('open');
            $table->text('resolution')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('driver_issues');
        Schema::dropIfExists('delivery_proofs');
        Schema::dropIfExists('locations');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('emails');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('otps');
        Schema::dropIfExists('order_events');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('vehicles');
        Schema::dropIfExists('shop_receivers');
        Schema::dropIfExists('shops');
        Schema::dropIfExists('users');
        Schema::dropIfExists('companies');
    }
};
