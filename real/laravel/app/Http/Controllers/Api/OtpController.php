<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Otp;
use App\Services\OtpService;
use Illuminate\Http\Request;

class OtpController extends Controller
{
    public function __construct(private OtpService $otps) {}

    /**
     * Demo test mode only. Production never returns a code through the API.
     */
    public function showTestCode(Request $request)
    {
        $request->validate([
            'order_id' => ['required'],
            'purpose' => ['required', 'in:order_confirmation,delivery_verification'],
        ]);

        $otp = Otp::where('order_id', $request->order_id)
            ->where('purpose', $request->purpose)
            ->latest('created_at')->first();

        abort_unless($otp, 404, 'No active code for this request.');

        return response()->json([
            'code' => $this->otps->revealForTesting($otp),
            'purpose' => $otp->purpose,
            'expires_at' => $otp->expires_at,
            'attempts' => $otp->attempts,
            'max_attempts' => $otp->max_attempts,
        ]);
    }
}
