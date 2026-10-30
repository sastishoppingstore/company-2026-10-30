import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, Search, X, type LucideIcon,
} from 'lucide-react'
import {
  createContext, useContext, useEffect, useId, useMemo, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { ORDER_STATUS_META } from '../lib/format'
import type { OrderStatus } from '../lib/types'

/* ------------------------------------------------------------------ button */
type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'soft'
type Size = 'xs' | 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-navy-900 text-white hover:bg-navy-800 active:bg-navy-950 shadow-[0_8px_20px_-12px_rgba(8,21,43,0.8)]',
  accent: 'bg-brand-600 text-white hover:bg-brand-500 active:bg-brand-700 shadow-[0_8px_20px_-12px_rgba(26,79,224,0.9)]',
  secondary: 'bg-white text-navy-800 border border-hairline hover:border-navy-300 hover:bg-navy-50',
  ghost: 'text-navy-600 hover:bg-navy-50 hover:text-navy-900',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
}

const SIZES: Record<Size, string> = {
  xs: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  sm: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  md: 'h-11 px-5 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-xl',
}

export function Button({
  variant = 'primary', size = 'md', icon: Icon, loading, className = '', children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; size?: Size; icon?: LucideIcon; loading?: boolean
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading ? <Loader2 size={size === 'xs' ? 14 : 16} className="animate-spin" /> : Icon ? <Icon size={size === 'xs' ? 14 : 16} /> : null}
      {children}
    </button>
  )
}

export function IconButton({
  icon: Icon, label, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={`inline-grid h-10 w-10 place-items-center rounded-xl border border-hairline bg-white text-navy-600 transition hover:border-navy-300 hover:text-navy-900 ${className}`}
    >
      <Icon size={17} />
    </button>
  )
}

/* -------------------------------------------------------------------- card */
export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-hairline bg-white shadow-[var(--shadow-card)] ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({
  title, subtitle, action, icon: Icon,
}: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy-700">
            <Icon size={17} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold text-navy-900">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ inputs */
export function Field({
  label, hint, error, required, children, className = '',
}: { label?: string; hint?: string; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      {label ? (
        <span className="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-navy-800">
          {label}
          {required ? <span className="text-rose-500">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-rose-600">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  )
}

const controlBase =
  'w-full rounded-xl border bg-white px-3.5 text-sm text-navy-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-4 disabled:bg-slate-50 disabled:text-slate-500'

export function Input({ className = '', invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      className={`${controlBase} h-11 ${invalid ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-hairline focus:border-brand-400 focus:ring-brand-100'} ${className}`}
    />
  )
}

export function Textarea({ className = '', invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...rest}
      className={`${controlBase} min-h-[96px] py-2.5 leading-relaxed ${invalid ? 'border-rose-300' : 'border-hairline focus:border-brand-400 focus:ring-brand-100'} ${className}`}
    />
  )
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...rest}
        className={`${controlBase} h-11 appearance-none border-hairline pr-10 focus:border-brand-400 focus:ring-brand-100 ${className}`}
      >
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  )
}

export function SearchInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input {...rest} className={`${controlBase} h-11 border-hairline pl-10 focus:border-brand-400 focus:ring-brand-100`} />
    </div>
  )
}

