// Business Agent's own subscription, paid through Stripe Billing (the platform's Stripe account,
// STRIPE_SECRET_KEY). Admins pick a plan on the Billing page → Stripe Checkout takes the card →
// Stripe charges it every month or year. The top plan starts with a 2-month free trial: the card
// is taken at the start and first charged when the trial ends. Stripe tells us about every change
// (webhook, below) and the nightly job checks again, so the `billing` row always follows Stripe;
// the database then decides what the business can use (public.current_plan(): a trial that ended
// unpaid or a failed renewal means Free until the payment goes through).
import { Hono, type Context } from 'hono'
import { bearer, serviceClient, userClient, type Env } from './supabase'
import { PLANS, TRIAL_DAYS, plan as planById, type Interval, type PlanId } from '../shared/plans'

// Pinned so the subscription has the shape read below, whatever the account's default version is.
const STRIPE_VERSION = '2024-06-20'
export const BILLING_EVENTS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated',
  'customer.subscription.deleted', 'customer.subscription.trial_will_end', 'invoice.paid', 'invoice.payment_failed']

interface Form { [key: string]: string | number | boolean | null | undefined | Form | Form[] | string[] }

/** Stripe's form encoding: nested objects and arrays as a[b][0]=c. */
export function encodeForm(data: Form, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (Array.isArray(v)) v.forEach((item, i) => typeof item === 'object' ? encodeForm(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item)))
    else if (typeof v === 'object') encodeForm(v, key, out)
    else out.append(key, String(v))
  }
  return out
}

async function stripe<T>(env: Env, method: 'GET' | 'POST', path: string, body?: Form, idempotencyKey?: string): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Billing is not set up yet (STRIPE_SECRET_KEY).')
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method, body: body ? encodeForm(body) : undefined,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': STRIPE_VERSION,
      ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
  })
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(`Stripe: ${json.error?.message ?? res.status}`)
  return json
}

interface Price { id: string; unit_amount: number; lookup_key: string | null; recurring: { interval: Interval } | null }
interface Subscription {
  id: string; status: string; customer: string; trial_end: number | null; current_period_end: number | null; cancel_at_period_end: boolean
  created: number; items: { data: { id: string; price: Price }[] }
}
interface BillingRow { plan: PlanId; status: string; stripe_customer_id: string | null; stripe_subscription_id: string | null; trial_used: boolean; complimentary?: string | null }

const lookupKey = (p: PlanId, i: Interval) => `business_agent_${p}_${i}`
const fromLookup = (key: string | null) => {
  const m = /^business_agent_(\w+)_(month|year)$/.exec(key ?? '')
  return m && PLANS.some(p => p.id === m[1]) ? { plan: m[1] as PlanId, interval: m[2] as Interval } : null
}

/**
 * The Stripe price for a plan, made the first time it's needed. Prices are found by lookup key, so
 * changing an amount in shared/plans.ts makes a new price that takes the key over (existing
 * subscribers keep theirs until they change plan).
 */
async function priceFor(env: Env, id: PlanId, interval: Interval): Promise<string> {
  const p = planById(id)
  const cents = Math.round((interval === 'month' ? p.monthly : p.yearly) * 100)
  const key = lookupKey(id, interval)
  const found = await stripe<{ data: Price[] }>(env, 'GET', `/prices?active=true&lookup_keys[]=${key}`)
  if (found.data[0]?.unit_amount === cents) return found.data[0].id
  const products = await stripe<{ data: { id: string }[] }>(env, 'GET', `/products/search?query=${encodeURIComponent(`metadata['business_agent_plan']:'${id}'`)}`)
  const product = products.data[0]?.id ?? (await stripe<{ id: string }>(env, 'POST', '/products', {
    name: `Business Agent ${p.name}`, metadata: { business_agent_plan: id },
  })).id
  const price = await stripe<Price>(env, 'POST', '/prices', {
    product, currency: 'eur', unit_amount: cents, recurring: { interval }, tax_behavior: 'exclusive',
    lookup_key: key, transfer_lookup_key: true, metadata: { business_agent_plan: id },
  })
  // The old amount comes off sale (subscribers already on it keep it; Stripe never deletes a used price).
  if (found.data[0]) await stripe(env, 'POST', `/prices/${found.data[0].id}`, { active: false })
  return price.id
}

