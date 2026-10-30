import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Clock, Inbox, MapPin, Package, Route, Truck, X } from 'lucide-react'
import { api, ApiClientError } from '../../lib/api'
import { onApiEvent } from '../../lib/api'
import { formatDateTime, relativeTime } from '../../lib/format'
import type { Order } from '../../lib/types'
import { Badge, Button, Card, CardHeader, EmptyState, Skeleton, StatusBadge, useToast } from '../../components/ui'

interface DriverJobsPayload {
  offers: Order[]
  active: Order[]
  history: Order[]
}

export function DriverHome() {
  const navigate = useNavigate()
  const { push } = useToast()
  const [data, setData] = useState<DriverJobsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await api.get<DriverJobsPayload>('/driver/jobs')
      setData(result)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { void load() }, 20000)
    const off = onApiEvent(() => { void load() })
    return () => { window.clearInterval(timer); off() }
  }, [load])

  const accept = async (order: Order) => {
    setBusy(order.id)
    try {
      await api.post(`/driver/jobs/${order.id}/accept`)
      push({ tone: 'success', title: 'Job accepted', message: `${order.order_code} is now assigned to you.` })
      await load()
    } catch (err) {
      push({ tone: 'danger', title: 'Could not accept', message: err instanceof ApiClientError ? err.message : 'Please try again.' })
    } finally {
      setBusy(null)
    }
  }

  const decline = async (order: Order) => {
    setBusy(order.id)
    try {
      await api.post(`/driver/jobs/${order.id}/decline`)
      push({ tone: 'info', title: 'Offer declined', message: 'The order has been returned to the assignment queue.' })
      await load()
    } catch (err) {
      push({ tone: 'danger', title: 'Could not decline', message: err instanceof ApiClientError ? err.message : 'Please try again.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold leading-tight text-navy-900 sm:text-[26px]">Driver console</h1>
        <p className="mt-1 text-sm text-slate-500">Offers, active jobs and your completed deliveries. All actions are enforced by the API.</p>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28" />)}</div>
      ) : (
        <>
          {data?.active.length ? (
            <Card className="border-brand-200 bg-brand-50/30">
              <CardHeader icon={Truck} title="Active job" subtitle="You are currently assigned to this delivery" />
              <div className="space-y-4 p-5">
                {data.active.map((order) => (
                  <div key={order.id} className="flex flex-col gap-3 rounded-xl border border-hairline bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-[13px] font-bold text-navy-900">{order.order_code}</p>
                        <StatusBadge status={order.status} />
                      </div>
                      <p className="mt-1 text-[13px] font-semibold text-navy-800">{order.shop_name}</p>
                      <p className="mt-0.5 text-[11.5px] text-slate-500">Receiver: {order.receiver_name} · {order.receiver_phone}</p>
                    </div>
                    <Button icon={ArrowRight} variant="accent" onClick={() => navigate(`/driver/jobs/${order.id}`)}>Open job</Button>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader icon={Inbox} title="Available offers" subtitle="Jobs you are eligible to accept" />
            {!data?.offers.length ? (
              <EmptyState icon={Inbox} title="No offers right now" description="You will be notified as soon as a delivery in your area is released." />
            ) : (
              <ul className="divide-y divide-hairline">
                {data.offers.map((order) => (
                  <li key={order.id} className="space-y-3 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-[13px] font-bold text-navy-900">{order.order_code}</p>
                          <Badge tone="warning">{order.priority}</Badge>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="mt-1.5 text-[14px] font-bold text-navy-900">{order.shop_name}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-500">{order.shop_code}</p>
                      </div>
                      <div className="text-right text-[12px] text-slate-500">
                        <p className="font-semibold text-navy-900">{order.distance_km} km</p>
                        <p>~{order.eta_minutes} min drive</p>
                      </div>
                    </div>

                    <div className="grid gap-2 text-[12px] text-slate-600 sm:grid-cols-2">
                      <span className="flex items-start gap-1.5"><MapPin size={13} className="mt-0.5 shrink-0 text-slate-400" /> {order.pickup_address}</span>
                      <span className="flex items-start gap-1.5"><Route size={13} className="mt-0.5 shrink-0 text-slate-400" /> {order.destination_address}</span>
                      <span className="flex items-start gap-1.5"><Package size={13} className="mt-0.5 shrink-0 text-slate-400" /> {order.quantity} × {order.item_description}</span>
                      <span className="flex items-start gap-1.5"><Clock size={13} className="mt-0.5 shrink-0 text-slate-400" /> Requested {formatDateTime(order.requested_delivery_at)}</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button icon={CheckCircle2} loading={busy === order.id} onClick={() => void accept(order)}>Accept job</Button>
                      <Button variant="secondary" icon={X} loading={busy === order.id} onClick={() => void decline(order)}>Decline</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader icon={Package} title="Completed jobs" subtitle="Your delivery history" />
            {!data?.history.length ? (
              <EmptyState icon={Package} title="No completed deliveries yet" description="Accepted and finished jobs appear here." />
            ) : (
              <ul className="divide-y divide-hairline">
                {data.history.map((order) => (
                  <li key={order.id}>
                    <Link to={`/driver/jobs/${order.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-navy-50/60">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[12.5px] font-bold text-navy-900">{order.order_code}</p>
                        <p className="mt-0.5 truncate text-[11.5px] text-slate-500">{order.shop_name} · {relativeTime(order.delivered_at ?? order.created_at)}</p>
                      </div>
                      <StatusBadge status={order.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
