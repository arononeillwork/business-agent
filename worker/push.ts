// Push notifications to people's phones and computers (Web Push: RFC 8030, with VAPID, RFC 8292, and
// the message encrypted for the device, RFC 8291). Each person turns it on for a device on the
// Notifications page, which saves the browser's subscription (push_subscriptions). Every minute the
// Worker sends the notifications that haven't been pushed to their person's devices, as they chose
// (shared/notify.ts), and drops the devices their push service says are gone.
//
// VAPID_KEY (a P-256 private key as a JWK, made once by the deploy: scripts/ops/worker-secrets.mjs)
// signs each request; browsers subscribe with its public half (GET /api/push/key).
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from './supabase'
import { channelFor, notificationTopic, pushes } from '../shared/notify'
import { languageOf, pushText } from '../shared/pushText'
import type { AppNotification, Preferences } from '../shared/types'
import { businessConfig } from '../shared/business.config'

const enc = new TextEncoder()

export const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const fromB64url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(b, c => c.charCodeAt(0))
}
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) { out.set(p, i); i += p.length }
  return out
}

type VapidJwk = JsonWebKey & { x: string; y: string; d: string }
const vapidJwk = (env: Env): VapidJwk | null => {
  if (!env.VAPID_KEY) return null
  try {
    const k = JSON.parse(env.VAPID_KEY) as VapidJwk
    return k.kty === 'EC' && k.crv === 'P-256' && k.x && k.y && k.d ? k : null
  } catch { return null }
}

/** The public key browsers subscribe with (an uncompressed P-256 point, base64url); null until it's set up. */
export function vapidPublicKey(env: Env): string | null {
  const k = vapidJwk(env)
  return k ? b64url(concat(new Uint8Array([4]), fromB64url(k.x), fromB64url(k.y))) : null
}

