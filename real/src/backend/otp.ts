import type { Otp, OtpChannel, OtpPurpose, Order } from '../lib/types.ts'
import { encryptSecret, hmacHex, randomNumericCode } from './crypto.ts'
import { ApiError } from './util.ts'
import type { Storage } from './storage.ts'
import { nowIso } from './util.ts'

export interface OtpConfig {
  otpTtlSeconds: number
  otpMaxAttempts: number
  otpResendCooldownSeconds: number
  otpMaxPerHour: number
  otpTestMode: boolean
}

/**
 * Purpose-scoped OTP issuance.
 * The stored value is an HMAC over (purpose | order | target | code) so a code
 * issued for delivery verification can never satisfy company confirmation.
 */
export async function issueOtp(
  storage: Storage,
  config: OtpConfig & { appSecret: string },
  params: {
    order: Order
    purpose: OtpPurpose
    channel: OtpChannel
    target: string
  },
): Promise<Otp> {
  const { order, purpose, channel, target } = params
  const now = Date.now()
  const existing = await storage.filter<Otp>('otps', (o) => o.order_id === order.id && o.purpose === purpose)

  const last = existing.sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  if (last && new Date(last.resend_available_at).getTime() > now) {
    throw new ApiError(
      429,
      `Please wait ${Math.ceil((new Date(last.resend_available_at).getTime() - now) / 1000)}s before requesting another code.`,
      { otp: ['resend cooldown active'] },
    )
  }
  const hourAgo = now - 3600_000
  const recent = existing.filter((o) => new Date(o.created_at).getTime() > hourAgo)
  if (recent.length >= config.otpMaxPerHour) {
    throw new ApiError(429, 'Verification code request limit reached. Try again later.', { otp: ['rate limit reached'] })
  }

  const code = randomNumericCode(6)
  const codeHash = await hmacHex(config.appSecret, `${purpose}|${order.id}|${target}|${code}`)
  const expiresAt = new Date(now + config.otpTtlSeconds * 1000).toISOString()
  const resendAt = new Date(now + config.otpResendCooldownSeconds * 1000).toISOString()

  const record: Otp = {
    id: `otp_${Math.random().toString(36).slice(2, 12)}`,
    order_id: order.id,
    company_id: order.company_id,
    purpose,
    channel,
    target,
    code_hash: codeHash,
    expires_at: expiresAt,
    attempts: 0,
    max_attempts: config.otpMaxAttempts,
    consumed_at: null,
    verified_at: null,
    resend_available_at: resendAt,
    created_at: nowIso(),
  } as Otp

  const row: Record<string, unknown> = { ...record }
  if (config.otpTestMode) {
    // Test mode only: keep an encrypted copy so the demo console can surface the
    // code without ever returning it from a normal API response.
    ;(row as any).code_cipher = await encryptSecret(config.appSecret, code)
  }
  await storage.insert('otps', row as any)
  return record
}

export async function verifyOtp(
  storage: Storage,
  config: OtpConfig & { appSecret: string },
  params: { orderId: string; purpose: OtpPurpose; code: string },
): Promise<Otp> {
  const { orderId, purpose, code } = params
  const candidates = (await storage.filter<Otp>('otps', (o) => o.order_id === orderId && o.purpose === purpose))
    .filter((o) => !o.verified_at && !o.consumed_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const active = candidates[0]
  if (!active) {
    throw new ApiError(400, 'No active verification code for this request.', { otp: ['no active code'] })
  }
  if (new Date(active.expires_at).getTime() < Date.now()) {
    throw new ApiError(400, 'This verification code has expired. Request a new one.', { otp: ['expired'] })
  }
  if (active.attempts >= active.max_attempts) {
    throw new ApiError(429, 'Too many incorrect attempts for this code. Request a new one.', { otp: ['attempt limit reached'] })
  }
  const expected = await hmacHex(config.appSecret, `${purpose}|${active.order_id}|${active.target}|${code.trim()}`)
  if (expected !== active.code_hash) {
    const attempts = active.attempts + 1
    await storage.update('otps', active.id, { attempts } as any)
    const left = Math.max(0, active.max_attempts - attempts)
    throw new ApiError(
      400,
      left > 0 ? `Incorrect verification code. ${left} attempt${left === 1 ? '' : 's'} remaining.` : 'Incorrect verification code.',
      { otp: ['invalid code'] },
    )
  }
  const verified = await storage.update<Otp>('otps', active.id, {
    verified_at: nowIso(),
    consumed_at: nowIso(),
  } as any)
  return verified
}

/** Replay protection: a verified, purpose-specific code cannot be used twice. */
export function assertSingleUse(otp: Otp): void {
  if (!otp.verified_at || otp.consumed_at !== otp.verified_at) {
    throw new ApiError(400, 'Verification code has already been used.', { otp: ['already used'] })
  }
}
