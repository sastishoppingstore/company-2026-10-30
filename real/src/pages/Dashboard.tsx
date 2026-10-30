import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight, Bell, CheckCircle2, Clock, MapPin, Package, Plus, Radio, ShoppingBag,
  Truck, XCircle, Zap,
} from 'lucide-react'
import { api, onApiEvent } from '../lib/api'
import { ORDER_STATUS_META, formatDateTime, relativeTime } from '../lib/format'
import type { AppNotification, Order } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { OrderProgress } from '../components/OrderProgress'
import { MapView } from '../components/MapView'
import { Badge, Button, Card, CardHeader, EmptyState, SectionTitle, Skeleton, StatCard, StatusBadge } from '../components/ui'

interface TrackPayload {
  location: { lat: number; lng: number; recorded_at: string; accuracy: number } | null
  gps: { status: string; last_update: string | null }
  route: { pickup: { lat: number; lng: number }; destination: { lat: number; lng: number } }
}

export function Dashboard() {
  const { user, company } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [track, setTrack] = useState<TrackPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [orderResult, notificationResult] = await Promise.all([
        api.get<{ data: Order[] }>('/orders', { per_page: 60 }),
        api.get<{ data: AppNotification[] }>('/notifications'),
      ])
      setOrders(orderResult.data)
      setNotifications(notificationResult.data.slice(0, 6))
    } catch {
      /* handled by empty states */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const off = onApiEvent(() => { void load() })
    return off
  }, [load])

  const active = useMemo(
    () => orders.filter((order) => ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_SHOP', 'OTP_VERIFIED'].includes(order.status)),
    [orders],
  )
  const drafts = useMemo(() => orders.filter((order) => order.status === 'DRAFT'), [orders])
  const delivered = useMemo(() => orders.filter((order) => order.status === 'DELIVERED'), [orders])
  const cancelled = useMemo(() => orders.filter((order) => order.status === 'CANCELLED'), [orders])
  const spotlight = active[0]

  useEffect(() => {
    if (!spotlight) { setTrack(null); return }
    const loadTrack = async () => {
      try {
        const result = await api.get<TrackPayload>(`/orders/${spotlight.id}/track`)
        setTrack(result)
      } catch {
        setTrack(null)
      }
    }
    void loadTrack()
    const timer = window.setInterval(loadTrack, 15000)
    const off = onApiEvent((event) => { if (event.type === 'driver.location' || event.type === 'order.updated') void loadTrack() })
    return () => { window.clearInterval(timer); off() }
  }, [spotlight])

  const completionRate = orders.length ? Math.round((delivered.length / orders.length) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-[22px] font-extrabold leading-tight text-navy-900 sm:text-[26px]">
            Good day, {user?.name?.split(' ')[0] ?? 'there'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {company?.name} · {active.length} active deliver{active.length === 1 ? 'y' : 'ies'} · {drafts.length} awaiting confirmation
          </p>
        </div>
        <Button icon={Plus} onClick={() => navigate('/orders/new')} size="md">New delivery</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[104px]" />)
        ) : (
          <>
            <StatCard label="Active deliveries" value={active.length} hint="Currently with a driver" icon={Truck} tone="progress" />
            <StatCard label="Awaiting confirmation" value={drafts.length} hint="Company OTP required" icon={Clock} tone="warning" />
            <StatCard label="Delivered" value={delivered.length} hint={`${completionRate}% of all orders`} icon={CheckCircle2} tone="success" />
            <StatCard label="Cancelled" value={cancelled.length} hint="Company or admin decision" icon={XCircle} tone="danger" />
          </>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* ------------------------------------------------------- spotlight */}
          <Card>
            <CardHeader
              icon={Radio}
              title={spotlight ? 'Live delivery in progress' : 'No delivery in progress'}
              subtitle={spotlight ? `Order ${spotlight.order_code} · ${spotlight.shop_name}` : 'Create an order to see live tracking here.'}
              action={spotlight ? <StatusBadge status={spotlight.status} /> : null}
            />
            {loading ? (
              <div className="space-y-3 p-5"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-24" /></div>
            ) : spotlight ? (
              <div className="grid gap-5 p-5 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="rounded-xl border border-hairline bg-navy-50/50 p-4">
                    <OrderProgress status={spotlight.status} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <Detail label="Destination" value={spotlight.shop_name} mono={false} />
                    <Detail label="Shop code" value={spotlight.shop_code} mono />
                    <Detail label="Receiver" value={spotlight.receiver_name} mono={false} />
                    <Detail label="Items" value={`${spotlight.quantity} × ${spotlight.item_description}`} mono={false} />
                  </dl>
                  {track?.gps.status === 'live' ? (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700">
                      <span className="rna-live-pulse h-2 w-2 rounded-full bg-emerald-500" />
                      GPS live · updated {relativeTime(track.gps.last_update)}
                    </div>
                  ) : track?.gps.status === 'stale' ? (
                    <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
                      <Clock size={13} /> Last known location · {relativeTime(track.gps.last_update)}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-600">
                      <Clock size={13} /> Location sharing has not started yet
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button icon={MapPin} variant="accent" onClick={() => navigate(`/orders/${spotlight.id}/track`)}>Track live</Button>
                    <Button variant="secondary" onClick={() => navigate(`/orders/${spotlight.id}`)}>Order details</Button>
                  </div>
                </div>
                <MapView
                  className="h-[260px] lg:h-full lg:min-h-[300px]"
                  interactive={false}
                  pins={[
                    { lat: spotlight.pickup_lat, lng: spotlight.pickup_lng, kind: 'pickup', label: 'Pickup' },
                    { lat: spotlight.dest_lat, lng: spotlight.dest_lng, kind: 'destination', label: spotlight.shop_name },
                    ...(track?.location ? [{ lat: track.location.lat, lng: track.location.lng, kind: 'driver' as const, label: 'Driver' }] : []),
                  ]}
                />
              </div>
            ) : (
              <EmptyState
                icon={Package}
                title="Nothing on the road right now"
                description="Create a delivery order and a driver will be notified immediately."
                action={<Button icon={Plus} onClick={() => navigate('/orders/new')}>Create delivery order</Button>}
              />
            )}
          </Card>

          {/* --------------------------------------------------- recent orders */}
          <Card>
            <CardHeader
              icon={ShoppingBag}
              title="Recent orders"
              subtitle="Latest activity across your company"
              action={
                <Link to="/orders">
                  <Button variant="ghost" size="sm" icon={ArrowRight}>All orders</Button>
                </Link>
              }
            />
            {loading ? (
              <div className="space-y-2 p-5">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-14" />)}</div>
            ) : orders.length === 0 ? (
              <EmptyState icon={Package} title="No orders yet" description="Your first delivery order will appear here." />
            ) : (
              <ul className="divide-y divide-hairline">
                {orders.slice(0, 6).map((order) => (
                  <li key={order.id}>
                    <Link to={`/orders/${order.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-navy-50/60">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-navy-50 font-mono text-[10px] font-bold text-navy-700">
                        {order.order_code.slice(-4)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold text-navy-900">{order.shop_name}</p>
                        <p className="truncate text-[11px] text-slate-500">
                          <span className="font-mono">{order.order_code}</span> · {order.quantity} × {order.item_description}
                        </p>
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        <StatusBadge status={order.status} />
                        <p className="mt-1 text-[11px] text-slate-400">{relativeTime(order.created_at)}</p>
                      </div>
                      <ArrowRight size={15} className="shrink-0 text-slate-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ----------------------------------------------------- right column */}
        <div className="space-y-5">
          {drafts.length ? (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader
                icon={Zap}
                title="Action required"
                subtitle="Confirm these orders with the OTP sent to your authorised contact"
              />
              <ul className="divide-y divide-amber-200/70">
                {drafts.map((order) => (
                  <li key={order.id} className="px-5 py-3.5">
                    <Link to={`/orders/${order.id}`} className="block">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-bold text-navy-900">{order.shop_name}</p>
                        <Badge tone="warning">OTP pending</Badge>
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-slate-500">{order.order_code}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader icon={MapPin} title="Demo destination" subtitle="Preloaded for the sample bag shipment" />
            <div className="p-5">
              <div className="rounded-xl border border-hairline bg-navy-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-navy-900">RNA General Store</p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-500">RNA-001 · Shivaji Nagar, Pune</p>
                  </div>
                  <Badge tone="info">Demo</Badge>
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-slate-600">
                  Registered receivers are ready for delivery OTP verification and signature capture.
                </p>
              </div>
              <Button className="mt-3 w-full" variant="secondary" icon={Plus} onClick={() => navigate('/orders/new')}>
                Send a bag to RNA General Store
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={Bell}
              title="Latest activity"
              subtitle="In-app and email notifications"
              action={
                <Link to="/notifications">
                  <Button variant="ghost" size="sm" icon={ArrowRight}>View</Button>
                </Link>
              }
            />
            {notifications.length === 0 ? (
              <EmptyState icon={Bell} title="No notifications" description="Updates about your shipments appear here." />
            ) : (
              <ul className="divide-y divide-hairline">
                {notifications.slice(0, 5).map((notification) => (
                  <li key={notification.id} className="px-5 py-3">
                    <div className="flex items-start gap-2.5">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.read_at ? 'bg-slate-300' : 'bg-brand-500'}`} />
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold leading-snug text-navy-900">{notification.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-slate-500">{notification.body}</p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          {notification.channel} · {formatDateTime(notification.created_at)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-0.5 text-[13px] font-semibold text-navy-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