const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null)

/** Copy the business's subscription from Stripe into `billing`. Safe to run any time. */
export async function syncBilling(env: Env): Promise<void> {
  if (!env.STRIPE_SECRET_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return
  const db = serviceClient(env)
  const { data: row } = await db.from('billing').select('plan, status, stripe_customer_id, stripe_subscription_id, trial_used').eq('id', 1).single<BillingRow>()
  // Complimentary accounts are ours to set; Stripe never changes them.
  if (!row?.stripe_customer_id || row.status === 'comped') return
  const subs = await stripe<{ data: Subscription[] }>(env, 'GET', `/subscriptions?customer=${row.stripe_customer_id}&status=all&limit=10`)
  // The live one if there is one, else the most recent.
  const live = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']
  const sub = subs.data.find(s => live.includes(s.status)) ?? subs.data.sort((a, b) => b.created - a.created)[0]
  if (!sub) {
    // Checkout opened but never finished: nothing changes (a given-free business stays given-free).
    return
  }
  const item = sub.items.data[0]
  const chosen = fromLookup(item?.price.lookup_key ?? null)
  const { error } = await db.from('billing').update({
    plan: chosen?.plan ?? row.plan,
    status: sub.status,
    billing_interval: chosen?.interval ?? item?.price.recurring?.interval ?? null,
    stripe_subscription_id: sub.id,
    trial_ends_at: iso(sub.trial_end),
    current_period_end: iso(sub.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end,
    trial_used: row.trial_used || !!sub.trial_end,
    updated_at: new Date().toISOString(),
  }).eq('id', 1)
  if (error) throw new Error(error.message)
  if (['active', 'trialing'].includes(sub.status) && chosen) await creditReferralMonths(env, row.stripe_customer_id, chosen.plan, chosen.interval)
}

/** One month of a plan, in cents, at the rate the business pays (a twelfth of the year on yearly). */
export const monthCents = (id: PlanId, interval: Interval) =>
  Math.round((interval === 'year' ? planById(id).yearly / 12 : planById(id).monthly) * 100)

/**
 * Referral months still owed go onto the Stripe customer's balance as credit, which Stripe takes
 * off the next invoices by itself (the first one after a trial included). Each month is sent once:
 * its own idempotency key, and the count kept in billing.referral_months_applied.
 */
async function creditReferralMonths(env: Env, customer: string, id: PlanId, interval: Interval) {
  const db = serviceClient(env)
  const [{ data: earned }, { data: b }] = await Promise.all([
    db.rpc('referral_months_earned'),
    db.from('billing').select('referral_months_applied').eq('id', 1).single<{ referral_months_applied: number }>(),
  ])
  const owed = Number(earned ?? 0)
  let applied = b?.referral_months_applied ?? 0
  if (owed <= applied || id === 'free') return
  const amount = monthCents(id, interval)
  for (let n = applied + 1; n <= owed; n++) {
    await stripe(env, 'POST', `/customers/${customer}/balance_transactions`, {
      amount: -amount, currency: 'eur', description: `Referral: a month of Business Agent ${planById(id).name} free (${n})`,
      metadata: { business_agent_referral_month: n },
    }, `business-agent-referral-${customer}-${n}`)
    applied = n
    const { error } = await db.from('billing').update({ referral_months_applied: applied, updated_at: new Date().toISOString() }).eq('id', 1)
    if (error) throw new Error(error.message)
  }
}

// ---------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------
export const billing = new Hono<{ Bindings: Env; Variables: { userId: string; email: string } }>()

/** Admins only (except the webhook, which Stripe calls). */
billing.use('/api/billing/*', async (c, next) => {
  if (c.req.path === '/api/billing/webhook') return next()
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const sb = userClient(c.env, token, 'app')
  const [{ data: user }, { data: isAdmin }] = await Promise.all([sb.auth.getUser(token), sb.rpc('is_admin')])
  if (!user.user || !isAdmin) return c.json({ error: 'Only an admin can manage billing' }, 403)
  c.set('userId', user.user.id)
  c.set('email', user.user.email ?? '')
  await next()
})

const row = async (env: Env) => {
  const { data, error } = await serviceClient(env).from('billing').select('*').eq('id', 1).single()
  if (error) throw new Error(error.message)
  return data as BillingRow & Record<string, unknown>
}

const view = (r: Record<string, unknown>, env: Env) => ({
  plan: r.plan, status: r.status, interval: r.billing_interval ?? null, trial_ends_at: r.trial_ends_at ?? null,
  current_period_end: r.current_period_end ?? null, cancel_at_period_end: !!r.cancel_at_period_end, trial_used: !!r.trial_used,
  has_customer: !!r.stripe_customer_id, ready: !!env.STRIPE_SECRET_KEY,
  complimentary: r.complimentary ?? null, complimentary_note: r.complimentary_note ?? null,
  referral_months_applied: Number(r.referral_months_applied ?? 0), referred_by: r.referred_by ?? null,
})

billing.get('/api/billing', async c => c.json(view(await row(c.env), c.env)))

/** After Checkout (or any time): read Stripe again, then answer like GET. */
billing.post('/api/billing/sync', async c => {
  await syncBilling(c.env)
  return c.json(view(await row(c.env), c.env))
})

async function customerFor(c: Context<{ Bindings: Env; Variables: { userId: string; email: string } }>, r: BillingRow) {
  if (r.stripe_customer_id) return r.stripe_customer_id
  const db = serviceClient(c.env)
  const { data: biz } = await db.from('business').select('name, email').eq('id', 1).maybeSingle()
  const customer = await stripe<{ id: string }>(c.env, 'POST', '/customers', {
    name: biz?.name ?? undefined, email: biz?.email || c.get('email') || undefined,
    metadata: { business_agent_site: new URL(c.req.url).host, business_id: c.env.BUSINESS_ID },
  })
  await db.from('billing').update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() }).eq('id', 1)
  return customer.id
}

