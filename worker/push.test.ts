// Push notifications: what's sent is what a browser can decrypt (RFC 8291) and signed so its push
// service accepts it (VAPID); each minute's notifications reach their person's devices as they chose,
// once, and devices their push service says are gone are forgotten.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { b64url, encryptFor, fromB64url, push, pushNotifications, sendPush, vapidPublicKey } from './push'
import { businessDb, type Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'

const vapid = (() => {
  const { kty, crv, x, y, d } = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' })
  return JSON.stringify({ kty, crv, x, y, d })
})()
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
  BUSINESS_ID: 'easy-beans', VAPID_KEY: vapid,
} as unknown as Env

const enc = new TextEncoder()
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap(p => [...p]))
const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) =>
  new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info },
    await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bytes * 8))

/** A browser: its keys, what it would hand the app when subscribing, and decrypting what arrives. */
async function browser(endpoint: string) {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey) as ArrayBuffer)
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return {
    sub: { endpoint, p256dh: b64url(pub), auth: b64url(auth) },
    async open(body: Uint8Array) {
      const salt = body.slice(0, 16), idLen = body[20], senderPub = body.slice(21, 21 + idLen), sealed = body.slice(21 + idLen)
      expect(new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0)).toBe(4096)
      const sender = await crypto.subtle.importKey('raw', senderPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
      const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: sender } as unknown as SubtleCryptoDeriveKeyAlgorithm, keys.privateKey, 256))
      const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), pub, senderPub), 32)
      const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
      const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce },
        await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), sealed))
      expect(plain.at(-1)).toBe(2)
      return JSON.parse(new TextDecoder().decode(plain.slice(0, -1)))
    },
  }
}

/** Checks a request's VAPID header the way a push service does; returns its claims. */
async function checkVapid(header: string) {
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(\S+)$/.exec(header)
  expect(m).not.toBeNull()
  const [, h, c, sig, k] = m!
  expect(k).toBe(vapidPublicKey(env))
  const key = await crypto.subtle.importKey('raw', fromB64url(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64url(sig), enc.encode(`${h}.${c}`))).toBe(true)
  return JSON.parse(new TextDecoder().decode(fromB64url(c))) as { aud: string; exp: number; sub: string }
}

let db: FakeSupabase
/** Each device's push service: what it was sent, and how it answers. */
let delivered: { endpoint: string; body: Uint8Array; headers: Headers }[]
let answer: Record<string, number>

