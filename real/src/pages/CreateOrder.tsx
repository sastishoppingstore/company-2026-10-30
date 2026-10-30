import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Info, MapPin, Package,
  Phone, Search, Store, UserCheck, Weight,
} from 'lucide-react'
import { api, ApiClientError } from '../lib/api'
import { useAuth } from '../state/AuthContext'
import { priorityMeta } from '../lib/format'
import type { Order, Priority, Shop, ShopReceiver } from '../lib/types'
import { Alert, Button, Card, CardHeader, Field, Input, SearchInput, Select, Textarea, useToast } from '../components/ui'
import { OtpConfirm } from '../components/OtpConfirm'
import { MapView } from '../components/MapView'

const SAMPLE_ITEM = '1 sealed bag — assorted grocery assortment'

interface FormState {
  pickup_address: string
  item_description: string
  quantity: number
  weight_kg: string
  special_instructions: string
  priority: Priority
  requested_delivery_at: string
  authorized_contact_name: string
  authorized_contact_phone: string
}

function defaultDeliveryTime(): string {
  const date = new Date(Date.now() + 24 * 3600_000)
  date.setHours(11, 0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function CreateOrder() {
  const { user, company } = useAuth()
  const navigate = useNavigate()
  const { push } = useToast()

  const [step, setStep] = useState(0)
  const [shops, setShops] = useState<Shop[]>([])
  const [search, setSearch] = useState('')
  const [shop, setShop] = useState<Shop | null>(null)
  const [receivers, setReceivers] = useState<ShopReceiver[]>([])
  const [receiver, setReceiver] = useState<ShopReceiver | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<Order | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    pickup_address: company ? `${company.address}, ${company.city}` : '',
    item_description: SAMPLE_ITEM,
    quantity: 1,
    weight_kg: '12',
    special_instructions: 'Handle with care — glass jars inside the bag.',
    priority: 'STANDARD',
    requested_delivery_at: defaultDeliveryTime(),
    authorized_contact_name: user?.name ?? '',
    authorized_contact_phone: user?.phone ?? '',
  })

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.get<{ data: Shop[] }>('/shops')
        setShops(result.data)
        const demo = result.data.find((item) => item.is_demo) ?? null
        if (demo) {
          setShop(demo)
          const detail = await api.get<{ receivers: ShopReceiver[] }>(`/shops/${demo.id}`)
          setReceivers(detail.receivers)
          setReceiver(detail.receivers.find((item) => item.is_primary) ?? detail.receivers[0] ?? null)
        }
      } catch {
        /* handled by empty state */
      }
    }
    void load()
  }, [])

  const filteredShops = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return shops
    return shops.filter((item) => `${item.name} ${item.code} ${item.address} ${item.category}`.toLowerCase().includes(query))
  }, [shops, search])

  const selectShop = async (selected: Shop) => {
    setShop(selected)
    setReceiver(null)
    setErrors((prev) => ({ ...prev, shop_id: '', receiver_id: '' }))
    try {
      const detail = await api.get<{ receivers: ShopReceiver[] }>(`/shops/${selected.id}`)
      setReceivers(detail.receivers)
      setReceiver(detail.receivers.find((item) => item.is_primary) ?? detail.receivers[0] ?? null)
    } catch {
      setReceivers([])
    }
  }

  const validateStep = (index: number): boolean => {
    const next: Record<string, string> = {}
    if (index === 0) {
      if (!shop) next.shop_id = 'Select a destination shop.'
      if (!receiver) next.receiver_id = 'Select the registered receiver for this delivery.'
    }
    if (index === 1) {
      if (form.item_description.trim().length < 3) next.item_description = 'Describe the bag or items being shipped.'
      if (!form.quantity || form.quantity < 1) next.quantity = 'Quantity must be at least 1.'
    }
    if (index === 2) {
      if (form.pickup_address.trim().length < 8) next.pickup_address = 'Enter a complete pickup address.'
      if (!form.requested_delivery_at) next.requested_delivery_at = 'Choose a requested delivery time.'
      if (form.authorized_contact_name.trim().length < 2) next.authorized_contact_name = 'Enter the authorised contact name.'
      if (form.authorized_contact_phone.trim().length < 8) next.authorized_contact_phone = 'Enter a reachable phone number.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const next = () => {
    if (!validateStep(step)) return
    setStep((value) => Math.min(value + 1, 3))
  }

  const submitOrder = async () => {
    if (!shop || !receiver) return
    setSubmitting(true)
    setServerError(null)
    try {
      const result = await api.post<{ order: Order }>('/orders', {
        shop_id: shop.id,
        receiver_id: receiver.id,
        pickup_address: form.pickup_address,
        pickup_lat: company ? 18.5642 : undefined,
        pickup_lng: company ? 73.7767 : undefined,
        item_description: form.item_description,
        quantity: Number(form.quantity),
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        special_instructions: form.special_instructions,
        priority: form.priority,
        requested_delivery_at: new Date(form.requested_delivery_at).toISOString(),
        authorized_contact_name: form.authorized_contact_name,
        authorized_contact_phone: form.authorized_contact_phone,
      })
      setCreated(result.order)
      setStep(4)
      push({ tone: 'success', title: `Order ${result.order.order_code} created`, message: 'Confirm it with the OTP sent to your authorised contact.' })
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message)
        setErrors(err.fieldErrors())
      } else {
        setServerError('Could not create the order. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const sendOtp = async () => {
    if (!created) return
    const result = await api.post<{ message: string }>(`/orders/${created.id}/submit`)
    push({ tone: 'info', title: 'Confirmation code sent', message: result.message })
  }

  const verifyOtp = async (code: string) => {
    if (!created) return
    await api.post(`/orders/${created.id}/confirm`, { otp: code })
    push({ tone: 'success', title: 'Order confirmed', message: 'Eligible drivers have been notified.' })
    window.setTimeout(() => navigate(`/orders/${created.id}`), 900)
  }

  const steps = ['Destination', 'Shipment', 'Schedule', 'Review', 'Confirm']

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => navigate(-1)} className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 transition hover:text-navy-800">
          <ArrowLeft size={15} /> Back
        </button>
        <h1 className="text-[22px] font-extrabold leading-tight text-navy-900 sm:text-[26px]">Create delivery order</h1>
        <p className="mt-1 text-sm text-slate-500">
          The order receives a unique ID from the server, then needs an OTP confirmation from your authorised contact before drivers are notified.
        </p>
      </div>

      {/* stepper */}
      <ol className="app-scrollbar flex gap-2 overflow-x-auto pb-1">
        {steps.map((label, index) => {
          const done = index < step
          const active = index === step
          return (
            <li key={label} className="flex min-w-[120px] flex-1 items-center gap-2">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${done ? 'bg-emerald-500 text-white' : active ? 'bg-brand-600 text-white' : 'bg-navy-100 text-navy-400'}`}>
                {done ? <CheckCircle2 size={14} /> : index + 1}
              </span>
              <span className={`text-[12px] font-bold ${active ? 'text-navy-900' : done ? 'text-emerald-700' : 'text-slate-400'}`}>{label}</span>
            </li>
          )
        })}
      </ol>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          {/* ---------------------------------------------------- step 1 */}
          {step === 0 ? (
            <Card>
              <CardHeader icon={Store} title="Destination shop" subtitle="Choose the registered shop that will receive the delivery" />
              <div className="space-y-4 p-5">
                <SearchInput
                  placeholder="Search shop name, code or locality…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {errors.shop_id ? <p className="text-xs font-medium text-rose-600">{errors.shop_id}</p> : null}
                <ul className="grid gap-2 sm:grid-cols-2">
                  {filteredShops.map((item) => {
                    const selected = shop?.id === item.id
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => void selectShop(item)}
                          className={`w-full rounded-xl border p-3.5 text-left transition ${selected ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-100' : 'border-hairline hover:border-navy-300 hover:bg-navy-50/50'} ${item.status !== 'active' ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[13px] font-bold text-navy-900">{item.name}</p>
                            {item.is_demo ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Demo</span> : null}
                          </div>
                          <p className="mt-1 font-mono text-[10px] font-semibold text-brand-600">{item.code}</p>
                          <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-slate-500">{item.address}</p>
                          <div className="mt-2 flex items-center gap-3 text-[10.5px] font-medium text-slate-400">
                            <span>{item.city}</span>
                            <span>★ {item.rating.toFixed(1)}</span>
                            <span>{item.category}</span>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {filteredShops.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">No shops match “{search}”.</p>
                ) : null}
              </div>
            </Card>
          ) : null}

          {/* ---------------------------------------------------- step 2 */}
          {step === 0 && shop ? (
            <Card>
              <CardHeader icon={UserCheck} title="Registered receiver" subtitle={`Receivers registered at ${shop.name}`} />
              <div className="space-y-2 p-5">
                {receivers.length === 0 ? (
                  <Alert tone="warning" title="No active receiver">This shop has no active registered receiver. Contact the platform administrator.</Alert>
                ) : null}
                {receivers.map((item) => {
                  const selected = receiver?.id === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setReceiver(item); setErrors((prev) => ({ ...prev, receiver_id: '' })) }}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition ${selected ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-100' : 'border-hairline hover:border-navy-300'}`}
                    >
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${selected ? 'bg-brand-600 text-white' : 'bg-navy-100 text-navy-600'}`}>
                        {item.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-navy-900">{item.name}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                          <Phone size={11} /> {item.phone}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {item.is_primary ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">Primary</span> : null}
                        <span className="text-[10px] text-slate-400">{item.role}</span>
                      </div>
                    </button>
                  )
                })}
                {errors.receiver_id ? <p className="text-xs font-medium text-rose-600">{errors.receiver_id}</p> : null}
              </div>
            </Card>
          ) : null}

          {/* ---------------------------------------------------- step 3 */}
          {step === 1 ? (
            <Card>
              <CardHeader
                icon={Package}
                title="Bag & item details"
                subtitle="Describe exactly what is inside the shipment"
                action={
                  <Button
                    variant="soft" size="xs"
                    onClick={() => setForm((prev) => ({ ...prev, item_description: SAMPLE_ITEM, quantity: 1, weight_kg: '12' }))}
                  >
                    Load sample bag
                  </Button>
                }
              />
              <div className="space-y-4 p-5">
                <Field label="Bag / item description" required error={errors.item_description}>
                  <Textarea
                    value={form.item_description}
                    invalid={Boolean(errors.item_description)}
                    onChange={(event) => setForm((prev) => ({ ...prev, item_description: event.target.value }))}
                    placeholder="1 sealed bag — assorted grocery assortment"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Quantity (bags / units)" required error={errors.quantity}>
                    <Input
                      type="number" min={1} value={form.quantity}
                      invalid={Boolean(errors.quantity)}
                      onChange={(event) => setForm((prev) => ({ ...prev, quantity: Number(event.target.value) }))}
                    />
                  </Field>
                  <Field label="Weight (kg)" hint="Optional — helps the driver plan the load.">
                    <div className="relative">
                      <Weight size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        type="number" min={0} step="0.5" value={form.weight_kg} className="pl-10"
                        onChange={(event) => setForm((prev) => ({ ...prev, weight_kg: event.target.value }))}
                      />
                    </div>
                  </Field>
                </div>
                <Field label="Special instructions" hint="Handling, timing or packaging notes for the driver.">
                  <Textarea
                    value={form.special_instructions}
                    onChange={(event) => setForm((prev) => ({ ...prev, special_instructions: event.target.value }))}
                    placeholder="Handle with care — glass jars inside the bag."
                  />
                </Field>
              </div>
            </Card>
          ) : null}

          {/* ---------------------------------------------------- step 4 */}
          {step === 2 ? (
            <>
              <Card>
                <CardHeader icon={MapPin} title="Pickup & schedule" subtitle="Where the bag is collected and when it must reach the shop" />
                <div className="space-y-4 p-5">
                  <Field label="Pickup address" required error={errors.pickup_address}>
                    <Input
                      value={form.pickup_address}
                      invalid={Boolean(errors.pickup_address)}
                      onChange={(event) => setForm((prev) => ({ ...prev, pickup_address: event.target.value }))}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Requested delivery time" required error={errors.requested_delivery_at}>
                      <Input
                        type="datetime-local"
                        value={form.requested_delivery_at}
                        invalid={Boolean(errors.requested_delivery_at)}
                        onChange={(event) => setForm((prev) => ({ ...prev, requested_delivery_at: event.target.value }))}
                      />
                    </Field>
                    <Field label="Priority" required>
                      <Select
                        value={form.priority}
                        onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value as Priority }))}
                      >
                        <option value="STANDARD">{priorityMeta('STANDARD').label}</option>
                        <option value="EXPRESS">{priorityMeta('EXPRESS').label}</option>
                        <option value="CRITICAL">{priorityMeta('CRITICAL').label}</option>
                      </Select>
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Authorised contact name" required error={errors.authorized_contact_name}>
                      <Input
                        value={form.authorized_contact_name}
                        invalid={Boolean(errors.authorized_contact_name)}
                        onChange={(event) => setForm((prev) => ({ ...prev, authorized_contact_name: event.target.value }))}
                      />
                    </Field>
                    <Field label="Authorised contact phone" required error={errors.authorized_contact_phone} hint="The confirmation OTP is sent here.">
                      <Input
                        value={form.authorized_contact_phone}
                        invalid={Boolean(errors.authorized_contact_phone)}
                        onChange={(event) => setForm((prev) => ({ ...prev, authorized_contact_phone: event.target.value }))}
                      />
                    </Field>
                  </div>
                </div>
              </Card>

              {shop ? (
                <Card>
                  <CardHeader icon={MapPin} title="Route preview" subtitle="Pickup point and destination on the map" />
                  <div className="p-5">
                    <MapView
                      className="h-[260px]"
                      pins={[
                        { lat: 18.5642, lng: 73.7767, kind: 'pickup', label: 'Pickup' },
                        { lat: shop.lat, lng: shop.lng, kind: 'destination', label: shop.name },
                      ]}
                    />
                  </div>
                </Card>
              ) : null}
            </>
          ) : null}

          {/* ---------------------------------------------------- step 5 */}
          {step === 3 ? (
            <Card>
              <CardHeader icon={ClipboardList} title="Review & submit" subtitle="Check every field before the order is created" />
              <div className="space-y-5 p-5">
                {serverError ? <Alert tone="danger" title="Could not create the order">{serverError}</Alert> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <ReviewGroup title="Destination">
                    <ReviewRow label="Shop" value={shop?.name ?? '—'} />
                    <ReviewRow label="Shop code" value={shop?.code ?? '—'} mono />
                    <ReviewRow label="Address" value={shop?.address ?? '—'} />
                    <ReviewRow label="Receiver" value={receiver ? `${receiver.name} · ${receiver.phone}` : '—'} />
                  </ReviewGroup>
                  <ReviewGroup title="Shipment">
                    <ReviewRow label="Description" value={form.item_description} />
                    <ReviewRow label="Quantity" value={String(form.quantity)} />
                    <ReviewRow label="Weight" value={form.weight_kg ? `${form.weight_kg} kg` : 'Not specified'} />
                    <ReviewRow label="Priority" value={priorityMeta(form.priority).label} />
                  </ReviewGroup>
                  <ReviewGroup title="Pickup & schedule">
                    <ReviewRow label="Pickup" value={form.pickup_address} />
                    <ReviewRow label="Requested by" value={new Date(form.requested_delivery_at).toLocaleString('en-IN')} />
                  </ReviewGroup>
                  <ReviewGroup title="Authorisation">
                    <ReviewRow label="Contact" value={form.authorized_contact_name} />
                    <ReviewRow label="Phone" value={form.authorized_contact_phone} mono />
                    <ReviewRow label="Confirmation" value="OTP required before drivers are notified" />
                  </ReviewGroup>
                </div>
                <Alert tone="info" title="What happens next">
                  Submitting creates a unique order ID and sends a confirmation OTP to {form.authorized_contact_phone}.
                  Only after that OTP is verified are eligible drivers and the Super Admin notified.
                </Alert>
              </div>
            </Card>
          ) : null}

          {/* ---------------------------------------------------- step 6 */}
          {step === 4 && created ? (
            <Card>
              <CardHeader
                icon={CheckCircle2}
                title={`Order ${created.order_code} created`}
                subtitle={`Confirm with the OTP sent to ${created.authorized_contact_phone}`}
              />
              <div className="space-y-5 p-5">
                <OtpConfirm
                  orderId={created.id}
                  purpose="order_confirmation"
                  target={created.authorized_contact_phone}
                  hint="This code confirms the company side of the delivery only."
                  onVerify={verifyOtp}
                  onResend={sendOtp}
                />
              </div>
            </Card>
          ) : null}

          {/* ------------------------------------------------- step nav */}
          {step < 4 ? (
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>
                Back
              </Button>
              {step < 3 ? (
                <Button variant="accent" icon={ArrowRight} onClick={next}>Continue</Button>
              ) : (
                <Button variant="accent" icon={CheckCircle2} loading={submitting} onClick={() => void submitOrder()}>
                  Create order &amp; send OTP
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {/* --------------------------------------------------- summary rail */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader icon={Info} title="Order summary" />
            <div className="space-y-3 p-5 text-sm">
              <SummaryRow label="Destination" value={shop?.name ?? 'Not selected'} />
              <SummaryRow label="Shop code" value={shop?.code ?? '—'} mono />
              <SummaryRow label="Receiver" value={receiver?.name ?? 'Not selected'} />
              <SummaryRow label="Contents" value={form.item_description || '—'} />
              <SummaryRow label="Quantity" value={`${form.quantity} bag(s)`} />
              <SummaryRow label="Weight" value={form.weight_kg ? `${form.weight_kg} kg` : '—'} />
              <SummaryRow label="Requested" value={new Date(form.requested_delivery_at).toLocaleString('en-IN')} />
              <SummaryRow label="Priority" value={priorityMeta(form.priority).label} />
              <SummaryRow label="OTP target" value={form.authorized_contact_phone} mono />
            </div>
            <div className="border-t border-hairline bg-navy-50/60 px-5 py-4">
              <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-600">
                <CalendarClock size={14} className="mt-0.5 shrink-0 text-brand-600" />
                Drivers are notified only after the company OTP is verified. Order IDs are generated server-side.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ReviewGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hairline p-4">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-[12.5px]">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className={`text-right font-semibold text-navy-900 ${mono ? 'font-mono text-[11.5px]' : ''}`}>{value}</span>
    </div>
  )
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-[12px] text-slate-500">{label}</span>
      <span className={`text-right text-[12.5px] font-semibold text-navy-900 ${mono ? 'font-mono text-[11.5px]' : ''}`}>{value}</span>
    </div>
  )
}
