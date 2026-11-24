// The coffee club (worker/coffeeClub.ts) against stand-ins for Supabase and Square. What must never break:
//   - only admins, and only while Square is the connected till; an older connection is asked to connect again
//   - setting it up makes the plan, its price, the discount and the checkout page in Square once (a retry makes
//     nothing twice); a new price is a new variation and checkout page, members on the old one still count
//   - a sale with the club's discount counts once, against the member added to it, at most the week's coffees;
//     one that can't be counted is kept with why, for an admin
//   - the note on the till: the club's line first, the team's own lines kept, written only when it changes
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { coffeeClubEvent, coffeeClubRoutes, siteClub, syncCoffeeClub, RECONNECT } from './coffeeClub'
import { businessDb, type Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import type { CoffeeClubState } from '../shared/coffeeClub'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', SQUARE_APP_ID: 'sq-app', SQUARE_APP_SECRET: 'sq-secret', SQUARE_WEBHOOK_SIGNATURE_KEY: 'sq-hook-key',
} as unknown as Env

let db: FakeSupabase
let apis: FakeProviders
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

// Wednesday 25 November 2026, 11:00 in Madrid: the week began on Monday the 23rd.
const NOW = Date.parse('2026-11-25T10:00:00Z')
beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  db = new FakeSupabase()
  apis = new FakeProviders()
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const as = (who: 'admin' | 'staff') => ({ authorization: `Bearer ${who}-token`, 'content-type': 'application/json' })
const get = (path: string, who: 'admin' | 'staff' = 'admin') => coffeeClubRoutes.request(`${APP}${path}`, { headers: as(who) }, env, ctx())
const post = (path: string, body: unknown = {}) => coffeeClubRoutes.request(`${APP}${path}`, { method: 'POST', headers: as('admin'), body: JSON.stringify(body) }, env, ctx())
const club = (more: Row = {}) => ({ name: 'Coffee club', price: 10, coffees_per_week: 1, max_value: 5, till_language: 'en', selling: true, key: 'key-one-1', ...more })
const b1 = () => businessDb(env, 1)

async function connectSquare() {
  const start = await integrations.request(`${APP}/api/integrations/square/start`, { method: 'POST', headers: as('admin'), body: '{}' }, env, ctx())
  const state = new URL((await start.json() as { url: string }).url).searchParams.get('state')!
  const res = await integrations.request(`${APP}/api/integrations/square/callback?code=c&state=${encodeURIComponent(state)}`, {}, env, ctx())
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe('square')
}

/** Set up at €10 a month, a coffee a week; returns what Square has. */
async function setUp() {
  await connectSquare()
  const res = await post('/api/coffee-club', club())
  expect(res.status).toBe(200)
  const row = db.tables.coffee_club[0]
  return { row, discount: row.square_discount_id as string, variation: row.square_variation_id as string }
}

const sub = (id: string, customer: string, variation: string, more: Row = {}) =>
  ({ id, location_id: 'L1', plan_variation_id: variation, customer_id: customer, status: 'ACTIVE', start_date: '2026-11-01', charged_through_date: '2026-12-01', ...more })
/** A completed sale with the club's discount on a flat white (and a croissant charged as usual). */
const sale = (id: string, customer: string | null, discount: string, closed = '2026-11-25T09:30:00Z', more: Row = {}) => ({
  id, state: 'COMPLETED', location_id: 'L1', closed_at: closed, ...(customer ? { customer_id: customer } : {}),
  discounts: [{ uid: `d-${id}`, catalog_object_id: discount, scope: 'LINE_ITEM', applied_money: { amount: 380 } }],
  line_items: [
    { uid: `li-${id}`, name: 'Flat White', variation_name: 'Regular', quantity: '1', applied_discounts: [{ discount_uid: `d-${id}`, applied_money: { amount: 380 } }] },
    { uid: `cr-${id}`, name: 'Croissant', quantity: '1' },
  ],
  ...more,
})
const completed = (orderId: string) => ({ merchant_id: 'M1', type: 'order.updated', data: { object: { order_updated: { order_id: orderId, state: 'COMPLETED' } } } })
const state = async () => (await (await get('/api/coffee-club')).json()) as CoffeeClubState

