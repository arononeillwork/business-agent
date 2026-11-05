// Referral links: https://<site>/?ref=CODE. The sign-up page tells the Worker the link was opened
// (counted, nothing personal kept) and who it's from. No sign-in: it finds the business whose code
// it is, or else the Business Agent rep whose code it is (docs/REPS_PLAN.md). The visitor's new business is put down as referred when they create it (create_business);
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

/** A Business Agent rep by their code (the hq_reps migration): their name, the kinds of business they
 * cover and what their cards offer; counted when asked. Null when it isn't a rep's code. */
async function rep(env: Env, raw: unknown, count: boolean) {
  const code = cleanCode(typeof raw === 'string' ? raw : null)
  if (!code) return null
  const { data } = await serviceClient(env).rpc('rep_by_code', { p_code: code, p_count: count })
  return (data ?? null) as { name: string; categories: string[]; offer: string | null } | null
}

referrals.post('/api/referrals/open', async c => {
  const { code, count } = await c.req.json<{ code?: string; count?: boolean }>().catch(() => ({ code: undefined, count: undefined }))
  const by = await inviter(c.env, code)
  if (by) {
    // The same visit opening the page again isn't counted twice.
    if (count !== false) await businessDb(c.env, by.id).from('referral_opens').insert({})
    return c.json({ business: by.name })
  }
  // Not a business's link: a Business Agent rep's code.
  const r = await rep(c.env, code, count !== false)
  if (r) return c.json({ rep: { name: r.name, categories: r.categories ?? [], offer: r.offer ?? null } })
  return c.json({ error: 'That invite link isn’t valid' }, 404)
})
