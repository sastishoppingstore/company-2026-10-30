import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Copy, FileCheck2, LockKeyhole, MapPin, ShieldCheck, Signature } from 'lucide-react'
import { api, ApiClientError } from '../lib/api'
import { formatDateTime } from '../lib/format'
import type { Order, StoredFile } from '../lib/types'
import { Alert, Badge, Button, Card, CardHeader, ErrorState, Skeleton, useToast } from '../components/ui'

interface ProofPayload {
  order: Order
  files: Array<StoredFile & { data_url?: string }>
  secure_link: string
  delivered_at: string | null
  receiver_name: string
}

export function ProofViewer() {
  const { orderId } = useParams()
  const { push } = useToast()
  const [data, setData] = useState<ProofPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.get<ProofPayload>(`/orders/${orderId}/proof`)
        setData(result)
        setError(null)
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Could not load the delivery proof.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [orderId])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-40" />
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      </div>
    )
  }

  if (error || !data) {
    return <ErrorState message={error ?? 'Proof not available.'} onRetry={() => window.location.reload()} />
  }

  const signature = data.files.find((file) => file.kind === 'signature')
  const photo = data.files.find((file) => file.kind === 'delivery_photo')

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(data.secure_link)
      push({ tone: 'success', title: 'Secure link copied', message: 'The link expires and requires authentication to open.' })
    } catch {
      push({ tone: 'warning', title: 'Copy failed', message: data.secure_link })
    }
  }

  return (
    <div className="space-y-5">
      <Link to={`/orders/${data.order.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 transition hover:text-navy-800">
        <ArrowLeft size={15} /> Back to order
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-extrabold leading-tight text-navy-900 sm:text-[26px]">Delivery proof</h1>
          <Badge tone="success"><CheckCircle2 size={12} /> Delivered</Badge>
        </div>
        <p className="mt-1.5 font-mono text-[13px] font-semibold text-navy-700">{data.order.order_code} · {data.order.shop_name}</p>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 bg-navy-950 px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-300">
              <ShieldCheck size={14} /> Verified handover
            </div>
            <h2 className="mt-1.5 font-display text-xl font-extrabold">Received by {data.receiver_name}</h2>
            <p className="mt-1 text-[12.5px] text-navy-300">Delivered {formatDateTime(data.delivered_at)}</p>
          </div>
          <div className="shrink-0">
            <Button variant="secondary" icon={Copy} onClick={() => void copyLink()}>Copy secure link</Button>
          </div>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <Signature size={13} /> Receiver signature
            </p>
            {signature?.data_url ? (
              <figure className="overflow-hidden rounded-xl border border-hairline bg-white">
                <img src={signature.data_url} alt="Receiver signature" className="w-full" />
              </figure>
            ) : (
              <Alert tone="warning">No signature was captured for this delivery.</Alert>
            )}
            <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
              The signature and photograph are stored in protected storage. They are only served to the owning company, the
              assigned driver and the Super Admin through an authorised endpoint.
            </p>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <MapPin size={13} /> Delivery photograph
            </p>
            {photo?.data_url ? (
              <figure className="overflow-hidden rounded-xl border border-hairline">
                <img src={photo.data_url} alt="Delivery photograph" className="w-full" />
              </figure>
            ) : (
              <Alert tone="warning">No delivery photograph was captured for this delivery.</Alert>
            )}
          </div>
        </div>

        <div className="border-t border-hairline bg-navy-50/60 px-5 py-4">
          <dl className="grid gap-3 text-[12.5px] sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Order ID</dt>
              <dd className="mt-0.5 font-mono font-semibold text-navy-900">{data.order.order_code}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Shop</dt>
              <dd className="mt-0.5 font-semibold text-navy-900">{data.order.shop_name} ({data.order.shop_code})</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Delivery time</dt>
              <dd className="mt-0.5 font-semibold text-navy-900">{formatDateTime(data.delivered_at)}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <Card>
        <CardHeader icon={FileCheck2} title="Shared proof link" subtitle="Signed, expiring link included in the delivery email" />
        <div className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="flex-1 truncate rounded-xl border border-hairline bg-navy-50 px-3.5 py-2.5 font-mono text-[11.5px] text-navy-800">
              {data.secure_link}
            </code>
            <Button variant="secondary" icon={Copy} onClick={() => void copyLink()}>Copy</Button>
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-500">
            <LockKeyhole size={14} className="mt-0.5 shrink-0" />
            The link is bound to this order with an HMAC signature and expires automatically. Identity images are never attached to email by default.
          </p>
        </div>
      </Card>
    </div>
  )
}