describe('The coffee club page', () => {
  it('admins only, and only while Square is connected', async () => {
    expect((await get('/api/coffee-club')).status).toBe(409)
    await connectSquare()
    expect((await get('/api/coffee-club', 'staff')).status).toBe(403)
    expect((await coffeeClubRoutes.request(`${APP}/api/coffee-club`, {}, env, ctx())).status).toBe(401)
    expect(await state()).toMatchObject({ status: 'not_set_up', club: null, members: [], week: '2026-11-23' })
  })

  it('sets the club up in Square once: the plan at €10 a month, the discount (the drink, up to €5) and the checkout page', async () => {
    await connectSquare()
    expect((await (await post('/api/coffee-club', club({ price: 0 }))).json() as { error: string }).error).toMatch(/price/)
    expect((await post('/api/coffee-club', club({ key: 'x' }))).status).toBe(400)
    const res = await post('/api/coffee-club', club())
    expect(res.status).toBe(200)
    const s = await res.json() as CoffeeClubState
    const [plan, variation, discount] = apis.square.catalogObjects
    expect(plan).toMatchObject({ type: 'SUBSCRIPTION_PLAN', subscription_plan_data: { name: 'Coffee club' } })
    expect(variation).toMatchObject({ type: 'SUBSCRIPTION_PLAN_VARIATION', subscription_plan_variation_data: {
      subscription_plan_id: plan.id, phases: [{ ordinal: 0, cadence: 'MONTHLY', pricing: { type: 'STATIC', price_money: { amount: 1000, currency: 'EUR' } } }] } })
    expect(discount).toMatchObject({ type: 'DISCOUNT', discount_data: { name: 'Coffee club', discount_type: 'FIXED_PERCENTAGE', percentage: '100',
      maximum_amount_money: { amount: 500, currency: 'EUR' } } })
    expect(apis.square.links).toHaveLength(1)
    expect(apis.square.links[0].request).toMatchObject({ quick_pay: { price_money: { amount: 1000, currency: 'EUR' }, location_id: 'L1' },
      checkout_options: { subscription_plan_id: variation.id } })
    expect(s).toMatchObject({ status: 'ok', club: { name: 'Coffee club', price: 10, coffees_per_week: 1, signup_url: apis.square.links[0].url } })
    // The same save again (a retry) makes nothing new.
    await post('/api/coffee-club', club())
    expect(apis.square.catalogObjects).toHaveLength(3)
    expect(apis.square.links).toHaveLength(1)
  })

  it('a new price is a new variation and checkout page; members who joined at the old one still count', async () => {
    const { variation: old, discount } = await setUp()
    await post('/api/coffee-club', club({ price: 12, key: 'key-two-22' }))
    const row = db.tables.coffee_club[0]
    expect(row.square_variation_id).not.toBe(old)
    expect(row.square_old_variation_ids).toEqual([old])
    expect(row.square_discount_id).toBe(discount)
    expect(apis.square.links.map(l => l.deleted)).toEqual([true, false])
    expect(row.signup_url).toBe(apis.square.links[1].url)
    // A new name changes the discount (Square's version sent back); not selling takes the page down.
    await post('/api/coffee-club', club({ price: 12, name: 'Easy Beans Club', selling: false, key: 'key-three-3' }))
    expect(apis.square.catalogObjects.find(o => o.id === discount)).toMatchObject({ version: 2, discount_data: { name: 'Easy Beans Club' } })
    expect(apis.square.links.every(l => l.deleted)).toBe(true)
    expect(db.tables.coffee_club[0]).toMatchObject({ selling: false, signup_url: null, square_link_id: null })
    // Members on the old price come in.
    apis.square.subscriptions = [sub('S-old', 'SQC1', old), sub('S-new', 'SQC2', row.square_variation_id as string), sub('S-other', 'SQC3', 'ANOTHER-PLAN')]
    await syncCoffeeClub(env, b1())
    expect(db.tables.coffee_club_members.map(m => m.square_subscription_id).sort()).toEqual(['S-new', 'S-old'])
  })

  it('a connection made before subscriptions were asked for says to connect Square again', async () => {
    await connectSquare()
    apis.square.clubScope = false
    expect(await (await post('/api/coffee-club', club())).json()).toMatchObject({ status: 'reconnect' })
    expect(RECONNECT).toMatch(/Connect again/)
  })
})

