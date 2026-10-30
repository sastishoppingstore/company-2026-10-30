// Shared domain types — mirrored by the Laravel reference implementation in
// `laravel/app/Models` and consumed by both the local API engine and the UI.

export type UserRole = 'company_admin' | 'company_user' | 'driver' | 'admin'
export type OrderStatus =
  | 'DRAFT'
  | 'PENDING_ASSIGNMENT'
  | 'OFFERED'
  | 'ACCEPTED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'ARRIVED_AT_SHOP'
  | 'OTP_VERIFIED'
  | 'DELIVERED'
  | 'CANCELLATION_REQUESTED'
  | 'CANCELLED'
  | 'DELIVERY_FAILED'
  | 'RETURN_REQUIRED'
  | 'ADMIN_REVIEW'
  | 'REASSIGNED'

export type Priority = 'STANDARD' | 'EXPRESS' | 'CRITICAL'
export type OtpPurpose = 'order_confirmation' | 'delivery_verification'
export type OtpChannel = 'sms' | 'email'

export interface Company {
  id: string
  name: string
  code: string
  email: string
  phone: string
  address: string
  city: string
  country: string
  gst_number: string
  status: 'active' | 'suspended'
  brand_color: string
  created_at: string
}

export interface User {
  id: string
  company_id: string | null
  name: string
  email: string
  phone: string
  role: UserRole
  status: 'active' | 'suspended'
  password_hash: string
  rating: number | null
  last_login_at: string | null
  created_at: string
}

export interface Shop {
  id: string
  code: string
  name: string
  address: string
  city: string
  state: string
  postal_code: string
  lat: number
  lng: number
  phone: string
  category: string
  status: 'active' | 'inactive'
  rating: number
  is_demo: number
  notes: string
  created_at: string
}

export interface ShopReceiver {
  id: string
  shop_id: string
  name: string
  phone: string
  email: string
  role: string
  is_primary: number
  status: 'active' | 'inactive'
  created_at: string
}

export interface Vehicle {
  id: string
  driver_id: string
  type: string
  model: string
  plate: string
  color: string
}

export interface Driver {
  id: string
  company_id: string | null
  name: string
  email: string
  phone: string
  role: UserRole
  status: 'active' | 'suspended'
  last_login_at: string | null
  created_at: string
  vehicle: Vehicle | null
  rating: number
  active_jobs: number
  is_available: number
  completed_jobs?: number
}

export interface Order {
  id: string
  order_code: string
  company_id: string
  shop_id: string
  shop_name: string
  shop_code: string
  created_by: string
  status: OrderStatus
  previous_status: OrderStatus | null
  priority: Priority
  pickup_address: string
  pickup_lat: number
  pickup_lng: number
  destination_address: string
  dest_lat: number
  dest_lng: number
  receiver_id: string
  receiver_name: string
  receiver_phone: string
  receiver_email: string
  item_description: string
  quantity: number
  weight_kg: number | null
  special_instructions: string
  requested_delivery_at: string
  authorized_contact_name: string
  authorized_contact_phone: string
  assigned_driver_id: string | null
  offered_driver_ids: string[]
  company_otp_verified_at: string | null
  accepted_at: string | null
  picked_up_at: string | null
  departed_at: string | null
  arrived_at: string | null
  otp_verified_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  cancellation_requested_at: string | null
  cancellation_reason: string
  cancellation_status: 'none' | 'requested' | 'approved' | 'rejected'
  last_location_at: string | null
  proof_expires_at: string | null
  distance_km: number
  eta_minutes: number
  created_at: string
  updated_at: string
}

export interface OrderEvent {
  id: string
  order_id: string
  company_id: string
  type: string
  actor_id: string
  actor_name: string
  actor_role: string
  message: string
  meta: Record<string, unknown>
  created_at: string
}

export interface Otp {
  id: string
  order_id: string
  company_id: string
  purpose: OtpPurpose
  channel: OtpChannel
  target: string
  code_hash: string
  expires_at: string
  attempts: number
  max_attempts: number
  consumed_at: string | null
  verified_at: string | null
  resend_available_at: string
  created_at: string
}

export interface AppNotification {
  id: string
  company_id: string
  user_id: string | null
  order_id: string | null
  channel: 'in_app' | 'email' | 'sms' | 'push'
  type: string
  title: string
  body: string
  data: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export interface EmailRecord {
  id: string
  company_id: string | null
  order_id: string | null
  to_email: string
  to_name: string
  subject: string
  html: string
  status: 'queued' | 'sent' | 'failed'
  provider: string
  error: string | null
  secure_link: string | null
  sent_at: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  actor_id: string
  actor_name: string
  actor_role: string
  company_id: string | null
  action: string
  entity_type: string
  entity_id: string
  meta: Record<string, unknown>
  ip: string
  created_at: string
}

export interface DriverLocation {
  id: string
  order_id: string
  driver_id: string
  lat: number
  lng: number
  accuracy: number
  heading: number
  speed: number
  battery: number
  recorded_at: string
  created_at: string
}

export interface StoredFile {
  id: string
  company_id: string
  order_id: string
  kind: 'signature' | 'delivery_photo' | 'document'
  name: string
  mime: string
  size: number
  storage_key: string
  created_at: string
}

export interface DriverIssue {
  id: string
  order_id: string
  company_id: string
  driver_id: string
  type: string
  description: string
  status: 'open' | 'resolved'
  resolution: string
  created_at: string
  resolved_at: string | null
}
