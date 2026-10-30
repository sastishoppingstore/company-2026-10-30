<?php

namespace App\Services;

use App\Models\Otp;
use App\Models\Order;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use RuntimeException;

/**
 * Purpose-scoped OTP service.
 *
 * The stored value is an HMAC over (purpose | order | target | code) so a code issued for
 * delivery verification can never satisfy a company confirmation request.
 */
class OtpService
{
    public function __construct(private readonly \Illuminate\Contracts\Cache\RateLimiter $limiter) {}

    public function issue(Order $order, string $purpose, string $channel, string $target): Otp
    {
        $key = "otp:{$order->id}:{$purpose}";
        if (RateLimiter::tooManyAttempts($key, (int) config('rna.otp_max_per_hour'))) {
            throw new RuntimeException('Verification code request limit reached. Try again later.');
        }

        $last = Otp::where('order_id', $order->id)->where('purpose', $purpose)->latest('created_at')->first();
        if ($last && $last->resend_available_at->isFuture()) {
            throw new RuntimeException('Please wait before requesting another code.');
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $ttl = (int) config('rna.otp_ttl_seconds');

        $otp = Otp::create([
            'order_id' => $order->id,
            'company_id' => $order->company_id,
            'purpose' => $purpose,
            'channel' => $channel,
            'target' => $target,
            'code_hash' => $this->hash($purpose, $order->id, $target, $code),
            'expires_at' => now()->addSeconds($ttl),
            'attempts' => 0,
            'max_attempts' => (int) config('rna.otp_max_attempts'),
            'resend_available_at' => now()->addSeconds((int) config('rna.otp_resend_cooldown')),
            // Encrypted copy kept only while the explicitly flagged test mode is enabled.
            'code_cipher' => config('rna.otp_test_mode') ? Crypt::encryptString($code) : null,
        ]);

        RateLimiter::hit($key, 3600);

        $this->dispatch($order, $purpose, $channel, $target, $code);

        return $otp;
    }

    public function verify(Order $order, string $purpose, string $code): Otp
    {
        $otp = Otp::where('order_id', $order->id)
            ->where('purpose', $purpose)
            ->whereNull('verified_at')
            ->whereNull('consumed_at')
            ->latest('created_at')
            ->first();

        if (! $otp) {
            throw new RuntimeException('No active verification code for this request.');
        }
        if ($otp->expires_at->isPast()) {
            throw new RuntimeException('This verification code has expired. Request a new one.');
        }
        if ($otp->attempts >= $otp->max_attempts) {
            throw new RuntimeException('Too many incorrect attempts for this code.');
        }

        if (! hash_equals($otp->code_hash, $this->hash($purpose, $order->id, $otp->target, trim($code)))) {
            $otp->increment('attempts');
            $left = max(0, $otp->max_attempts - $otp->attempts);
            throw new RuntimeException("Incorrect verification code. {$left} attempt(s) remaining.");
        }

        $otp->update(['verified_at' => now(), 'consumed_at' => now()]);

        return $otp;
    }

    public function revealForTesting(Otp $otp): string
    {
        abort_unless(config('rna.otp_test_mode'), 404);
        abort_unless($otp->code_cipher, 404);

        return Crypt::decryptString($otp->code_cipher);
    }

    private function hash(string $purpose, int $orderId, string $target, string $code): string
    {
        return hash_hmac('sha256', "{$purpose}|{$orderId}|{$target}|{$code}", (string) config('app.key'));
    }

    private function dispatch(Order $order, string $purpose, string $channel, string $target, string $code): void
    {
        // Production delivery uses the configured SMS/e-mail provider. The console channel is
        // used by the local driver app in development environments.
        match ($channel) {
            'sms' => Notification::route('nexmo', $target)->notify(new \App\Notifications\OtpNotification($code, $purpose, $order)),
            'email' => Notification::route('mail', $target)->notify(new \App\Notifications\OtpNotification($code, $purpose, $order)),
            default => null,
        };
    }
}