describe('Members and their coffees', () => {
  it('members from Square, linked to Customers (brought in when new), with whether the month was paid', async () => {
    const { variation } = await setUp()
    db.tables.customers = [{ id: 'c-lucia', square_id: 'SQC1', first_name: 'Lucía', last_name: 'García', kind: 'customer', source: 'square' }]
    apis.square.subscriptions = [sub('S1', 'SQC1', variation), sub('S2', 'SQC2', variation)]
    apis.square.invoices = [
      { id: 'I1', location_id: 'L1', subscription_id: 'S2', status: 'PAID', created_at: '2026-10-01T09:00:00Z' },
      { id: 'I2', location_id: 'L1', subscription_id: 'S2', status: 'UNPAID', created_at: '2026-11-01T09:00:00Z' },
      { id: 'I3', location_id: 'L1', subscription_id: 'S1', status: 'PAID', created_at: '2026-11-01T09:00:00Z' },
    ]
    expect(await syncCoffeeClub(env, b1())).toBe(2)
    const tom = db.tables.customers.find(c => c.square_id === 'SQC2')!
    expect(tom).toMatchObject({ first_name: 'Tom', notes: 'Oat flat white' })
    const s = await state()
    expect(s.members.map(m => [m.name, m.status, m.paid]).sort()).toEqual([['Lucía García', 'active', true], ['Tom', 'active', false]])
    // Their notes on the till: the club's line first, Tom's own line kept.
    expect(apis.square.notes.get('SQC1')!.note).toBe('☕ Coffee club: this week’s coffee is ready')
    expect(apis.square.notes.get('SQC2')!.note).toBe('☕ Coffee club: the last payment failed. Charge as normal\nOat flat white')
    // Nothing changed, nothing written again.
    const writes = apis.square.noteWrites
    await syncCoffeeClub(env, b1())
    expect(apis.square.noteWrites).toBe(writes)
  })

  it('a sale with the club’s discount counts once, against the member added to it, at most the week’s coffees', async () => {
    const { variation, discount } = await setUp()
    apis.square.subscriptions = [sub('S1', 'SQC1', variation)]
    await syncCoffeeClub(env, b1())
    apis.square.clubOrders = [sale('O1', 'SQC1', discount)]
    expect(await coffeeClubEvent(env, b1(), completed('O1'))).toBe(true)
    // Square sends the same sale again: counted once.
    await coffeeClubEvent(env, b1(), completed('O1'))
    expect(db.tables.coffee_club_coffees).toEqual([expect.objectContaining({ square_order_id: 'O1', item: 'Flat White', quantity: 1, value: 3.8, week: '2026-11-23', problem: null })])
    expect(apis.square.notes.get('SQC1')!.note).toBe('☕ Coffee club: this week’s coffee used. Next one on Monday')
    // A second the same week: kept, with why.
    apis.square.clubOrders.push(sale('O2', 'SQC1', discount, '2026-11-25T09:45:00Z'))
    await coffeeClubEvent(env, b1(), completed('O2'))
    expect(db.tables.coffee_club_coffees.find(c => c.square_order_id === 'O2')).toMatchObject({ problem: 'over_limit' })
    // Nobody added to the sale; someone who isn't a member.
    apis.square.clubOrders.push(sale('O3', null, discount), sale('O4', 'SQC9', discount))
    await coffeeClubEvent(env, b1(), completed('O3'))
    await coffeeClubEvent(env, b1(), completed('O4'))
    expect(db.tables.coffee_club_coffees.map(c => c.problem)).toEqual([null, 'over_limit', 'no_customer', 'not_member'])
    // A sale without the discount, or not completed yet, isn't the club's.
    apis.square.clubOrders.push(sale('O5', 'SQC1', 'SOME-OTHER-DISCOUNT'))
    expect(await coffeeClubEvent(env, b1(), completed('O5'))).toBe(false)
    expect(await coffeeClubEvent(env, b1(), { ...completed('O1'), data: { object: { order_updated: { order_id: 'O1', state: 'OPEN' } } } })).toBe(false)
    // On the page: this week's one, and the three to look at; one marked sorted.
    const s = await state()
    expect(s.members[0]).toMatchObject({ used_this_week: 1, coffees: 1 })
    const toLook = s.coffees.filter(c => c.problem)
    expect(toLook).toHaveLength(3)
    expect((await post(`/api/coffee-club/coffees/${toLook[0].id}/sorted`)).status).toBe(200)
    expect((await state()).coffees.filter(c => c.problem && !c.sorted_at)).toHaveLength(2)
    const counted = s.coffees.find(c => !c.problem)!
    expect((await post(`/api/coffee-club/coffees/${counted.id}/sorted`)).status).toBe(400)
  })

  it('a member whose payment failed: the coffee is kept as not paid; next Monday the note says ready again', async () => {
    const { variation, discount } = await setUp()
    apis.square.subscriptions = [sub('S1', 'SQC1', variation)]
    await syncCoffeeClub(env, b1())
    await coffeeClubEvent(env, b1(), { merchant_id: 'M1', type: 'invoice.scheduled_charge_failed', data: { object: { invoice: { id: 'I9', subscription_id: 'S1' } } } })
    expect(db.tables.coffee_club_members[0]).toMatchObject({ paid: false })
    apis.square.clubOrders = [sale('O1', 'SQC1', discount)]
    await coffeeClubEvent(env, b1(), completed('O1'))
    expect(db.tables.coffee_club_coffees[0]).toMatchObject({ problem: 'not_paid' })
    await coffeeClubEvent(env, b1(), { merchant_id: 'M1', type: 'invoice.payment_made', data: { object: { invoice: { id: 'I9', subscription_id: 'S1' } } } })
    apis.square.clubOrders.push(sale('O2', 'SQC1', discount, '2026-11-25T10:30:00Z'))
    await coffeeClubEvent(env, b1(), completed('O2'))
    expect(apis.square.notes.get('SQC1')!.note).toMatch(/used/)
    // Monday: a new week.
    vi.setSystemTime(Date.parse('2026-11-30T07:00:00Z'))
    await syncCoffeeClub(env, b1())
    expect(apis.square.notes.get('SQC1')!.note).toBe('☕ Coffee club: this week’s coffee is ready')
  })

  it('every 15 minutes, the sales since the last look are counted too (a webhook missed)', async () => {
    const { variation, discount } = await setUp()
    apis.square.subscriptions = [sub('S1', 'SQC1', variation)]
    // Before the club was set up: not looked at; after: counted.
    apis.square.clubOrders = [sale('O0', 'SQC1', discount, '2026-11-20T09:00:00Z'), sale('O1', 'SQC1', discount, '2026-11-25T09:59:00Z')]
    db.tables.coffee_club[0].set_up_at = '2026-11-24T09:00:00Z'
    await syncCoffeeClub(env, b1())
    expect(db.tables.coffee_club_coffees.map(c => c.square_order_id)).toEqual(['O1'])
    expect(db.tables.coffee_club[0].orders_checked_at).toBe(new Date(NOW).toISOString())
  })

  it('someone who joined again: their new membership’s line, whatever order Square lists them in', async () => {
    const { variation } = await setUp()
    apis.square.subscriptions = [sub('S-new', 'SQC1', variation), sub('S-old', 'SQC1', variation, { status: 'CANCELED', canceled_date: '2026-10-01' })]
    await syncCoffeeClub(env, b1())
    expect(apis.square.notes.get('SQC1')!.note).toBe('☕ Coffee club: this week’s coffee is ready')
    apis.square.subscriptions.reverse()
    await syncCoffeeClub(env, b1())
    expect(apis.square.notes.get('SQC1')!.note).toBe('☕ Coffee club: this week’s coffee is ready')
  })

  it('ending a membership: Square stops at the end of the month paid for, and the coffees count until then', async () => {
    const { variation } = await setUp()
    apis.square.subscriptions = [sub('S1', 'SQC1', variation)]
    await syncCoffeeClub(env, b1())
    const id = db.tables.coffee_club_members[0].id as string
    expect((await post(`/api/coffee-club/members/${id}/cancel`)).status).toBe(200)
    expect(db.tables.coffee_club_members[0]).toMatchObject({ status: 'active', ends_on: '2026-12-01' })
    expect((await state()).members[0]).toMatchObject({ ends_on: '2026-12-01' })
  })

  it('the website’s account page: the pass for a member, the way to join for someone who isn’t', async () => {
    const { variation, discount } = await setUp()
    db.tables.customers = [{ id: 'c-lucia', square_id: 'SQC1', first_name: 'Lucía', kind: 'customer', source: 'square' }]
    apis.square.subscriptions = [sub('S1', 'SQC1', variation)]
    await syncCoffeeClub(env, b1())
    apis.square.clubOrders = [sale('O1', 'SQC1', discount)]
    await coffeeClubEvent(env, b1(), completed('O1'))
    expect(await siteClub(b1(), 'c-lucia', 'SQC1')).toEqual({
      name: 'Coffee club', price: 10, currency: 'EUR', coffees_per_week: 1, join_url: null,
      pass: { standing: 'active', used_this_week: 1, left_this_week: 0, week_start: '2026-11-23', started_on: '2026-11-01', ends_on: null },
    })
    expect(await siteClub(b1(), 'c-someone', null)).toMatchObject({ join_url: db.tables.coffee_club[0].signup_url, pass: null })
    db.tables.coffee_club = []
    expect(await siteClub(b1(), 'c-lucia', 'SQC1')).toBeUndefined()
  })
})
