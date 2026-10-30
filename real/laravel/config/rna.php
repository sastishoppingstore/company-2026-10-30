<?php

return [
    // OTP delivery
    'otp_test_mode' => env('OTP_TEST_MODE', false),
    'otp_ttl_seconds' => (int) env('OTP_TTL_SECONDS', 600),
    'otp_max_attempts' => (int) env('OTP_MAX_ATTEMPTS', 5),
    'otp_resend_cooldown' => (int) env('OTP_RESEND_COOLDOWN', 45),
    'otp_max_per_hour' => (int) env('OTP_MAX_PER_HOUR', 8),

    // Proof storage (private disk, served through an authorised controller)
    'proof_disk' => env('PROOF_DISK', 'proofs'),

    // Push notifications (FCM) and transactional email
    'fcm' => [
        'enabled' => env('FCM_ENABLED', false),
        'server_key' => env('FCM_SERVER_KEY'),
    ],
    'mail' => [
        'from' => env('MAIL_FROM_ADDRESS', 'no-reply@rnaship.test'),
        'transport' => env('MAIL_TRANSPORT', 'smtp'),
    ],
];
