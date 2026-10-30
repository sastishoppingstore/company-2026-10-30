import type {
  AppNotification, AuditLog, Company, Driver, DriverIssue, DriverLocation, EmailRecord,
  Order, OrderEvent, Otp, OtpPurpose, Shop, ShopReceiver, StoredFile, User,
} from '../lib/types.ts'
import type { Storage } from './storage.ts'
import { decryptSecret, hmacHex, hashPassword, randomId, randomToken, verifyPassword } from './crypto.ts'
import { issueOtp, verifyOtp } from './otp.ts'
import {
  ApiError, assertValid, buildProofLink, fail, haversineKm, minutesBetween, nowIso, orderCode, validateFields,
} from './util.ts'
import {
  renderCancellationEmail, renderDeliveryReceivedEmail, renderOtpEmail, renderOrderCreatedEmail, renderResetPasswordEmail,
} from './mailer.ts'
import { seedDatabase } from './seed.ts'

export interface ApiConfig {
  appSecret: string
  otpTestMode: boolean
  otpTtlSeconds: number
  otpMaxAttempts: number
  otpResendCooldownSeconds: number
  otpMaxPerHour: number
  sessionTtlHours: number
  mailFrom: string
  emailTransport: string
  publicBaseUrl: string
  proofLinkTtlHours: number
}

export const defaultConfig: ApiConfig = {
  appSecret: 'rna-ship-dev-secret-change-in-production',
  otpTestMode: true,
  otpTtlSeconds: 600,
  otpMaxAttempts: 5,
  otpResendCooldownSeconds: 45,
  otpMaxPerHour: 8,
  sessionTtlHours: 12,
  mailFrom: 'no-reply@rnaship.test',
  emailTransport: 'smtp://smtp.rnaship.test (sandbox log transport)',
  publicBaseUrl: '',
  proofLinkTtlHours: 48,
}

export interface ApiRequest {
  method: string
  path: string
  query?: Record<string, string | undefined>
  body?: any
  token?: string | null
  origin?: string
  ip?: string
}

export interface ApiResponse {
  status: number
  data: any
}

export type EmitFn = (type: string, payload: unknown) => void

interface Ctx {
  params: Record<string, string>
  query: Record<string, string | undefined>
  body: any
  user: User | null
  company: Company | null
  storage: Storage
  config: ApiConfig
  ip: string
  origin: string
  emit: EmitFn
}

type Handler = (ctx: Ctx) => Promise<any>
type AuthMode = 'none' | 'any' | 'company' | 'driver' | 'admin'

interface Route {
  method: string
  pattern: string
  auth: AuthMode
  handler: Handler
}

const ACTIVE_JOB_STATUSES: Order['status'][] = ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_SHOP', 'OTP_VERIFIED']
const COMPANY_DIRECT_CANCEL: Order['status'][] = ['DRAFT', 'PENDING_ASSIGNMENT', 'OFFERED']
const COMPANY_REQUEST_CANCEL: Order['status'][] = ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_SHOP', 'OTP_VERIFIED']

export class Api {
  private routes: Route[] = []
  private storage: Storage
  private config: ApiConfig
  private emitFn: EmitFn

  constructor(storage: Storage, config: Partial<ApiConfig> = {}, emit: EmitFn = () => {}) {
    this.storage = storage
    this.config = { ...defaultConfig, ...config }
    this.emitFn = emit
    this.registerRoutes()
  }

  getConfig(): ApiConfig {
    return this.config
  }

  async init(): Promise<void> {
    await this.storage.init()
    await seedDatabase(this.storage, this.config)
  }

  /* ------------------------------------------------------------- route table */
  private route(method: string, pattern: string, auth: AuthMode, handler: Handler) {
    this.routes.push({ method, pattern, auth, handler })
  }

  private registerRoutes() {
    const r = this.route.bind(this)

    r('GET', '/public/config', 'none', async () => ({
      app_name: 'RNA Ship',
      environment: 'demo',
      otp_test_mode: this.config.otpTestMode,
      otp_ttl_seconds: this.config.otpTtlSeconds,
      otp_resend_cooldown_seconds: this.config.otpResendCooldownSeconds,
      demo_shop_id: 'shp_rna',
      company_count: await this.storage.count('companies'),
    }))

    r('GET', '/public/proof/:orderId', 'none', async (ctx) => {
      const order = await this.storage.get<Order>('orders', ctx.params.orderId)
      if (!order) fail(404, 'Order not found.')
      const token = ctx.query.token ?? ''
      const expected = await this.proofToken(order)
      if (!token || token !== expected) fail(403, 'This proof link is invalid or has expired.')
      const expiresAt = Number(token.split('.')[0])
      if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) fail(403, 'This proof link is invalid or has expired.')
      const files = await this.storage.filter<StoredFile>('files', (f) => f.order_id === order.id)
      return {
        order: this.publicOrder(order),
        files: files.map((f) => ({ id: f.id, kind: f.kind, name: f.name, mime: f.mime, size: f.size, created_at: f.created_at })),
        proof_files: await this.proofPayloads(files),
      }
    })

    r('POST', '/auth/login', 'none', async (ctx) => {
      const errors = validateFields(ctx.body ?? {}, {
        email: { type: 'string', required: true, email: true },
        password: { type: 'string', required: true, minLength: 6 },
      })
      assertValid(errors)
      const email = String(ctx.body.email).trim().toLowerCase()
      const user = await this.storage.find<User>('users', (u) => u.email.toLowerCase() === email)
      if (!user) fail(401, 'These credentials do not match our records.', { email: ['invalid credentials'] })
      const ok = await verifyPassword(String(ctx.body.password), user.password_hash)
      if (!ok) fail(401, 'These credentials do not match our records.', { password: ['invalid credentials'] })
      if (user.status !== 'active') fail(403, 'This account has been suspended. Contact your administrator.')
      const token = randomToken(32)
      const tokenHash = await hmacHex(this.config.appSecret, token)
      await this.storage.insert('sessions', {
        id: randomId('ses'), user_id: user.id, token_hash: tokenHash,
        expires_at: new Date(Date.now() + this.config.sessionTtlHours * 3600_000).toISOString(),
        created_at: nowIso(), ip: ctx.ip, user_agent: 'rnaship-client',
      })
      await this.storage.update('users', user.id, { last_login_at: nowIso() } as any)
      const company = user.company_id ? await this.storage.get<Company>('companies', user.company_id) : null
      await this.audit(ctx, 'auth.login', 'user', user.id, { role: user.role })
      return { token, user: this.publicUser(user), company }
    })

    r('POST', '/auth/logout', 'any', async (ctx) => {
      if (ctx.user) {
        const sessions = await this.storage.filter<any>('sessions', (s) => s.user_id === ctx.user!.id)
        for (const s of sessions) await this.storage.remove('sessions', s.id)
        await this.audit(ctx, 'auth.logout', 'user', ctx.user.id, {})
      }
      return { message: 'Signed out.' }
    })

    r('GET', '/auth/me', 'any', async (ctx) => ({
      user: ctx.user ? this.publicUser(ctx.user) : null,
      company: ctx.company,
    }))

    r('POST', '/auth/password/forgot', 'none', async (ctx) => {
      const email = String(ctx.body?.email ?? '').trim().toLowerCase()
      const user = await this.storage.find<User>('users', (u) => u.email.toLowerCase() === email)
      if (!user) {
        // Do not disclose whether the address exists.
        return { message: 'If that address is registered, a reset link has been sent.' }
      }
      const token = randomToken(24)
      const tokenHash = await hmacHex(this.config.appSecret, token)
      await this.storage.insert('password_resets', {
        id: randomId('pr'), user_id: user.id, token_hash: tokenHash,
        expires_at: new Date(Date.now() + 3600_000).toISOString(), used_at: null, created_at: nowIso(),
      })
      const link = `${this.baseUrl(ctx)}/reset-password?token=${token}`
      await this.sendEmail(ctx, {
        companyId: user.company_id, toEmail: user.email, toName: user.name,
        subject: 'Reset your RNA Ship password',
        html: renderResetPasswordEmail(link, user.name),
      })
      await this.audit(ctx, 'auth.password_reset_requested', 'user', user.id, { email })
      return {
        message: 'If that address is registered, a reset link has been sent.',
        ...(this.config.otpTestMode ? { debug_reset_token: token } : {}),
      }
    })