/**
 * Choose a plan. New subscribers go to Stripe Checkout (the top plan with its free trial, once per
 * business). Someone already paying moves to the new plan straight away (prorated). Free: cancel
 * through the portal, at the end of the period.
 */
billing.post('/api/billing/checkout', async c => {
  const body = await c.req.json<{ plan?: PlanId; interval?: Interval }>().catch(() => ({} as { plan?: PlanId; interval?: Interval }))
  const target = PLANS.find(p => p.id === body.plan && p.id !== 'free')
  const interval: Interval = body.interval === 'year' ? 'year' : 'month'
  if (!target) return c.json({ error: 'Choose a paid plan' }, 400)
  const r = await row(c.env)
  if (r.status === 'comped') return c.json({ error: 'This business already has the top plan, free. Nothing to pay.' }, 409)
  const origin = new URL(c.req.url).origin
  const price = await priceFor(c.env, target.id, interval)

  if (r.stripe_subscription_id && ['active', 'trialing'].includes(r.status)) {
    const sub = await stripe<Subscription>(c.env, 'GET', `/subscriptions/${r.stripe_subscription_id}`)
    if (['active', 'trialing'].includes(sub.status)) {
      await stripe(c.env, 'POST', `/subscriptions/${sub.id}`, {
        items: [{ id: sub.items.data[0].id, price }], proration_behavior: 'create_prorations', cancel_at_period_end: false,
      })
      await syncBilling(c.env)
      return c.json({ changed: true })
    }
  }
  const customer = await customerFor(c, r)
  const trial = target.trial && !r.trial_used
  const session = await stripe<{ url: string }>(c.env, 'POST', '/checkout/sessions', {
    mode: 'subscription', customer, line_items: [{ price, quantity: 1 }],
    // The card is always taken, so the first payment happens by itself when the trial ends;
    // a trial without a card on file is cancelled rather than left running.
    payment_method_collection: 'always',
    subscription_data: {
      metadata: { business_agent_plan: target.id },
      ...(trial ? { trial_period_days: TRIAL_DAYS, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } } : {}),
    },
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    customer_update: { name: 'auto', address: 'auto' },
    success_url: `${origin}/account/billing?checkout=done`,
    cancel_url: `${origin}/account/billing?checkout=cancelled`,
  })
  return c.json({ url: session.url })
})

