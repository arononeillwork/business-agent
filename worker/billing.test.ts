// Business Agent's own subscription, through the Worker's billing routes against stand-ins for
// Supabase and Stripe. What must never break:
//   - the top plan's 2-month trial takes a card up front, once per business
//   - Stripe's state is copied faithfully, so an unpaid trial or failed renewal loses the paid plan
//   - webhooks are only believed after fetching the event back from Stripe
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { billing, encodeForm, syncBilling } from './billing'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { TRIAL_DAYS } from '../shared/plans'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  STRIPE_SECRET_KEY: 'sk_test_platform',
} as unknown as Env

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
type Sub = { id: string; status: string; customer: string; trial_end: number | null; current_period_end: number; cancel_at_period_end: boolean; created: number;
  items: { data: { id: string; price: { id: string; unit_amount: number; lookup_key: string; recurring: { interval: string } } }[] } }

/** Just enough of Stripe: prices by lookup key, products, customers, Checkout, subscriptions, events. */
class FakeStripe {
  prices: { id: string; unit_amount: number; lookup_key: string; recurring: { interval: string }; active: boolean }[] = []
  products: { id: string; plan: string }[] = []
  checkouts: URLSearchParams[] = []
  subs: Sub[] = []
  events = new Map<string, { type: string; data: { object: { customer: string } } }>()
  /** Customer balance credits, by idempotency key (a repeated key is the same transaction, as on Stripe). */
  credits = new Map<string, { customer: string; amount: number; description: string }>()
  handle(url: string, init?: RequestInit): Response | null {
    const u = new URL(url)
    if (u.host !== 'api.stripe.com') return null
    if (new Headers(init?.headers).get('authorization') !== 'Bearer sk_test_platform') return json({ error: { message: 'Invalid API Key' } }, 401)
    const body = new URLSearchParams(String(init?.body ?? ''))
    const path = u.pathname.replace('/v1', '')
    const method = init?.method ?? 'GET'
    if (path === '/prices' && method === 'GET') return json({ data: this.prices.filter(p => p.active && p.lookup_key === u.searchParams.get('lookup_keys[]')) })
    if (path === '/products/search') return json({ data: this.products.filter(p => u.searchParams.get('query')!.includes(`'${p.plan}'`)) })
    if (path === '/products') { const p = { id: `prod_${this.products.length + 1}`, plan: body.get('metadata[business_agent_plan]')! }; this.products.push(p); return json(p) }
    if (path === '/prices') {
      if (body.get('transfer_lookup_key') === 'true') for (const p of this.prices) if (p.lookup_key === body.get('lookup_key')) p.active = false
      const p = { id: `price_${this.prices.length + 1}`, unit_amount: Number(body.get('unit_amount')), lookup_key: body.get('lookup_key')!,
        recurring: { interval: body.get('recurring[interval]')! }, active: true }
      this.prices.push(p)
      return json(p)
    }
    if (path === '/customers') return json({ id: 'cus_1' })
    if (path === '/checkout/sessions') { this.checkouts.push(body); return json({ url: 'https://checkout.stripe.com/c/pay/cs_1' }) }
    if (path === '/subscriptions') return json({ data: this.subs.filter(s => s.customer === u.searchParams.get('customer')) })
    const sub = /^\/subscriptions\/(\w+)$/.exec(path)
    if (sub) {
      const s = this.subs.find(x => x.id === sub[1])!
      if (method === 'POST') {
        const price = this.prices.find(p => p.id === body.get('items[0][price]'))!
        s.items.data[0].price = { id: price.id, unit_amount: price.unit_amount, lookup_key: price.lookup_key, recurring: price.recurring }
      }
      return json(s)
    }
    const ev = /^\/events\/(\w+)$/.exec(path)
    if (ev) return this.events.has(ev[1]) ? json({ id: ev[1], ...this.events.get(ev[1]) }) : json({ error: { message: 'No such event' } }, 404)
    const bal = /^\/customers\/(\w+)\/balance_transactions$/.exec(path)
    if (bal) {
      const key = new Headers(init?.headers).get('idempotency-key') ?? `no-key-${this.credits.size}`
      if (!this.credits.has(key)) this.credits.set(key, { customer: bal[1], amount: Number(body.get('amount')), description: body.get('description')! })
      return json({ id: `cbtxn_${this.credits.size}`, ...this.credits.get(key) })
    }
    if (path === '/billing_portal/sessions') return json({ url: 'https://billing.stripe.com/p/session/1' })
    return json({ error: { message: `fake Stripe: ${method} ${path}` } }, 404)
  }
  /** Stripe's side of a finished Checkout for a plan. */
  subscribe(lookup: string, status: string, trialEnd: Date | null) {
    const price = this.prices.find(p => p.lookup_key === lookup && p.active)!
    this.subs = [{ id: 'sub_1', status, customer: 'cus_1', trial_end: trialEnd && Math.floor(+trialEnd / 1000), current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
      cancel_at_period_end: false, created: 1, items: { data: [{ id: 'si_1', price: { id: price.id, unit_amount: price.unit_amount, lookup_key: lookup, recurring: price.recurring } }] } }]
  }
}