    r('POST', '/auth/password/reset', 'none', async (ctx) => {
      const errors = validateFields(ctx.body ?? {}, {
        token: { type: 'string', required: true },
        password: { type: 'string', required: true, minLength: 8 },
        password_confirmation: { type: 'string', required: true },
      })
      assertValid(errors)
      if (ctx.body.password !== ctx.body.password_confirmation) {
        fail(422, 'The given data was invalid.', { password_confirmation: ['passwords do not match'] })
      }
      const tokenHash = await hmacHex(this.config.appSecret, String(ctx.body.token))
      const reset = await this.storage.find<any>('password_resets', (p) => p.token_hash === tokenHash)
      if (!reset || reset.used_at || new Date(reset.expires_at).getTime() < Date.now()) {
        fail(400, 'This password reset link is invalid or has expired.')
      }
      await this.storage.update('users', reset.user_id, {
        password_hash: await hashPassword(String(ctx.body.password)),
      } as any)
      await this.storage.update('password_resets', reset.id, { used_at: nowIso() } as any)
      return { message: 'Password updated. You can now sign in.' }
    })

    r('POST', '/auth/password/change', 'any', async (ctx) => {
      const user = this.requireUser(ctx)
      const errors = validateFields(ctx.body ?? {}, {
        current_password: { type: 'string', required: true },
        password: { type: 'string', required: true, minLength: 8 },
      })
      assertValid(errors)
      const ok = await verifyPassword(String(ctx.body.current_password), user.password_hash)
      if (!ok) fail(422, 'The given data was invalid.', { current_password: ['current password is incorrect'] })
      await this.storage.update('users', user.id, { password_hash: await hashPassword(String(ctx.body.password)) } as any)
      await this.audit(ctx, 'auth.password_changed', 'user', user.id, {})
      return { message: 'Password updated.' }
    })

    r('GET', '/shops', 'any', async (ctx) => {
      const search = (ctx.query.search ?? '').toLowerCase()
      const city = (ctx.query.city ?? '').toLowerCase()
      const status = ctx.query.status ?? 'active'
      const shops = await this.storage.filter<Shop>('shops', (s) => {
        if (status !== 'all' && s.status !== status) return false
        if (city && !s.city.toLowerCase().includes(city)) return false
        if (search && !`${s.name} ${s.code} ${s.address} ${s.category}`.toLowerCase().includes(search)) return false
        return true
      })
      const receivers = await this.storage.all<ShopReceiver>('shop_receivers')
      const withMeta = await Promise.all(shops.map(async (s) => ({
        ...s,
        receiver_count: receivers.filter((rc) => rc.shop_id === s.id && rc.status === 'active').length,
      })))
      return { data: withMeta.sort((a, b) => a.name.localeCompare(b.name)) }
    })

