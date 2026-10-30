import type { Order, OrderStatus, Priority } from './types.ts'

export const currency = (value: number, code = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(value)

export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function relativeTime(value?: string | null): string {
  if (!value) return '—'
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(value)
}

export function timeAgoFromNow(value?: string | null): string {
  if (!value) return '—'
  const diff = new Date(value).getTime() - Date.now()
  const minutes = Math.round(diff / 60000)
  if (minutes <= 0) return 'now'
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `in ${hours} hr${hours === 1 ? '' : 's'}`
  return `in ${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? '' : 's'}`
}

export interface StatusMeta {
  label: string
  tone: 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger'
  dot: string
  description: string
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral', dot: 'bg-slate-400', description: 'Created but not yet submitted for confirmation.' },
  PENDING_ASSIGNMENT: { label: 'Pending assignment', tone: 'info', dot: 'bg-blue-500', description: 'Waiting for a driver to be assigned.' },
  OFFERED: { label: 'Offered to drivers', tone: 'info', dot: 'bg-sky-500', description: 'Eligible drivers have been notified.' },
  ACCEPTED: { label: 'Driver assigned', tone: 'progress', dot: 'bg-indigo-500', description: 'A driver accepted the job and will collect the bag.' },
  PICKED_UP: { label: 'Picked up', tone: 'progress', dot: 'bg-violet-500', description: 'The bag has been collected from the pickup address.' },
  IN_TRANSIT: { label: 'In transit', tone: 'progress', dot: 'bg-blue-600', description: 'The driver is on the way with live location sharing.' },
  ARRIVED_AT_SHOP: { label: 'Arrived at shop', tone: 'warning', dot: 'bg-amber-500', description: 'Driver is waiting for the receiver delivery code.' },
  OTP_VERIFIED: { label: 'OTP verified', tone: 'progress', dot: 'bg-teal-500', description: 'Receiver code accepted — proof capture in progress.' },
  DELIVERED: { label: 'Delivered', tone: 'success', dot: 'bg-emerald-500', description: 'Handover completed with proof of delivery.' },
  CANCELLATION_REQUESTED: { label: 'Cancellation requested', tone: 'warning', dot: 'bg-orange-500', description: 'Awaiting Super Admin decision.' },
  CANCELLED: { label: 'Cancelled', tone: 'danger', dot: 'bg-rose-500', description: 'This order was cancelled.' },
  DELIVERY_FAILED: { label: 'Delivery failed', tone: 'danger', dot: 'bg-rose-600', description: 'The delivery could not be completed.' },
  RETURN_REQUIRED: { label: 'Return required', tone: 'danger', dot: 'bg-red-600', description: 'The bag must be returned to the pickup address.' },
  ADMIN_REVIEW: { label: 'Under admin review', tone: 'warning', dot: 'bg-amber-600', description: 'A driver issue was raised and is being handled by the Super Admin.' },
  REASSIGNED: { label: 'Reassigned', tone: 'info', dot: 'bg-cyan-500', description: 'The delivery was reassigned to another driver.' },
}

export const ORDER_FLOW: OrderStatus[] = [
  'DRAFT', 'PENDING_ASSIGNMENT', 'OFFERED', 'ACCEPTED', 'PICKED_UP',
  'IN_TRANSIT', 'ARRIVED_AT_SHOP', 'OTP_VERIFIED', 'DELIVERED',
]

export function priorityMeta(priority: Priority) {
  switch (priority) {
    case 'CRITICAL': return { label: 'Critical', tone: 'danger' as const, icon: '🔥' }
    case 'EXPRESS': return { label: 'Express', tone: 'warning' as const, icon: '⚡' }
    default: return { label: 'Standard', tone: 'info' as const, icon: '◆' }
  }
}

export function isActiveOrder(order: Order): boolean {
  return ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_SHOP', 'OTP_VERIFIED'].includes(order.status)
}

export function canCancelDirectly(order: Order): boolean {
  return ['DRAFT', 'PENDING_ASSIGNMENT', 'OFFERED'].includes(order.status)
}

export function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
}

export function maskedPhone(phone?: string | null): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return phone
  return `${phone.slice(0, phone.length - 4).replace(/\d/g, '•')} ${digits.slice(-4)}`
}
