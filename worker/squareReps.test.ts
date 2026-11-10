// Customers' credit on Square (worker/squareReps.ts) against stand-ins for Supabase and Square. What must
// never break:
//   - each line of credit goes onto the card once, however often the job runs (its own key on Square)
//   - what's spent with the card at the till comes back as credit used, once
//   - a connection without CUSTOMERS_WRITE says to connect Square again, and puts nothing on a card
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { syncRepsToSquare } from './squareReps'
import { businessDb, type Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', SQUARE_APP_ID: 'sq-app', SQUARE_APP_SECRET: 'sq-secret', SQUARE_WEBHOOK_SIGNATURE_KEY: 'sq-hook-key',
} as unknown as Env

let db: FakeSupabase
let apis: FakeProviders
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext
const as = () => ({ authorization: 'Bearer admin-token', 'content-type': 'application/json' })

beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

async function connectSquare() {
  const start = await integrations.request(`${APP}/api/integrations/square/start`, { method: 'POST', headers: as(), body: '{}' }, env, ctx())
  const state = new URL((await start.json() as { url: string }).url).searchParams.get('state')!
  const res = await integrations.request(`${APP}/api/integrations/square/callback?code=c&state=${encodeURIComponent(state)}`, {}, env, ctx())
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe('square')
}

const sync = () => syncRepsToSquare(env, businessDb(env, 1))
const rep = (more: Row = {}): Row => ({ id: 'rep-nora', name: '@nora.eats', kind: 'customer', approved: true, active: true, instagram: 'nora.eats', customer_id: null,
  square_customer_id: null, square_gift_card_id: null, square_synced_at: null, square_error: null, business_id: 1, ...more })
const line = (id: string, amount: number, more: Row = {}): Row => ({ id, rep_id: 'rep-nora', kind: amount > 0 ? 'earn' : 'redeem', label: 'Cashback for a post', amount,
  status: 'approved', created_at: `2026-11-0${id.slice(-1)}T10:00:00Z`, square_pushed_at: null, square_activity_id: null, business_id: 1, ...more })
const card = () => apis.square.giftCards.find(g => g.id === db.tables.sales_reps[0].square_gift_card_id)!
const activities = () => apis.square.giftActivities.filter(a => a.gift_card_id === card().id).map(a => a.type)

describe('Customers’ credit on Square', () => {
  it('a Square customer and a gift card on file, each line of credit on it once; spent in the app, it comes off', async () => {
    await connectSquare()
    db.tables.sales_reps = [rep()]
    db.tables.rep_rewards = [line('l1', 5), line('l2', 2.5), line('l3', 3, { status: 'pending' })]
    expect(await sync()).toBe(1)
    const made = [...apis.square.customersMade.values()]
    expect(made).toEqual([expect.objectContaining({ given_name: 'nora.eats', nickname: '@nora.eats', reference_id: 'rep:rep-nora' })])
    expect(db.tables.sales_reps[0]).toMatchObject({ square_customer_id: made[0].id, square_error: null })
    // The first credit activates the card, the next goes on; it's on her customer, for the till.
    expect(activities()).toEqual(['ACTIVATE', 'ADJUST_INCREMENT'])
    expect(card()).toMatchObject({ state: 'ACTIVE', balance_money: { amount: 750, currency: 'EUR' }, customer_ids: [made[0].id] })
    expect(db.tables.rep_rewards.filter(l => l.square_pushed_at).map(l => l.id)).toEqual(['l1', 'l2'])

    // Again: nothing twice.
    await sync()
    expect(activities()).toHaveLength(2)

    // Approved now, and credit used in the app: on the card, and off it.
    db.tables.rep_rewards[2].status = 'approved'
    db.tables.rep_rewards.push(line('l4', -1, { label: 'Used at the till' }))
    await sync()
    expect(activities()).toEqual(['ACTIVATE', 'ADJUST_INCREMENT', 'ADJUST_INCREMENT', 'ADJUST_DECREMENT'])
    expect(card().balance_money.amount).toBe(950)
    expect(apis.square.customersMade.size).toBe(1)
  })

  it('spent with the card at the till: credit used in the app too, once', async () => {
    await connectSquare()
    db.tables.sales_reps = [rep()]
    db.tables.rep_rewards = [line('l1', 10)]
    await sync()
    apis.square.giftActivities.push({ id: 'GA-till', type: 'REDEEM', created_at: new Date().toISOString(), gift_card_gan: card().gan, gift_card_id: card().id,
      redeem_activity_details: { amount_money: { amount: 400, currency: 'EUR' } } })
    await sync()
    await sync()
    const used = db.tables.rep_rewards.filter(l => l.square_activity_id === 'GA-till')
    expect(used).toEqual([expect.objectContaining({ kind: 'redeem', amount: -4, status: 'approved', label: 'Used at the till' })])
    // It came from the card: nothing to take off it again.
    expect(used[0].square_pushed_at).toBeTruthy()
    expect(activities()).toEqual(['ACTIVATE', 'REDEEM'])
  })

  it('someone linked to a customer already: their own Square customer, no new one', async () => {
    await connectSquare()
    db.tables.customers = [{ id: 'cust-1', square_id: 'SQC1', business_id: 1 }]
    db.tables.sales_reps = [rep({ customer_id: 'cust-1' })]
    db.tables.rep_rewards = [line('l1', 2)]
    await sync()
    expect(apis.square.customersMade.size).toBe(0)
    expect(card().customer_ids).toEqual(['SQC1'])
  })

  it('a connection made before CUSTOMERS_WRITE: says to connect Square again, and puts nothing on a card', async () => {
    await connectSquare()
    apis.square.customersWrite = false
    db.tables.sales_reps = [rep()]
    db.tables.rep_rewards = [line('l1', 5)]
    await sync()
    expect(db.tables.sales_reps[0].square_error).toMatch(/Connect Square again/)
    expect(db.tables.sales_reps[0].square_gift_card_id).toBeNull()
    expect(db.tables.rep_rewards[0].square_pushed_at).toBeNull()
  })

  it('nothing for the team or ambassadors (commission isn’t credit), nor without Square', async () => {
    db.tables.sales_reps = [rep({ kind: 'ambassador' })]
    db.tables.rep_rewards = [line('l1', 5)]
    expect(await sync()).toBe(0)
    await connectSquare()
    expect(await sync()).toBe(0)
    expect(apis.square.customersMade.size).toBe(0)
  })
})