/** Stripe's own page to change the card, see invoices or cancel. */
billing.post('/api/billing/portal', async c => {
  const r = await row(c.env)
  if (!r.stripe_customer_id) return c.json({ error: 'There is no subscription yet. Choose a plan first.' }, 400)
  const return_url = `${new URL(c.req.url).origin}/account/billing`
  const open = () => stripe<{ url: string }>(c.env, 'POST', '/billing_portal/sessions', { customer: r.stripe_customer_id!, return_url })
  try {
    return c.json({ url: (await open()).url })
  } catch (e) {
    if (!/configuration/i.test(String(e))) throw e
    // First use on this Stripe account: save a portal set-up (card, invoices, cancel at period end).
    await stripe(c.env, 'POST', '/billing_portal/configurations', {
      business_profile: { headline: 'Business Agent: manage your subscription' },
      features: {
        payment_method_update: { enabled: true }, invoice_history: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ['name', 'email', 'address', 'tax_id'] },
        subscription_cancel: { enabled: true, mode: 'at_period_end' },
      },
    })
    return c.json({ url: (await open()).url })
  }
})

/**
 * Stripe → us. Nothing in the body is trusted: the event is fetched back from Stripe with our
 * secret key (so only real events count), then the subscription is read again.
 */
billing.post('/api/billing/webhook', async c => {
  const { id } = await c.req.json<{ id?: string }>().catch(() => ({ id: undefined }))
  if (!id || !/^evt_\w+$/.test(id)) return c.json({ error: 'Not a Stripe event' }, 400)
  const event = await stripe<{ type: string; data: { object: { customer?: string } } }>(c.env, 'GET', `/events/${id}`).catch(() => null)
  if (!event) return c.json({ error: 'Unknown event' }, 400)
  if (!BILLING_EVENTS.includes(event.type)) return c.json({ ok: true, ignored: event.type })
  const r = await row(c.env)
  if (!r.stripe_customer_id || event.data.object.customer !== r.stripe_customer_id) return c.json({ ok: true, ignored: 'another customer' })
  await syncBilling(c.env)
  return c.json({ ok: true })
})

interface PlanStatus { plan: PlanId; limits: { people: number | null; features: string[] }; usage: { people: number } }

/** Before adding someone: a plain reason the plan doesn't allow it, or null. (The database checks too.) */
export async function planBlocksInvite(env: Env, role: string): Promise<string | null> {
  const { data } = await serviceClient(env).rpc('plan_status')
  const s = data as PlanStatus | null
  if (!s) return null
  const needs = (f: string) => planById(PLANS.find(p => p.features.includes(f as never))?.id).name
  if (role === 'partner' && !s.limits.features.includes('partners')) return `Partner access needs the ${needs('partners')} plan. Upgrade on the Billing page.`
  if (role === 'kiosk' && !s.limits.features.includes('kiosk')) return `The clock-in tablet needs the ${needs('kiosk')} plan or higher. Upgrade on the Billing page.`
  if (['admin', 'employee'].includes(role) && s.limits.people !== null && s.usage.people >= s.limits.people) {
    return `Your plan includes ${s.limits.people} people, and the team is full. Switch someone off, or upgrade on the Billing page.`
  }
  return null
}

/** The plan features in force right now (for the background jobs). */
export async function planFeatures(env: Env): Promise<Set<string>> {
  const { data } = await serviceClient(env).rpc('plan_status')
  return new Set((data as PlanStatus | null)?.limits.features ?? [])
}
