// Referral links: https://<site>/?ref=CODE. The sign-up page tells the Worker the link was opened
// (counted, nothing personal kept) and lets the visiting business join the waitlist. No sign-in:
// both routes find the business whose code it is and take only short, plain fields. That business's
// admins read the results on the Referrals page (database rules: admins only).
import { Hono } from 'hono'
import { businessDb, serviceClient, type Env } from './supabase'
import { cleanCode } from '../shared/referrals'

export const referrals = new Hono<{ Bindings: Env }>()

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** The business behind a code, or null when no business has it. */
async function inviter(env: Env, raw: unknown) {
  const code = cleanCode(typeof raw === 'string' ? raw : null)
  if (!code) return null
  const { data } = await serviceClient(env).from('business').select('id, name').eq('referral_code', code).maybeSingle()
  return data ? { id: data.id as number, name: data.name as string } : null
}

referrals.post('/api/referrals/open', async c => {
  const { code, count } = await c.req.json<{ code?: string; count?: boolean }>().catch(() => ({ code: undefined, count: undefined }))
  const by = await inviter(c.env, code)
  if (!by) return c.json({ error: 'That invite link isn’t valid' }, 404)
  // The same visit opening the page again isn't counted twice.
  if (count !== false) await businessDb(c.env, by.id).from('referral_opens').insert({})
  return c.json({ business: by.name })
})

referrals.post('/api/referrals/join', async c => {
  const body = await c.req.json<{ code?: string; business_name?: string; contact_name?: string; email?: string }>().catch(() => ({}))
  const b = body as { code?: string; business_name?: string; contact_name?: string; email?: string }
  const by = await inviter(c.env, b.code)
  if (!by) return c.json({ error: 'That invite link isn’t valid' }, 404)
  const businessName = (b.business_name ?? '').trim()
  const contactName = (b.contact_name ?? '').trim()
  const email = (b.email ?? '').trim().toLowerCase()
  if (!businessName || businessName.length > 120) return c.json({ error: 'Add your business’s name' }, 400)
  if (contactName.length > 120) return c.json({ error: 'That name is too long' }, 400)
  if (!EMAIL.test(email) || email.length > 254) return c.json({ error: 'Add a valid email address' }, 400)
  const { error } = await businessDb(c.env, by.id).from('referrals')
    .insert({ business_name: businessName, contact_name: contactName || null, email })
  // Already on the list: say yes all the same (never reveal who has joined).
  if (error && error.code !== '23505') return c.json({ error: 'Couldn’t add you just now. Try again.' }, 500)
  return c.json({ ok: true })
})
