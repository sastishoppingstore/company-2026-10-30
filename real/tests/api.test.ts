import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Api } from '../src/backend/api.ts'
import { SqliteStorage } from '../src/backend/storage/sqlite.ts'

const PASSWORD = 'Password@123'

async function boot() {
  const storage = new SqliteStorage(':memory:')
  const api = new Api(storage, { appSecret: 'test-secret', otpTestMode: true })
  await api.init()
  return { storage, api }
}

async function login(api: Api, email: string) {
  const response = await api.handle({
    method: 'POST', path: '/auth/login', body: { email, password: PASSWORD }, token: null,
  })
  assert.equal(response.status, 200, JSON.stringify(response.data))
  return response.data as { token: string; user: any; company: any }
}

async function call(api: Api, method: string, path: string, token: string | null, body?: any, query?: any) {
  return api.handle({ method, path, body, query, token })
}

test('authentication issues a session token and rejects bad credentials', async () => {
  const { api } = await boot()
  const session = await login(api, 'admin@vantage.test')
  assert.ok(session.token)
  assert.equal(session.user.role, 'company_admin')
  assert.equal(session.company.code, 'VNT')

  const bad = await call(api, 'POST', '/auth/login', null, { email: 'admin@vantage.test', password: 'wrong-password' })
  assert.equal(bad.status, 401)

  const me = await call(api, 'GET', '/auth/me', session.token)
  assert.equal(me.status, 200)
  assert.equal((me.data as any).user.email, 'admin@vantage.test')

  const anonymous = await call(api, 'GET', '/orders', null)
  assert.equal(anonymous.status, 401)
})

test('company data isolation: a company cannot read another company order', async () => {
  const { api } = await boot()
  const session = await login(api, 'admin@vantage.test')
  const foreign = await call(api, 'GET', '/orders/ord_h001', session.token)
  assert.equal(foreign.status, 403)
})

