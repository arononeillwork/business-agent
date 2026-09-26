// Small Web Crypto helpers for the Worker: encrypt provider tokens at rest, sign OAuth state,
// and verify webhook signatures.

const enc = new TextEncoder()
const dec = new TextDecoder()

const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))
const b64url = (bytes: ArrayBuffer | Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))

async function aesKey(secret: string) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(secret))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** AES-GCM encrypt a JSON value. Output: base64(iv).base64(ciphertext). */
export async function seal(secret: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(JSON.stringify(value)))
  return `${b64(iv)}.${b64(ct)}`
}

export async function unseal<T>(secret: string, sealed: string): Promise<T> {
  const [iv, ct] = sealed.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(secret), unb64(ct))
  return JSON.parse(dec.decode(pt)) as T
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function hmacHex(secret: string, body: string) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Signed, expiring token (for OAuth `state`). */
export async function signState(secret: string, data: Record<string, unknown>, ttlSeconds = 600) {
  const body = b64url(enc.encode(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds })))
  const sig = b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)))
  return `${body}.${sig}`
}

export async function verifyState<T>(secret: string, token: string): Promise<T> {
  const [body, sig] = token.split('.')
  if (!body || !sig) throw new Error('Invalid state')
  // Only the canonical encoding counts (the last base64url character has spare bits).
  if (b64url(unb64url(sig)) !== sig) throw new Error('Invalid state')
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig), enc.encode(body))
  if (!ok) throw new Error('Invalid state')
  const data = JSON.parse(dec.decode(unb64url(body))) as T & { exp: number }
  if (data.exp < Date.now() / 1000) throw new Error('This link has expired. Start again.')
  return data
}
