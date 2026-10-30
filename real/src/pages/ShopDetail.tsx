import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Phone, Plus, Star, Store, UserCheck } from 'lucide-react'
import { api } from '../lib/api'
import type { Order, Shop, ShopReceiver } from '../lib/types'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton, StatusBadge } from '../components/ui'
import { MapView } from '../components/MapView'

export function ShopDetail() {
  const { shopId } = useParams()
  const [shop, setShop] = useState<Shop | null>(null)
  const [receivers, setReceivers] = useState<ShopReceiver[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const result = await api.get<{ shop: Shop; receivers: ShopReceiver[]; recent_orders: Order[] }>(`/shops/${shopId}`)
        setShop(result.shop)
        setReceivers(result.receivers)
        setOrders(result.recent_orders)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load this shop.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [shopId])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-44" />
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      </div>
    )
  }

  if (error || !shop) {
    return <ErrorState message={error ?? 'Shop not found.'} onRetry={() => window.location.reload()} />
  }

  return (
    <div className="space-y-5">
      <Link to="/shops" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 transition hover:text-navy-800">
        <ArrowLeft size={15} /> Shop directory
      </Link>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-extrabold text-navy-900">{shop.name}</h1>
              {shop.is_demo ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-700">Demo shop</span> : null}
              <Badge tone={shop.status === 'active' ? 'success' : 'neutral'}>{shop.status}</Badge>
            </div>
            <p className="mt-1.5 font-mono text-[12px] font-semibold text-brand-600">{shop.code}</p>
            <div className="mt-4 grid gap-2 text-[13px] text-slate-600 sm:grid-cols-2">
              <span className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" /> {shop.address}, {shop.city} {shop.postal_code}</span>
              <span className="flex items-center gap-2"><Phone size={14} className="shrink-0 text-slate-400" /> <span className="font-mono">{shop.phone}</span></span>
              <span className="flex items-center gap-2"><Star size={14} className="shrink-0 text-amber-400" /> {shop.rating.toFixed(1)} rating</span>
              <span className="flex items-center gap-2"><Store size={14} className="shrink-0 text-slate-400" /> {shop.category}</span>
            </div>
            {shop.notes ? (
              <p className="mt-4 max-w-2xl rounded-xl border border-hairline bg-navy-50/60 px-4 py-3 text-[12.5px] leading-relaxed text-slate-600">
                {shop.notes}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <Link to="/orders/new">
              <Button icon={Plus} className="w-full sm:w-auto">Send delivery here</Button>
            </Link>
            <p className="text-center text-[11px] text-slate-400">Receiver OTP + signature required</p>
          </div>
        </div>
        <div className="border-t border-hairline p-5">
          <MapView
            className="h-[280px]"
            pins={[{ lat: shop.lat, lng: shop.lng, kind: 'destination', label: shop.name }]}
          />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={UserCheck} title="Authorised receivers" subtitle="These contacts can receive the delivery OTP" />
          {receivers.length === 0 ? (
            <EmptyState icon={UserCheck} title="No registered receivers" description="Contact the platform administrator to register a receiver." />
          ) : (
            <ul className="divide-y divide-hairline">
              {receivers.map((receiver) => (
                <li key={receiver.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy-50 text-[12px] font-bold text-navy-700">
                    {receiver.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-navy-900">{receiver.name}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-500">{receiver.phone}</p>
                    <p className="truncate text-[11px] text-slate-400">{receiver.email}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[11px] font-semibold text-slate-600">{receiver.role}</span>
                    {receiver.is_primary ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">Primary</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader icon={Store} title="Your recent deliveries here" subtitle="Company-scoped — other companies' orders are never exposed" />
          {orders.length === 0 ? (
            <EmptyState icon={Store} title="No deliveries to this shop yet" description="Create an order to get started." />
          ) : (
            <ul className="divide-y divide-hairline">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link to={`/orders/${order.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-navy-50/60">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[12px] font-bold text-navy-900">{order.order_code}</p>
                      <p className="mt-0.5 truncate text-[11.5px] text-slate-500">{order.quantity} × {order.item_description}</p>
                    </div>
                    <StatusBadge status={order.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
