// The sign-up check (Supabase's "before user created" hook): off without the Turnstile keys; an email
// sign-up then needs a passed check, outside sign-ins and the Worker's own invites go through, and only
// calls Supabase signed with this hook's own secret are answered.
import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { allowSignUp, inviteMark, NEEDS_CHECK, SIGNUP_HOOK, signupCheck, type NewUser } from './signupCheck'
import { hookSecret } from './authEmail'
import type { Env } from './supabase'

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'pk', SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret' } as Env
const signUp = (user_metadata: NewUser['user']['user_metadata'] = {}, provider = 'email'): NewUser => ({
  metadata: { uuid: 'req-1', ip_address: '203.0.113.9' },
  user: { email: 'New@Cafe.test', app_metadata: { provider }, user_metadata },
})
const turnstile = (success: boolean) => vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
  new Response(JSON.stringify({ success, 'error-codes': success ? [] : ['invalid-input-response'] })))

describe('the sign-up check', () => {
  it('is off until the Turnstile keys are set', async () => {
    expect(await allowSignUp({ ...env, TURNSTILE_SECRET_KEY: undefined }, signUp())).toBe(true)
  })

  it('needs a passed check for an email sign-up, asked of Cloudflare with the person’s address', async () => {
    expect(await allowSignUp(env, signUp())).toBe(NEEDS_CHECK)
    const pass = turnstile(true)
    expect(await allowSignUp(env, signUp({ captcha: 'token-1' }), pass as unknown as typeof fetch)).toBe(true)
    const form = new URLSearchParams(String(pass.mock.calls[0][1]?.body))
    expect(Object.fromEntries(form)).toEqual({ secret: 'secret', response: 'token-1', remoteip: '203.0.113.9', idempotency_key: 'req-1' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await allowSignUp(env, signUp({ captcha: 'used-twice' }), turnstile(false) as unknown as typeof fetch)).toBe(NEEDS_CHECK)
    // Cloudflare unreachable: let it through rather than turn everyone away.
    expect(await allowSignUp(env, signUp({ captcha: 't' }), (async () => { throw new Error('offline') }) as typeof fetch)).toBe(true)
    warn.mockRestore()
  })

  it('lets Google, Microsoft and the other outside sign-ups through, and invites with the Worker’s mark', async () => {
    expect(await allowSignUp(env, signUp({}, 'google'))).toBe(true)
    expect(await allowSignUp(env, signUp({}, 'azure'))).toBe(true)
    expect(await allowSignUp(env, signUp({ invite: await inviteMark('service-key', 'new@cafe.test') }))).toBe(true)
    expect(await allowSignUp(env, signUp({ invite: await inviteMark('service-key', 'someone@else.test') }))).toBe(NEEDS_CHECK)
    expect(await allowSignUp(env, signUp({ invite: 'made-up' }))).toBe(NEEDS_CHECK)
  })

  it('makes the same invite mark as the ops script (scripts/ops/invite.mjs)', async () => {
    const script = createHmac('sha256', 'service-key').update('business-agent:invite:new@cafe.test').digest('base64url')
    expect(await inviteMark('service-key', ' New@Cafe.test ')).toBe(script)
  })

  it('answers only Supabase, signed with this hook’s own secret', async () => {
    const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))
    const call = async (payload: NewUser, label = SIGNUP_HOOK) => {
      const body = JSON.stringify(payload), id = 'msg_1', ts = String(Math.floor(Date.now() / 1000))
      const k = await crypto.subtle.importKey('raw', await hookSecret('service-key', label), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      const sig = b64(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${id}.${ts}.${body}`)))
      return signupCheck.request('/api/auth/before-user-created', {
        method: 'POST', body, headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` },
      }, env)
    }
    const ok = await call(signUp({}, 'google'))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({})
    const refused = await call(signUp())
    expect(refused.status).toBe(400)
    expect(await refused.json()).toEqual({ error: { http_code: 400, message: NEEDS_CHECK } })
    // The sign-in emails' secret doesn't open this one.
    expect((await call(signUp({}, 'google'), 'business-agent:send-email-hook')).status).toBe(401)
  })
})
