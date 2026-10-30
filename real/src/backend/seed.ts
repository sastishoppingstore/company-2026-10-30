import type { Storage } from './storage.ts'
import { hashPassword } from './crypto.ts'
import { issueOtp } from './otp.ts'
import { haversineKm, nowIso } from './util.ts'
import type { OtpConfig } from './otp.ts'

export interface SeedConfig extends OtpConfig {
  appSecret: string
}

const DEMO_PASSWORD = 'Password@123'

function daysAgo(days: number, hours = 0, minutes = 0): string {
  return new Date(Date.now() - (days * 86400 + hours * 3600 + minutes * 60) * 1000).toISOString()
}
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function signatureSvg(name: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="150"><rect width="100%" height="100%" fill="#ffffff"/><path d="M24 92 C 64 28, 96 118, 138 66 S 208 36, 248 82 S 332 26, 396 66" stroke="#0B2140" stroke-width="3.2" fill="none" stroke-linecap="round"/><line x1="24" y1="118" x2="396" y2="118" stroke="#CBD5E1" stroke-width="1.5"/><text x="24" y="136" font-family="Helvetica,Arial,sans-serif" font-size="13" fill="#64748B">${name}</text></svg>`
}

function photoSvg(label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#DBEAFE"/><stop offset="100%" stop-color="#93C5FD"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect x="60" y="110" width="300" height="230" rx="8" fill="#ffffff"/><rect x="60" y="110" width="300" height="70" rx="8" fill="#1E6FFF"/><text x="90" y="156" font-family="Helvetica,Arial,sans-serif" font-size="30" font-weight="bold" fill="#ffffff">${label}</text><rect x="95" y="210" width="110" height="130" rx="6" fill="#E2E8F0"/><rect x="225" y="210" width="110" height="60" rx="6" fill="#E2E8F0"/><rect x="225" y="285" width="110" height="55" rx="6" fill="#E2E8F0"/><circle cx="480" cy="90" r="36" fill="#FDE68A"/><text x="400" y="380" font-family="Helvetica,Arial,sans-serif" font-size="22" fill="#1E3A8A">Delivery proof photo · ${label}</text></svg>`
}

function dataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export async function seedDatabase(storage: Storage, config: SeedConfig): Promise<void> {
  if ((await storage.count('companies')) > 0) return

  const passwordHash = await hashPassword(DEMO_PASSWORD)
  const created = nowIso()

  /* ---------------------------------------------------------------- companies */
  await storage.insert('companies', {
    id: 'cmp_vantage', name: 'Vantage Trading Co.', code: 'VNT',
    email: 'dispatch@vantage.test', phone: '+91 98765 40000',
    address: 'Unit 14, Survey 42, Baner MIDC, Baner Road', city: 'Pune',
    country: 'India', gst_number: '27AABCV1234M1ZP', status: 'active',
    brand_color: '#1E6FFF', created_at: created,
  })
  await storage.insert('companies', {
    id: 'cmp_halcyon', name: 'Halcyon Exports Pvt Ltd', code: 'HEX',
    email: 'ops@halcyon.test', phone: '+91 98765 99000',
    address: 'Plot 7, MIDC Industrial Area, Chakan', city: 'Pune',
    country: 'India', gst_number: '27AAHCH5566N1ZQ', status: 'active',
    brand_color: '#0F766E', created_at: created,
  })

  /* -------------------------------------------------------------------- users */
  const users = [
    { id: 'usr_ananya', company_id: 'cmp_vantage', name: 'Ananya Rao', email: 'admin@vantage.test', phone: '+91 98765 40021', role: 'company_admin' },
    { id: 'usr_rahul', company_id: 'cmp_vantage', name: 'Rahul Menon', email: 'dispatcher@vantage.test', phone: '+91 98765 40022', role: 'company_user' },
    { id: 'usr_priya', company_id: 'cmp_halcyon', name: 'Priya Desai', email: 'ops@halcyon.test', phone: '+91 98765 99011', role: 'company_admin' },
    { id: 'usr_super', company_id: null, name: 'Super Admin', email: 'superadmin@rnaship.test', phone: '+91 90000 00000', role: 'admin' },
    { id: 'usr_imran', company_id: null, name: 'Imran Shaikh', email: 'imran@drives.test', phone: '+91 90000 11111', role: 'driver' },
    { id: 'usr_vikas', company_id: null, name: 'Vikas Jadhav', email: 'vikas@drives.test', phone: '+91 90000 22222', role: 'driver' },
    { id: 'usr_sandeep', company_id: null, name: 'Sandeep Patil', email: 'sandeep@drives.test', phone: '+91 90000 33333', role: 'driver' },
  ]
  for (const u of users) {
    await storage.insert('users', {
      ...u, status: 'active', password_hash: passwordHash, rating: u.role === 'driver' ? 4.6 : null,
      last_login_at: null, created_at: created,
    })
  }

  /* -------------------------------------------------------------------- shops */
  const shops = [
    { id: 'shp_rna', code: 'RNA-001', name: 'RNA General Store', address: 'Shop 12, Shivaji Nagar Main Road, Near Post Office', city: 'Pune', state: 'Maharashtra', postal_code: '411005', lat: 18.5308, lng: 73.8475, phone: '+91 20 2545 7788', category: 'Grocery & General Store', status: 'active', rating: 4.8, is_demo: 1, notes: 'Demonstration destination shop for the sample bag shipment. Registered receivers can be verified on the driver app.' },
    { id: 'shp_sgt', code: 'SGT-014', name: 'Shree Ganesh Traders', address: '18, Kothrud Depot Road', city: 'Pune', state: 'Maharashtra', postal_code: '411038', lat: 18.5074, lng: 73.8077, phone: '+91 20 2521 4490', category: 'Grocery & Provisions', status: 'active', rating: 4.5, is_demo: 0, notes: 'Deliver before 10:00 — market area closes early on Sundays.' },
    { id: 'shp_kmd', code: 'KMD-207', name: 'Krishna Medicals', address: 'Survey 78, Paud Road, Aundh', city: 'Pune', state: 'Maharashtra', postal_code: '411007', lat: 18.559, lng: 73.807, phone: '+91 20 2588 1200', category: 'Pharmacy', status: 'active', rating: 4.9, is_demo: 0, notes: 'Pharmaceutical delivery — receiver signature mandatory.' },
    { id: 'shp_mms', code: 'MMS-118', name: 'Metro Mart Supermarket', address: 'Baner Link Road, Near Dmart', city: 'Pune', state: 'Maharashtra', postal_code: '411045', lat: 18.563, lng: 73.786, phone: '+91 20 6712 3300', category: 'Supermarket', status: 'active', rating: 4.2, is_demo: 0, notes: 'Goods-in desk operates 08:00 – 20:00.' },
    { id: 'shp_sps', code: 'SPS-042', name: 'Sunrise Provision Store', address: '22, Hadapsar-Bhuga Road', city: 'Pune', state: 'Maharashtra', postal_code: '411028', lat: 18.5089, lng: 73.926, phone: '+91 20 6600 2211', category: 'Grocery & General Store', status: 'active', rating: 4.4, is_demo: 0, notes: 'Weekday deliveries only.' },
    { id: 'shp_ktm', code: 'KTM-055', name: 'Kirti Textiles', address: '9, MG Road, Camp', city: 'Pune', state: 'Maharashtra', postal_code: '411001', lat: 18.5187, lng: 73.8785, phone: '+91 20 2543 9090', category: 'Textiles & Provisions', status: 'inactive', rating: 3.9, is_demo: 0, notes: 'Temporarily inactive — account on hold.' },
  ]
  for (const s of shops) await storage.insert('shops', { ...s, created_at: created })

  /* ----------------------------------------------------------------- receivers */
  const receivers = [
    { id: 'rcv_rna_1', shop_id: 'shp_rna', name: 'Rohit Sharma', phone: '+919822011234', email: 'rohit.sharma@rnageneralstore.test', role: 'Store Owner', is_primary: 1 },
    { id: 'rcv_rna_2', shop_id: 'shp_rna', name: 'Sneha Kulkarni', phone: '+919822055678', email: 'sneha.kulkarni@rnageneralstore.test', role: 'Shift Supervisor', is_primary: 0 },
    { id: 'rcv_sgt_1', shop_id: 'shp_sgt', name: 'Mahesh Agarwal', phone: '+919823377101', email: 'mahesh@shreeganeshtraders.test', role: 'Proprietor', is_primary: 1 },
    { id: 'rcv_kmd_1', shop_id: 'shp_kmd', name: 'Dr. Kavita Nimbalkar', phone: '+919844556677', email: 'kavita@krishnamedicals.test', role: 'Pharmacist', is_primary: 1 },
    { id: 'rcv_mms_1', shop_id: 'shp_mms', name: 'Anil Bhosale', phone: '+919811223344', email: 'anil@metromart.test', role: 'Goods-in Supervisor', is_primary: 1 },
    { id: 'rcv_sps_1', shop_id: 'shp_sps', name: 'Farida Sayyed', phone: '+919855667788', email: 'farida@sunriseprovision.test', role: 'Store Manager', is_primary: 1 },
    { id: 'rcv_ktm_1', shop_id: 'shp_ktm', name: 'Vinay Kadam', phone: '+919899001122', email: 'vinay@kirtitextiles.test', role: 'Owner', is_primary: 1 },
  ]
  for (const r of receivers) {
    await storage.insert('shop_receivers', { ...r, status: 'active', created_at: created })
  }

  /* ------------------------------------------------------------------ vehicles */
  await storage.insert('vehicles', { id: 'veh_1', driver_id: 'usr_imran', type: 'Van', model: 'Toyota Innova Crysta', plate: 'MH 12 AB 4417', color: 'White' })
  await storage.insert('vehicles', { id: 'veh_2', driver_id: 'usr_vikas', type: 'Tempo', model: 'Mahindra Supro', plate: 'MH 14 CD 8821', color: 'Silver' })
  await storage.insert('vehicles', { id: 'veh_3', driver_id: 'usr_sandeep', type: 'Three-wheeler', model: 'Bajaj Chetak', plate: 'MH 12 XY 2290', color: 'Blue' })

  /* -------------------------------------------------------------------- orders */
  const pickup = { address: 'Unit 14, Survey 42, Baner MIDC, Baner Road, Pune 411045', lat: 18.5642, lng: 73.7767 }

  const orders = [
    {
      id: 'ord_0001', order_code: 'RN-2026-0001', company_id: 'cmp_vantage', shop_id: 'shp_rna', shop_name: 'RNA General Store', shop_code: 'RNA-001',
      created_by: 'usr_ananya', status: 'DELIVERED', priority: 'STANDARD', receiver_id: 'rcv_rna_1', receiver_name: 'Rohit Sharma', receiver_phone: '+919822011234', receiver_email: 'rohit.sharma@rnageneralstore.test',
      item_description: '1 sealed bag — assorted grocery assortment', quantity: 1, weight_kg: 12,
      special_instructions: 'Handle with care — glass jars inside the bag.', requested_delivery_at: daysAgo(6),
      authorized_contact_name: 'Ananya Rao', authorized_contact_phone: '+91 98765 40021',
      assigned_driver_id: 'usr_imran', company_otp_verified_at: daysAgo(6), accepted_at: daysAgo(6), picked_up_at: daysAgo(6), departed_at: daysAgo(6),
      arrived_at: daysAgo(6), otp_verified_at: daysAgo(6), delivered_at: daysAgo(6), created_at: daysAgo(6), updated_at: daysAgo(6),
    },
    {
      id: 'ord_0002', order_code: 'RN-2026-0002', company_id: 'cmp_vantage', shop_id: 'shp_kmd', shop_name: 'Krishna Medicals', shop_code: 'KMD-207',
      created_by: 'usr_rahul', status: 'DELIVERED', priority: 'EXPRESS', receiver_id: 'rcv_kmd_1', receiver_name: 'Dr. Kavita Nimbalkar', receiver_phone: '+919844556677', receiver_email: 'kavita@krishnamedicals.test',
      item_description: '1 sealed bag — OTC medicine assortment', quantity: 1, weight_kg: 4.5,
      special_instructions: 'Pharmacy counter closes at 21:00.', requested_delivery_at: daysAgo(3),
      authorized_contact_name: 'Rahul Menon', authorized_contact_phone: '+91 98765 40022',
      assigned_driver_id: 'usr_vikas', company_otp_verified_at: daysAgo(3), accepted_at: daysAgo(3), picked_up_at: daysAgo(3), departed_at: daysAgo(3),
      arrived_at: daysAgo(3), otp_verified_at: daysAgo(3), delivered_at: daysAgo(3), created_at: daysAgo(3), updated_at: daysAgo(3),
    },
    {
      id: 'ord_0003', order_code: 'RN-2026-0003', company_id: 'cmp_vantage', shop_id: 'shp_sgt', shop_name: 'Shree Ganesh Traders', shop_code: 'SGT-014',
      created_by: 'usr_rahul', status: 'CANCELLED', priority: 'STANDARD', receiver_id: 'rcv_sgt_1', receiver_name: 'Mahesh Agarwal', receiver_phone: '+919823377101', receiver_email: 'mahesh@shreeganeshtraders.test',
      item_description: '2 sealed bags — dry provisions', quantity: 2, weight_kg: 18,
      special_instructions: '', requested_delivery_at: daysAgo(4),
      authorized_contact_name: 'Rahul Menon', authorized_contact_phone: '+91 98765 40022',
      company_otp_verified_at: daysAgo(4), cancelled_at: daysAgo(4), cancellation_reason: 'Duplicate request raised by the branch warehouse.',
      created_at: daysAgo(4), updated_at: daysAgo(4),
    },
    {
      id: 'ord_0004', order_code: 'RN-2026-0004', company_id: 'cmp_vantage', shop_id: 'shp_rna', shop_name: 'RNA General Store', shop_code: 'RNA-001',
      created_by: 'usr_ananya', status: 'IN_TRANSIT', priority: 'EXPRESS', receiver_id: 'rcv_rna_1', receiver_name: 'Rohit Sharma', receiver_phone: '+919822011234', receiver_email: 'rohit.sharma@rnageneralstore.test',
      item_description: '1 sealed bag — assorted grocery assortment', quantity: 1, weight_kg: 12,
      special_instructions: 'Priority drop. Ring the bell twice at the rear entrance.', requested_delivery_at: minutesAgo(-45),
      authorized_contact_name: 'Ananya Rao', authorized_contact_phone: '+91 98765 40021',
      assigned_driver_id: 'usr_imran', company_otp_verified_at: minutesAgo(95), accepted_at: minutesAgo(80),
      picked_up_at: minutesAgo(55), departed_at: minutesAgo(50), last_location_at: minutesAgo(2),
      created_at: minutesAgo(100), updated_at: minutesAgo(2),
    },
    {
      id: 'ord_0005', order_code: 'RN-2026-0005', company_id: 'cmp_vantage', shop_id: 'shp_mms', shop_name: 'Metro Mart Supermarket', shop_code: 'MMS-118',
      created_by: 'usr_rahul', status: 'DRAFT', priority: 'STANDARD', receiver_id: 'rcv_mms_1', receiver_name: 'Anil Bhosale', receiver_phone: '+919811223344', receiver_email: 'anil@metromart.test',
      item_description: '1 sealed bag — seasonal assortment', quantity: 1, weight_kg: 9,
      special_instructions: 'Deliver to the goods-in desk.', requested_delivery_at: minutesAgo(-180),
      authorized_contact_name: 'Rahul Menon', authorized_contact_phone: '+91 98765 40022',
      company_otp_verified_at: null, created_at: minutesAgo(12), updated_at: minutesAgo(12),
    },
    {
      id: 'ord_0006', order_code: 'RN-2026-0006', company_id: 'cmp_vantage', shop_id: 'shp_sgt', shop_name: 'Shree Ganesh Traders', shop_code: 'SGT-014',
      created_by: 'usr_rahul', status: 'ACCEPTED', priority: 'STANDARD', receiver_id: 'rcv_sgt_1', receiver_name: 'Mahesh Agarwal', receiver_phone: '+919823377101', receiver_email: 'mahesh@shreeganeshtraders.test',
      item_description: '3 sealed bags — cooking staples', quantity: 3, weight_kg: 22,
      special_instructions: 'Stack bags in order.', requested_delivery_at: minutesAgo(-240),
      authorized_contact_name: 'Rahul Menon', authorized_contact_phone: '+91 98765 40022',
      assigned_driver_id: 'usr_vikas', company_otp_verified_at: minutesAgo(35), accepted_at: minutesAgo(18),
      created_at: minutesAgo(40), updated_at: minutesAgo(18),
    },
    {
      id: 'ord_0007', order_code: 'RN-2026-0007', company_id: 'cmp_vantage', shop_id: 'shp_sps', shop_name: 'Sunrise Provision Store', shop_code: 'SPS-042',
      created_by: 'usr_ananya', status: 'DELIVERED', priority: 'STANDARD', receiver_id: 'rcv_sps_1', receiver_name: 'Farida Sayyed', receiver_phone: '+919855667788', receiver_email: 'farida@sunriseprovision.test',
      item_description: '2 sealed bags — packaged staples', quantity: 2, weight_kg: 15,
      special_instructions: '', requested_delivery_at: daysAgo(1),
      authorized_contact_name: 'Ananya Rao', authorized_contact_phone: '+91 98765 40021',
      assigned_driver_id: 'usr_sandeep', company_otp_verified_at: daysAgo(1), accepted_at: daysAgo(1), picked_up_at: daysAgo(1), departed_at: daysAgo(1),
      arrived_at: daysAgo(1), otp_verified_at: daysAgo(1), delivered_at: daysAgo(1), created_at: daysAgo(1), updated_at: daysAgo(1),
    },
    {
      id: 'ord_h001', order_code: 'RN-2026-0091', company_id: 'cmp_halcyon', shop_id: 'shp_rna', shop_name: 'RNA General Store', shop_code: 'RNA-001',
      created_by: 'usr_priya', status: 'PENDING_ASSIGNMENT', priority: 'STANDARD', receiver_id: 'rcv_rna_2', receiver_name: 'Sneha Kulkarni', receiver_phone: '+919822055678', receiver_email: 'sneha.kulkarni@rnageneralstore.test',
      item_description: '1 sealed bag — export sample', quantity: 1, weight_kg: 6,
      special_instructions: '', requested_delivery_at: minutesAgo(-60),
      authorized_contact_name: 'Priya Desai', authorized_contact_phone: '+91 98765 99011',
      created_at: minutesAgo(9), updated_at: minutesAgo(9),
    },
  ]

  for (const o of orders) {
    const dest = shops.find((s) => s.id === o.shop_id)!
    const distance = haversineKm(pickup, dest)
    await storage.insert('orders', {
      ...o,
      previous_status: null,
      pickup_address: pickup.address, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
      destination_address: dest.address, dest_lat: dest.lat, dest_lng: dest.lng,
      weight_kg: o.weight_kg ?? null,
      special_instructions: o.special_instructions ?? '',
      authorized_contact_name: o.authorized_contact_name, authorized_contact_phone: o.authorized_contact_phone,
      offered_driver_ids: [], cancellation_reason: o.cancellation_reason ?? '', cancellation_status: 'none',
      cancellation_requested_at: null, cancelled_at: o.cancelled_at ?? null, delivered_at: o.delivered_at ?? null,
      distance_km: distance, eta_minutes: Math.round(distance * 4.2),
    })
  }

  /* ------------------------------------------------------------------- events */
  const events: Array<[string, string, string, string, string, string, number]> = [
    ['ord_0004', 'order_created', 'Ananya Rao', 'company_admin', 'Order created for RNA General Store', 'created', 100],
    ['ord_0004', 'otp_sent', 'System', 'system', 'Confirmation OTP sent to authorized contact +91 98765 40021', 'otp', 95],
    ['ord_0004', 'otp_verified', 'Ananya Rao', 'company_admin', 'Company confirmation OTP verified', 'otp', 95],
    ['ord_0004', 'offers_dispatched', 'System', 'system', '2 eligible drivers notified', 'drivers', 94],
    ['ord_0004', 'accepted', 'Imran Shaikh', 'driver', 'Imran Shaikh accepted the delivery', 'driver', 80],
    ['ord_0004', 'picked_up', 'Imran Shaikh', 'driver', 'Bag picked up from Baner MIDC warehouse', 'driver', 55],
    ['ord_0004', 'in_transit', 'Imran Shaikh', 'driver', 'Trip started — live location sharing enabled', 'driver', 50],
    ['ord_0001', 'order_created', 'Ananya Rao', 'company_admin', 'Order created for RNA General Store', 'created', 400],
    ['ord_0001', 'otp_verified', 'Ananya Rao', 'company_admin', 'Company confirmation OTP verified', 'otp', 395],
    ['ord_0001', 'accepted', 'Imran Shaikh', 'driver', 'Imran Shaikh accepted the delivery', 'driver', 380],
    ['ord_0001', 'delivered', 'Imran Shaikh', 'driver', 'Delivery OTP verified · handed over to Rohit Sharma', 'driver', 300],
    ['ord_0006', 'order_created', 'Rahul Menon', 'company_user', 'Order created for Shree Ganesh Traders', 'created', 40],
    ['ord_0006', 'otp_verified', 'Rahul Menon', 'company_user', 'Company confirmation OTP verified', 'otp', 35],
    ['ord_0006', 'accepted', 'Vikas Jadhav', 'driver', 'Vikas Jadhav accepted the delivery', 'driver', 18],
  ]
  for (const [orderId, type, actorName, actorRole, message, meta, minutes] of events) {
    const order = orders.find((o) => o.id === orderId)!
    await storage.insert('order_events', {
      id: `evt_${orderId}_${type}_${minutes}`, order_id: orderId, company_id: order.company_id, type,
      actor_id: actorName === 'System' ? 'system' : (type === 'accepted' ? order.assigned_driver_id ?? 'system' : order.created_by),
      actor_name: actorName, actor_role: actorRole, message, meta: { tag: meta },
      created_at: minutesAgo(minutes),
    })
  }

  /* ---------------------------------------------------------------- locations */
  const route = [
    { lat: 18.5642, lng: 73.7767, m: 50 },
    { lat: 18.5596, lng: 73.7861, m: 34 },
    { lat: 18.5527, lng: 73.7985, m: 26 },
    { lat: 18.5461, lng: 73.8129, m: 18 },
    { lat: 18.5402, lng: 73.8291, m: 9 },
    { lat: 18.5354, lng: 73.8398, m: 3 },
    { lat: 18.5321, lng: 73.8459, m: 1 },
  ]
  for (const [index, point] of route.entries()) {
    await storage.insert('locations', {
      id: `loc_ord_0004_${index}`, order_id: 'ord_0004', driver_id: 'usr_imran',
      lat: point.lat, lng: point.lng, accuracy: 8 + index, heading: 62, speed: 22, battery: 78 - index * 4,
      recorded_at: minutesAgo(point.m), created_at: minutesAgo(point.m),
    })
  }

  /* --------------------------------------------------------- delivery proof */
  const proofs: Array<[string, string, string, string, string]> = [
    ['ord_0001', 'signature', 'signature-rohit-sharma.svg', 'image/svg+xml', 'Rohit Sharma'],
    ['ord_0001', 'delivery_photo', 'delivery-rna-general-store.svg', 'image/svg+xml', 'RNA General Store'],
    ['ord_0002', 'signature', 'signature-kavita-nimbalkar.svg', 'image/svg+xml', 'Dr. Kavita Nimbalkar'],
    ['ord_0002', 'delivery_photo', 'delivery-krishna-medicals.svg', 'image/svg+xml', 'Krishna Medicals'],
    ['ord_0007', 'signature', 'signature-farida-sayyed.svg', 'image/svg+xml', 'Farida Sayyed'],
    ['ord_0007', 'delivery_photo', 'delivery-sunrise-provision.svg', 'image/svg+xml', 'Sunrise Provision Store'],
  ]
  for (const [orderId, kind, name, mime, label] of proofs) {
    const order = orders.find((o) => o.id === orderId)!
    const key = `${orderId}/${kind}`
    const data = kind === 'signature' ? dataUrl(signatureSvg(label)) : dataUrl(photoSvg(label))
    await storage.putBlob(key, data)
    await storage.insert('files', {
      id: `file_${orderId}_${kind}`, company_id: order.company_id, order_id: orderId, kind,
      name, mime, size: data.length, storage_key: key, created_at: order.delivered_at ?? created,
    })
  }

  /* --------------------------- pending company OTP for the draft order 0005 */
  const draft = orders.find((o) => o.id === 'ord_0005')!
  await issueOtp(storage, config, {
    order: draft as any,
    purpose: 'order_confirmation',
    channel: 'sms',
    target: '+91 98765 40022',
  })

  await storage.insert('notifications', {
    id: 'ntf_seed_1', company_id: 'cmp_vantage', user_id: null, order_id: 'ord_0004', channel: 'in_app',
    type: 'order_status', title: 'Order RN-2026-0004 is in transit',
    body: 'Imran Shaikh picked up the bag and is sharing live location.',
    data: { order_code: 'RN-2026-0004' }, read_at: null, created_at: minutesAgo(50),
  })
  await storage.insert('notifications', {
    id: 'ntf_seed_2', company_id: 'cmp_vantage', user_id: null, order_id: 'ord_0001', channel: 'in_app',
    type: 'delivery_received', title: 'Order RN-2026-0001 received at RNA General Store',
    body: 'Delivery OTP verified. Proof of delivery is available.',
    data: { order_code: 'RN-2026-0001' }, read_at: null, created_at: daysAgo(6),
  })
}
