// Sign-in emails (invites, sign-up confirmations, sign-in codes, password resets), from The Business
// Agent instead of from Supabase. Supabase Auth calls this through its "send email" hook (switched on by
// the deploy: scripts/ops/supabase-auth.mjs) and sends nothing itself.
// - With Cloudflare Email Sending on (the EMAIL binding; scripts/ops/email-sending.mjs), everyone gets
//   them from noreply@businesssagent.com, with replies going to support@.
// - Without it, or if it fails, they go out as before: from the person's business's own Gmail or
//   Outlook, or, for someone in no business yet or whose business has no mailbox, through the founding
//   business's mailbox.
//
// Supabase signs each call (Standard Webhooks). The shared secret is derived from the service key,
// which both the Worker and the deploy already have, so there is no extra secret to manage.
import { Hono } from 'hono'
import { SECRETS_BUSINESS_ID, businessDb, serviceClient, type Env } from './supabase'
import { sendEmail } from './integrations'

/** Who the emails come from, and where replies go (Cloudflare Email Sending; docs/business-email.md). */
export const SENDER = { email: 'noreply@businesssagent.com', name: 'The Business Agent' }
export const REPLY_TO = 'support@businesssagent.com'
const PRODUCT = 'The Business Agent'

const enc = new TextEncoder()
const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
const hmac = async (key: BufferSource, data: string) =>
  crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(data))

/** The hook secret: 32 bytes from the service key. Supabase gets it as `v1,whsec_<base64>`. Each hook has its own label. */
export const SEND_EMAIL_HOOK = 'business-agent:send-email-hook'
export const hookSecret = (serviceKey: string, label = SEND_EMAIL_HOOK) => hmac(enc.encode(serviceKey), label)

const TOLERANCE_S = 5 * 60

/** Standard Webhooks: base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)) in a `v1,<sig>` list. */
export async function verifyHook(serviceKey: string, headers: Headers, body: string, now = Date.now(), label = SEND_EMAIL_HOOK) {
  const id = headers.get('webhook-id'), ts = headers.get('webhook-timestamp'), sigs = headers.get('webhook-signature')
  if (!id || !ts || !sigs) return false
  if (!/^\d+$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > TOLERANCE_S) return false
  const expected = b64(await hmac(await hookSecret(serviceKey, label), `${id}.${ts}.${body}`))
  return sigs.split(' ').some(s => {
    const [v, sig] = s.split(',')
    if (v !== 'v1' || !sig || sig.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
    return diff === 0
  })
}

interface HookPayload {
  user: { id?: string; email: string; user_metadata?: { full_name?: string } }
  email_data: { token: string; token_hash: string; redirect_to: string; email_action_type: string; site_url: string }
}

const esc = (v: string) => v.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

/** One sign-in email: a greeting, what happened, a code or a button, and what to do if it wasn't you. */
interface Parts { subject: string; lines: string[]; code?: string; button?: { label: string; url: string }; after?: string[] }

/** Plain text and a simple HTML version of the same email, The Business Agent's robot at the top. */
function render(site: string, hi: string, p: Parts) {
  const text = [hi, '', ...p.lines.flatMap(l => [l, '']),
    ...(p.code ? [p.code, ''] : []),
    ...(p.button ? [`${p.button.label}:`, p.button.url, ''] : []),
    ...(p.after ?? []).flatMap(l => [l, '']), `${PRODUCT} · businesssagent.com`].join('\n')
  const para = (l: string) => `<p style="margin:0 0 14px">${esc(l)}</p>`
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#22272E;max-width:480px;margin:0 auto;padding:24px">
<img src="${esc(site)}/icon-192.png" width="56" height="56" alt="${PRODUCT}" style="display:block;margin:0 0 18px">
${para(hi)}${p.lines.map(para).join('')}${p.code ? `<p style="margin:4px 0 18px;font-size:30px;font-weight:700;letter-spacing:6px">${esc(p.code)}</p>` : ''}${p.button
    ? `<p style="margin:4px 0 18px"><a href="${esc(p.button.url)}" style="display:inline-block;background:#22C55E;color:#FFFFFF;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:999px">${esc(p.button.label)}</a></p>` : ''}${(p.after ?? []).map(l => `<p style="margin:0 0 14px;color:#6B7280;font-size:13px">${esc(l)}</p>`).join('')}
<p style="margin:22px 0 0;color:#9CA3AF;font-size:12px">${PRODUCT} · businesssagent.com</p>
</div>`
  return { subject: p.subject, text, html }
}

/**
 * The email for each kind of sign-in message, as The Business Agent. `business` is the person's
 * business when they're in one (an invite names who invited them). Links go through Supabase,
 * exactly like its own emails.
 */
export function authMessage(env: Env, business: string | null, p: HookPayload) {
  const d = p.email_data
  const name = p.user.user_metadata?.full_name?.split(' ')[0]
  const hi = name ? `Hola ${name},` : 'Hola,'
  const site = (d.site_url || 'https://businesssagent.com').replace(/\/+$/, '')
  const link = (type: string) =>
    `${env.SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(d.token_hash)}&type=${type}&redirect_to=${encodeURIComponent(d.redirect_to || d.site_url)}`
  const ignore = "If you didn't ask for this, you can ignore this email."
  const where = business ? `${business} on ${PRODUCT}` : PRODUCT
  switch (d.email_action_type) {
    case 'invite':
      return render(site, hi, {
        subject: business ? `${business} invited you to ${PRODUCT}` : `You're invited to ${PRODUCT}`,
        lines: [`${business ?? 'A business'} has invited you to its team on ${PRODUCT}: the rota, your hours and the rest of the business in one app. Accept and choose a password:`],
        button: { label: 'Accept the invite', url: link('invite') },
        after: [`If the link has expired, open ${d.site_url}, type this email address and tap "Forgot password?" to set one.`],
      })
    case 'signup':
      return render(site, hi, {
        subject: `Confirm your email for ${PRODUCT}`,
        lines: [`Welcome to ${PRODUCT}. Confirm this is your email address:`],
        button: { label: 'Confirm my email', url: link('signup') }, after: [ignore],
      })
    case 'magiclink':
      return render(site, hi, {
        subject: `Your sign-in code for ${PRODUCT}`,
        lines: [`Your code to sign in to ${where}:`], code: d.token,
        after: ['Type it into the app. It works once, for one hour.', `Or sign in with this link: ${link('magiclink')}`, ignore],
      })
    case 'recovery':
      return render(site, hi, {
        subject: `Reset your password for ${PRODUCT}`,
        lines: [`Choose a new password for ${where}:`],
        button: { label: 'Choose a new password', url: link('recovery') }, after: [ignore],
      })
    case 'reauthentication':
      return render(site, hi, { subject: `Your confirmation code for ${PRODUCT}`, lines: ['Your confirmation code:'], code: d.token, after: [ignore] })
    default:
      return null
  }
}

