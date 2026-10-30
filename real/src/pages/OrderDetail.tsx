import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, Ban, CalendarClock, CheckCircle2, FileCheck2, MapPin, Phone,
  Receipt, Route, ShieldAlert, Truck, User, Weight,
} from 'lucide-react'
import { api, ApiClientError } from '../lib/api'
import { formatDateTime, formatTime, priorityMeta, relativeTime } from '../lib/format'
import type { DriverIssue, Order, OrderEvent, Shop, ShopReceiver, StoredFile, User as UserType } from '../lib/types'
import {
  Alert, Badge, Button, Card, CardHeader, ErrorState, Field, Modal, Skeleton, StatusBadge, Textarea, useToast,
} from '../components/ui'
import { OrderProgress } from '../components/OrderProgress'
import { OrderTimeline } from '../components/OrderTimeline'
import { OtpConfirm } from '../components/OtpConfirm'

interface OrderDetailPayload {
  order: Order
  driver: (UserType & { vehicle: { type: string; model: string; plate: string; color: string } | null }) | null
  events: OrderEvent[]
  files: StoredFile[]
  issues: DriverIssue[]
  shop: Shop | null
  receiver: ShopReceiver | null
  offered_drivers: Array<{ id: string; name: string; phone: string }>
  permissions: Record<string, boolean>
}

