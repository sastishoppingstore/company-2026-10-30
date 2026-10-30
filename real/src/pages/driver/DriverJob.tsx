import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, Ban, Camera, CheckCircle2, ClipboardCheck, Flag, MapPin, Navigation,
  Package, Phone, Route, ShieldAlert, Truck,
} from 'lucide-react'
import { api, ApiClientError } from '../../lib/api'
import { onApiEvent } from '../../lib/api'
import { formatDateTime, relativeTime } from '../../lib/format'
import type { Order, Shop, ShopReceiver, StoredFile } from '../../lib/types'
import {
  Alert, Badge, Button, Card, CardHeader, ErrorState, Field, Input, Modal, Skeleton, StatusBadge, Textarea, useToast,
} from '../../components/ui'
import { MapView } from '../../components/MapView'
import { OtpConfirm } from '../../components/OtpConfirm'
import { SignaturePad } from '../../components/SignaturePad'
import { PhotoCapture } from '../../components/PhotoCapture'

interface DriverOrderPayload {
  order: Order
  shop: Shop | null
  receiver: ShopReceiver | null
  files: StoredFile[]
  trail: Array<{ lat: number; lng: number; recorded_at: string }>
}

type GpsMode = 'idle' | 'live' | 'demo' | 'error'

export function DriverJob() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { push } = useToast()
  const [data, setData] = useState<DriverOrderPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [gpsMode, setGpsMode] = useState<GpsMode>('idle')
  const [gpsNote, setGpsNote] = useState<string | null>(null)
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [telemetry, setTelemetry] = useState<{ speed?: number; battery?: number; accuracy?: number }>({})
  const [receiverName, setReceiverName] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [proofErrors, setProofErrors] = useState<Record<string, string>>({})
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueType, setIssueType] = useState('vehicle_breakdown')
  const [issueText, setIssueText] = useState('')
  const demoProgress = useRef(0)

  const load = useCallback(async () => {
    try {
      const result = await api.get<DriverOrderPayload>(`/driver/orders/${orderId}`)
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load this job.')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { void load() }, [load])

  const order = data?.order

  /* ------------------------------------------------ live location sharing */
  useEffect(() => {
    if (!order || order.status !== 'IN_TRANSIT') return
    let watchId: number | null = null
    let interval: number | null = null
    let stopped = false

    const post = async (lat: number, lng: number, extra: Record<string, unknown> = {}) => {
      try {
        await api.post(`/driver/orders/${order.id}/location`, { lat, lng, ...extra })
      } catch {
        /* transient failures are retried by the next tick */
      }
    }

    const startDemo = () => {
      if (stopped || demoProgress.current > 0) return
      demoProgress.current = 0.02
      setGpsMode('demo')
      setGpsNote('Device GPS is unavailable in this preview environment, so the route is simulated. Real devices post genuine device coordinates.')
      interval = window.setInterval(() => {
        demoProgress.current = Math.min(1, demoProgress.current + 0.035)
        const progress = demoProgress.current
        const lat = order.pickup_lat + (order.dest_lat - order.pickup_lat) * progress
        const lng = order.pickup_lng + (order.dest_lng - order.pickup_lng) * progress
        setPosition({ lat, lng })
        void post(lat, lng, { accuracy: 12, speed: 24, heading: 62, battery: 76 })
      }, 5000)
    }

    if (!('geolocation' in navigator)) {
      startDemo()
    } else {
      watchId = navigator.geolocation.watchPosition(
        (positionEvent) => {
          setGpsMode('live')
          setGpsNote(null)
          const lat = positionEvent.coords.latitude
          const lng = positionEvent.coords.longitude
          setPosition({ lat, lng })
          setTelemetry({
            speed: positionEvent.coords.speed ?? undefined,
            accuracy: positionEvent.coords.accuracy ?? undefined,
            battery: (positionEvent.coords as any).battery ?? undefined,
          })
          void post(lat, lng, {
            accuracy: positionEvent.coords.accuracy,
            heading: positionEvent.coords.heading ?? 0,
            speed: positionEvent.coords.speed ?? 0,
          })
        },
        () => {
          setGpsMode('error')
          startDemo()
        },
        { enableHighAccuracy: true, maximumAge: 4000, timeout: 8000 },
      )
    }

    return () => {
      stopped = true
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      if (interval !== null) window.clearInterval(interval)
    }
  }, [order?.id, order?.status])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (error || !data || !order) {
    return <ErrorState message={error ?? 'Job not found.'} onRetry={() => void load()} />
  }

  const act = async (path: string, body?: unknown, successMessage?: string) => {
    setBusy(true)
    try {
      await api.post(`/driver/orders/${order.id}${path}`, body)
      if (successMessage) push({ tone: 'success', title: successMessage })
      await load()
    } catch (err) {
      push({ tone: 'danger', title: 'Action blocked', message: err instanceof ApiClientError ? err.message : 'Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  const attemptCancel = async () => {
    setBusy(true)
    try {
      await api.post(`/driver/orders/${order.id}/cancel`)
    } catch (err) {
      push({
        tone: 'warning',
        title: 'Cancellation not permitted',
        message: err instanceof ApiClientError ? err.message : 'Drivers cannot cancel an accepted job.',
      })
    } finally {
      setBusy(false)
    }
  }

  const submitDelivery = async () => {
    const errors: Record<string, string> = {}
    if (receiverName.trim().length < 2) errors.receiver_name = 'Record who received the bag.'
    if (!signature) errors.signature = 'Capture the receiver signature.'
    if (!photo) errors.photo = 'Attach a delivery photograph.'
    setProofErrors(errors)
    if (Object.keys(errors).length) return
    setBusy(true)
    try {
      await api.post(`/driver/orders/${order.id}/deliver`, {
        receiver_name: receiverName.trim(),
        signature,
        photo,
      })
      push({ tone: 'success', title: 'Delivery completed', message: 'The company has been notified by email and in-app alert.' })
      await load()
    } catch (err) {
      push({ tone: 'danger', title: 'Could not complete', message: err instanceof ApiClientError ? err.message : 'Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  const submitIssue = async () => {
    if (issueText.trim().length < 5) {
      push({ tone: 'danger', title: 'Add a description', message: 'Describe the issue in at least 5 characters.' })
      return
    }
    await act('/report-issue', { type: issueType, description: issueText }, 'Issue reported to the Super Admin')
    setIssueOpen(false)
    setIssueText('')
  }

  const pins = [
    { lat: order.pickup_lat, lng: order.pickup_lng, kind: 'pickup' as const, label: 'Pickup' },
    { lat: order.dest_lat, lng: order.dest_lng, kind: 'destination' as const, label: order.shop_name },
    ...(position ? [{ lat: position.lat, lng: position.lng, kind: 'driver' as const, label: 'You' }] : []),
  ]

  return (
    <div className="space-y-5">
      <Link to="/driver" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 transition hover:text-navy-800">
        <ArrowLeft size={15} /> Driver console
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-[22px] font-extrabold tracking-tight text-navy-900 sm:text-[26px]">{order.order_code}</h1>
            <StatusBadge status={order.status} />
            <Badge tone="warning">{order.priority}</Badge>
          </div>
          <p className="mt-1.5 text-sm text-slate-500">{order.shop_name} · {order.shop_code} · {order.quantity} × {order.item_description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.assigned_driver_id && ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_SHOP', 'OTP_VERIFIED'].includes(order.status) ? (
            <>
              <Button variant="secondary" icon={Flag} onClick={() => setIssueOpen(true)}>Report issue</Button>
              <Button variant="ghost" icon={Ban} onClick={() => void attemptCancel()}>Cancel job</Button>
            </>
          ) : null}
        </div>
      </div>

      {gpsMode === 'demo' || gpsMode === 'error' ? (
        <Alert tone="warning" title={gpsMode === 'error' ? 'Device GPS unavailable' : 'Simulated GPS (preview only)'}>
          {gpsNote ?? 'Location could not be obtained from the device.'}
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <MapView className="h-[320px] sm:h-[380px]" pins={pins} path={data.trail} />
        <div className="flex flex-wrap items-center gap-3 border-t border-hairline px-5 py-3 text-[11.5px] text-slate-500">
          <span className="flex items-center gap-1.5 font-semibold text-navy-800">
            <Navigation size={13} className="text-brand-600" />
            {gpsMode === 'live' ? 'Live GPS' : gpsMode === 'demo' ? 'Simulated GPS' : 'GPS not started'}
          </span>
          {telemetry.speed !== undefined ? <span>Speed {Math.round(telemetry.speed)} m/s</span> : null}
          {telemetry.accuracy !== undefined ? <span>Accuracy ±{Math.round(telemetry.accuracy)} m</span> : null}
          <span>Last fix {relativeTime(order.last_location_at)}</span>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {order.status === 'ACCEPTED' ? (
            <Card>
              <CardHeader icon={Package} title="Collect the bag" subtitle="Confirm the pickup only after the bag is physically in your vehicle" />
              <div className="space-y-4 p-5">
                <div className="rounded-xl border border-hairline bg-navy-50/60 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Pickup point</p>
                  <p className="mt-1.5 text-[13.5px] font-semibold text-navy-900">{order.pickup_address}</p>
                </div>
                <Button icon={CheckCircle2} loading={busy} onClick={() => void act('/pickup', undefined, 'Pickup confirmed')}>
                  Confirm pickup
                </Button>
              </div>
            </Card>
          ) : null}

          {order.status === 'PICKED_UP' ? (
            <Card>
              <CardHeader icon={Navigation} title="Start the trip" subtitle="Starting the trip enables live location sharing for the company" />
              <div className="space-y-4 p-5">
                <Alert tone="info" title="Location sharing">Once started, the company and Super Admin can follow your position on the map.</Alert>
                <Button icon={Navigation} loading={busy} onClick={() => void act('/start-trip', undefined, 'Trip started — location sharing is live')}>
                  Start trip
                </Button>
              </div>
            </Card>
          ) : null}

          {order.status === 'IN_TRANSIT' ? (
            <Card>
              <CardHeader icon={MapPin} title="On the way" subtitle="Share your arrival at the shop to release the delivery code" />
              <div className="space-y-4 p-5">
                <div className="rounded-xl border border-hairline bg-navy-50/60 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Destination</p>
                  <p className="mt-1.5 text-[13.5px] font-semibold text-navy-900">{order.destination_address}</p>
                  <p className="mt-1 text-[12px] text-slate-500">Receiver: {order.receiver_name} · <span className="font-mono">{order.receiver_phone}</span></p>
                </div>
                <Button icon={MapPin} loading={busy} onClick={() => void act('/arrive', undefined, 'Arrival recorded — delivery code issued')}>
                  Arrived at shop
                </Button>
              </div>
            </Card>
          ) : null}

          {order.status === 'ARRIVED_AT_SHOP' ? (
            <Card>
              <CardHeader icon={ClipboardCheck} title="Verify the receiver" subtitle="Ask the receiver for the 6-digit delivery code sent to their registered phone" />
              <div className="p-5">
                <OtpConfirm
                  orderId={order.id}
                  purpose="delivery_verification"
                  target={order.receiver_phone}
                  hint="This code proves the shop received the goods — it is separate from the company confirmation code."
                  onVerify={async (code) => {
                    await api.post(`/driver/orders/${order.id}/verify-otp`, { otp: code })
                    push({ tone: 'success', title: 'Delivery code verified', message: 'Capture the signature and photograph to complete the handover.' })
                    await load()
                  }}
                />
              </div>
            </Card>
          ) : null}

          {order.status === 'OTP_VERIFIED' ? (
            <Card>
              <CardHeader icon={Camera} title="Proof of delivery" subtitle="Record who received the bag, capture their signature and take a photo" />
              <div className="space-y-4 p-5">
                <Field label="Received by (name)" required error={proofErrors.receiver_name}>
                  <Input value={receiverName} invalid={Boolean(proofErrors.receiver_name)} onChange={(event) => setReceiverName(event.target.value)} placeholder="Full name of the person who took the bag" />
                </Field>
                <div>
                  <SignaturePad onChange={setSignature} />
                  {proofErrors.signature ? <p className="mt-1.5 text-xs font-medium text-rose-600">{proofErrors.signature}</p> : null}
                </div>
                <div>
                  <PhotoCapture onChange={setPhoto} />
                  {proofErrors.photo ? <p className="mt-1.5 text-xs font-medium text-rose-600">{proofErrors.photo}</p> : null}
                </div>
                <Button icon={CheckCircle2} loading={busy} onClick={() => void submitDelivery()}>Complete handover</Button>
              </div>
            </Card>
          ) : null}

          {order.status === 'DELIVERED' ? (
            <Card className="border-emerald-200 bg-emerald-50/40">
              <CardHeader icon={CheckCircle2} title="Delivery completed" subtitle={`Received by ${order.receiver_name} at ${formatDateTime(order.delivered_at)}`} />
              <div className="space-y-3 p-5">
                <p className="text-[13px] leading-relaxed text-slate-600">
                  The company has been notified in-app and by email with a secure link to the proof of delivery.
                </p>
                <Button variant="secondary" onClick={() => navigate('/driver')}>Back to jobs</Button>
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader icon={Route} title="Job details" />
            <dl className="space-y-2.5 p-5 text-[12.5px]">
              <Row label="Pickup" value={order.pickup_address} />
              <Row label="Drop" value={order.destination_address} />
              <Row label="Receiver" value={order.receiver_name} />
              <Row label="Phone" value={order.receiver_phone} mono />
              <Row label="Contents" value={order.item_description} />
              <Row label="Quantity" value={`${order.quantity} bag(s)`} />
              <Row label="Weight" value={order.weight_kg ? `${order.weight_kg} kg` : '—'} />
              <Row label="Distance" value={`${order.distance_km} km`} />
              <Row label="Requested by" value={formatDateTime(order.requested_delivery_at)} />
              {order.special_instructions ? <Row label="Instructions" value={order.special_instructions} /> : null}
            </dl>
          </Card>

          {data.receiver ? (
            <Card>
              <CardHeader icon={Phone} title="Receiver contact" />
              <div className="p-5">
                <p className="text-[13px] font-bold text-navy-900">{data.receiver.name}</p>
                <p className="mt-0.5 font-mono text-[12px] text-slate-500">{data.receiver.phone}</p>
                <a href={`tel:${data.receiver.phone}`}>
                  <Button variant="secondary" size="sm" icon={Phone} className="mt-3">Call receiver</Button>
                </a>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader icon={ShieldAlert} title="Job rules" />
            <div className="space-y-2 p-5 text-[12px] leading-relaxed text-slate-600">
              <p className="flex items-start gap-2"><Truck size={14} className="mt-0.5 shrink-0 text-slate-400" /> Once you accept a job you cannot cancel or reject it yourself.</p>
              <p className="flex items-start gap-2"><Flag size={14} className="mt-0.5 shrink-0 text-slate-400" /> In an emergency, report an issue — the Super Admin handles reassignment and the company is notified.</p>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        title="Report an issue"
        subtitle="The order moves to admin review and the company is notified"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIssueOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void submitIssue()}>Send report</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Issue type" required>
            <select
              value={issueType}
              onChange={(event) => setIssueType(event.target.value)}
              className="h-11 w-full rounded-xl border border-hairline bg-white px-3.5 text-sm text-navy-900 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
            >
              <option value="vehicle_breakdown">Vehicle breakdown</option>
              <option value="traffic">Severe traffic</option>
              <option value="address_issue">Address issue</option>
              <option value="receiver_unavailable">Receiver unavailable</option>
              <option value="damage">Damage</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Description" required>
            <Textarea value={issueText} onChange={(event) => setIssueText(event.target.value)} placeholder="Describe what happened…" />
          </Field>
          <Alert tone="warning" title="Admin review">
            The order status is set to <strong>ADMIN_REVIEW</strong> and the previous status is restored once the issue is resolved.
          </Alert>
        </div>
      </Modal>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={`text-right font-semibold text-navy-900 ${mono ? 'font-mono text-[11.5px]' : ''}`}>{value}</dd>
    </div>
  )
}
