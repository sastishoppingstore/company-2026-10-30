import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { FileCheck2, Loader2, LockKeyhole, MapPin, ShieldCheck } from 'lucide-react'
import { api, ApiClientError } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { Card } from '../components/ui'

interface ProofPayload {
  order: {
    order_code: string; shop_name: string; shop_code: string; delivered_at: string | null;
    receiver_name: string; item_description: string; quantity: number;
    destination_address: string; created_at: string
  }
  files: Array<{ id: string; kind: string; name: string; mime: string; size: number; created_at: string }>
  proof_files: Record<string, string>
}

export function PublicProof() {
  const { orderId } = useParams()
  const [params] = useSearchParams()
  const [data, setData] = useState<ProofPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.get<ProofPayload>(`/public/proof/${orderId}`, { token: params.get('token') ?? '' })
        setData(result)
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Could not load this proof page.')
      }
    }
    void load()
  }, [orderId, params])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-5">
        <Card className="max-w-md p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <LockKeyhole size={22} />
          </span>
          <h1 className="mt-4 font-display text-lg font-extrabold text-navy-900">Link unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-slate-500">
        <Loader2 size={22} className="animate-spin" />
      </div>
    )
  }

  const signature = data.files.find((file) => file.kind === 'signature')
  const photo = data.files.find((file) => file.kind === 'delivery_photo')

  return (
    <div className="min-h-screen bg-canvas px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy-950 text-[12px] font-extrabold text-white">RNA</span>
          <div>
            <p className="font-display text-base font-extrabold leading-none text-navy-900">RNA Ship</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Proof of delivery</p>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="bg-navy-950 px-6 py-6 text-white">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-300">
              <ShieldCheck size={14} /> Verified delivery
            </div>
            <h1 className="mt-2 font-display text-2xl font-extrabold">{data.order.shop_name}</h1>
            <p className="mt-1 font-mono text-sm text-navy-300">{data.order.order_code} · {data.order.shop_code}</p>
          </div>

          <div className="grid gap-6 p-6 sm:grid-cols-2">
            <div className="space-y-3 text-sm">
              <Row label="Delivered at" value={formatDateTime(data.order.delivered_at)} />
              <Row label="Received by" value={data.order.receiver_name} />
              <Row label="Items" value={`${data.order.quantity} × ${data.order.item_description}`} />
              <Row label="Destination" value={data.order.destination_address} />
              <Row label="Order created" value={formatDateTime(data.order.created_at)} />
            </div>
            <div className="space-y-4">
              {signature ? (
                <figure>
                  <figcaption className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <FileCheck2 size={13} /> Receiver signature
                  </figcaption>
                  <img src={data.proof_files[signature.id]} alt="Receiver signature" className="w-full rounded-xl border border-hairline bg-white" />
                </figure>
              ) : null}
              {photo ? (
                <figure>
                  <figcaption className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <MapPin size={13} /> Delivery photograph
                  </figcaption>
                  <img src={data.proof_files[photo.id]} alt="Delivery photograph" className="w-full rounded-xl border border-hairline" />
                </figure>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-hairline pb-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-navy-900">{value}</span>
    </div>
  )
}
