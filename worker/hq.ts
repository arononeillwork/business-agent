// The Business Agent's back-office in the Worker (the Businesses page, HQ's admins only): what needs
// Stripe. Extending a business's free trial moves its Stripe subscription's trial end later, then billing
// follows Stripe again (extendTrial in worker/billing.ts). Making a business complimentary is the
// database's (public.hq_set_complimentary(), the hq_actions migration), called from the app.
import { Hono } from 'hono'
import { bearer, userClient, type Env } from './supabase'
import { extendTrial } from './billing'
import { isTrialExtension } from '../shared/hqActions'

export const hq = new Hono<{ Bindings: Env }>()

/** HQ's active admins only (public.is_hq_admin(), asked as whoever signed in). */
hq.use('/api/hq/*', async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const { data, error } = await userClient(c.env, token, 'app').rpc('is_hq_admin')
  if (error || data !== true) return c.json({ error: 'Only The Business Agent HQ’s admins can do that' }, 403)
  await next()
})

/** A business's free trial, 7, 14 or 30 days longer. */
hq.post('/api/hq/businesses/:id/extend-trial', async c => {
  const id = Number(c.req.param('id'))
  const { days } = await c.req.json<{ days?: unknown }>().catch(() => ({ days: undefined }))
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'No such business' }, 404)
  if (!isTrialExtension(days)) return c.json({ error: 'A trial can be extended by 7, 14 or 30 days' }, 400)
  const done = await extendTrial(c.env, id, days)
  return 'error' in done ? c.json({ error: done.error }, done.status) : c.json(done)
})
