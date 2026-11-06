// The business's refresh rates in the Worker (worker/refresh.ts): one read of its settings a run, the plan
// asked for only when it has chosen a time, and what's chosen kept to what the plan allows.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { menuFromSquare, minutesFor } from './refresh'
import { businessDb, type Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'

let db: FakeSupabase
let asked: string[]
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' } as Env

beforeEach(() => {
  db = new FakeSupabase()
  asked = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    asked.push(url.pathname)
    return db.handle(url.href, init) ?? new Response('not found', { status: 404 })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('refresh rates in the Worker', () => {
  it('the usual times, with one read and no plan asked for, when nothing is chosen', async () => {
    db.tables.settings = [{ id: 1, refresh_minutes: {}, menu_source: 'square' }]
    const b = businessDb(env, 1)
    expect(await minutesFor(b, 'menu')).toBe(60)
    expect(await minutesFor(b, 'hours')).toBe(15)
    expect(await menuFromSquare(b)).toBe(true)
    expect(asked).toEqual(['/rest/v1/settings'])
  })

  it('a time chosen is kept to what the plan allows', async () => {
    db.tables.settings = [{ id: 1, refresh_minutes: { takings: 2, menu: 7 }, menu_source: 'custom' }]
    db.plan.plan = 'pro'
    const b = businessDb(env, 1)
    expect(await minutesFor(b, 'takings')).toBe(5)
    expect(await minutesFor(b, 'menu')).toBe(15)
    expect(await menuFromSquare(b)).toBe(false)
    expect(asked).toEqual(['/rest/v1/settings', '/rest/v1/rpc/current_plan'])
    db.plan.plan = 'business'
    const again = businessDb(env, 1)
    expect(await minutesFor(again, 'menu')).toBe(7)
  })

  it('settings that can’t be read: the usual times', async () => {
    const b = businessDb(env, 1)
    expect(await minutesFor(b, 'customers')).toBe(60)
    expect(await menuFromSquare(b)).toBe(false)
  })
})