beforeEach(() => {
  db = new FakeSupabase()
  delivered = []
  answer = {}
  db.tables.notifications = []
  db.tables.push_subscriptions = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('https://push.test/')) {
      delivered.push({ endpoint: url, body: new Uint8Array(init!.body as Uint8Array), headers: new Headers(init!.headers) })
      return new Response(null, { status: answer[url] ?? 201 })
    }
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('sending one', () => {
  it('encrypts it so only that browser can read it', async () => {
    const phone = await browser('https://push.test/a')
    const body = await encryptFor(phone.sub, enc.encode(JSON.stringify({ title: 'Hola' })))
    expect(await phone.open(body)).toEqual({ title: 'Hola' })
    // A fresh key and salt every time.
    expect(b64url(await encryptFor(phone.sub, enc.encode('{}')))).not.toBe(b64url(await encryptFor(phone.sub, enc.encode('{}'))))
  })

  it('signs it for the push service, which keeps it a day', async () => {
    const phone = await browser('https://push.test/a')
    expect(await sendPush(env, { id: 's1', ...phone.sub }, { title: 'Bank holiday in 7 days: Inmaculada', link: '/calendar' })).toBe('ok')
    const [sent] = delivered
    const claims = await checkVapid(sent.headers.get('authorization')!)
    expect(claims.aud).toBe('https://push.test')
    expect(claims.exp * 1000).toBeGreaterThan(Date.now())
    expect(claims.exp * 1000).toBeLessThanOrEqual(Date.now() + 24 * 3600_000)
    expect(sent.headers.get('content-encoding')).toBe('aes128gcm')
    expect(sent.headers.get('ttl')).toBe('86400')
    expect(await phone.open(sent.body)).toEqual({ title: 'Bank holiday in 7 days: Inmaculada', link: '/calendar' })
  })

  it('knows a device that is gone, and does nothing without a key', async () => {
    const phone = await browser('https://push.test/old')
    answer['https://push.test/old'] = 410
    expect(await sendPush(env, { id: 's1', ...phone.sub }, { title: 'x' })).toBe('gone')
    expect(await sendPush({ ...env, VAPID_KEY: undefined }, { id: 's1', ...phone.sub }, { title: 'x' })).toBe('failed')
  })

  it('gives browsers the public key, or says it is being set up', async () => {
    const res = await push.request('https://app.test/api/push/key', {}, env)
    const { key } = await res.json() as { key: string }
    expect(fromB64url(key)).toHaveLength(65)
    expect((await push.request('https://app.test/api/push/key', {}, { ...env, VAPID_KEY: undefined })).status).toBe(503)
  })
})

describe('every minute', () => {
  const now = () => new Date().toISOString()
  const note = (id: number, profile_id: string, extra: Record<string, unknown> = {}) =>
    ({ id, profile_id, title: `Note ${id}`, body: null, link: null, kind: null, created_at: now(), read_at: null, pushed_at: null, data: {}, ...extra })

  it('sends new notifications to their person’s devices, as they chose, once', async () => {
    const maria = await browser('https://push.test/maria-phone')
    const mariaLaptop = await browser('https://push.test/maria-laptop')
    const julio = await browser('https://push.test/julio-phone')
    db.tables.push_subscriptions = [
      { id: 'm1', profile_id: 'maria', ...maria.sub, failures: 0, last_ok_at: null },
      { id: 'm2', profile_id: 'maria', ...mariaLaptop.sub, failures: 0, last_ok_at: null },
      { id: 'j1', profile_id: 'julio', ...julio.sub, failures: 0, last_ok_at: null },
    ]
    db.tables.profiles = [
      { id: 'maria', role: 'admin', preferences: { notify: { holidays: 'push', reviews: 'app' }, languages: ['en', 'es'], language: 'es' } },
      { id: 'julio', role: 'employee', preferences: {} },
      { id: 'ana', role: 'admin', preferences: {} },
    ]
    db.tables.notifications = [
      note(1, 'maria', { kind: 'bank_holiday', title: 'Bank holiday in 7 days: Inmaculada', body: 'Tuesday 8 December · National holiday. Check the rota and the opening hours.',
        link: '/calendar', data: { event: 'e1', date: '2026-12-08', days: 7, name: 'Inmaculada Concepción', category: 'national', town: null } }),
      note(2, 'maria', { kind: 'review', link: '/reviews' }),
      note(3, 'julio', { link: '/todo' }),
      note(4, 'ana'),
      note(5, 'maria', { pushed_at: now() }),
      note(6, 'julio', { created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }),
    ]
    expect(await pushNotifications(env, businessDb(env, 1))).toBe(2)
    expect(delivered.map(d => d.endpoint).sort()).toEqual(['https://push.test/julio-phone', 'https://push.test/maria-laptop', 'https://push.test/maria-phone'])
    // In Spanish: what Maria reads the app in.
    expect(await maria.open(delivered.find(d => d.endpoint.endsWith('maria-phone'))!.body)).toEqual({
      title: 'Festivo dentro de 7 días: Inmaculada Concepción', body: 'martes, 8 de diciembre · Festivo nacional. Revisa los turnos y el horario.',
      link: '/calendar', tag: 'n1' })
    expect(await julio.open(delivered.find(d => d.endpoint.endsWith('julio-phone'))!.body)).toMatchObject({ title: 'Note 3' })
    const rows = Object.fromEntries(db.tables.notifications.map(n => [n.id, n]))
    // Phone only: read once it's reached the phone, so the bell stays quiet.
    expect(rows[1].read_at).not.toBeNull()
    expect(rows[3].read_at).toBeNull()
    // All of this minute's are done (the review stays in the app; Ana has no device), the old ones untouched.
    expect([1, 2, 3, 4].every(id => rows[id].pushed_at)).toBe(true)
    expect(rows[6].pushed_at).toBeNull()
    expect(db.tables.push_subscriptions.every(s => s.last_ok_at)).toBe(true)

    delivered = []
    expect(await pushNotifications(env, businessDb(env, 1))).toBe(0)
    expect(delivered).toEqual([])
  })

  it('forgets devices that are gone, and gives up on one that keeps failing', async () => {
    const gone = await browser('https://push.test/gone')
    const broken = await browser('https://push.test/broken')
    answer['https://push.test/gone'] = 410
    answer['https://push.test/broken'] = 500
    db.tables.push_subscriptions = [
      { id: 'g', profile_id: 'maria', ...gone.sub, failures: 0, last_ok_at: null },
      { id: 'b', profile_id: 'maria', ...broken.sub, failures: 19, last_ok_at: null },
    ]
    db.tables.profiles = [{ id: 'maria', role: 'admin', preferences: { notify: { other: 'push' } } }]
    db.tables.notifications = [note(1, 'maria')]
    expect(await pushNotifications(env, businessDb(env, 1))).toBe(0)
    expect(db.tables.push_subscriptions).toEqual([])
    // Nothing reached a device: it stays unread in the app.
    expect(db.tables.notifications[0].read_at).toBeNull()
  })

  it('marks them done without sending while push is being set up', async () => {
    db.tables.notifications = [note(1, 'maria')]
    expect(await pushNotifications({ ...env, VAPID_KEY: undefined }, businessDb(env, 1))).toBe(0)
    expect(db.tables.notifications[0].pushed_at).not.toBeNull()
    expect(delivered).toEqual([])
  })
})