test('full delivery lifecycle: create → company OTP → driver accept → proof → email', async () => {
  const { api } = await boot()
  const company = await login(api, 'admin@vantage.test')
  const driver = await login(api, 'sandeep@drives.test')

  const shops = await call(api, 'GET', '/shops', company.token)
  const rna = (shops.data as any).data.find((shop: any) => shop.code === 'RNA-001')
  assert.ok(rna, 'RNA General Store must exist in the shop directory')

  const shopDetail = await call(api, 'GET', `/shops/${rna.id}`, company.token)
  const receiver = (shopDetail.data as any).receivers[0]
  assert.ok(receiver)

  const created = await call(api, 'POST', '/orders', company.token, {
    shop_id: rna.id,
    receiver_id: receiver.id,
    pickup_address: 'Unit 14, Baner MIDC, Baner Road, Pune 411045',
    pickup_lat: 18.5642,
    pickup_lng: 73.7767,
    item_description: '1 sealed bag — assorted grocery assortment',
    quantity: 1,
    weight_kg: 12,
    special_instructions: 'Handle with care',
    priority: 'STANDARD',
    requested_delivery_at: new Date(Date.now() + 3600_000).toISOString(),
    authorized_contact_name: 'Ananya Rao',
    authorized_contact_phone: '+91 98765 40021',
  })
  assert.equal(created.status, 200, JSON.stringify(created.data))
  const order = (created.data as any).order
  assert.equal(order.status, 'DRAFT')
  assert.match(order.order_code, /^RN-\d{4}-\d{4}$/)

  // invalid payload is rejected by the server
  const invalid = await call(api, 'POST', '/orders', company.token, { shop_id: rna.id })
  assert.equal(invalid.status, 422)

  // submit → company OTP is issued, never returned in the normal response
  const submitted = await call(api, 'POST', `/orders/${order.id}/submit`, company.token)
  assert.equal(submitted.status, 200)
  assert.equal((submitted.data as any).otp_required, true)
  assert.equal(JSON.stringify(submitted.data).includes('code'), false)

  // a wrong code is rejected
  const wrong = await call(api, 'POST', `/orders/${order.id}/confirm`, company.token, { otp: '000000' })
  assert.equal(wrong.status, 400)

  // the test-mode endpoint surfaces the active code
  const testCode = await call(api, 'GET', '/otp/test-code', company.token, undefined, {
    order_id: order.id, purpose: 'order_confirmation',
  })
  assert.equal(testCode.status, 200)
  const confirmationCode = (testCode.data as any).code

  const confirmed = await call(api, 'POST', `/orders/${order.id}/confirm`, company.token, { otp: confirmationCode })
  assert.equal(confirmed.status, 200)
  assert.equal((confirmed.data as any).order.status, 'OFFERED')

  // the same code cannot be replayed
  const replay = await call(api, 'POST', `/orders/${order.id}/confirm`, company.token, { otp: confirmationCode })
  assert.equal(replay.status, 409)

  // driver accepts
  const jobs = await call(api, 'GET', '/driver/jobs', driver.token)
  const offer = (jobs.data as any).offers.find((item: any) => item.id === order.id)
  assert.ok(offer, 'the driver must see the offer')

  const accepted = await call(api, 'POST', `/driver/jobs/${order.id}/accept`, driver.token)
  assert.equal(accepted.status, 200)
  assert.equal((accepted.data as any).order.status, 'ACCEPTED')

  // a driver may not cancel an accepted job
  const driverCancel = await call(api, 'POST', `/driver/orders/${order.id}/cancel`, driver.token)
  assert.equal(driverCancel.status, 409)

  // pickup → trip → arrival
  assert.equal((await call(api, 'POST', `/driver/orders/${order.id}/pickup`, driver.token)).status, 200)
  assert.equal((await call(api, 'POST', `/driver/orders/${order.id}/start-trip`, driver.token)).status, 200)

  const located = await call(api, 'POST', `/driver/orders/${order.id}/location`, driver.token, {
    lat: 18.5402, lng: 73.8291, accuracy: 12, heading: 62, speed: 22, battery: 80,
  })
  assert.equal(located.status, 200)

  const arrived = await call(api, 'POST', `/driver/orders/${order.id}/arrive`, driver.token)
  assert.equal(arrived.status, 200)

  // the delivery OTP is purpose specific: the company code must not work here
  const crossPurpose = await call(api, 'POST', `/driver/orders/${order.id}/verify-otp`, driver.token, { otp: confirmationCode })
  assert.equal(crossPurpose.status, 400)

  const deliveryCode = await call(api, 'GET', '/otp/test-code', driver.token, undefined, {
    order_id: order.id, purpose: 'delivery_verification',
  })
  assert.equal(deliveryCode.status, 200)

  const verified = await call(api, 'POST', `/driver/orders/${order.id}/verify-otp`, driver.token, { otp: (deliveryCode.data as any).code })
  assert.equal(verified.status, 200)
  assert.equal((verified.data as any).order.status, 'OTP_VERIFIED')

  // delivery without proof is rejected
  const noProof = await call(api, 'POST', `/driver/orders/${order.id}/deliver`, driver.token, {
    receiver_name: 'Rohit Sharma', signature: '', photo: '',
  })
  assert.equal(noProof.status, 422)

  const delivered = await call(api, 'POST', `/driver/orders/${order.id}/deliver`, driver.token, {
    receiver_name: 'Rohit Sharma',
    signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
    photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
  })
  assert.equal(delivered.status, 200)
  assert.equal((delivered.data as any).order.status, 'DELIVERED')

  // proof is stored and served only to authorised parties
  const proof = await call(api, 'GET', `/orders/${order.id}/proof`, company.token)
  assert.equal(proof.status, 200)
  const files = (proof.data as any).files
  assert.equal(files.length, 2)
  assert.ok(files.every((file: any) => typeof file.data_url === 'string'))

  const stranger = await login(api, 'ops@halcyon.test')
  const foreignProof = await call(api, 'GET', `/orders/${order.id}/proof`, stranger.token)
  assert.equal(foreignProof.status, 403)

  // the email outbox contains the delivery confirmation with a secure proof link
  const emails = await call(api, 'GET', '/emails', company.token)
  const email = (emails.data as any).data.find((item: any) => item.subject.includes(order.order_code))
  assert.ok(email, 'a delivery email must be queued')
  assert.equal(email.status, 'sent')
  assert.ok(email.secure_link.includes('/proof/'))
  assert.ok(email.html.includes(order.order_code))
  assert.ok(email.html.includes('RNA General Store'))

  // the secure link opens the public proof page
  const token = email.secure_link.split('token=')[1]
  const publicProof = await call(api, 'GET', `/public/proof/${order.id}`, null, undefined, { token })
  assert.equal(publicProof.status, 200)
  assert.equal((publicProof.data as any).order.order_code, order.order_code)

  const badToken = await call(api, 'GET', `/public/proof/${order.id}`, null, undefined, { token: 'broken' })
  assert.equal(badToken.status, 403)
})

