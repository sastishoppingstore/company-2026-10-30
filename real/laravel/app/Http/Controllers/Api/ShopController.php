<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Shop;
use Illuminate\Http\Request;

class ShopController extends Controller
{
    public function index(Request $request)
    {
        $query = Shop::query();

        if ($request->filled('search')) {
            $search = '%'.$request->search.'%';
            $query->where(fn ($q) => $q->where('name', 'like', $search)
                ->orWhere('code', 'like', $search)
                ->orWhere('address', 'like', $search));
        }
        if ($request->filled('city')) {
            $query->where('city', 'like', '%'.$request->city.'%');
        }
        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        return response()->json([
            'data' => $query->orderBy('name')->get()->map(function (Shop $shop) {
                return [...$shop->toArray(), 'receiver_count' => $shop->receivers()->where('status', 'active')->count()];
            }),
        ]);
    }

    public function show(Request $request, Shop $shop)
    {
        $user = $request->user();
        $orders = Order::where('shop_id', $shop->id)
            ->when($user->company_id, fn ($q) => $q->where('company_id', $user->company_id))
            ->latest()->limit(5)->get();

        return response()->json([
            'shop' => $shop,
            'receivers' => $shop->receivers,
            'recent_orders' => $orders,
        ]);
    }
}
