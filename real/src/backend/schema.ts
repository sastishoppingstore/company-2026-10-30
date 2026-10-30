// Physical data model. The SQLite adapter turns these definitions into real
// typed SQL tables; the IndexedDB adapter uses the same names as object stores.
// The Laravel reference backend mirrors these tables in `laravel/database/migrations`.

export type ColumnType = 'text' | 'int' | 'real' | 'bool' | 'json'

export interface TableDef {
  name: string
  columns: Record<string, ColumnType>
}

export const SCHEMA: TableDef[] = [
  {
    name: 'companies',
    columns: {
      id: 'text', name: 'text', code: 'text', email: 'text', phone: 'text',
      address: 'text', city: 'text', country: 'text', gst_number: 'text',
      status: 'text', brand_color: 'text', created_at: 'text',
    },
  },
  {
    name: 'users',
    columns: {
      id: 'text', company_id: 'text', name: 'text', email: 'text', phone: 'text',
      role: 'text', status: 'text', password_hash: 'text', rating: 'real',
      last_login_at: 'text', created_at: 'text',
    },
  },
  {
    name: 'shops',
    columns: {
      id: 'text', code: 'text', name: 'text', address: 'text', city: 'text',
      state: 'text', postal_code: 'text', lat: 'real', lng: 'real', phone: 'text',
      category: 'text', status: 'text', rating: 'real', is_demo: 'int',
      notes: 'text', created_at: 'text',
    },
  },
  {
    name: 'shop_receivers',
    columns: {
      id: 'text', shop_id: 'text', name: 'text', phone: 'text', email: 'text',
      role: 'text', is_primary: 'int', status: 'text', created_at: 'text',
    },
  },
  {
    name: 'vehicles',
    columns: { id: 'text', driver_id: 'text', type: 'text', model: 'text', plate: 'text', color: 'text' },
  },
  {
    name: 'orders',
    columns: {
      id: 'text', order_code: 'text', company_id: 'text', shop_id: 'text',
      shop_name: 'text', shop_code: 'text', created_by: 'text', status: 'text',
      previous_status: 'text', priority: 'text', pickup_address: 'text',
      pickup_lat: 'real', pickup_lng: 'real', destination_address: 'text',
      dest_lat: 'real', dest_lng: 'real', receiver_id: 'text', receiver_name: 'text',
      receiver_phone: 'text', receiver_email: 'text', item_description: 'text',
      quantity: 'int', weight_kg: 'real', special_instructions: 'text',
      requested_delivery_at: 'text', authorized_contact_name: 'text',
      authorized_contact_phone: 'text', assigned_driver_id: 'text',
      offered_driver_ids: 'json', company_otp_verified_at: 'text', accepted_at: 'text',
      picked_up_at: 'text', departed_at: 'text', arrived_at: 'text',
      otp_verified_at: 'text', delivered_at: 'text', cancelled_at: 'text',
      cancellation_requested_at: 'text', cancellation_reason: 'text',
      cancellation_status: 'text', last_location_at: 'text', distance_km: 'real',
      eta_minutes: 'int', proof_expires_at: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'order_events',
    columns: {
      id: 'text', order_id: 'text', company_id: 'text', type: 'text', actor_id: 'text',
      actor_name: 'text', actor_role: 'text', message: 'text', meta: 'json', created_at: 'text',
    },
  },
  {
    name: 'otps',
    columns: {
      id: 'text', order_id: 'text', company_id: 'text', purpose: 'text', channel: 'text',
      target: 'text', code_hash: 'text', expires_at: 'text', attempts: 'int',
      max_attempts: 'int', consumed_at: 'text', verified_at: 'text',
      resend_available_at: 'text', code_cipher: 'text', created_at: 'text',
    },
  },
  {
    name: 'notifications',
    columns: {
      id: 'text', company_id: 'text', user_id: 'text', order_id: 'text', channel: 'text',
      type: 'text', title: 'text', body: 'text', data: 'json', read_at: 'text', created_at: 'text',
    },
  },
  {
    name: 'emails',
    columns: {
      id: 'text', company_id: 'text', order_id: 'text', to_email: 'text', to_name: 'text',
      subject: 'text', html: 'text', status: 'text', provider: 'text', error: 'text',
      secure_link: 'text', sent_at: 'text', created_at: 'text',
    },
  },
  {
    name: 'audit_logs',
    columns: {
      id: 'text', actor_id: 'text', actor_name: 'text', actor_role: 'text',
      company_id: 'text', action: 'text', entity_type: 'text', entity_id: 'text',
      meta: 'json', ip: 'text', created_at: 'text',
    },
  },
  {
    name: 'locations',
    columns: {
      id: 'text', order_id: 'text', driver_id: 'text', lat: 'real', lng: 'real',
      accuracy: 'real', heading: 'real', speed: 'real', battery: 'int',
      recorded_at: 'text', created_at: 'text',
    },
  },
  {
    name: 'files',
    columns: {
      id: 'text', company_id: 'text', order_id: 'text', kind: 'text', name: 'text',
      mime: 'text', size: 'int', storage_key: 'text', data: 'text', created_at: 'text',
    },
  },
  {
    name: 'driver_issues',
    columns: {
      id: 'text', order_id: 'text', company_id: 'text', driver_id: 'text', type: 'text',
      description: 'text', status: 'text', resolution: 'text', created_at: 'text', resolved_at: 'text',
    },
  },
  {
    name: 'sessions',
    columns: {
      id: 'text', user_id: 'text', token_hash: 'text', expires_at: 'text',
      created_at: 'text', ip: 'text', user_agent: 'text',
    },
  },
  {
    name: 'password_resets',
    columns: {
      id: 'text', user_id: 'text', token_hash: 'text', expires_at: 'text',
      used_at: 'text', created_at: 'text',
    },
  },
]

export const TABLE_NAMES = SCHEMA.map((t) => t.name)

export function columnType(table: string, column: string): ColumnType {
  const def = SCHEMA.find((t) => t.name === table)
  return def?.columns[column] ?? 'text'
}