let db: FakeSupabase
let stripe: FakeStripe
beforeEach(() => {
  db = new FakeSupabase()
  db.tables.billing = [{ id: 1, plan: 'free', status: 'none', stripe_customer_id: null, stripe_subscription_id: null, trial_used: false, cancel_at_period_end: false }]
  stripe = new FakeStripe()
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? stripe.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const headers = (who: 'admin' | 'staff') => ({ authorization: `Bearer ${who}-token`, 'content-type': 'application/json' })
const post = (path: string, body: unknown = {}, who: 'admin' | 'staff' = 'admin') =>
  billing.request(`${APP}${path}`, { method: 'POST', headers: headers(who), body: JSON.stringify(body) }, env)
const row = () => db.table('billing')[0]

describe('choosing a plan', () => {
  it('Business: Stripe Checkout with the card taken now and a 60-day trial; prices made once, in euros', async () => {
    const res = await post('/api/billing/checkout', { plan: 'business', interval: 'month' })
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_1' })
    const c = stripe.checkouts[0]
    expect(c.get('mode')).toBe('subscription')
    expect(c.get('customer')).toBe('cus_1')
    expect(c.get('payment_method_collection')).toBe('always')
    expect(c.get('subscription_data[trial_period_days]')).toBe(String(TRIAL_DAYS))
    expect(c.get('subscription_data[trial_settings][end_behavior][missing_payment_method]')).toBe('cancel')
    expect(stripe.prices).toEqual([expect.objectContaining({ unit_amount: 12900, lookup_key: 'business_agent_business_month' })])
    expect(row().stripe_customer_id).toBe('cus_1')
    await post('/api/billing/checkout', { plan: 'business', interval: 'month' })
    expect(stripe.prices).toHaveLength(1)
  })

  it('no second trial, and no trial on the other plans', async () => {
    await post('/api/billing/checkout', { plan: 'pro', interval: 'year' })
    expect(stripe.checkouts[0].get('subscription_data[trial_period_days]')).toBeNull()
    expect(stripe.prices[0]).toMatchObject({ unit_amount: 79000, lookup_key: 'business_agent_pro_year' })
    Object.assign(row(), { trial_used: true })
    await post('/api/billing/checkout', { plan: 'business', interval: 'month' })
    expect(stripe.checkouts[1].get('subscription_data[trial_period_days]')).toBeNull()
  })

  it('a complimentary account (founding, friends & family) has nothing to pay, and Stripe never changes it', async () => {
    Object.assign(row(), { plan: 'business', status: 'comped', complimentary: 'friends_family', stripe_customer_id: 'cus_1' })
    expect((await post('/api/billing/checkout', { plan: 'business', interval: 'month' })).status).toBe(409)
    expect(await (await billing.request(`${APP}/api/billing`, { headers: headers('admin') }, env)).json())
      .toMatchObject({ plan: 'business', status: 'comped', complimentary: 'friends_family' })
    stripe.subs = [{ ...({} as Sub), id: 'sub_old', status: 'canceled', customer: 'cus_1', trial_end: null, current_period_end: 0, cancel_at_period_end: false, created: 1,
      items: { data: [{ id: 'si', price: { id: 'p', unit_amount: 2500, lookup_key: 'business_agent_starter_month', recurring: { interval: 'month' } } }] } }]
    await syncBilling(env)
    expect(row()).toMatchObject({ plan: 'business', status: 'comped' })
  })

  it('bosses only, not a shop manager; Free is not something to check out', async () => {
    expect((await post('/api/billing/checkout', { plan: 'business' }, 'staff')).status).toBe(403)
    db.people.set('manager-token', { id: 'admin-2', role: 'admin' }) // Maria: an admin without pay access
    const manager = await billing.request(`${APP}/api/billing`, { headers: { authorization: 'Bearer manager-token' } }, env)
    expect(manager.status).toBe(403)
    expect(await manager.json()).toEqual({ error: 'Only a boss can manage billing' })
    expect((await post('/api/billing/checkout', { plan: 'free' })).status).toBe(400)
  })

  it('already paying: moves the subscription to the new plan instead of a second one', async () => {
    await post('/api/billing/checkout', { plan: 'pro', interval: 'month' })
    stripe.subscribe('business_agent_pro_month', 'active', null)
    await syncBilling(env)
    expect(row()).toMatchObject({ plan: 'pro', status: 'active' })
    expect(await (await post('/api/billing/checkout', { plan: 'business', interval: 'month' })).json()).toEqual({ changed: true })
    expect(stripe.checkouts).toHaveLength(1)
    expect(row()).toMatchObject({ plan: 'business', status: 'active' })
  })
})

describe('following Stripe', () => {
  beforeEach(async () => { await post('/api/billing/checkout', { plan: 'business', interval: 'month' }) })

  it('a webhook is only believed once the event is fetched back from Stripe', async () => {
    const trialEnd = new Date(Date.now() + TRIAL_DAYS * 86400_000)
    stripe.subscribe('business_agent_business_month', 'trialing', trialEnd)
    const hook = (body: unknown) => billing.request(`${APP}/api/billing/webhook`, { method: 'POST', body: JSON.stringify(body) }, env)
    expect((await hook({ id: 'evt_forged', type: 'customer.subscription.updated' })).status).toBe(400)
    expect(row().status).toBe('none')
    stripe.events.set('evt_1', { type: 'customer.subscription.created', data: { object: { customer: 'cus_1' } } })
    expect((await hook({ id: 'evt_1' })).status).toBe(200)
    expect(row()).toMatchObject({ plan: 'business', status: 'trialing', trial_used: true, stripe_subscription_id: 'sub_1', trial_ends_at: new Date(Math.floor(+trialEnd / 1000) * 1000).toISOString() })
  })

  it('the trial ends and the card is declined: Stripe says past_due, and so does the business', async () => {
    stripe.subscribe('business_agent_business_month', 'past_due', new Date(Date.now() - 3600_000))
    stripe.events.set('evt_2', { type: 'invoice.payment_failed', data: { object: { customer: 'cus_1' } } })
    await billing.request(`${APP}/api/billing/webhook`, { method: 'POST', body: JSON.stringify({ id: 'evt_2' }) }, env)
    expect(row()).toMatchObject({ plan: 'business', status: 'past_due' })
  })

  it('events for other Stripe customers change nothing', async () => {
    stripe.subscribe('business_agent_business_month', 'canceled', null)
    stripe.events.set('evt_3', { type: 'customer.subscription.deleted', data: { object: { customer: 'cus_someone_else' } } })
    await billing.request(`${APP}/api/billing/webhook`, { method: 'POST', body: JSON.stringify({ id: 'evt_3' }) }, env)
    expect(row().status).toBe('none')
  })

  it('the portal opens for a business with a Stripe customer', async () => {
    expect(await (await post('/api/billing/portal')).json()).toEqual({ url: 'https://billing.stripe.com/p/session/1' })
  })
})

describe('referral months as Stripe credit', () => {
  beforeEach(async () => { await post('/api/billing/checkout', { plan: 'pro', interval: 'month' }) })
  const setUp = (n: number) => { db.tables.referrals = Array.from({ length: n }, (_, i) => ({ id: `r${i}`, email: `c${i}@test.es`, set_up_at: '2026-10-01T00:00:00Z' })) }

  it('each month earned goes on the bill once, worth a month of the plan, and only while there is a subscription', async () => {
    setUp(2)
    await syncBilling(env)
    expect(stripe.credits.size).toBe(0) // nothing to pay yet: kept for later
    stripe.subscribe('business_agent_pro_month', 'trialing', new Date(Date.now() + 86400_000))
    await syncBilling(env)
    expect([...stripe.credits.values()]).toEqual([
      { customer: 'cus_1', amount: -7900, description: 'Referral: a month of Business Agent Pro free (1)' },
      { customer: 'cus_1', amount: -7900, description: 'Referral: a month of Business Agent Pro free (2)' },
    ])
    expect(row().referral_months_applied).toBe(2)
    await syncBilling(env)
    expect(stripe.credits.size).toBe(2) // no double credit
    setUp(3)
    Object.assign(row(), { referred_month: true })
    await syncBilling(env)
    expect(stripe.credits.size).toBe(4)
    expect(row().referral_months_applied).toBe(4)
  })

  it('a month at the yearly rate on yearly billing; capped at 12 referrals', async () => {
    await post('/api/billing/checkout', { plan: 'business', interval: 'year' })
    stripe.subscribe('business_agent_business_year', 'active', null)
    setUp(15)
    await syncBilling(env)
    expect(stripe.credits.size).toBe(12)
    expect([...stripe.credits.values()][0].amount).toBe(-10750) // €1,290 / 12
  })

  it('a key already sent (a crash after Stripe took it) is not credited twice', async () => {
    stripe.subscribe('business_agent_pro_month', 'active', null)
    setUp(1)
    stripe.credits.set('business-agent-referral-cus_1-1', { customer: 'cus_1', amount: -7900, description: 'earlier' })
    await syncBilling(env)
    expect(stripe.credits.size).toBe(1)
    expect(row().referral_months_applied).toBe(1)
  })
})

it('encodes nested form fields the way Stripe expects', () => {
  expect(encodeForm({ a: 1, line_items: [{ price: 'p', quantity: 1 }], b: { c: { d: 'x' } }, skip: undefined }).toString())
    .toBe('a=1&line_items%5B0%5D%5Bprice%5D=p&line_items%5B0%5D%5Bquantity%5D=1&b%5Bc%5D%5Bd%5D=x')
})
