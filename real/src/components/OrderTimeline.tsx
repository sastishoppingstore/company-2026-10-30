import {
  BadgeCheck, CircleDot, FileCheck2, KeyRound, MapPin, PackageCheck, Radio, ShieldAlert, Truck, XCircle,
} from 'lucide-react'
import { formatDateTime } from '../lib/format'
import type { OrderEvent } from '../lib/types'

const ICONS: Record<string, typeof CircleDot> = {
  order_created: CircleDot,
  otp_sent: KeyRound,
  otp_verified: BadgeCheck,
  offers_dispatched: Radio,
  accepted: Truck,
  offer_declined: XCircle,
  assigned: Truck,
  picked_up: PackageCheck,
  in_transit: MapPin,
  arrived: MapPin,
  delivered: FileCheck2,
  cancelled: XCircle,
  cancellation_requested: ShieldAlert,
  cancellation_approved: ShieldAlert,
  cancellation_rejected: ShieldAlert,
  issue_reported: ShieldAlert,
  awaiting_assignment: Radio,
}

const TONES: Record<string, string> = {
  delivered: 'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-rose-50 text-rose-600',
  otp_verified: 'bg-teal-50 text-teal-600',
  accepted: 'bg-indigo-50 text-indigo-600',
  in_transit: 'bg-brand-50 text-brand-600',
  picked_up: 'bg-violet-50 text-violet-600',
}

export function OrderTimeline({ events }: { events: OrderEvent[] }) {
  if (!events.length) {
    return <p className="px-5 py-8 text-center text-sm text-slate-500">No events recorded yet.</p>
  }
  const ordered = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at))
  return (
    <ol className="relative space-y-0 px-5 py-4">
      {ordered.map((event, index) => {
        const Icon = ICONS[event.type] ?? CircleDot
        const tone = TONES[event.type] ?? 'bg-navy-50 text-navy-600'
        return (
          <li key={event.id} className="relative flex gap-3.5 pb-5 last:pb-0">
            {index < ordered.length - 1 ? (
              <span className="absolute left-[15px] top-9 h-[calc(100%-36px)] w-px bg-navy-100" />
            ) : null}
            <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${tone}`}>
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[13px] font-semibold leading-snug text-navy-900">{event.message}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-600">{event.actor_name}</span>
                <span className="mx-1.5 text-slate-300">·</span>
                {event.actor_role.replace(/_/g, ' ')}
                <span className="mx-1.5 text-slate-300">·</span>
                {formatDateTime(event.created_at)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
