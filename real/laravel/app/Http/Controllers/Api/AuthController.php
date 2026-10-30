<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'min:6'],
        ]);

        $user = User::where('email', strtolower($credentials['email']))->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            return response()->json([
                'message' => 'These credentials do not match our records.',
                'errors' => ['email' => ['invalid credentials']],
            ], 401);
        }

        abort_if($user->status !== 'active', 403, 'This account has been suspended.');

        $token = $user->createToken('rnaship-client')->plainTextToken;
        $user->forceFill(['last_login_at' => now()])->save();

        \App\Models\AuditLog::create([
            'actor_id' => $user->id, 'actor_name' => $user->name, 'actor_role' => $user->role,
            'company_id' => $user->company_id, 'action' => 'auth.login', 'entity_type' => 'user',
            'entity_id' => (string) $user->id, 'ip' => $request->ip(),
        ]);

        return response()->json([
            'token' => $token,
            'user' => $user,
            'company' => $user->company,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Signed out.']);
    }

    public function me(Request $request)
    {
        return response()->json([
            'user' => $request->user(),
            'company' => $request->user()->company,
        ]);
    }

    public function forgotPassword(Request $request)
    {
        $request->validate(['email' => ['required', 'email']]);
        $status = Password::sendResetLink(['email' => $request->email]);

        // Never disclose whether the address exists.
        return response()->json(['message' => 'If that address is registered, a reset link has been sent.']);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'token' => ['required'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill(['password' => Hash::make($password)])->save();
            }
        );

        return $status === Password::PASSWORD_RESET
            ? response()->json(['message' => 'Password updated. You can now sign in.'])
            : response()->json(['message' => 'This password reset link is invalid or has expired.'], 400);
    }

    public function changePassword(Request $request)
    {
        $request->validate([
            'current_password' => ['required'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $user = $request->user();
        abort_unless(Hash::check($request->current_password, $user->password), 422,
            'The current password is incorrect.');

        $user->forceFill(['password' => Hash::make($request->password)])->save();

        return response()->json(['message' => 'Password updated.']);
    }

    public function profile(Request $request)
    {
        $user = $request->user();
        $orders = $user->company ? $user->company->orders() : collect();

        return response()->json([
            'user' => $user,
            'company' => $user->company,
            'stats' => [
                'total' => $orders->count(),
                'delivered' => $orders->where('status', 'DELIVERED')->count(),
                'active' => $orders->whereIn('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_SHOP', 'OTP_VERIFIED'])->count(),
                'cancelled' => $orders->where('status', 'CANCELLED')->count(),
            ],
        ]);
    }

    public function updateProfile(Request $request)
    {
        $company = $request->user()->company;
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2'],
            'phone' => ['required', 'string', 'min:8'],
            'address' => ['required', 'string', 'min:4'],
            'city' => ['required', 'string'],
            'email' => ['required', 'email'],
            'gst_number' => ['nullable', 'string', 'max:32'],
        ]);

        $company->update($data);

        return response()->json(['company' => $company->fresh(), 'message' => 'Company profile updated.']);
    }
}