export const hookError = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { 'content-type': 'application/json' } })

export const authEmail = new Hono<{ Bindings: Env }>()

authEmail.post('/api/auth/send-email', async c => {
  const body = await c.req.text()
  if (!c.env.SUPABASE_SERVICE_ROLE_KEY || !await verifyHook(c.env.SUPABASE_SERVICE_ROLE_KEY, c.req.raw.headers, body)) {
    return hookError(401, 'Invalid signature')
  }
  const payload = JSON.parse(body) as HookPayload
  const { data: person } = payload.user.id
    ? await serviceClient(c.env).from('profiles').select('business_id').eq('id', payload.user.id).maybeSingle()
    : { data: null }
  const own = (person?.business_id as number | null | undefined) ?? null
  const ownDb = own ? businessDb(c.env, own) : null
  const { data: biz } = ownDb ? await ownDb.from('business').select('name').maybeSingle() : { data: null }
  const { data: box } = ownDb
    ? await ownDb.from('integrations').select('provider').in('provider', ['gmail', 'outlook']).eq('status', 'connected').limit(1)
    : { data: [] }
  const db = ownDb && box?.length ? ownDb : businessDb(c.env, SECRETS_BUSINESS_ID)
  const message = authMessage(c.env, (biz?.name as string | undefined) ?? null, payload)
  if (!message) return hookError(400, `This kind of email isn't supported: ${payload.email_data.email_action_type}`)
  // From The Business Agent's own address when Cloudflare Email Sending is on.
  if (c.env.EMAIL) {
    try {
      await c.env.EMAIL.send({ from: SENDER, to: payload.user.email, replyTo: REPLY_TO, subject: message.subject, text: message.text, html: message.html })
      return c.json({})
    } catch (e) {
      // Not set up yet (the plan, the domain) or refused: say so in the logs and send it the old way.
      console.warn(`Cloudflare Email Sending refused a sign-in email, so it goes from a mailbox instead: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  try {
    await sendEmail(c.env, db, { to: payload.user.email, subject: message.subject, text: message.text })
  } catch (e) {
    // Shown to the person who asked (invite, reset…): say what's wrong, not "error sending email".
    return hookError(503, `The email couldn't be sent from the business's mailbox: ${e instanceof Error ? e.message : String(e)}`)
  }
  return c.json({})
})