export function OrderDetail() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { push } = useToast()
  const [data, setData] = useState<OrderDetailPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await api.get<OrderDetailPayload>(`/orders/${orderId}`)
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load this order.')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32" />
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-64 lg:col-span-2" /><Skeleton className="h-64" /></div>
      </div>
    )
  }

  if (error || !data) {
    return <ErrorState message={error ?? 'Order not found.'} onRetry={() => void load()} />
  }

  const { order, driver, events, shop, receiver, permissions } = data
  const isActive = ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_SHOP', 'OTP_VERIFIED'].includes(order.status)

  const submitCancellation = async (requestOnly: boolean) => {
    if (reason.trim().length < 4) {
      setActionError('Please give a short reason (at least 4 characters).')
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      if (requestOnly) {
        await api.post(`/orders/${order.id}/cancellation-request`, { reason })
        push({ tone: 'warning', title: 'Cancellation requested', message: 'The Super Admin will review and decide on reassignment.' })
      } else {
        await api.post(`/orders/${order.id}/cancel`, { reason })
        push({ tone: 'success', title: 'Order cancelled', message: `${order.order_code} has been cancelled.` })
      }
      setCancelOpen(false)
      setReason('')
      await load()
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'The action could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  const sendConfirmationOtp = async () => {
    const result = await api.post<{ message: string }>(`/orders/${order.id}/submit`)
    push({ tone: 'info', title: 'Confirmation code sent', message: result.message })
  }

  return (
    <div className="space-y-5">
      <Link to="/orders" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 transition hover:text-navy-800">
        <ArrowLeft size={15} /> Order history
      </Link>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-[22px] font-extrabold tracking-tight text-navy-900 sm:text-[26px]">{order.order_code}</h1>
            <StatusBadge status={order.status} />
            <Badge tone="neutral">{priorityMeta(order.priority).icon} {priorityMeta(order.priority).label}</Badge>
          </div>
          <p className="mt-1.5 text-sm text-slate-500">
            {order.shop_name} · {order.shop_code} · created {relativeTime(order.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isActive ? (
            <Button variant="accent" icon={MapPin} onClick={() => navigate(`/orders/${order.id}/track`)}>Track live</Button>
          ) : null}
          {order.status === 'DELIVERED' ? (
            <Button variant="secondary" icon={FileCheck2} onClick={() => navigate(`/orders/${order.id}/proof`)}>Delivery proof</Button>
          ) : null}
          {permissions.can_cancel ? (
            <Button variant="secondary" icon={Ban} onClick={() => { setCancelOpen(true); setActionError(null) }}>Cancel order</Button>
          ) : null}
          {permissions.can_request_cancellation ? (
            <Button variant="secondary" icon={ShieldAlert} onClick={() => { setCancelOpen(true); setActionError(null) }}>Request cancellation</Button>
          ) : null}
        </div>
      </div>

      {order.status === 'CANCELLATION_REQUESTED' ? (
        <Alert tone="warning" title="Cancellation under review">
          The Super Admin has been asked to approve cancellation of this order. Until a decision is made the delivery continues.
        </Alert>
      ) : null}
      {order.cancellation_status === 'rejected' ? (
        <Alert tone="info" title="Cancellation rejected">The Super Admin rejected the cancellation — the delivery continues.</Alert>
      ) : null}

      {order.status === 'DRAFT' ? (
        <Card>
          <CardHeader
            icon={CheckCircle2}
            title="Confirm this order"
            subtitle={`A confirmation OTP is sent to ${order.authorized_contact_phone} before drivers are notified`}
          />
          <div className="p-5">
            <OtpConfirm
              orderId={order.id}
              purpose="order_confirmation"
              target={order.authorized_contact_phone}
              hint="This authorises the company side of the delivery only."
              onVerify={async (code) => {
                await api.post(`/orders/${order.id}/confirm`, { otp: code })
                push({ tone: 'success', title: 'Order confirmed', message: 'Eligible drivers have been notified.' })
                await load()
              }}
              onResend={sendConfirmationOtp}
            />
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="p-5">
          <OrderProgress status={order.status} />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader icon={Receipt} title="Shipment details" subtitle="Exactly what was requested and where it is going" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Detail label="Destination shop" value={order.shop_name} />
              <Detail label="Shop code" value={order.shop_code} mono />
              <Detail label="Destination address" value={order.destination_address} />
              <Detail label="Pickup address" value={order.pickup_address} />
              <Detail label="Item description" value={order.item_description} />
              <Detail label="Quantity" value={`${order.quantity} bag(s)`} />
              <Detail label="Weight" value={order.weight_kg ? `${order.weight_kg} kg` : 'Not specified'} />
              <Detail label="Priority" value={priorityMeta(order.priority).label} />
              <Detail label="Requested delivery" value={formatDateTime(order.requested_delivery_at)} />
              <Detail label="Authorised contact" value={`${order.authorized_contact_name} · ${order.authorized_contact_phone}`} />
              <Detail label="Distance" value={`${order.distance_km} km · ~${order.eta_minutes} min`} />
              <Detail label="Special instructions" value={order.special_instructions || 'None'} />
            </div>
          </Card>

          <Card>
            <CardHeader icon={User} title="Receiver" subtitle="Registered contact who confirms the handover with a delivery OTP" />
            <div className="flex flex-wrap items-center gap-4 p-5">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-navy-50 text-sm font-bold text-navy-700">
                {(receiver?.name ?? order.receiver_name).split(' ').map((part) => part[0]).slice(0, 2).join('')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-navy-900">{order.receiver_name}</p>
                <p className="mt-0.5 font-mono text-[12px] text-slate-500">{order.receiver_phone}</p>
                {receiver ? <p className="mt-0.5 text-[11.5px] text-slate-400">{receiver.role} · {receiver.email}</p> : null}
              </div>
              <a href={`tel:${order.receiver_phone}`}>
                <Button variant="secondary" size="sm" icon={Phone}>Call receiver</Button>
              </a>
            </div>
          </Card>

          <Card>
            <CardHeader icon={Route} title="Order timeline" subtitle="Every server-side event recorded against this order" />
            <OrderTimeline events={events} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader icon={Truck} title="Driver & vehicle" />
            {driver ? (
              <div className="space-y-3 p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-[13px] font-bold text-brand-700">
                    {driver.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-navy-900">{driver.name}</p>
                    <p className="font-mono text-[11.5px] text-slate-500">{driver.phone}</p>
                  </div>
                </div>
                {driver.vehicle ? (
                  <dl className="space-y-2 rounded-xl border border-hairline bg-navy-50/50 p-3.5 text-[12.5px]">
                    <Row label="Vehicle" value={`${driver.vehicle.type} · ${driver.vehicle.model}`} />
                    <Row label="Registration" value={driver.vehicle.plate} mono />
                    <Row label="Colour" value={driver.vehicle.color} />
                  </dl>
                ) : null}
                <p className="text-[11.5px] leading-relaxed text-slate-500">
                  A driver who has accepted a job cannot cancel it independently. Emergency cases are reported to the Super Admin for reassignment.
                </p>
              </div>
            ) : data.offered_drivers.length ? (
              <div className="p-5">
                <p className="mb-2 text-[12px] font-semibold text-slate-500">Offered to</p>
                <ul className="space-y-2">
                  {data.offered_drivers.map((offered) => (
                    <li key={offered.id} className="flex items-center justify-between rounded-xl border border-hairline px-3 py-2">
                      <span className="text-[13px] font-semibold text-navy-900">{offered.name}</span>
                      <span className="font-mono text-[11px] text-slate-500">{offered.phone}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="p-5 text-[13px] text-slate-500">No driver assigned yet.</div>
            )}
          </Card>

          <Card>
            <CardHeader icon={CalendarClock} title="Key timestamps" />
            <dl className="space-y-2.5 p-5 text-[12.5px]">
              <Row label="Created" value={formatDateTime(order.created_at)} />
              <Row label="Company OTP verified" value={formatDateTime(order.company_otp_verified_at)} />
              <Row label="Accepted" value={formatDateTime(order.accepted_at)} />
              <Row label="Picked up" value={formatDateTime(order.picked_up_at)} />
              <Row label="Departed" value={formatDateTime(order.departed_at)} />
              <Row label="Arrived at shop" value={formatDateTime(order.arrived_at)} />
              <Row label="Delivery OTP verified" value={formatDateTime(order.otp_verified_at)} />
              <Row label="Delivered" value={formatDateTime(order.delivered_at)} />
              {order.cancelled_at ? <Row label="Cancelled" value={formatDateTime(order.cancelled_at)} /> : null}
            </dl>
          </Card>

          {order.cancellation_reason ? (
            <Card>
              <CardHeader icon={AlertTriangle} title="Cancellation details" />
              <div className="p-5 text-[13px]">
                <p className="font-semibold text-navy-900">Reason</p>
                <p className="mt-1 leading-relaxed text-slate-600">{order.cancellation_reason}</p>
                <p className="mt-3 text-[11.5px] text-slate-400">Status: {order.cancellation_status}</p>
              </div>
            </Card>
          ) : null}

          {data.issues.length ? (
            <Card>
              <CardHeader icon={ShieldAlert} title="Driver issues" />
              <ul className="space-y-2 p-5">
                {data.issues.map((issue) => (
                  <li key={issue.id} className="rounded-xl border border-hairline p-3">
                    <p className="text-[12.5px] font-bold text-navy-900">{issue.type.replace(/_/g, ' ')}</p>
                    <p className="mt-1 text-[12px] text-slate-600">{issue.description}</p>
                    <p className="mt-1.5 text-[11px] uppercase tracking-wide text-slate-400">{issue.status} · {formatTime(issue.created_at)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={permissions.can_cancel ? 'Cancel this order' : 'Request cancellation'}
        subtitle={permissions.can_cancel
          ? 'Cancelling releases the order and notifies the platform.'
          : 'The Super Admin reviews the request and decides on reassignment.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Close</Button>
            <Button variant="danger" loading={busy} onClick={() => void submitCancellation(!permissions.can_cancel)}>
              {permissions.can_cancel ? 'Cancel order' : 'Send request'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          <Alert tone="info">
            {permissions.can_cancel
              ? 'Orders can only be cancelled directly before a driver accepts them.'
              : 'The driver continues the delivery until the Super Admin decides.'}
          </Alert>
          <Field label="Reason" required>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Duplicate order raised by the branch warehouse." />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-[13px] font-semibold text-navy-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
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