test('cancellation rules: company cancel before acceptance, request after acceptance', async () => {
  const { api } = await boot()
  const company = await login(api, 'admin@vantage.test')
  const admin = await login(api, 'superadmin@rnaship.test')

  const shops = await call(api, 'GET', '/shops', company.token)
  const rna = (shops.data as any).data.find((shop: any) => shop.code === 'RNA-001')
  const shopDetail = await call(api, 'GET', `/shops/${rna.id}`, company.token)
  const receiver = (shopDetail.data as any).receivers[0]

  const makeOrder = async () => {
    const created = await call(api, 'POST', '/orders', company.token, {
      shop_id: rna.id, receiver_id: receiver.id,
      pickup_address: 'Unit 14, Baner MIDC, Pune',
      item_description: '2 sealed bags — dry provisions', quantity: 2,
      priority: 'EXPRESS', requested_delivery_at: new Date(Date.now() + 3600_000).toISOString(),
      authorized_contact_name: 'Ananya Rao', authorized_contact_phone: '+91 98765 40021',
    })
    return (created.data as any).order
  }

  // direct cancel is allowed while the order is still a draft
  const draft = await makeOrder()
  const cancelled = await call(api, 'POST', `/orders/${draft.id}/cancel`, company.token, { reason: 'Duplicate request' })
  assert.equal(cancelled.status, 200)
  assert.equal((cancelled.data as any).order.status, 'CANCELLED')

  // a short reason is rejected
  const second = await makeOrder()
  const tooShort = await call(api, 'POST', `/orders/${second.id}/cancel`, company.token, { reason: 'x' })
  assert.equal(tooShort.status, 422)

  // once accepted, the company must request cancellation instead
  await call(api, 'POST', `/orders/${second.id}/submit`, company.token)
  const code = await call(api, 'GET', '/otp/test-code', company.token, undefined, { order_id: second.id, purpose: 'order_confirmation' })
  await call(api, 'POST', `/orders/${second.id}/confirm`, company.token, { otp: (code.data as any).code })

  const driver = await login(api, 'sandeep@drives.test')
  await call(api, 'POST', `/driver/jobs/${second.id}/accept`, driver.token)

  const directCancel = await call(api, 'POST', `/orders/${second.id}/cancel`, company.token, { reason: 'Too late now' })
  assert.equal(directCancel.status, 409)

  const requested = await call(api, 'POST', `/orders/${second.id}/cancellation-request`, company.token, { reason: 'Goods recalled by warehouse' })
  assert.equal(requested.status, 200)
  assert.equal((requested.data as any).order.status, 'CANCELLATION_REQUESTED')

  const approved = await call(api, 'POST', `/admin/orders/${second.id}/cancellation/approve`, admin.token)
  assert.equal(approved.status, 200)
  assert.equal((approved.data as any).order.status, 'CANCELLED')
})

test('OTP resend is rate limited and attempts are capped', async () => {
  const { api } = await boot()
  const company = await login(api, 'admin@vantage.test')
  const shops = await call(api, 'GET', '/shops', company.token)
  const rna = (shops.data as any).data.find((shop: any) => shop.code === 'RNA-001')
  const shopDetail = await call(api, 'GET', `/shops/${rna.id}`, company.token)
  const receiver = (shopDetail.data as any).receivers[0]

  const created = await call(api, 'POST', '/orders', company.token, {
    shop_id: rna.id, receiver_id: receiver.id, pickup_address: 'Unit 14, Baner MIDC, Pune',
    item_description: '1 sealed bag — sample', quantity: 1, priority: 'STANDARD',
    requested_delivery_at: new Date(Date.now() + 3600_000).toISOString(),
    authorized_contact_name: 'Ananya Rao', authorized_contact_phone: '+91 98765 40021',
  })
  const order = (created.data as any).order

  assert.equal((await call(api, 'POST', `/orders/${order.id}/submit`, company.token)).status, 200)
  const resend = await call(api, 'POST', `/orders/${order.id}/submit`, company.token)
  assert.equal(resend.status, 429)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await call(api, 'POST', `/orders/${order.id}/confirm`, company.token, { otp: '111111' })
  }
  const capped = await call(api, 'POST', `/orders/${order.id}/confirm`, company.token, { otp: '111111' })
  assert.equal(capped.status, 429)
})

test('audit trail records sensitive actions', async () => {
  const { api } = await boot()
  const admin = await login(api, 'superadmin@rnaship.test')
  const logs = await call(api, 'GET', '/admin/audit-logs', admin.token)
  assert.equal(logs.status, 200)
  const actions = (logs.data as any).data.map((entry: any) => entry.action)
  assert.ok(actions.includes('auth.login'))
})
