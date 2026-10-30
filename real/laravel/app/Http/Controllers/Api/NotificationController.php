<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmailRecord;
use App\Models\Notification;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Notification::query()->when($user->company_id, fn ($q) => $q->where('company_id', $user->company_id));

        $rows = $query->orderByDesc('created_at')->limit(100)->get();

        return response()->json([
            'data' => $rows,
            'unread' => $rows->whereNull('read_at')->count(),
        ]);
    }

    public function readAll(Request $request)
    {
        Notification::where('company_id', $request->user()->company_id)
            ->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json(['message' => 'All notifications marked as read.']);
    }

    public function read(Request $request, Notification $notification)
    {
        abort_unless($notification->company_id === $request->user()->company_id, 403);
        $notification->forceFill(['read_at' => now()])->save();

        return response()->json(['message' => 'Marked as read.']);
    }

    public function emails(Request $request)
    {
        $rows = EmailRecord::where('company_id', $request->user()->company_id)->orderByDesc('created_at')->get();

        return response()->json([
            'data' => $rows,
            'transport' => config('rna.mail.transport'),
            'from' => config('rna.mail.from'),
        ]);
    }
}