    r('GET', '/shops/:id', 'any', async (ctx) => {
      const shop = await this.storage.get<Shop>('shops', ctx.params.id)
      if (!shop) fail(404, 'Shop not found.')
      const receivers = await this.storage.filter<ShopReceiver>('shop_receivers', (rc) => rc.shop_id === shop.id)
      const orders = ctx.user?.role === 'company_user' || ctx.user?.role === 'company_admin'
        ? await this.storage.filter<Order>('orders', (o) => o.shop_id === shop.id && o.company_id === ctx.user!.company_id)
        : await this.storage.filter<Order>('orders', (o) => o.shop_id === shop.id)
      return {
        shop,
        receivers: receivers.map((rc) => this.publicReceiver(rc, ctx.user)),
        recent_orders: orders
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 5)
          .map((o) => this.publicOrder(o)),
      }
    })

    r('POST', '/orders', 'company', async (ctx) => {
      const user = this.requireUser(ctx)
      const errors = validateFields(ctx.body ?? {}, {
        shop_id: { type: 'string', required: true },
        receiver_id: { type: 'string', required: true },
        pickup_address: { type: 'string', required: true, minLength: 8, maxLength: 240 },
        pickup_lat: { type: 'number', min: -90, max: 90, nullable: true },
        pickup_lng: { type: 'number', min: -180, max: 180, nullable: true },
        item_description: { type: 'string', required: true, minLength: 3, maxLength: 240 },
        quantity: { type: 'int', required: true, min: 1, max: 999 },
        weight_kg: { type: 'number', min: 0, max: 5000, nullable: true },
        priority: { type: 'string', required: true, enum: ['STANDARD', 'EXPRESS', 'CRITICAL'] },
        requested_delivery_at: { type: 'string', required: true },
        authorized_contact_name: { type: 'string', required: true, minLength: 2, maxLength: 120 },
        authorized_contact_phone: { type: 'string', required: true, minLength: 8, maxLength: 24 },
        special_instructions: { type: 'string', maxLength: 500, nullable: true },
      })
      assertValid(errors)

      const shop = await this.storage.get<Shop>('shops', String(ctx.body.shop_id))
      if (!shop) fail(422, 'The given data was invalid.', { shop_id: ['unknown shop'] })
      if (shop.status !== 'active') fail(422, 'This shop is not accepting deliveries.', { shop_id: ['shop is inactive'] })
      const receiver = await this.storage.get<ShopReceiver>('shop_receivers', String(ctx.body.receiver_id))
      if (!receiver || receiver.shop_id !== shop.id) {
        fail(422, 'The given data was invalid.', { receiver_id: ['receiver is not registered for this shop'] })
      }
      if (receiver.status !== 'active') {
        fail(422, 'The given data was invalid.', { receiver_id: ['receiver is inactive'] })
      }

      const pickup = ctx.body.pickup_lat !== undefined && ctx.body.pickup_lat !== null
        && ctx.body.pickup_lng !== undefined && ctx.body.pickup_lng !== null
        ? { lat: Number(ctx.body.pickup_lat), lng: Number(ctx.body.pickup_lng) }
        : this.parseCoordinates(String(ctx.body.pickup_address))
      const distance = haversineKm(pickup, shop)
      const sequence = (await this.storage.count('orders')) + 1
      const now = nowIso()
      const order: Order = {
        id: randomId('ord'),
        order_code: orderCode(new Date().getFullYear(), sequence),
        company_id: user.company_id!,
        shop_id: shop.id,
        shop_name: shop.name,
        shop_code: shop.code,
        created_by: user.id,
        status: 'DRAFT',
        previous_status: null,
        priority: ctx.body.priority,
        pickup_address: ctx.body.pickup_address,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        destination_address: shop.address,
        dest_lat: shop.lat,
        dest_lng: shop.lng,
        receiver_id: receiver.id,
        receiver_name: receiver.name,
        receiver_phone: receiver.phone,
        receiver_email: receiver.email,
        item_description: ctx.body.item_description,
        quantity: Number(ctx.body.quantity),
        weight_kg: ctx.body.weight_kg === null || ctx.body.weight_kg === undefined ? null : Number(ctx.body.weight_kg),
        special_instructions: ctx.body.special_instructions ?? '',
        requested_delivery_at: new Date(String(ctx.body.requested_delivery_at)).toISOString(),
        authorized_contact_name: ctx.body.authorized_contact_name,
        authorized_contact_phone: ctx.body.authorized_contact_phone,
        assigned_driver_id: null,
        offered_driver_ids: [],
        company_otp_verified_at: null,
        accepted_at: null, picked_up_at: null, departed_at: null, arrived_at: null,
        otp_verified_at: null, delivered_at: null, cancelled_at: null,
        cancellation_requested_at: null, cancellation_reason: '', cancellation_status: 'none',
        last_location_at: null, proof_expires_at: null,
        distance_km: distance, eta_minutes: Math.round(distance * 4.2),
        created_at: now, updated_at: now,
      }
      await this.storage.insert('orders', order as any)
      await this.addEvent(ctx, order, 'order_created', `Order created for ${shop.name}`, { shop_code: shop.code })
      await this.audit(ctx, 'order.created', 'order', order.id, { order_code: order.order_code })
      await this.sendEmail(ctx, {
        companyId: order.company_id, orderId: order.id, toEmail: user.email, toName: user.name,
        subject: `Delivery order ${order.order_code} created`,
        html: renderOrderCreatedEmail(order, shop.name),
      })
      this.emitFn('order.created', { orderId: order.id, companyId: order.company_id })
      return { order: this.publicOrder(order) }
    })

    r('GET', '/orders', 'any', async (ctx) => {
      const page = Math.max(1, Number(ctx.query.page ?? 1))
      const perPage = Math.min(100, Math.max(1, Number(ctx.query.per_page ?? 15)))
      const status = ctx.query.status
      const priority = ctx.query.priority
      const search = (ctx.query.search ?? '').toLowerCase()
      const shopId = ctx.query.shop_id
      const from = ctx.query.from
      const to = ctx.query.to
      const driverId = ctx.query.driver_id

      let orders = await this.storage.all<Order>('orders')
      if (ctx.user!.role === 'company_admin' || ctx.user!.role === 'company_user') {
        orders = orders.filter((o) => o.company_id === ctx.user!.company_id)
      } else if (ctx.user!.role === 'driver') {
        orders = orders.filter((o) => o.assigned_driver_id === ctx.user!.id || o.offered_driver_ids.includes(ctx.user!.id))
      }
      if (status && status !== 'all') orders = orders.filter((o) => o.status === status)
      if (priority && priority !== 'all') orders = orders.filter((o) => o.priority === priority)
      if (shopId) orders = orders.filter((o) => o.shop_id === shopId)
      if (driverId) orders = orders.filter((o) => o.assigned_driver_id === driverId)
      if (from) orders = orders.filter((o) => new Date(o.created_at) >= new Date(from))
      if (to) orders = orders.filter((o) => new Date(o.created_at) <= new Date(`${to}T23:59:59`))
      if (search) {
        orders = orders.filter((o) =>
          `${o.order_code} ${o.shop_name} ${o.shop_code} ${o.receiver_name} ${o.item_description}`.toLowerCase().includes(search))
      }
      orders.sort((a, b) => b.created_at.localeCompare(a.created_at))
      const total = orders.length
      const pageItems = orders.slice((page - 1) * perPage, page * perPage)
      const drivers = await this.storage.all<User>('users')
      return {
        data: pageItems.map((o) => ({
          ...this.publicOrder(o),
          driver_name: drivers.find((d) => d.id === o.assigned_driver_id)?.name ?? null,
        })),
        meta: { total, page, per_page: perPage, last_page: Math.max(1, Math.ceil(total / perPage)) },
      }
    })

    r('GET', '/orders/:id', 'any', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      const driver = order.assigned_driver_id ? await this.storage.get<User>('users', order.assigned_driver_id) : null
      const vehicle = driver ? await this.storage.find<any>('vehicles', (v) => v.driver_id === driver.id) : null
      const events = await this.storage.filter<OrderEvent>('order_events', (e) => e.order_id === order.id)
      const files = await this.storage.filter<StoredFile>('files', (f) => f.order_id === order.id)
      const issues = await this.storage.filter<DriverIssue>('driver_issues', (i) => i.order_id === order.id)
      const offers = await this.storage.all<User>('users')
      return {
        order: this.publicOrder(order),
        driver: driver ? { ...this.publicUser(driver), vehicle } : null,
        events: events.sort((a, b) => a.created_at.localeCompare(b.created_at)),
        files,
        issues,
        shop: await this.storage.get<Shop>('shops', order.shop_id),
        receiver: await this.storage.get<ShopReceiver>('shop_receivers', order.receiver_id),
        offered_drivers: order.offered_driver_ids
          .map((id) => offers.find((u) => u.id === id))
          .filter(Boolean)
          .map((u: any) => ({ id: u.id, name: u.name, phone: u.phone })),
        permissions: this.orderPermissions(ctx, order),
      }
    })

    r('GET', '/orders/:id/timeline', 'any', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      const events = await this.storage.filter<OrderEvent>('order_events', (e) => e.order_id === order.id)
      return { data: events.sort((a, b) => a.created_at.localeCompare(b.created_at)) }
    })

    r('GET', '/orders/:id/track', 'any', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      const locations = await this.storage.filter<DriverLocation>('locations', (l) => l.order_id === order.id)
      const latest = locations.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]
      const driver = order.assigned_driver_id ? await this.storage.get<User>('users', order.assigned_driver_id) : null
      const vehicle = driver ? await this.storage.find<any>('vehicles', (v) => v.driver_id === driver.id) : null
      const stale = latest ? Date.now() - new Date(latest.recorded_at).getTime() > 120_000 : true
      return {
        order: this.publicOrder(order),
        driver: driver ? { ...this.publicUser(driver), vehicle } : null,
        location: latest ?? null,
        gps: {
          status: latest ? (stale ? 'stale' : 'live') : 'unavailable',
          last_update: latest?.recorded_at ?? null,
          accuracy: latest?.accuracy ?? null,
          permission: latest ? 'granted' : 'unknown',
        },
        route: {
          pickup: { label: order.pickup_address, lat: order.pickup_lat, lng: order.pickup_lng },
          destination: { label: order.destination_address, lat: order.dest_lat, lng: order.dest_lng },
        },
        trail: locations
          .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
          .slice(-50)
          .map((l) => ({ lat: l.lat, lng: l.lng, recorded_at: l.recorded_at })),
        eta_minutes: order.eta_minutes,
        distance_km: order.distance_km,
      }
    })

    r('GET', '/orders/:id/proof', 'any', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      const files = await this.storage.filter<StoredFile>('files', (f) => f.order_id === order.id)
      const payload = await this.proofPayloads(files)
      const token = await this.proofToken(order)
      return {
        order: this.publicOrder(order),
        files: files.map((f) => ({ ...f, data_url: payload[f.id] })),
        secure_link: buildProofLink(this.baseUrl(ctx), order.id, token),
        delivered_at: order.delivered_at,
        receiver_name: order.receiver_name,
      }
    })

    r('GET', '/orders/:id/proof/:fileId', 'any', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      const file = await this.storage.get<StoredFile>('files', ctx.params.fileId)
      if (!file || file.order_id !== order.id) fail(404, 'File not found.')
      const data = await this.storage.getBlob(file.storage_key)
      if (!data) fail(404, 'File payload not found.')
      return { file: { ...file, data_url: data } }
    })

    r('POST', '/orders/:id/submit', 'company', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (order.status !== 'DRAFT') {
        fail(409, 'Only a draft order can be submitted.', { status: [`order is ${order.status}`] })
      }
      if (order.company_otp_verified_at) {
        fail(409, 'This order has already been confirmed.', { status: ['already confirmed'] })
      }
      const otp = await issueOtp(this.storage, this.config, {
        order, purpose: 'order_confirmation', channel: 'sms', target: order.authorized_contact_phone,
      })
      await this.notify(ctx, {
        companyId: order.company_id, orderId: order.id, channel: 'sms', type: 'otp_sent',
        title: `Confirmation OTP for ${order.order_code}`,
        body: `A 6-digit confirmation code was sent to ${order.authorized_contact_phone} for order ${order.order_code}. It expires in ${Math.round(this.config.otpTtlSeconds / 60)} minutes.`,
        data: { purpose: 'order_confirmation', target: order.authorized_contact_phone },
      })
      await this.addEvent(ctx, order, 'otp_sent', `Confirmation OTP sent to authorized contact ${order.authorized_contact_phone}`, { purpose: 'order_confirmation' })
      await this.audit(ctx, 'order.submitted', 'order', order.id, { purpose: 'order_confirmation' })
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      return {
        message: `Confirmation OTP sent to ${order.authorized_contact_phone}.`,
        otp_required: true,
        purpose: 'order_confirmation' as OtpPurpose,
        otp_id: otp.id,
        expires_at: otp.expires_at,
        resend_available_at: otp.resend_available_at,
      }
    })

    r('POST', '/orders/:id/confirm', 'company', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (order.status !== 'DRAFT') fail(409, 'This order has already been confirmed.')
      const code = String(ctx.body?.otp ?? '').trim()
      if (!/^\d{6}$/.test(code)) fail(422, 'The given data was invalid.', { otp: ['enter the 6-digit code'] })
      const otp = await verifyOtp(this.storage, this.config, { orderId: order.id, purpose: 'order_confirmation', code })
      const now = nowIso()
      await this.storage.update<Order>('orders', order.id, {
        status: 'PENDING_ASSIGNMENT', company_otp_verified_at: otp.verified_at, updated_at: now,
      } as any)
      const updated = { ...order, status: 'PENDING_ASSIGNMENT' as const, company_otp_verified_at: otp.verified_at }
      await this.addEvent(ctx, updated, 'otp_verified', 'Company confirmation OTP verified — order released to the driver network', { purpose: 'order_confirmation' })

      const eligible = await this.eligibleDrivers()
      if (eligible.length) {
        await this.storage.update<Order>('orders', order.id, {
          status: 'OFFERED', offered_driver_ids: eligible.map((d) => d.id), updated_at: now,
        } as any)
        await this.addEvent(ctx, updated, 'offers_dispatched', `${eligible.length} eligible driver${eligible.length === 1 ? '' : 's'} notified`, { drivers: eligible.map((d) => d.name) })
        for (const d of eligible) {
          await this.notify(ctx, {
            companyId: order.company_id, orderId: order.id, channel: 'push', type: 'job_offer',
            title: `New delivery job · ${order.order_code}`,
            body: `Pickup in Baner MIDC, drop at ${order.shop_name} (${order.shop_code}).`,
            data: { order_id: order.id, driver_id: d.id },
          })
        }
      } else {
        await this.addEvent(ctx, updated, 'awaiting_assignment', 'No eligible driver available — Super Admin assignment required', {})
      }
      await this.notifyAdmins(ctx, order, 'New delivery order awaiting assignment',
        `${order.order_code} for ${order.shop_name} is ${eligible.length ? 'offered to drivers' : 'awaiting a driver'}.`)
      await this.audit(ctx, 'order.confirmed', 'order', order.id, { eligible: eligible.length })
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      const fresh = await this.storage.get<Order>('orders', order.id)
      return { order: this.publicOrder(fresh!), eligible_drivers: eligible.length }
    })

    r('POST', '/orders/:id/cancel', 'company', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (!COMPANY_DIRECT_CANCEL.includes(order.status)) {
        fail(409, `An order that is already ${order.status.replace(/_/g, ' ').toLowerCase()} can only be cancelled by a cancellation request.`, {
          status: ['cancellation request required'],
        })
      }
      const reason = String(ctx.body?.reason ?? '').trim()
      if (reason.length < 4) fail(422, 'The given data was invalid.', { reason: ['please give a reason (min 4 characters)'] })
      const now = nowIso()
      await this.storage.update<Order>('orders', order.id, {
        status: 'CANCELLED', cancelled_at: now, cancellation_reason: reason, cancellation_status: 'none', updated_at: now,
      } as any)
      await this.addEvent(ctx, order, 'cancelled', `Order cancelled by ${ctx.user!.name}: ${reason}`, { reason })
      if (order.assigned_driver_id) {
        await this.notify(ctx, {
          companyId: order.company_id, orderId: order.id, channel: 'push', type: 'order_cancelled',
          title: `Order ${order.order_code} cancelled`,
          body: 'The company cancelled this job before it started.', data: { driver_id: order.assigned_driver_id },
        })
      }
      await this.notifyAdmins(ctx, order, `Order ${order.order_code} cancelled`, reason)
      await this.sendEmail(ctx, {
        companyId: order.company_id, orderId: order.id, toEmail: ctx.company!.email, toName: ctx.company!.name,
        subject: `Order ${order.order_code} cancelled`, html: renderCancellationEmail(order, reason),
      })
      await this.audit(ctx, 'order.cancelled', 'order', order.id, { reason })
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      const fresh = await this.storage.get<Order>('orders', order.id)
      return { order: this.publicOrder(fresh!), message: 'Order cancelled.' }
    })

    r('POST', '/orders/:id/cancellation-request', 'company', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (!COMPANY_REQUEST_CANCEL.includes(order.status)) {
        fail(409, 'This order cannot be cancelled directly by the company.', { status: ['not cancellable'] })
      }
      if (order.cancellation_status === 'requested') fail(409, 'A cancellation request is already under review.')
      const reason = String(ctx.body?.reason ?? '').trim()
      if (reason.length < 4) fail(422, 'The given data was invalid.', { reason: ['please give a reason (min 4 characters)'] })
      const now = nowIso()
      await this.storage.update<Order>('orders', order.id, {
        status: 'CANCELLATION_REQUESTED', previous_status: order.status,
        cancellation_requested_at: now, cancellation_reason: reason, cancellation_status: 'requested', updated_at: now,
      } as any)
      await this.addEvent(ctx, order, 'cancellation_requested', `Cancellation requested by ${ctx.user!.name}: ${reason}`, { reason })
      await this.notifyAdmins(ctx, order, `Cancellation requested · ${order.order_code}`,
        `${ctx.user!.name} requested cancellation of ${order.order_code}. Review and decide on reassignment.`)
      if (order.assigned_driver_id) {
        await this.notify(ctx, {
          companyId: order.company_id, orderId: order.id, channel: 'push', type: 'cancellation_requested',
          title: `Cancellation requested · ${order.order_code}`,
          body: 'The company has requested cancellation. The Super Admin will decide.',
          data: { driver_id: order.assigned_driver_id },
        })
      }
      await this.audit(ctx, 'order.cancellation_requested', 'order', order.id, { reason })
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      const fresh = await this.storage.get<Order>('orders', order.id)
      return { order: this.publicOrder(fresh!), message: 'Cancellation request submitted for Super Admin review.' }
    })

    r('POST', '/orders/:id/otp/request', 'company', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      const purpose = (ctx.body?.purpose ?? 'order_confirmation') as OtpPurpose
      const otp = await issueOtp(this.storage, this.config, {
        order, purpose, channel: 'sms', target: purpose === 'delivery_verification' ? order.receiver_phone : order.authorized_contact_phone,
      })
      await this.addEvent(ctx, order, 'otp_sent', `New ${purpose.replace(/_/g, ' ')} code issued`, { purpose })
      await this.audit(ctx, 'otp.requested', 'order', order.id, { purpose })
      return { message: 'A new verification code has been sent.', expires_at: otp.expires_at, resend_available_at: otp.resend_available_at }
    })

    r('GET', '/otp/test-code', 'any', async (ctx) => {
      if (!this.config.otpTestMode) fail(404, 'Not found.')
      const orderId = String(ctx.query.order_id ?? '')
      const purpose = (ctx.query.purpose ?? 'order_confirmation') as OtpPurpose
      const order = await this.loadOrder(ctx, orderId)
      const otp = (await this.storage.filter<any>('otps', (o) => o.order_id === order.id && o.purpose === purpose))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      if (!otp) fail(404, 'No active code for this request.')
      const code = otp.code_cipher ? await decryptSecret(this.config.appSecret, otp.code_cipher) : null
      if (!code) fail(404, 'No active code for this request.')
      await this.audit(ctx, 'otp.test_code_viewed', 'order', order.id, { purpose })
      return { code, purpose, expires_at: otp.expires_at, attempts: otp.attempts, max_attempts: otp.max_attempts }
    })

    r('GET', '/notifications', 'any', async (ctx) => {
      let rows = await this.storage.all<AppNotification>('notifications')
      if (ctx.user!.role === 'company_admin' || ctx.user!.role === 'company_user') {
        rows = rows.filter((n) => n.company_id === ctx.user!.company_id)
      } else if (ctx.user!.role === 'driver') {
        rows = rows.filter((n) => (n.data as any)?.driver_id === ctx.user!.id)
      }
      rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
      const unread = rows.filter((n) => !n.read_at).length
      return { data: rows.slice(0, 100), unread }
    })

    r('POST', '/notifications/read-all', 'any', async (ctx) => {
      let rows = await this.storage.all<AppNotification>('notifications')
      if (ctx.user!.role === 'company_admin' || ctx.user!.role === 'company_user') {
        rows = rows.filter((n) => n.company_id === ctx.user!.company_id)
      } else if (ctx.user!.role === 'driver') {
        rows = rows.filter((n) => (n.data as any)?.driver_id === ctx.user!.id)
      }
      for (const n of rows.filter((x) => !x.read_at)) await this.storage.update('notifications', n.id, { read_at: nowIso() } as any)
      return { message: 'All notifications marked as read.' }
    })

    r('POST', '/notifications/:id/read', 'any', async (ctx) => {
      const record = await this.storage.get<AppNotification>('notifications', ctx.params.id)
      if (!record) fail(404, 'Notification not found.')
      await this.storage.update('notifications', record.id, { read_at: nowIso() } as any)
      return { message: 'Marked as read.' }
    })

    r('GET', '/emails', 'any', async (ctx) => {
      let rows = await this.storage.all<EmailRecord>('emails')
      if (ctx.user!.role === 'company_admin' || ctx.user!.role === 'company_user') {
        rows = rows.filter((e) => e.company_id === ctx.user!.company_id)
      }
      rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
      return { data: rows, transport: this.config.emailTransport, from: this.config.mailFrom }
    })

    r('POST', '/emails/:id/resend', 'any', async (ctx) => {
      const record = await this.storage.get<EmailRecord>('emails', ctx.params.id)
      if (!record) fail(404, 'Email record not found.')
      await this.storage.update('emails', record.id, { status: 'sent', sent_at: nowIso(), error: null } as any)
      await this.audit(ctx, 'email.resent', 'email', record.id, { to: record.to_email })
      return { message: `Email re-queued to ${record.to_email}.` }
    })

    r('GET', '/profile', 'any', async (ctx) => {
      const user = this.requireUser(ctx)
      const company = ctx.company
      const orders = await this.storage.filter<Order>('orders', (o) => o.company_id === user.company_id)
      return {
        user: this.publicUser(user),
        company,
        stats: {
          total: orders.length,
          delivered: orders.filter((o) => o.status === 'DELIVERED').length,
          active: orders.filter((o) => ACTIVE_JOB_STATUSES.includes(o.status)).length,
          cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
        },
      }
    })

    r('PUT', '/profile', 'company', async (ctx) => {
      if (ctx.user!.role !== 'company_admin') fail(403, 'Only a company administrator can update company details.')
      const errors = validateFields(ctx.body ?? {}, {
        name: { type: 'string', required: true, minLength: 2 },
        phone: { type: 'string', required: true, minLength: 8 },
        address: { type: 'string', required: true, minLength: 4 },
        city: { type: 'string', required: true },
        email: { type: 'string', required: true, email: true },
        gst_number: { type: 'string', maxLength: 32, nullable: true },
      })
      assertValid(errors)
      const updated = await this.storage.update<Company>('companies', ctx.company!.id, {
        name: ctx.body.name, phone: ctx.body.phone, address: ctx.body.address,
        city: ctx.body.city, email: ctx.body.email, gst_number: ctx.body.gst_number ?? ctx.company!.gst_number,
      } as any)
      await this.audit(ctx, 'company.updated', 'company', updated.id, {})
      return { company: updated, message: 'Company profile updated.' }
    })

    r('PUT', '/profile/password', 'any', async (ctx) => {
      return this.handleChangePassword(ctx)
    })

    /* ------------------------------------------------------------------ driver */
    r('GET', '/driver/jobs', 'driver', async (ctx) => {
      const orders = await this.storage.all<Order>('orders')
      const offers = orders.filter((o) => o.status === 'OFFERED' && o.offered_driver_ids.includes(ctx.user!.id))
      const active = orders.filter((o) => o.assigned_driver_id === ctx.user!.id && ACTIVE_JOB_STATUSES.includes(o.status))
      const history = orders.filter((o) => o.assigned_driver_id === ctx.user!.id && ['DELIVERED', 'CANCELLED'].includes(o.status))
      const shops = await this.storage.all<Shop>('shops')
      return {
        offers: offers.map((o) => this.publicOrder(o)),
        active: active.map((o) => this.publicOrder(o)),
        history: history.map((o) => this.publicOrder(o)).slice(0, 20),
        shops: shops.length,
      }
    })

    r('GET', '/driver/orders/:id', 'driver', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      const files = await this.storage.filter<StoredFile>('files', (f) => f.order_id === order.id)
      const locations = await this.storage.filter<DriverLocation>('locations', (l) => l.order_id === order.id)
      return {
        order: this.publicOrder(order),
        shop: await this.storage.get<Shop>('shops', order.shop_id),
        receiver: await this.storage.get<ShopReceiver>('shop_receivers', order.receiver_id),
        files,
        trail: locations.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)).slice(-50),
      }
    })

    r('POST', '/driver/jobs/:id/accept', 'driver', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (order.status !== 'OFFERED') fail(409, 'This job is no longer open.')
      if (!order.offered_driver_ids.includes(ctx.user!.id)) fail(403, 'This job was not offered to you.')
      const now = nowIso()
      await this.storage.update<Order>('orders', order.id, {
        status: 'ACCEPTED', assigned_driver_id: ctx.user!.id, offered_driver_ids: [ctx.user!.id], accepted_at: now, updated_at: now,
      } as any)
      await this.addEvent(ctx, order, 'accepted', `${ctx.user!.name} accepted the delivery`, { driver: ctx.user!.name })
      await this.notify(ctx, {
        companyId: order.company_id, orderId: order.id, channel: 'in_app', type: 'driver_assigned',
        title: `Driver assigned · ${order.order_code}`,
        body: `${ctx.user!.name} accepted your delivery to ${order.shop_name}.`,
        data: { order_code: order.order_code },
      })
      await this.notifyAdmins(ctx, order, `Driver accepted · ${order.order_code}`, `${ctx.user!.name} accepted the job.`)
      await this.audit(ctx, 'driver.accepted', 'order', order.id, { driver_id: ctx.user!.id })
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      const fresh = await this.storage.get<Order>('orders', order.id)
      return { order: this.publicOrder(fresh!), message: 'Job accepted. The company has been notified.' }
    })

    r('POST', '/driver/jobs/:id/decline', 'driver', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (order.status !== 'OFFERED') fail(409, 'This job can no longer be declined.')
      if (!order.offered_driver_ids.includes(ctx.user!.id)) fail(403, 'This job was not offered to you.')
      const remaining = order.offered_driver_ids.filter((id) => id !== ctx.user!.id)
      await this.storage.update<Order>('orders', order.id, {
        offered_driver_ids: remaining,
        status: remaining.length ? 'OFFERED' : 'PENDING_ASSIGNMENT', updated_at: nowIso(),
      } as any)
      await this.addEvent(ctx, order, 'offer_declined', `${ctx.user!.name} declined the offer`, { driver: ctx.user!.name })
      await this.audit(ctx, 'driver.declined', 'order', order.id, {})
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      return { message: 'Offer declined.' }
    })

    r('POST', '/driver/orders/:id/pickup', 'driver', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (order.assigned_driver_id !== ctx.user!.id) fail(403, 'This job is assigned to another driver.')
      if (order.status !== 'ACCEPTED') fail(409, 'The bag can only be picked up after the job is accepted.')
      const now = nowIso()
      await this.storage.update<Order>('orders', order.id, { status: 'PICKED_UP', picked_up_at: now, updated_at: now } as any)
      await this.addEvent(ctx, order, 'picked_up', `Bag picked up from ${order.pickup_address}`, {})
      await this.notify(ctx, {
        companyId: order.company_id, orderId: order.id, channel: 'in_app', type: 'order_status',
        title: `Bag picked up · ${order.order_code}`,
        body: `${ctx.user!.name} collected the bag from ${order.pickup_address}.`,
        data: { order_code: order.order_code },
      })
      await this.audit(ctx, 'driver.picked_up', 'order', order.id, {})
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      const fresh = await this.storage.get<Order>('orders', order.id)
      return { order: this.publicOrder(fresh!) }
    })

    r('POST', '/driver/orders/:id/start-trip', 'driver', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (order.assigned_driver_id !== ctx.user!.id) fail(403, 'This job is assigned to another driver.')
      if (order.status !== 'PICKED_UP') fail(409, 'Start the trip after the bag is picked up.')
      const now = nowIso()
      await this.storage.update<Order>('orders', order.id, { status: 'IN_TRANSIT', departed_at: now, updated_at: now } as any)
      await this.addEvent(ctx, order, 'in_transit', 'Trip started — live location sharing enabled', {})
      await this.notify(ctx, {
        companyId: order.company_id, orderId: order.id, channel: 'in_app', type: 'order_status',
        title: `On the way · ${order.order_code}`,
        body: `${ctx.user!.name} is driving to ${order.shop_name}. Live tracking is active.`,
        data: { order_code: order.order_code },
      })
      await this.audit(ctx, 'driver.started_trip', 'order', order.id, {})
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      const fresh = await this.storage.get<Order>('orders', order.id)
      return { order: this.publicOrder(fresh!) }
    })

    r('POST', '/driver/orders/:id/arrive', 'driver', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (order.assigned_driver_id !== ctx.user!.id) fail(403, 'This job is assigned to another driver.')
      if (order.status !== 'IN_TRANSIT') fail(409, 'Mark arrival after the trip has started.')
      const now = nowIso()
      await this.storage.update<Order>('orders', order.id, { status: 'ARRIVED_AT_SHOP', arrived_at: now, updated_at: now } as any)
      const otp = await issueOtp(this.storage, this.config, {
        order, purpose: 'delivery_verification', channel: 'sms', target: order.receiver_phone,
      })
      await this.notify(ctx, {
        companyId: order.company_id, orderId: order.id, channel: 'sms', type: 'otp_sent',
        title: `Delivery OTP for ${order.order_code}`,
        body: `Delivery verification code sent to ${order.receiver_name} (${order.receiver_phone}).`,
        data: { purpose: 'delivery_verification', target: order.receiver_phone },
      })
      if (order.receiver_email) {
        await this.sendEmail(ctx, {
          companyId: order.company_id, orderId: order.id, toEmail: order.receiver_email, toName: order.receiver_name,
          subject: `Delivery verification code · ${order.order_code}`,
          html: renderOtpEmail('• • • • • •', order, 'delivery_verification'),
          quiet: true,
        })
      }
      await this.addEvent(ctx, order, 'arrived', `Arrived at ${order.shop_name} — delivery code issued to the receiver`, { purpose: 'delivery_verification' })
      await this.notify(ctx, {
        companyId: order.company_id, orderId: order.id, channel: 'in_app', type: 'order_status',
        title: `Driver at shop · ${order.order_code}`,
        body: `${ctx.user!.name} arrived at ${order.shop_name}. Waiting for the receiver's delivery code.`,
        data: { order_code: order.order_code },
      })
      await this.audit(ctx, 'driver.arrived', 'order', order.id, {})
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      const fresh = await this.storage.get<Order>('orders', order.id)
      return { order: this.publicOrder(fresh!), expires_at: otp.expires_at }
    })

    r('POST', '/driver/orders/:id/location', 'driver', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (order.assigned_driver_id !== ctx.user!.id) fail(403, 'This job is assigned to another driver.')
      if (!ACTIVE_JOB_STATUSES.includes(order.status)) fail(409, 'Location sharing is only active during an active job.')
      const errors = validateFields(ctx.body ?? {}, {
        lat: { type: 'number', required: true, min: -90, max: 90 },
        lng: { type: 'number', required: true, min: -180, max: 180 },
        accuracy: { type: 'number', min: 0, max: 5000, nullable: true },
        heading: { type: 'number', min: 0, max: 360, nullable: true },
        speed: { type: 'number', min: 0, max: 400, nullable: true },
        battery: { type: 'int', min: 0, max: 100, nullable: true },
      })
      assertValid(errors)
      const now = nowIso()
      const record = {
        id: randomId('loc'), order_id: order.id, driver_id: ctx.user!.id,
        lat: Number(ctx.body.lat), lng: Number(ctx.body.lng),
        accuracy: ctx.body.accuracy ?? 0, heading: ctx.body.heading ?? 0,
        speed: ctx.body.speed ?? 0, battery: ctx.body.battery ?? 0,
        recorded_at: now, created_at: now,
      }
      await this.storage.insert('locations', record as any)
      await this.storage.update('orders', order.id, { last_location_at: now, updated_at: now } as any)
      this.emitFn('driver.location', { orderId: order.id, lat: record.lat, lng: record.lng, recorded_at: now })
      return { message: 'Location updated.', recorded_at: now }
    })

    r('POST', '/driver/orders/:id/verify-otp', 'driver', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (order.assigned_driver_id !== ctx.user!.id) fail(403, 'This job is assigned to another driver.')
      if (order.status !== 'ARRIVED_AT_SHOP') fail(409, 'Verify the delivery code after arriving at the shop.')
      const code = String(ctx.body?.otp ?? '').trim()
      if (!/^\d{6}$/.test(code)) fail(422, 'The given data was invalid.', { otp: ['enter the 6-digit code'] })
      const otp = await verifyOtp(this.storage, this.config, { orderId: order.id, purpose: 'delivery_verification', code })
      const now = nowIso()
      await this.storage.update<Order>('orders', order.id, { status: 'OTP_VERIFIED', otp_verified_at: otp.verified_at, updated_at: now } as any)
      await this.addEvent(ctx, order, 'otp_verified', 'Delivery OTP verified by the driver — handover authorised', { purpose: 'delivery_verification' })
      await this.audit(ctx, 'driver.otp_verified', 'order', order.id, {})
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      const fresh = await this.storage.get<Order>('orders', order.id)
      return { order: this.publicOrder(fresh!), message: 'Delivery code verified. Capture the proof to complete the handover.' }
    })

    r('POST', '/driver/orders/:id/deliver', 'driver', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (order.assigned_driver_id !== ctx.user!.id) fail(403, 'This job is assigned to another driver.')
      if (order.status !== 'OTP_VERIFIED') fail(409, 'Verify the delivery code before completing the handover.')
      const errors = validateFields(ctx.body ?? {}, {
        receiver_name: { type: 'string', required: true, minLength: 2, maxLength: 120 },
        signature: { type: 'string', required: true, minLength: 32 },
        photo: { type: 'string', required: true, minLength: 32 },
      })
      assertValid(errors)
      const now = nowIso()
      const signatureKey = `${order.id}/signature`
      const photoKey = `${order.id}/delivery_photo`
      await this.storage.putBlob(signatureKey, ctx.body.signature)
      await this.storage.putBlob(photoKey, ctx.body.photo)
      await this.storage.insert('files', {
        id: randomId('file'), company_id: order.company_id, order_id: order.id, kind: 'signature',
        name: `signature-${order.receiver_name.toLowerCase().replace(/\s+/g, '-')}.png`, mime: 'image/png',
        size: ctx.body.signature.length, storage_key: signatureKey, created_at: now,
      })
      await this.storage.insert('files', {
        id: randomId('file'), company_id: order.company_id, order_id: order.id, kind: 'delivery_photo',
        name: `delivery-photo-${order.order_code}.png`, mime: 'image/jpeg',
        size: ctx.body.photo.length, storage_key: photoKey, created_at: now,
      })
      const proofExpiresAt = new Date(Date.now() + this.config.proofLinkTtlHours * 3600_000).toISOString()
      await this.storage.update<Order>('orders', order.id, {
        status: 'DELIVERED', delivered_at: now, receiver_name: ctx.body.receiver_name,
        proof_expires_at: proofExpiresAt, updated_at: now,
      } as any)
      const deliveredOrder: Order = {
        ...order, status: 'DELIVERED', delivered_at: now,
        receiver_name: ctx.body.receiver_name, proof_expires_at: proofExpiresAt, updated_at: now,
      }
      await this.addEvent(ctx, order, 'delivered', `Handed over to ${ctx.body.receiver_name} — proof captured`, { receiver: ctx.body.receiver_name })

      const token = await this.proofToken(deliveredOrder)
      const link = buildProofLink(this.baseUrl(ctx), order.id, token)
      const owningCompany = await this.storage.get<Company>('companies', order.company_id)
      const companyAdmin = await this.storage.find<User>(
        'users', (u) => u.company_id === order.company_id && u.role === 'company_admin' && u.status === 'active',
      )
      const recipientEmail = companyAdmin?.email ?? owningCompany?.email ?? 'operations@company.test'
      const recipientName = companyAdmin?.name ?? owningCompany?.name ?? 'Company operations'
      await this.sendEmail(ctx, {
        companyId: order.company_id, orderId: order.id, toEmail: recipientEmail, toName: recipientName,
        subject: `Order ${order.order_code} received at ${order.shop_name}`,
        html: renderDeliveryReceivedEmail(deliveredOrder, link, ctx.user!.name),
        secureLink: link,
      })
      await this.notify(ctx, {
        companyId: order.company_id, orderId: order.id, channel: 'in_app', type: 'delivery_received',
        title: `Order ${order.order_code} received at ${order.shop_name}`,
        body: `Delivered at ${new Date(now).toLocaleString()} and received by ${ctx.body.receiver_name}. Proof of delivery is available.`,
        data: { order_code: order.order_code, order_id: order.id },
      })
      await this.notifyAdmins(ctx, order, `Delivered · ${order.order_code}`, `Received by ${ctx.body.receiver_name} at ${order.shop_name}.`)
      await this.audit(ctx, 'driver.delivered', 'order', order.id, { receiver: ctx.body.receiver_name })
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      const fresh = await this.storage.get<Order>('orders', order.id)
      return { order: this.publicOrder(fresh!), message: 'Delivery completed and proof saved.' }
    })

    r('POST', '/driver/orders/:id/report-issue', 'driver', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (order.assigned_driver_id !== ctx.user!.id) fail(403, 'This job is assigned to another driver.')
      const errors = validateFields(ctx.body ?? {}, {
        type: { type: 'string', required: true, enum: ['vehicle_breakdown', 'traffic', 'address_issue', 'receiver_unavailable', 'damage', 'other'] },
        description: { type: 'string', required: true, minLength: 5, maxLength: 500 },
      })
      assertValid(errors)
      const now = nowIso()
      await this.storage.insert('driver_issues', {
        id: randomId('iss'), order_id: order.id, company_id: order.company_id, driver_id: ctx.user!.id,
        type: ctx.body.type, description: ctx.body.description, status: 'open', resolution: '', created_at: now, resolved_at: null,
      })
      await this.storage.update<Order>('orders', order.id, {
        status: 'ADMIN_REVIEW', previous_status: order.status, updated_at: now,
      } as any)
      await this.addEvent(ctx, order, 'issue_reported', `Driver reported an issue: ${ctx.body.description}`, { type: ctx.body.type })
      await this.notifyAdmins(ctx, order, `Driver issue · ${order.order_code}`, `${ctx.user!.name}: ${ctx.body.description}`)
      await this.audit(ctx, 'driver.issue_reported', 'order', order.id, { type: ctx.body.type })
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      const fresh = await this.storage.get<Order>('orders', order.id)
      return { order: this.publicOrder(fresh!), message: 'Issue reported. The Super Admin will take action.' }
    })

    r('POST', '/driver/orders/:id/cancel', 'driver', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (order.assigned_driver_id !== ctx.user!.id) fail(403, 'This job is assigned to another driver.')
      fail(409,
        'Drivers cannot cancel an accepted job. Use "Report an issue" and the Super Admin will reassign the delivery.',
        { status: ['driver cancellation not permitted'] })
    })

    /* ------------------------------------------------------------------- admin */
    r('GET', '/admin/orders', 'admin', async (ctx) => {
      const orders = await this.storage.all<Order>('orders')
      const users = await this.storage.all<User>('users')
      const companies = await this.storage.all<Company>('companies')
      const status = ctx.query.status
      let filtered = orders
      if (status && status !== 'all') filtered = filtered.filter((o) => o.status === status)
      filtered.sort((a, b) => b.created_at.localeCompare(a.created_at))
      return {
        data: filtered.slice(0, 200).map((o) => ({
          ...this.publicOrder(o),
          company_name: companies.find((c) => c.id === o.company_id)?.name ?? '—',
          driver_name: users.find((u) => u.id === o.assigned_driver_id)?.name ?? null,
        })),
      }
    })

    r('GET', '/admin/drivers', 'admin', async (ctx) => {
      const drivers = await this.storage.filter<User>('users', (u) => u.role === 'driver')
      const orders = await this.storage.all<Order>('orders')
      const result: Driver[] = []
      for (const d of drivers) {
        const vehicle = await this.storage.find<any>('vehicles', (v) => v.driver_id === d.id)
        const active = orders.filter((o) => o.assigned_driver_id === d.id && ACTIVE_JOB_STATUSES.includes(o.status))
        const completed = orders.filter((o) => o.assigned_driver_id === d.id && o.status === 'DELIVERED')
        result.push({
          ...this.publicUser(d),
          vehicle,
          rating: d.rating ?? 4.5,
          active_jobs: active.length,
          is_available: active.length === 0 ? 1 : 0,
          completed_jobs: completed.length,
        } as Driver)
      }
      return { data: result }
    })

    r('GET', '/admin/audit-logs', 'admin', async (ctx) => {
      const logs = await this.storage.all<AuditLog>('audit_logs')
      logs.sort((a, b) => b.created_at.localeCompare(a.created_at))
      return { data: logs.slice(0, 200) }
    })

    r('GET', '/admin/reports/summary', 'admin', async (ctx) => {
      const orders = await this.storage.all<Order>('orders')
      const byStatus: Record<string, number> = {}
      for (const o of orders) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1
      const delivered = orders.filter((o) => o.status === 'DELIVERED')
      const durations = delivered.map((o) => minutesBetween(o.created_at, o.delivered_at ?? o.created_at))
      const onTime = delivered.filter((o) => o.delivered_at && new Date(o.delivered_at) <= new Date(o.requested_delivery_at)).length
      const shops = await this.storage.all<Shop>('shops')
      const topShops = shops
        .map((s) => ({ shop: s.name, code: s.code, orders: orders.filter((o) => o.shop_id === s.id).length }))
        .sort((a, b) => b.orders - a.orders)
        .slice(0, 5)
      return {
        total: orders.length,
        by_status: byStatus,
        delivered: delivered.length,
        cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
        on_time_rate: delivered.length ? Math.round((onTime / delivered.length) * 100) : 0,
        avg_delivery_minutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
        top_shops: topShops,
      }
    })

    r('POST', '/admin/orders/:id/assign', 'admin', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      const driverId = String(ctx.body?.driver_id ?? '')
      const driver = await this.storage.get<User>('users', driverId)
      if (!driver || driver.role !== 'driver') fail(422, 'The given data was invalid.', { driver_id: ['unknown driver'] })
      if (['DELIVERED', 'CANCELLED'].includes(order.status)) fail(409, 'This order is already closed.')
      const now = nowIso()
      await this.storage.update<Order>('orders', order.id, {
        status: 'ACCEPTED', assigned_driver_id: driver.id, offered_driver_ids: [], accepted_at: now, updated_at: now,
      } as any)
      await this.addEvent(ctx, order, 'assigned', `${ctx.user!.name} assigned ${driver.name} to this delivery`, { driver: driver.name })
      await this.notify(ctx, {
        companyId: order.company_id, orderId: order.id, channel: 'in_app', type: 'driver_assigned',
        title: `Driver assigned · ${order.order_code}`,
        body: `${driver.name} was assigned by the Super Admin.`, data: { order_code: order.order_code },
      })
      await this.notify(ctx, {
        companyId: order.company_id, orderId: order.id, channel: 'push', type: 'job_offer',
        title: `New job · ${order.order_code}`, body: `You have been assigned to deliver to ${order.shop_name}.`,
        data: { order_id: order.id, driver_id: driver.id },
      })
      await this.audit(ctx, 'admin.assigned_driver', 'order', order.id, { driver_id: driver.id })
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      const fresh = await this.storage.get<Order>('orders', order.id)
      return { order: this.publicOrder(fresh!), message: `${driver.name} assigned.` }
    })

    r('POST', '/admin/orders/:id/cancellation/approve', 'admin', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (order.status !== 'CANCELLATION_REQUESTED') fail(409, 'There is no pending cancellation request on this order.')
      const now = nowIso()
      await this.storage.update<Order>('orders', order.id, {
        status: 'CANCELLED', cancelled_at: now, cancellation_status: 'approved', updated_at: now,
      } as any)
      await this.addEvent(ctx, order, 'cancellation_approved', `${ctx.user!.name} approved the cancellation — driver released for reassignment`, {})
      await this.notify(ctx, {
        companyId: order.company_id, orderId: order.id, channel: 'in_app', type: 'order_cancelled',
        title: `Cancellation approved · ${order.order_code}`,
        body: `The Super Admin approved the cancellation. Reason: ${order.cancellation_reason}`,
        data: { order_code: order.order_code },
      })
      if (order.assigned_driver_id) {
        await this.notify(ctx, {
          companyId: order.company_id, orderId: order.id, channel: 'push', type: 'order_cancelled',
          title: `Job cancelled · ${order.order_code}`, body: 'The company cancellation was approved.',
          data: { driver_id: order.assigned_driver_id },
        })
      }
      await this.audit(ctx, 'admin.cancellation_approved', 'order', order.id, {})
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      const fresh = await this.storage.get<Order>('orders', order.id)
      return { order: this.publicOrder(fresh!), message: 'Cancellation approved.' }
    })

    r('POST', '/admin/orders/:id/cancellation/reject', 'admin', async (ctx) => {
      const order = await this.loadOrder(ctx, ctx.params.id)
      if (order.status !== 'CANCELLATION_REQUESTED') fail(409, 'There is no pending cancellation request on this order.')
      const restore = (order.previous_status ?? 'IN_TRANSIT') as Order['status']
      const now = nowIso()
      await this.storage.update<Order>('orders', order.id, {
        status: restore, previous_status: null, cancellation_status: 'rejected', updated_at: now,
      } as any)
      await this.addEvent(ctx, order, 'cancellation_rejected', `${ctx.user!.name} rejected the cancellation — delivery continues`, { reason: ctx.body?.reason })
      await this.notify(ctx, {
        companyId: order.company_id, orderId: order.id, channel: 'in_app', type: 'cancellation_rejected',
        title: `Cancellation rejected · ${order.order_code}`,
        body: `The Super Admin rejected the cancellation. The delivery continues (${restore.replace(/_/g, ' ').toLowerCase()}).`,
        data: { order_code: order.order_code },
      })
      await this.audit(ctx, 'admin.cancellation_rejected', 'order', order.id, {})
      this.emitFn('order.updated', { orderId: order.id, companyId: order.company_id })
      const fresh = await this.storage.get<Order>('orders', order.id)
      return { order: this.publicOrder(fresh!), message: 'Cancellation rejected — the delivery continues.' }
    })

    r('POST', '/admin/issues/:id/resolve', 'admin', async (ctx) => {
      const issue = await this.storage.get<DriverIssue>('driver_issues', ctx.params.id)
      if (!issue) fail(404, 'Issue not found.')
      const now = nowIso()
      await this.storage.update('driver_issues', issue.id, { status: 'resolved', resolution: String(ctx.body?.resolution ?? 'Resolved'), resolved_at: now } as any)
      const order = await this.storage.get<Order>('orders', issue.order_id)
      if (order && order.status === 'ADMIN_REVIEW') {
        const restore = (order.previous_status ?? 'IN_TRANSIT') as Order['status']
        await this.storage.update('orders', order.id, { status: restore, previous_status: null, updated_at: now } as any)
        await this.addEvent(ctx, order, 'issue_resolved', `${ctx.user!.name} resolved the driver issue`, {})
      }
      await this.audit(ctx, 'admin.issue_resolved', 'driver_issue', issue.id, {})
      return { message: 'Issue resolved.' }
    })
  }

  /* ----------------------------------------------------------------- helpers */
  private requireUser(ctx: Ctx): User {
    if (!ctx.user) fail(401, 'Unauthenticated.')
    return ctx.user
  }

  private baseUrl(ctx: Ctx): string {
    return this.config.publicBaseUrl || ctx.origin || ''
  }

  private parseCoordinates(address: string): { lat: number; lng: number } {
    const match = address.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/)
    if (match) return { lat: Number(match[1]), lng: Number(match[2]) }
    return { lat: 18.5642, lng: 73.7767 }
  }

  publicUser(user: User): Omit<User, 'password_hash'> {
    const { password_hash, ...rest } = user as any
    return rest
  }

  private publicReceiver(receiver: ShopReceiver, user: User | null) {
    const privileged = user && (user.role === 'admin' || user.role === 'company_admin' || user.role === 'company_user')
    return {
      ...receiver,
      phone: privileged ? receiver.phone : receiver.phone.replace(/\d(?=\d{2})/g, '•'),
    }
  }

  publicOrder(order: Order) {
    const { ...rest } = order
    return rest
  }

  private orderPermissions(ctx: Ctx, order: Order) {
    const isCompany = ctx.user?.role === 'company_admin' || ctx.user?.role === 'company_user'
    const isAdmin = ctx.user?.role === 'admin'
    const isDriver = ctx.user?.role === 'driver'
    return {
      can_cancel: (isCompany || isAdmin) && COMPANY_DIRECT_CANCEL.includes(order.status),
      can_request_cancellation: isCompany && COMPANY_REQUEST_CANCEL.includes(order.status),
      can_assign_driver: isAdmin && !['DELIVERED', 'CANCELLED'].includes(order.status),
      can_approve_cancellation: isAdmin && order.status === 'CANCELLATION_REQUESTED',
      can_verify_delivery_otp: isDriver && order.status === 'ARRIVED_AT_SHOP',
      can_capture_proof: isDriver && order.status === 'OTP_VERIFIED',
      can_report_issue: isDriver && ACTIVE_JOB_STATUSES.includes(order.status),
      driver_may_cancel: false,
    }
  }

  private async loadOrder(ctx: Ctx, id: string): Promise<Order> {
    const order = await this.storage.get<Order>('orders', id)
    if (!order) fail(404, 'Order not found.')
    const user = ctx.user!
    const allowed =
      user.role === 'admin' ||
      (user.role === 'driver'
        ? order.assigned_driver_id === user.id || order.offered_driver_ids.includes(user.id)
        : order.company_id === user.company_id)
    if (!allowed) fail(403, 'You are not allowed to access this order.')
    return order
  }

  private async eligibleDrivers(): Promise<User[]> {
    const drivers = await this.storage.filter<User>('users', (u) => u.role === 'driver' && u.status === 'active')
    const orders = await this.storage.all<Order>('orders')
    const busy = new Set(orders.filter((o) => ACTIVE_JOB_STATUSES.includes(o.status)).map((o) => o.assigned_driver_id))
    return drivers.filter((d) => !busy.has(d.id))
  }

  /** Deterministic, order-bound proof token. Recomputing it yields the same value. */
  private async proofToken(order: Order): Promise<string> {
    const base = order.proof_expires_at
      ?? (order.delivered_at
        ? new Date(new Date(order.delivered_at).getTime() + this.config.proofLinkTtlHours * 3600_000).toISOString()
        : order.created_at)
    const exp = new Date(base).getTime()
    const signature = await hmacHex(this.config.appSecret, `proof|${order.id}|${base}`)
    return `${exp}.${signature}`
  }

  private async proofPayloads(files: StoredFile[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    for (const f of files) {
      const data = await this.storage.getBlob(f.storage_key)
      if (data) out[f.id] = data
    }
    return out
  }

  private async addEvent(ctx: Ctx, order: Order, type: string, message: string, meta: Record<string, unknown> = {}) {
    const event: OrderEvent = {
      id: randomId('evt'), order_id: order.id, company_id: order.company_id, type,
      actor_id: ctx.user?.id ?? 'system', actor_name: ctx.user?.name ?? 'System',
      actor_role: ctx.user?.role ?? 'system', message, meta, created_at: nowIso(),
    }
    await this.storage.insert('order_events', event as any)
    return event
  }

  private async notify(ctx: Ctx, params: {
    companyId: string; orderId?: string | null; channel: AppNotification['channel']; type: string;
    title: string; body: string; data?: Record<string, unknown>
  }) {
    const record: AppNotification = {
      id: randomId('ntf'), company_id: params.companyId, user_id: null, order_id: params.orderId ?? null,
      channel: params.channel, type: params.type, title: params.title, body: params.body,
      data: params.data ?? {}, read_at: null, created_at: nowIso(),
    }
    await this.storage.insert('notifications', record as any)
    return record
  }

  private async notifyAdmins(ctx: Ctx, order: Order, title: string, body: string) {
    const admins = await this.storage.filter<User>('users', (u) => u.role === 'admin')
    for (const admin of admins) {
      await this.notify(ctx, {
        companyId: order.company_id, orderId: order.id, channel: 'in_app', type: 'admin_alert',
        title, body, data: { admin_id: admin.id, order_code: order.order_code },
      })
    }
  }

  private async sendEmail(ctx: Ctx, params: {
    companyId: string | null; orderId?: string | null; toEmail: string; toName: string;
    subject: string; html: string; secureLink?: string | null; quiet?: boolean
  }) {
    const record: EmailRecord = {
      id: randomId('eml'), company_id: params.companyId, order_id: params.orderId ?? null,
      to_email: params.toEmail, to_name: params.toName, subject: params.subject, html: params.html,
      status: 'sent', provider: this.config.emailTransport, error: null,
      secure_link: params.secureLink ?? null, sent_at: nowIso(), created_at: nowIso(),
    }
    await this.storage.insert('emails', record as any)
    if (!params.quiet && params.companyId) {
      await this.notify(ctx, {
        companyId: params.companyId, orderId: params.orderId ?? null, channel: 'email', type: 'email_sent',
        title: params.subject, body: `Email delivered to ${params.toEmail}.`,
        data: { email_id: record.id },
      })
    }
    return record
  }

  private async audit(ctx: Ctx, action: string, entityType: string, entityId: string, meta: Record<string, unknown>) {
    const log: AuditLog = {
      id: randomId('aud'), actor_id: ctx.user?.id ?? 'system', actor_name: ctx.user?.name ?? 'System',
      actor_role: ctx.user?.role ?? 'system', company_id: ctx.user?.company_id ?? null,
      action, entity_type: entityType, entity_id: entityId, meta, ip: ctx.ip, created_at: nowIso(),
    }
    await this.storage.insert('audit_logs', log as any)
  }

  private async handleChangePassword(ctx: Ctx) {
    const user = this.requireUser(ctx)
    const errors = validateFields(ctx.body ?? {}, {
      current_password: { type: 'string', required: true },
      password: { type: 'string', required: true, minLength: 8 },
    })
    assertValid(errors)
    const ok = await verifyPassword(String(ctx.body.current_password), user.password_hash)
    if (!ok) fail(422, 'The given data was invalid.', { current_password: ['current password is incorrect'] })
    await this.storage.update('users', user.id, { password_hash: await hashPassword(String(ctx.body.password)) } as any)
    await this.audit(ctx, 'auth.password_changed', 'user', user.id, {})
    return { message: 'Password updated.' }
  }

  /* --------------------------------------------------------------- dispatch */
  async handle(request: ApiRequest): Promise<ApiResponse> {
    const method = request.method.toUpperCase()
    const path = request.path.replace(/^\/api\/v1/, '').replace(/\/+$/, '') || '/'
    const query = request.query ?? {}
    const body = request.body ?? {}

    let matched: { route: Route; params: Record<string, string> } | null = null
    for (const route of this.routes) {
      if (route.method !== method) continue
      const params = matchPattern(route.pattern, path)
      if (params) { matched = { route, params }; break }
    }
    if (!matched) return { status: 404, data: { message: `No route matched ${method} ${path}.` } }

    const route = matched.route
    let user: User | null = null
    let company: Company | null = null
    if (request.token) {
      const tokenHash = await hmacHex(this.config.appSecret, request.token)
      const session = await this.storage.find<any>('sessions', (s) => s.token_hash === tokenHash)
      if (session && new Date(session.expires_at).getTime() > Date.now()) {
        user = await this.storage.get<User>('users', session.user_id) ?? null
        if (user) company = user.company_id ? await this.storage.get<Company>('companies', user.company_id) ?? null : null
      }
    }

    if (route.auth !== 'none') {
      if (!user) return { status: 401, data: { message: 'Unauthenticated.' } }
      if (route.auth === 'company' && !['company_admin', 'company_user'].includes(user.role)) {
        return { status: 403, data: { message: 'This endpoint is restricted to client company users.' } }
      }
      if (route.auth === 'driver' && user.role !== 'driver') {
        return { status: 403, data: { message: 'This endpoint is restricted to drivers.' } }
      }
      if (route.auth === 'admin' && user.role !== 'admin') {
        return { status: 403, data: { message: 'This endpoint is restricted to the Super Admin.' } }
      }
    }

    const ctx: Ctx = {
      params: matched.params, query, body, user, company,
      storage: this.storage, config: this.config,
      ip: request.ip ?? '127.0.0.1', origin: request.origin ?? '', emit: this.emitFn,
    }

    try {
      const data = await route.handler(ctx)
      return { status: 200, data }
    } catch (error) {
      if (error instanceof ApiError) {
        return { status: error.status, data: { message: error.message, errors: error.errors } }
      }
      console.error('[api] unhandled error', error)
      return { status: 500, data: { message: 'Something went wrong while processing the request.' } }
    }
  }
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean)
  const s = path.split('/').filter(Boolean)
  if (p.length !== s.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return params
}
