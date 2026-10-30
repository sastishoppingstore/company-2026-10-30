<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DriverController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\OtpController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\ShopController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| RNA Ship API — routes/api.php
|--------------------------------------------------------------------------
| Mirrors the contract implemented by the embedded API core (src/backend/api.ts)
| so the Flutter, web and driver clients can run against either backend.
*/

Route::post('auth/login', [AuthController::class, 'login']);
Route::post('auth/password/forgot', [AuthController::class, 'forgotPassword']);
Route::post('auth/password/reset', [AuthController::class, 'resetPassword']);

Route::get('public/config', fn () => response()->json([
    'app_name' => config('app.name'),
    'otp_test_mode' => config('rna.otp_test_mode'),
    'otp_ttl_seconds' => config('rna.otp_ttl_seconds'),
]));

Route::get('public/proof/{order}', function (\App\Models\Order $order) {
    $token = request()->query('token');
    abort_unless(hash_equals($order->proof_token, (string) $token), 403, 'This proof link is invalid or has expired.');

    return response()->json([
        'order' => $order->only(['order_code', 'shop_name', 'shop_code', 'delivered_at', 'receiver_name', 'item_description', 'quantity', 'destination_address', 'created_at']),
        'files' => $order->proofs()->get()->map(fn ($proof) => [
            'id' => $proof->id,
            'kind' => $proof->kind,
            'name' => $proof->name,
            'mime' => $proof->mime,
            'size' => $proof->size,
            'created_at' => $proof->created_at,
        ]),
        'proof_files' => $order->proofs()->get()->mapWithKeys(fn ($proof) => [
            $proof->id => Storage::disk('proofs')->get($proof->storage_key),
        ]),
    ]);
})->name('public.proof');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('auth/me', [AuthController::class, 'me']);
    Route::post('auth/password/change', [AuthController::class, 'changePassword']);

    Route::get('shops', [ShopController::class, 'index']);
    Route::get('shops/{shop}', [ShopController::class, 'show']);

    Route::get('notifications', [NotificationController::class, 'index']);
    Route::post('notifications/read-all', [NotificationController::class, 'readAll']);
    Route::post('notifications/{notification}/read', [NotificationController::class, 'read']);
    Route::get('emails', [NotificationController::class, 'emails']);

    Route::get('otp/test-code', [OtpController::class, 'showTestCode'])->middleware('otp.testmode');

    Route::get('profile', [AuthController::class, 'profile']);
    Route::put('profile', [AuthController::class, 'updateProfile'])->middleware('role:company_admin');

    // ------------------------------------------------------------ company
    Route::middleware('role:company_admin,company_user')->group(function () {
        Route::get('orders', [OrderController::class, 'index']);
        Route::post('orders', [OrderController::class, 'store']);
        Route::get('orders/{order}', [OrderController::class, 'show']);
        Route::get('orders/{order}/timeline', [OrderController::class, 'timeline']);
        Route::get('orders/{order}/track', [OrderController::class, 'track']);
        Route::get('orders/{order}/proof', [OrderController::class, 'proof']);
        Route::get('orders/{order}/proof/{proof}', [OrderController::class, 'proofFile']);
        Route::post('orders/{order}/submit', [OrderController::class, 'submit']);
        Route::post('orders/{order}/confirm', [OrderController::class, 'confirm']);
        Route::post('orders/{order}/cancel', [OrderController::class, 'cancel']);
        Route::post('orders/{order}/cancellation-request', [OrderController::class, 'requestCancellation']);
    });

    // ------------------------------------------------------------- driver
    Route::middleware('role:driver')->prefix('driver')->group(function () {
        Route::get('jobs', [DriverController::class, 'jobs']);
        Route::get('orders/{order}', [DriverController::class, 'show']);
        Route::post('jobs/{order}/accept', [DriverController::class, 'accept']);
        Route::post('jobs/{order}/decline', [DriverController::class, 'decline']);
        Route::post('orders/{order}/pickup', [DriverController::class, 'pickup']);
        Route::post('orders/{order}/start-trip', [DriverController::class, 'startTrip']);
        Route::post('orders/{order}/arrive', [DriverController::class, 'arrive']);
        Route::post('orders/{order}/location', [DriverController::class, 'location']);
        Route::post('orders/{order}/verify-otp', [DriverController::class, 'verifyOtp']);
        Route::post('orders/{order}/deliver', [DriverController::class, 'deliver']);
        Route::post('orders/{order}/report-issue', [DriverController::class, 'reportIssue']);
        // Drivers may never cancel an accepted job — the request is always refused.
        Route::post('orders/{order}/cancel', [DriverController::class, 'cancel'])->name('driver.cancel');
    });

    // ------------------------------------------------------- super admin
    Route::middleware('role:admin')->prefix('admin')->group(function () {
        Route::get('orders', [AdminController::class, 'orders']);
        Route::get('drivers', [AdminController::class, 'drivers']);
        Route::get('audit-logs', [AdminController::class, 'auditLogs']);
        Route::get('reports/summary', [AdminController::class, 'reports']);
        Route::post('orders/{order}/assign', [AdminController::class, 'assign']);
        Route::post('orders/{order}/cancellation/approve', [AdminController::class, 'approveCancellation']);
        Route::post('orders/{order}/cancellation/reject', [AdminController::class, 'rejectCancellation']);
    });
});
