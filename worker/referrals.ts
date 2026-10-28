// Referral links: https://<site>/?ref=CODE. The sign-up page tells the Worker the link was opened
// (counted, nothing personal kept) and who it's from. No sign-in: it finds the business whose code
// it is. The visitor's new business is put down as referred when they create it (create_business);
// the referring business's admins see both on the Referrals page (database rules: admins only).
import { Hono } from 'hono'
import { businessDb, serviceClient, type Env } from './supabase'
import { cleanCode } from '../shared/referrals'

export const referrals = new Hono<{ Bindings: Env }>()

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
