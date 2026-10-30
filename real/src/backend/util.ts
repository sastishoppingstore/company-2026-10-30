import type { Order, Shop } from '../lib/types.ts'

export class ApiError extends Error {
  status: number
  errors: Record<string, string[]>

  constructor(status: number, message: string, errors: Record<string, string[]> = {}) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

export function fail(status: number, message: string, errors: Record<string, string[]> = {}): never {
  throw new ApiError(status, message, errors)
}

export type FieldType = 'string' | 'number' | 'int' | 'boolean' | 'array' | 'object'

export interface FieldRule {
  type: FieldType
  required?: boolean
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  enum?: readonly string[]
  email?: boolean
  nullable?: boolean
  default?: unknown
}

/** Server-side validation. Returns a 422-shaped error map (Laravel parity). */
export function validateFields(data: Record<string, unknown>, schema: Record<string, FieldRule>): Record<string, string[]> {
  const errors: Record<string, string[]> = {}
  for (const [field, rule] of Object.entries(schema)) {
    const raw = data?.[field]
    const value = raw === '' || raw === undefined ? undefined : raw
    const push = (message: string) => {
      errors[field] = errors[field] ?? []
      errors[field].push(message)
    }
    if (value === undefined || value === null) {
      if (rule.required) push(`${field.replace(/_/g, ' ')} is required.`)
      else if (rule.nullable === false) push(`${field.replace(/_/g, ' ')} cannot be null.`)
      continue
    }
    switch (rule.type) {
      case 'string': {
        const str = String(value)
        if (rule.minLength !== undefined && str.length < rule.minLength) push(`${field.replace(/_/g, ' ')} must be at least ${rule.minLength} characters.`)
        if (rule.maxLength !== undefined && str.length > rule.maxLength) push(`${field.replace(/_/g, ' ')} may not be greater than ${rule.maxLength} characters.`)
        if (rule.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(str)) push(`${field.replace(/_/g, ' ')} must be a valid email address.`)
        break
      }
      case 'number':
      case 'int': {
        const num = Number(value)
        if (Number.isNaN(num)) push(`${field.replace(/_/g, ' ')} must be a number.`)
        else {
          if (rule.type === 'int' && !Number.isInteger(num)) push(`${field.replace(/_/g, ' ')} must be an integer.`)
          if (rule.min !== undefined && num < rule.min) push(`${field.replace(/_/g, ' ')} must be at least ${rule.min}.`)
          if (rule.max !== undefined && num > rule.max) push(`${field.replace(/_/g, ' ')} may not be greater than ${rule.max}.`)
        }
        break
      }
      case 'array':
        if (!Array.isArray(value)) push(`${field.replace(/_/g, ' ')} must be an array.`)
        break
      case 'object':
        if (typeof value !== 'object') push(`${field.replace(/_/g, ' ')} must be an object.`)
        break
      case 'boolean':
        if (typeof value !== 'boolean') push(`${field.replace(/_/g, ' ')} must be true or false.`)
        break
    }
    if (rule.enum && !rule.enum.includes(String(value))) {
      push(`${field.replace(/_/g, ' ')} must be one of: ${rule.enum.join(', ')}.`)
    }
  }
  return errors
}

export function assertValid(errors: Record<string, string[]>): void {
  if (Object.keys(errors).length) {
    fail(422, 'The given data was invalid.', errors)
  }
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (v: number) => (v * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10
}

export function orderCode(year: number, sequence: number): string {
  return `RN-${year}-${String(sequence).padStart(4, '0')}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function minutesBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000))
}

export function buildProofLink(baseUrl: string, orderId: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/proof/${orderId}?token=${token}`
}

export function orderSummaryLine(order: Order, shop: Shop | undefined): string {
  return `${order.order_code} · ${order.shop_name}`
}