/* ------------------------------------------------------------------ badges */
type Tone = 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger'

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-brand-50 text-brand-700 ring-brand-200',
  progress: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
}

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${TONES[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function StatusBadge({ status, className = '' }: { status: OrderStatus; className?: string }) {
  const meta = ORDER_STATUS_META[status] ?? ORDER_STATUS_META.DRAFT
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${TONES[meta.tone]} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

/* ------------------------------------------------------------------- modal */
export function Modal({
  open, onClose, title, subtitle, children, footer, size = 'md',
}: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode;
  footer?: ReactNode; size?: 'sm' | 'md' | 'lg'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const width = size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl'

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px]"
          />
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className={`relative z-10 max-h-[92vh] w-full overflow-hidden rounded-t-3xl bg-white shadow-[var(--shadow-lift)] sm:rounded-2xl ${width}`}
          >
            <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-navy-900">{title}</h3>
                {subtitle ? <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p> : null}
              </div>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <div className="app-scrollbar max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
            {footer ? <div className="flex items-center justify-end gap-2 border-t border-hairline bg-slate-50/70 px-5 py-3.5">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ states */
export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin text-brand-600 ${className}`} />
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <Spinner size={24} />
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rna-skeleton rounded-xl ${className}`} />
}

export function EmptyState({
  icon: Icon = Info, title, description, action,
}: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-navy-50 text-navy-500">
        <Icon size={24} />
      </span>
      <h4 className="mt-4 text-[15px] font-bold text-navy-900">{title}</h4>
      {description ? <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
        <AlertTriangle size={22} />
      </span>
      <p className="max-w-md text-sm font-medium text-navy-800">{message}</p>
      {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button> : null}
    </div>
  )
}

export function Alert({ tone = 'info', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  const icons: Record<Tone, LucideIcon> = {
    neutral: Info, info: Info, progress: Info, success: CheckCircle2, warning: AlertTriangle, danger: AlertTriangle,
  }
  const Icon = icons[tone]
  return (
    <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${TONES[tone]}`}>
      <Icon size={17} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? 'mt-0.5 leading-relaxed opacity-90' : 'leading-relaxed'}>{children}</div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- toast host */
export interface ToastItem {
  id: number
  tone: Tone
  title: string
  message?: string
}

const ToastContext = createContext<{ push: (toast: Omit<ToastItem, 'id'>) => void }>({ push: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useMemo(() => ({ value: 0 }), [])

  const push = (toast: Omit<ToastItem, 'id'>) => {
    counter.value += 1
    const id = counter.value
    setItems((prev) => [...prev, { ...toast, id }])
    setTimeout(() => setItems((prev) => prev.filter((item) => item.id !== id)), 5200)
  }

  const tones: Record<Tone, string> = {
    neutral: 'bg-navy-900 text-white',
    info: 'bg-brand-600 text-white',
    progress: 'bg-indigo-600 text-white',
    success: 'bg-emerald-600 text-white',
    warning: 'bg-amber-500 text-white',
    danger: 'bg-rose-600 text-white',
  }

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 top-3 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:top-5 sm:items-end">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: -12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              className={`pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 shadow-[var(--shadow-lift)] ${tones[item.tone]}`}
            >
              <p className="text-sm font-semibold">{item.title}</p>
              {item.message ? <p className="mt-0.5 text-[13px] leading-relaxed opacity-90">{item.message}</p> : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

/* ------------------------------------------------------------------ layout */
export function PageHeader({
  eyebrow, title, description, actions,
}: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</p> : null}
        <h1 className="text-[22px] font-extrabold leading-tight text-navy-900 sm:text-[26px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function StatCard({
  label, value, hint, icon: Icon, tone = 'info', onClick,
}: { label: string; value: string | number; hint?: string; icon?: LucideIcon; tone?: Tone; onClick?: () => void }) {
  const accents: Record<Tone, string> = {
    neutral: 'bg-slate-100 text-slate-600',
    info: 'bg-brand-50 text-brand-600',
    progress: 'bg-indigo-50 text-indigo-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-rose-50 text-rose-600',
  }
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-hairline bg-white p-4 shadow-[var(--shadow-card)] transition ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {Icon ? <span className={`grid h-8 w-8 place-items-center rounded-lg ${accents[tone]}`}><Icon size={16} /></span> : null}
      </div>
      <p className="mt-2 text-[26px] font-extrabold leading-none text-navy-900">{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-bold text-navy-900">{children}</h2>
      {action}
    </div>
  )
}

export function useToggle(initial = false) {
  const [value, setValue] = useState(initial)
  return [value, () => setValue((v) => !v), setValue] as const
}
