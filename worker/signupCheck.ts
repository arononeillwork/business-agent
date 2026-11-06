// The check on the sign-up form (Cloudflare Turnstile), so nobody can create accounts by the hundred.
// The form shows Turnstile and sends its answer with the sign-up (user_metadata.captcha). Supabase
// Auth calls this through its "before user created" hook, switched on by the deploy once the Turnstile
// keys are set (scripts/ops/supabase-auth.mjs), and creates the account only if this says yes:
// - an email sign-up needs a passed check;
// - Google, Microsoft, Apple and Facebook sign-ups go through (those already check for a person);
// - an invite from the Team page (or scripts/ops/invite.mjs) carries the Worker's own mark instead.
// Sign-in, sign-in codes and password resets never come here: only a new account does.
//
// Supabase signs each call (Standard Webhooks), with a secret derived from the service key under this
// hook's own label, as the sign-in emails' hook does.
import { Hono } from 'hono'
import type { Env } from './supabase'
import { hookError, verifyHook } from './authEmail'

export const SIGNUP_HOOK = 'business-agent:before-user-created-hook'
const INVITE_MARK = 'business-agent:invite'
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

const enc = new TextEncoder()
const b64url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** The mark an invite carries (user_metadata.invite): only someone with the service key can make it. */
export async function inviteMark(serviceKey: string, email: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(serviceKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`${INVITE_MARK}:${email.trim().toLowerCase()}`)))
}

export interface NewUser {
  metadata?: { uuid?: string; ip_address?: string }
  user: { email?: string; app_metadata?: { provider?: string }; user_metadata?: { captcha?: unknown; invite?: unknown } }
}

export const NEEDS_CHECK = 'Tick the box that shows you’re a person, then create your account again.'

/** Whether Supabase may create this account: true, or what to tell the person. */
export async function allowSignUp(env: Env, p: NewUser, fetchImpl: typeof fetch = fetch): Promise<true | string> {
  if (!env.TURNSTILE_SECRET_KEY) return true
  const provider = p.user.app_metadata?.provider ?? 'email'
  if (provider !== 'email') return true
  const meta = p.user.user_metadata ?? {}
  if (typeof meta.invite === 'string' && env.SUPABASE_SERVICE_ROLE_KEY && p.user.email
      && meta.invite === await inviteMark(env.SUPABASE_SERVICE_ROLE_KEY, p.user.email)) return true
  if (typeof meta.captcha !== 'string' || !meta.captcha) return NEEDS_CHECK
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: meta.captcha })
  if (p.metadata?.ip_address) form.set('remoteip', p.metadata.ip_address)
  if (p.metadata?.uuid) form.set('idempotency_key', p.metadata.uuid)
  try {
    const res = await fetchImpl(SITEVERIFY, { method: 'POST', body: form })
    const out = await res.json() as { success?: boolean; 'error-codes'?: string[] }
    if (out.success) return true
    console.warn(`Sign-up check failed: ${(out['error-codes'] ?? []).join(', ') || res.status}`)
    return NEEDS_CHECK
  } catch (e) {
    // Cloudflare unreachable: let the sign-up through rather than turn everyone away.
    console.warn(`Sign-up check couldn't be verified, so it was let through: ${e instanceof Error ? e.message : String(e)}`)
    return true
  }
}

export const signupCheck = new Hono<{ Bindings: Env }>()

signupCheck.post('/api/auth/before-user-created', async c => {
  const body = await c.req.text()
  if (!c.env.SUPABASE_SERVICE_ROLE_KEY || !await verifyHook(c.env.SUPABASE_SERVICE_ROLE_KEY, c.req.raw.headers, body, Date.now(), SIGNUP_HOOK)) {
    return hookError(401, 'Invalid signature')
  }
  const verdict = await allowSignUp(c.env, JSON.parse(body) as NewUser)
  return verdict === true ? c.json({}) : hookError(400, verdict)
})
