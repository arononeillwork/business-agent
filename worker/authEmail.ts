// Sign-in emails (invites, sign-up confirmations, sign-in codes, password resets) sent from the
// business's own connected mailbox, Gmail or Outlook, instead of from Supabase. Supabase Auth calls
// this through its "send email" hook (switched on by the deploy once a mailbox is connected:
// scripts/ops/supabase-auth.mjs) and sends nothing itself.
//
// Supabase signs each call (Standard Webhooks). The shared secret is derived from the service key,
// which both the Worker and the deploy already have, so there is no extra secret to manage.
import { Hono } from 'hono'
import { serviceClient, type Env } from './supabase'
import { sendEmail } from './integrations'

const enc = new TextEncoder()
const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
const hmac = async (key: BufferSource, data: string) =>
  crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(data))

/** The hook secret: 32 bytes from the service key. Supabase gets it as `v1,whsec_<base64>`. */
export const hookSecret = (serviceKey: string) => hmac(enc.encode(serviceKey), 'business-agent:send-email-hook')

const TOLERANCE_S = 5 * 60

/** Standard Webhooks: base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)) in a `v1,<sig>` list. */
export async function verifyHook(serviceKey: string, headers: Headers, body: string, now = Date.now()) {
  const id = headers.get('webhook-id'), ts = headers.get('webhook-timestamp'), sigs = headers.get('webhook-signature')
  if (!id || !ts || !sigs) return false
  if (!/^\d+$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > TOLERANCE_S) return false
  const expected = b64(await hmac(await hookSecret(serviceKey), `${id}.${ts}.${body}`))
  return sigs.split(' ').some(s => {
    const [v, sig] = s.split(',')
    if (v !== 'v1' || !sig || sig.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
    return diff === 0
  })
}

interface HookPayload {
  user: { email: string; user_metadata?: { full_name?: string } }
  email_data: { token: string; token_hash: string; redirect_to: string; email_action_type: string; site_url: string }
}

/** The email for each kind of sign-in message. Links go through Supabase, exactly like its own emails. */
export function authMessage(env: Env, business: string, p: HookPayload) {
  const d = p.email_data
  const name = p.user.user_metadata?.full_name?.split(' ')[0]
  const hi = name ? `Hola ${name},` : 'Hola,'
  const link = (type: string) =>
    `${env.SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(d.token_hash)}&type=${type}&redirect_to=${encodeURIComponent(d.redirect_to || d.site_url)}`
  const ignore = "If you didn't ask for this, you can ignore this email."
  switch (d.email_action_type) {
    case 'invite':
      return { subject: `You're invited to the ${business} team app`, text: `${hi}\n\n${business} has invited you to its team app. Open this link to accept and choose a password:\n\n${link('invite')}\n\nIf the link has expired, open ${d.site_url}, type this email address and tap "Email me a sign-in code".` }
    case 'signup':
      return { subject: `Confirm your email for ${business}`, text: `${hi}\n\nOpen this link to confirm your email address:\n\n${link('signup')}\n\n${ignore}` }
    case 'magiclink':
      return { subject: `Your ${business} sign-in code`, text: `${hi}\n\nYour sign-in code is ${d.token}\n\nType it into the ${business} team app. It works once, for one hour. You can also open this link:\n\n${link('magiclink')}\n\n${ignore}` }
    case 'recovery':
      return { subject: `Reset your ${business} password`, text: `${hi}\n\nOpen this link to choose a new password:\n\n${link('recovery')}\n\n${ignore}` }
    case 'reauthentication':
      return { subject: `Your ${business} confirmation code`, text: `${hi}\n\nYour confirmation code is ${d.token}\n\n${ignore}` }
    default:
      return null
  }
}

const hookError = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { 'content-type': 'application/json' } })

export const authEmail = new Hono<{ Bindings: Env }>()

authEmail.post('/api/auth/send-email', async c => {
  const body = await c.req.text()
  if (!c.env.SUPABASE_SERVICE_ROLE_KEY || !await verifyHook(c.env.SUPABASE_SERVICE_ROLE_KEY, c.req.raw.headers, body)) {
    return hookError(401, 'Invalid signature')
  }
  const payload = JSON.parse(body) as HookPayload
  const db = serviceClient(c.env)
  const { data: biz } = await db.from('business').select('name').eq('id', 1).maybeSingle()
  const message = authMessage(c.env, (biz?.name as string | undefined) ?? 'Business Agent', payload)
  if (!message) return hookError(400, `This kind of email isn't supported: ${payload.email_data.email_action_type}`)
  try {
    await sendEmail(c.env, db, { to: payload.user.email, ...message })
  } catch (e) {
    // Shown to the person who asked (invite, reset…): say what's wrong, not "error sending email".
    return hookError(503, `The email couldn't be sent from the business's mailbox: ${e instanceof Error ? e.message : String(e)}`)
  }
  return c.json({})
})