/** The Authorization header for one push service: a JWT it can check against our public key. */
async function vapidAuth(k: VapidJwk, endpoint: string) {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    // Who push services contact about our messages (a URL or mailto:).
    sub: businessConfig.appUrl,
  })))
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: k.x, y: k.y, d: k.d, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)))
  const pub = concat(new Uint8Array([4]), fromB64url(k.x), fromB64url(k.y))
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${b64url(pub)}`
}

const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) => {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

/** The message encrypted for one device (RFC 8291, aes128gcm): the body to send. */
export async function encryptFor(sub: { p256dh: string; auth: string }, payload: Uint8Array) {
  const uaPublic = fromB64url(sub.p256dh)
  const authSecret = fromB64url(sub.auth)
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey) as ArrayBuffer)
  const theirs = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  // Workers' types call it $public; the runtime (like every browser) reads public.
  const ecdh = { name: 'ECDH', public: theirs } as unknown as SubtleCryptoDeriveKeyAlgorithm
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, local.privateKey, 256))
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // One record: the message, then 0x02 (the last record's padding delimiter).
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(payload, new Uint8Array([2]))))
  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, sealed)
}

export interface PushMessage { title: string; body?: string | null; link?: string | null; tag?: string }
interface Subscription { id: string; endpoint: string; p256dh: string; auth: string }

/** Send one message to one device: 'ok', 'gone' (the device unsubscribed: forget it) or 'failed'. */
export async function sendPush(env: Env, sub: Subscription, message: PushMessage): Promise<'ok' | 'gone' | 'failed'> {
  const k = vapidJwk(env)
  if (!k) return 'failed'
  const body = await encryptFor(sub, enc.encode(JSON.stringify(message)))
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuth(k, sub.endpoint),
      'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream',
      // Kept by the push service for a day while the phone is off.
      ttl: '86400', urgency: 'normal',
    },
    body,
  }).catch(() => null)
  if (!res) return 'failed'
  if (res.status === 404 || res.status === 410) return 'gone'
  if (!res.ok) console.error('push failed', res.status, (await res.text().catch(() => '')).slice(0, 200))
  return res.ok ? 'ok' : 'failed'
}

type Pending = Pick<AppNotification, 'id' | 'title' | 'body' | 'link' | 'kind' | 'data'> & { profile_id: string }

/**
 * Every minute, for one business: the notifications not pushed yet (from the last day) go to their
 * person's devices, as they chose, in their language. Ones they want only on their phone are marked
 * read once they've reached it, so the bell doesn't light up for them too.
 */
export async function pushNotifications(env: Env, db: SupabaseClient) {
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { data: rows, error } = await db.from('notifications').select('id, profile_id, title, body, link, kind, data')
    .is('pushed_at', null).gte('created_at', since).order('created_at').limit(200)
  if (error) throw new Error(error.message)
  const pending = (rows ?? []) as Pending[]
  if (!pending.length) return 0
  // Claimed first, so a slow minute and the next one never send the same one twice.
  const { error: claimed } = await db.from('notifications').update({ pushed_at: new Date().toISOString() }).in('id', pending.map(n => n.id))
  if (claimed) throw new Error(claimed.message)
  if (!vapidJwk(env)) return 0

  const people = [...new Set(pending.map(n => n.profile_id))]
  const [{ data: subs }, { data: profiles }, { data: settings }] = await Promise.all([
    db.from('push_subscriptions').select('id, profile_id, endpoint, p256dh, auth').in('profile_id', people),
    db.from('profiles').select('id, preferences').in('id', people),
    db.from('settings').select('languages').eq('id', 1).maybeSingle(),
  ])
  const team = (settings?.languages as string[] | null | undefined) ?? []
  const devices = new Map<string, Subscription[]>()
  for (const s of (subs ?? []) as (Subscription & { profile_id: string })[]) devices.set(s.profile_id, [...(devices.get(s.profile_id) ?? []), s])
  const prefs = new Map((profiles ?? []).map(p => [p.id as string, p.preferences as Preferences | null]))

  const gone = new Set<string>(), ok = new Set<string>(), failed = new Set<string>(), readNow: number[] = []
  let sent = 0
  for (const n of pending) {
    const channel = channelFor(prefs.get(n.profile_id), n.kind === 'test' ? 'test' : notificationTopic(n))
    const to = (devices.get(n.profile_id) ?? []).filter(s => !gone.has(s.id))
    if (!pushes(channel) || !to.length) continue
    const text = pushText(n, languageOf(prefs.get(n.profile_id), team))
    const results = await Promise.all(to.map(s => sendPush(env, s, { ...text, link: n.link, tag: `n${n.id}` })
      .then(r => { (r === 'gone' ? gone : r === 'ok' ? ok : failed).add(s.id); return r })))
    if (results.includes('ok')) {
      sent++
      if (channel === 'push') readNow.push(n.id)
    }
  }
  const now = new Date().toISOString()
  await Promise.all([
    gone.size ? db.from('push_subscriptions').delete().in('id', [...gone]) : null,
    ok.size ? db.from('push_subscriptions').update({ last_ok_at: now, failures: 0 }).in('id', [...ok]) : null,
    readNow.length ? db.from('notifications').update({ read_at: now }).in('id', readNow).is('read_at', null) : null,
  ])
  // A device that keeps failing (and isn't one that also worked) is dropped after 20 tries.
  for (const id of [...failed].filter(id => !ok.has(id))) {
    const { data } = await db.from('push_subscriptions').select('failures').eq('id', id).maybeSingle()
    if (!data) continue
    if ((data.failures as number) >= 19) await db.from('push_subscriptions').delete().eq('id', id)
    else await db.from('push_subscriptions').update({ failures: (data.failures as number) + 1 }).eq('id', id)
  }
  return sent
}

export const push = new Hono<{ Bindings: Env }>()

// The public key browsers subscribe with (nothing secret: it's in every push request too).
push.get('/api/push/key', c => {
  const key = vapidPublicKey(c.env)
  return key ? c.json({ key }) : c.json({ error: 'Push notifications are being set up' }, 503)
})
