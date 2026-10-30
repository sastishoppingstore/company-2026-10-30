import { Check, Circle } from 'lucide-react'
import { ORDER_FLOW, ORDER_STATUS_META } from '../lib/format'
import type { OrderStatus } from '../lib/types'

export function OrderProgress({ status, compact = false }: { status: OrderStatus; compact?: boolean }) {
  const flow = ORDER_FLOW
  const currentIndex = flow.indexOf(status)
  const abnormal = currentIndex === -1

  if (compact) {
    const meta = ORDER_STATUS_META[status] ?? ORDER_STATUS_META.DRAFT
    const progress = abnormal ? 100 : Math.round(((currentIndex + 1) / flow.length) * 100)
    return (
      <div className="w-full">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold">
          <span className="text-navy-700">{meta.label}</span>
          <span className="font-mono text-slate-400">{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-navy-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              status === 'DELIVERED' ? 'bg-emerald-500' : abnormal ? 'bg-amber-500' : 'bg-brand-600'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <ol className="app-scrollbar flex gap-1 overflow-x-auto pb-2">
      {flow.map((step, index) => {
        const done = !abnormal && index < currentIndex
        const active = !abnormal && index === currentIndex
        const meta = ORDER_STATUS_META[step]
        return (
          <li key={step} className="flex min-w-[118px] flex-1 flex-col gap-2">
            <div className="flex items-center gap-1">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  done ? 'bg-emerald-500 text-white' : active ? 'bg-brand-600 text-white' : 'bg-navy-100 text-navy-400'
                }`}
              >
                {done ? <Check size={13} /> : <Circle size={8} fill="currentColor" />}
              </span>
              {index < flow.length - 1 ? (
                <span className={`h-0.5 flex-1 rounded-full ${done ? 'bg-emerald-400' : 'bg-navy-100'}`} />
              ) : null}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wide ${active ? 'text-brand-700' : done ? 'text-emerald-700' : 'text-slate-400'}`}>
              {meta.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
