// The Loyalty page's routes against stand-ins for Supabase and Square. What must never break:
//   - only admins, and only while Square is the connected till
//   - a connection without the loyalty permissions asks to reconnect, in plain words
//   - goodwill points and gift cards carry idempotency keys (a retry never gives twice)
//   - a gift card's number never leaves the Worker: the last 4 digits only
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { loyaltyRoutes, RECONNECT } from './loyalty'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import type { GiftCards, LoyaltyState } from '../shared/loyalty'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', SQUARE_APP_ID: 'sq-app', SQUARE_APP_SECRET: 'sq-secret', SQUARE_WEBHOOK_SIGNATURE_KEY: 'sq-hook-key',
} as unknown as Env

let db: FakeSupabase
let apis: FakeProviders
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

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

const as = (who: 'admin' | 'staff') => ({ authorization: `Bearer ${who}-token`, 'content-type': 'application/json' })
const get = (path: string, who: 'admin' | 'staff' = 'admin') => loyaltyRoutes.request(`${APP}${path}`, { headers: as(who) }, env, ctx())
const post = (path: string, body: unknown) => loyaltyRoutes.request(`${APP}${path}`, { method: 'POST', headers: as('admin'), body: JSON.stringify(body) }, env, ctx())

async function connectSquare() {
  const start = await integrations.request(`${APP}/api/integrations/square/start`, { method: 'POST', headers: as('admin'), body: '{}' }, env, ctx())
  const state = new URL((await start.json() as { url: string }).url).searchParams.get('state')!
  const res = await integrations.request(`${APP}/api/integrations/square/callback?code=c&state=${encodeURIComponent(state)}`, {}, env, ctx())
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe('square')
}

describe('Loyalty and gift cards, from Square', () => {
  it('admins only, and only while Square is connected', async () => {
    expect((await get('/api/loyalty')).status).toBe(409)
    expect((await (await get('/api/loyalty')).json() as { error: string }).error).toMatch(/Connect Square/)
    await connectSquare()
    expect((await get('/api/loyalty', 'staff')).status).toBe(403)
    expect((await get('/api/giftcards', 'staff')).status).toBe(403)
    expect((await loyaltyRoutes.request(`${APP}/api/loyalty`, {}, env, ctx())).status).toBe(401)
  })

  it('the stamp card: the programme, its members (named from Customers) and what happened, without reward bookkeeping', async () => {
    await connectSquare()
    db.table('customers').push({ id: 'c-1', square_id: 'SQC1', first_name: 'Lucía', last_name: 'García' })
    const res = await get('/api/loyalty?from=2026-09-01&to=2026-09-30')
    expect(res.status).toBe(200)
    const s = await res.json() as LoyaltyState
    expect(s.status).toBe('ok')
    expect(s.program).toEqual({ one: 'Stamp', other: 'Stamps', per_visit: 1, minimum_spend: 2.5, per_spend: null, tiers: [{ id: 'T1', name: 'Free coffee', points: 9 }] })
    expect(s.members.map(m => [m.name, m.balance, m.last_visit])).toEqual([['Lucía García', 7, '2026-09-28T08:15:00Z'], [null, 3, '2026-09-20T08:15:00Z']])
    expect(s.events.map(e => e.kind)).toEqual(['earn', 'redeem', 'earn']) // CREATE_REWARD left out
  })

  it('no programme yet: says so; a connection without loyalty access is asked to reconnect, in plain words', async () => {
    await connectSquare()
    apis.square.program = null
    expect(await (await get('/api/loyalty')).json()).toMatchObject({ status: 'no_program', members: [] })
    apis.square.loyaltyScope = false
    expect(await (await get('/api/loyalty')).json()).toMatchObject({ status: 'reconnect' })
    expect(await (await get('/api/giftcards')).json()).toMatchObject({ status: 'reconnect', cards: [] })
    const adjust = await post('/api/loyalty/adjust', { account_id: 'LA1', points: 1, reason: 'Sorry for the wait', key: 'k-12345678' })
    expect(await adjust.json()).toEqual({ error: RECONNECT })
    expect(db.integration('square').status).toBe('connected') // takings keep working meanwhile
  })

  it('goodwill points carry an idempotency key: the same request twice gives once', async () => {
    await connectSquare()
    const body = { account_id: 'LA2', points: 2, reason: 'Wrong order', key: 'k-12345678' }
    expect((await post('/api/loyalty/adjust', body)).status).toBe(200)
    expect((await post('/api/loyalty/adjust', body)).status).toBe(200)
    expect([...apis.square.adjustments]).toEqual([['adjust:k-12345678', { account: 'LA2', points: 2, reason: 'Wrong order' }]])
    expect(apis.square.loyaltyAccounts.find(a => a.id === 'LA2')!.balance).toBe(5)
    const bad = async (b: object) => (await (await post('/api/loyalty/adjust', { ...body, ...b })).json() as { error: string }).error
    expect(await bad({ points: 0 })).toBe('Give a whole number of points, not zero')
    expect(await bad({ points: 5000 })).toBe('Adjust by up to 1,000 points at a time')
    expect(await bad({ reason: ' ' })).toBe('Say why, for the record (Square keeps it)')
  })

  it('gift cards: only the last 4 digits ever come back, with the balance owed and what happened', async () => {
    await connectSquare()
    db.table('customers').push({ id: 'c-1', square_id: 'SQC1', first_name: 'Lucía', last_name: 'García' })
    const res = await get('/api/giftcards?from=2026-09-01&to=2026-09-30')
    const raw = await res.text()
    expect(raw).not.toContain('7783320001234567')
    expect(raw).not.toContain('778332000123')
    const g = JSON.parse(raw) as GiftCards
    expect(g.cards.map(c => [c.last4, c.state, c.balance, c.customer])).toEqual([['4567', 'ACTIVE', 25, 'Lucía García'], ['6543', 'DEACTIVATED', 0, null]])
    expect(g.activities.map(a => [a.kind, a.amount, a.last4])).toEqual([['activate', 30, '4567'], ['redeem', 5, '4567']])
  })

  it('selling a digital gift card: created, then activated at the café for the amount, each step with its own key', async () => {
    await connectSquare()
    const res = await post('/api/giftcards', { amount: 25.5, customer_id: 'SQC1', key: 'gift-12345678' })
    expect(res.status).toBe(200)
    const { card } = await res.json() as { card: { last4: string; state: string; balance: number; customer_id: string } }
    expect(card).toMatchObject({ state: 'ACTIVE', balance: 25.5, customer_id: 'SQC1' })
    expect(card.last4).toMatch(/^\d{4}$/)
    expect(apis.square.giftKeys).toEqual(['giftcard:gift-12345678:create', 'giftcard:gift-12345678:activate'])
    const made = apis.square.giftCards.at(-1)!
    expect(made).toMatchObject({ state: 'ACTIVE', balance_money: { amount: 2550, currency: 'EUR' }, customer_ids: ['SQC1'] })
    const bad = async (b: object) => (await (await post('/api/giftcards', { amount: 20, key: 'gift-87654321', ...b })).json() as { error: string }).error
    expect(await bad({ amount: 2 })).toBe('Gift cards start at €5')
    expect(await bad({ amount: 5000 })).toBe('Gift cards go up to €1,000')
    expect(await bad({ key: '' })).toBe('Try again')
  })
})
