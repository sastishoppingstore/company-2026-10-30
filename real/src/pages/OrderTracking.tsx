import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Clock, LocateFixed, MapPin, Navigation, Phone, Radio, Signal, Truck,
} from 'lucide-react'
import { api } from '../lib/api'
import { onApiEvent } from '../lib/api'
import { formatDateTime, relativeTime } from '../lib/format'
import type { Order } from '../lib/types'
import { Alert, Badge, Button, Card, CardHeader, ErrorState, Skeleton, StatusBadge } from '../components/ui'
import { MapView } from '../components/MapView'

interface TrackPayload {
  order: Order
  driver: { id: string; name: string; phone: string; vehicle: { type: string; model: string; plate: string; color: string } | null } | null
  location: { lat: number; lng: number; accuracy: number; recorded_at: string; speed: number; heading: number; battery: number } | null
  gps: { status: string; last_update: string | null; accuracy: number | null; permission: string }
  route: { pickup: { label: string; lat: number; lng: number }; destination: { label: string; lat: number; lng: number } }
  trail: Array<{ lat: number; lng: number; recorded_at: string }>
  eta_minutes: number
  distance_km: number
}

export function OrderTracking() {
  const { orderId } = useParams()
  const [data, setData] = useState<TrackPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await api.get<TrackPayload>(`/orders/${orderId}/track`)
      setData(result)
      setUpdatedAt(new Date().toISOString())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tracking data.')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { void load() }, 10000)
    const off = onApiEvent((event) => {
      if (event.type === 'driver.location' || event.type === 'order.updated') void load()
    })
    return () => { window.clearInterval(timer); off() }
  }, [load])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-[420px]" />
        <div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      </div>
    )
  }

  if (error || !data) {
    return <ErrorState message={error ?? 'Tracking unavailable.'} onRetry={() => void load()} />
  }

  const { order, driver, location, gps, route, trail } = data
  const pins = [
    { lat: route.pickup.lat, lng: route.pickup.lng, kind: 'pickup' as const, label: 'Pickup' },
    { lat: route.destination.lat, lng: route.destination.lng, kind: 'destination' as const, label: order.shop_name },
    ...(location ? [{ lat: location.lat, lng: location.lng, kind: 'driver' as const, label: driver?.name ?? 'Driver' }] : []),
  ]

  return (
    <div className="space-y-5">
      <Link to={`/orders/${order.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 transition hover:text-navy-800">
        <ArrowLeft size={15} /> Back to order
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-extrabold leading-tight text-navy-900 sm:text-[26px]">Live tracking</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1.5 font-mono text-[13px] font-semibold text-navy-700">{order.order_code} · {order.shop_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 ring-1 ring-hairline">
            <Clock size={12} /> refreshed {updatedAt ? relativeTime(updatedAt) : '—'}
          </span>
          <Button variant="secondary" size="sm" icon={LocateFixed} onClick={() => void load()}>Refresh</Button>
        </div>
      </div>

      {gps.status === 'unavailable' ? (
        <Alert tone="warning" title="No GPS fix yet">
          The driver has not shared a location for this job. The map shows the planned route until the first update arrives.
        </Alert>
      ) : null}
      {gps.status === 'stale' ? (
        <Alert tone="warning" title="Location may be stale">
          The last update was {relativeTime(gps.last_update)}. The driver app sends a new fix every few seconds while the job is active.
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <MapView className="h-[380px] sm:h-[460px]" pins={pins} path={trail} />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">GPS signal</p>
          <p className="mt-1.5 flex items-center gap-2 text-[15px] font-bold text-navy-900">
            {gps.status === 'live'
              ? <><span className="rna-live-pulse h-2.5 w-2.5 rounded-full bg-emerald-500" /> Live</>
              : gps.status === 'stale'
                ? <><Signal size={15} className="text-amber-500" /> Stale</>
                : <><Signal size={15} className="text-slate-400" /> Unavailable</>}
          </p>
          <p className="mt-1 text-[11.5px] text-slate-500">
            Last fix {relativeTime(gps.last_update)}
            {gps.accuracy ? ` · ±${Math.round(gps.accuracy)} m` : ''}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Permission</p>
          <p className="mt-1.5 flex items-center gap-2 text-[15px] font-bold text-navy-900">
            <Radio size={15} className="text-brand-600" /> {gps.permission === 'granted' ? 'Granted' : 'Unknown'}
          </p>
          <p className="mt-1 text-[11.5px] text-slate-500">Background sharing on an active job</p>
        </Card>

        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">ETA / distance</p>
          <p className="mt-1.5 flex items-center gap-2 text-[15px] font-bold text-navy-900">
            <Navigation size={15} className="text-brand-600" /> {data.eta_minutes} min
          </p>
          <p className="mt-1 text-[11.5px] text-slate-500">{data.distance_km} km planned route</p>
        </Card>

        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Driver</p>
          {driver ? (
            <>
              <p className="mt-1.5 text-[15px] font-bold text-navy-900">{driver.name}</p>
              <p className="mt-1 font-mono text-[11.5px] text-slate-500">
                {driver.vehicle ? `${driver.vehicle.plate} · ${driver.vehicle.type}` : driver.phone}
              </p>
              <a href={`tel:${driver.phone}`} className="mt-2 inline-block">
                <Button size="xs" variant="secondary" icon={Phone}>Call driver</Button>
              </a>
            </>
          ) : (
            <p className="mt-1.5 text-[13px] text-slate-500">Not assigned yet</p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader icon={MapPin} title="Route" subtitle="Pickup point, destination and the recorded trail" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="rounded-xl border border-hairline p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Pickup</p>
            <p className="mt-1.5 text-[13px] font-semibold leading-relaxed text-navy-900">{route.pickup.label}</p>
            <p className="mt-1 font-mono text-[11px] text-slate-400">{route.pickup.lat}, {route.pickup.lng}</p>
          </div>
          <div className="rounded-xl border border-hairline p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Destination</p>
            <p className="mt-1.5 text-[13px] font-semibold leading-relaxed text-navy-900">{route.destination.label}</p>
            <p className="mt-1 font-mono text-[11px] text-slate-400">{route.destination.lat}, {route.destination.lng}</p>
          </div>
        </div>
        <div className="border-t border-hairline px-5 py-4">
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-500">
            <Badge tone="info">{trail.length} trail point(s)</Badge>
            <span className="flex items-center gap-1.5"><Truck size={13} /> Location is posted by the driver app while the job is active.</span>
            {location ? <span className="font-mono">speed {location.speed} km/h · battery {location.battery}%</span> : null}
            {gps.last_update ? <span>Last update {formatDateTime(gps.last_update)}</span> : null}
          </div>
        </div>
      </Card>
    </div>
  )
}
