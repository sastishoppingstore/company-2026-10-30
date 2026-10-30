// Cryptographic primitives. Every secret-handling rule in the spec lives here:
// PBKDF2 password hashing, HMAC-based token/OTP hashing, AES-GCM encryption
// used ONLY to surface a code in the explicitly-flagged test mode.

const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function randomId(prefix: string): string {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  return `${prefix}_${Array.from(bytes).map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)}`
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return toHex(buf.buffer)
}

/** Cryptographically secure numeric code with rejection sampling. */
export function randomNumericCode(length = 6): string {
  const max = Math.floor(0xffffffff / Math.pow(10, length)) * Math.pow(10, length)
  const buf = new Uint32Array(1)
  let value = 0
  do {
    crypto.getRandomValues(buf)
    value = buf[0]
  } while (value >= max)
  return String(value % Math.pow(10, length)).padStart(length, '0')
}

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(data)))
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function hashPassword(password: string, salt?: string): Promise<string> {
  const iterations = 120000
  const saltB64 = salt ?? toHex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(saltB64), iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return `pbkdf2$${iterations}$${saltB64}$${toHex(bits)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  const salt = parts[2]
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return timingSafeEqual(toHex(bits), parts[3])
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('rna-otp-envelope'), iterations: 50000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Envelope-encrypt a short code. Only ever used when test mode is explicitly enabled. */
export async function encryptSecret(secret: string, plaintext: string): Promise<string> {
  const key = await aesKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext)))
  return `${toHex(iv.buffer)}.${toHex(cipher.buffer)}`
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.substr(index * 2, 2), 16)
  }
  return bytes
}

export async function decryptSecret(secret: string, payload: string): Promise<string | null> {
  try {
    const [ivHex, dataHex] = payload.split('.')
    const key = await aesKey(secret)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hexToBytes(ivHex) },
      key,
      hexToBytes(dataHex),
    )
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((b) => { binary += String.fromCharCode(b) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
