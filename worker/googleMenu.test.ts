// The menu on the Google Maps listing: kept in step with the app's menu (Custom or Square), the way
// opening hours are. Through the Worker against stand-ins for Supabase, Google and Square. What must
// never break:
//   - Google gets what customers read: sections in the menu's order, items with prices in the
//     business's currency, the other ways an item is sold as its options; items off the menu or
//     without a price never go (Google refuses an item without one)
//   - read, changed, written back: the cuisines and menu link set on Google stay
//   - only a changed menu is sent (every minute, nothing goes to Google while it's the same)
//   - a listing Google won't take a menu on is said plainly, kept for the Menu page, and not tried
//     again every minute
//   - a Square read that changed something sends the menu straight away
//   - the plan decides: no Google Maps in the plan, nothing is sent
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations, pushGoogleMenu } from './integrations'
import { menu as menuRoutes } from './menu'
import { seal } from './crypto'
import { businessDb, type Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import { foodMenusName, toGoogleMenu, toMoney, withAppMenu } from './providers/google'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret',
  SQUARE_APP_ID: 'sq-app', SQUARE_APP_SECRET: 'sq-secret',
} as unknown as Env

let db: FakeSupabase
let apis: FakeProviders
let items: Row[]
let square: { objects: unknown[] }
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext
const admin = { authorization: 'Bearer admin-token', 'content-type': 'application/json' }

const item = (id: string, name: string, category: string, price: number | null, more: Partial<Row> = {}): Row => ({
  id, name, category, sell_price: price, price_label: null, vat_rate: 10, description: null, photo_url: null, featured: false, on_menu: true,
  menu_sort: 1, variants: [], square_id: null, ...more,
})

beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  square = { objects: [] }
  items = [
    item('r1', 'Flat white', 'Coffee', 3.2, { description: 'Double shot, silky milk', price_label: 'Hot', variants: [{ id: 'v1', name: 'Iced', price_change: 1 }], menu_sort: 1 }),
    item('r2', 'Espresso', 'Coffee', 2, { menu_sort: 2 }),
    item('r3', 'Banana bread', 'Bakery', 3.5, { featured: true }),
    item('r4', 'Matcha', 'Coffee', 4, { on_menu: false, menu_sort: 3 }),
    item('r5', 'New special', 'Coffee', null, { menu_sort: 4 }),
  ]
  db.rpcs.menu_list = () => items
  db.table('business')[0] = { id: 1, name: 'Easy Beans Coffee', phone: '+34 695 415 335', opening_hours: { mon: { open: '08:00', close: '18:00' } } }
  db.tables.calendar_events = []
  db.tables.settings = [{ id: 1, menu_sections: ['Bakery', 'Coffee'], menu_source: 'custom' }]
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('https://connect.squareup.com/v2/catalog/list')) {
      return new Response(JSON.stringify({ objects: square.objects }), { headers: { 'content-type': 'application/json' } })
    }
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

async function connectMaps() {
  const start = await integrations.request(`${APP}/api/integrations/google/start`, { method: 'POST', headers: admin, body: '{}' }, env, ctx())
  const state = new URL((await start.json() as { url: string }).url).searchParams.get('state')!
  await integrations.request(`${APP}/api/integrations/google/callback?code=c&state=${encodeURIComponent(state)}`, {}, env, ctx())
  expect(db.integration('google_business')).toMatchObject({ status: 'connected', external: { location: 'locations/1', account: 'accounts/1' } })
}
const push = (force = false) => pushGoogleMenu(env, businessDb(env, 1), { force })
const sendNow = () => integrations.request(`${APP}/api/integrations/google/menu`, { method: 'POST', headers: admin, body: '{}' }, env, ctx())
type Sent = { menus: { labels: { displayName: string }[]; sections: { labels: { displayName: string }[]; items: { labels: { displayName: string; description?: string }[]
  attributes: { price: unknown }; options?: { labels: { displayName: string }[]; attributes: { price: unknown } }[] }[] }[]; cuisines?: string[]; sourceUrl?: string }[] }
/** What the app keeps next to the listing. */
const kept = () => db.integration('google_business').external as Record<string, unknown>
const lastSent = () => apis.google.menuEdits.at(-1)!.body as unknown as Sent

describe('The menu as Google’s food menu', () => {
  it('prices are Google Money: whole units as a string, the cents in nanos', () => {
    expect(toMoney(3.5, 'EUR')).toEqual({ currencyCode: 'EUR', units: '3', nanos: 500_000_000 })
    expect(toMoney(2, 'EUR')).toEqual({ currencyCode: 'EUR', units: '2' })
    expect(toMoney(4.2, 'EUR')).toEqual({ currencyCode: 'EUR', units: '4', nanos: 200_000_000 })
    expect(toMoney(0.1 + 0.2, 'EUR')).toEqual({ currencyCode: 'EUR', units: '0', nanos: 300_000_000 })
  })

  it('sections and items in order; variants are options with their own price; unpriced items and empty sections left out', () => {
    const m = toGoogleMenu({ title: 'Menu', sections: [
      { category: 'Coffee', items: [
        { name: 'Flat white', description: 'Silky', sell_price: 3.2, variants: [{ name: 'Iced', price_change: 1 }, { name: 'Oat milk', price_change: 0.4 }] },
        { name: 'Special', description: null, sell_price: null, variants: [] },
      ] },
      { category: 'Soon', items: [{ name: 'Cake', description: null, sell_price: null, variants: [] }] },
    ] }, 'EUR')
    expect(m.labels).toEqual([{ displayName: 'Menu' }])
    expect(m.sections).toHaveLength(1)
    expect(m.sections[0]).toEqual({ labels: [{ displayName: 'Coffee' }], items: [{
      labels: [{ displayName: 'Flat white', description: 'Silky' }],
      attributes: { price: { currencyCode: 'EUR', units: '3', nanos: 200_000_000 } },
      options: [
        { labels: [{ displayName: 'Iced' }], attributes: { price: { currencyCode: 'EUR', units: '4', nanos: 200_000_000 } } },
        { labels: [{ displayName: 'Oat milk' }], attributes: { price: { currencyCode: 'EUR', units: '3', nanos: 600_000_000 } } },
      ],
    }] })
  })

  it('names and descriptions are kept within Google’s lengths', () => {
    const m = toGoogleMenu({ title: 'Menu', sections: [{ category: null, items: [{ name: 'x'.repeat(200), description: 'y'.repeat(1200), sell_price: 1, variants: [] }] }] }, 'EUR')
    const l = m.sections[0].items[0].labels[0]
    expect(l.displayName.length).toBe(140)
    expect(l.description!.length).toBe(1000)
    expect(m.sections[0].labels[0].displayName).toBe('Menu')
  })

  it('the app’s menu replaces the listing’s, keeping the cuisines and menu link set on Google', () => {
    const ours = toGoogleMenu({ title: 'Menu', sections: [{ category: 'Coffee', items: [{ name: 'Espresso', description: null, sell_price: 2, variants: [] }] }] }, 'EUR')
    const merged = withAppMenu({ name: 'accounts/1/locations/9/foodMenus', menus: [
      { labels: [{ displayName: 'Old' }], sections: [], cuisines: ['SPANISH'], sourceUrl: 'https://easybeans.test/menu' },
      { labels: [{ displayName: 'Lunch' }], sections: [] },
    ] }, ours)
    expect(merged).toEqual({ name: 'accounts/1/locations/9/foodMenus', menus: [{ ...ours, cuisines: ['SPANISH'], sourceUrl: 'https://easybeans.test/menu' }] })
  })

  it('the v4 name comes from the account and the Business Information listing name', () => {
    expect(foodMenusName('accounts/123', 'locations/456')).toBe('accounts/123/locations/456/foodMenus')
  })
})

describe('The menu on Google Maps: kept in step with the app', () => {
  beforeEach(connectMaps)

  it('the menu goes to the listing: what’s on the menu, in the menu’s section order', async () => {
    apis.google.foodMenus = { name: 'accounts/1/locations/1/foodMenus', menus: [{ labels: [{ displayName: 'Carta' }], sections: [], cuisines: ['BRUNCH'] }] }
    expect(await push()).toEqual({ status: 'sent', items: 3 })
    const edit = apis.google.menuEdits[0]
    expect(edit).toMatchObject({ path: '/v4/accounts/1/locations/1/foodMenus', mask: 'menus' })
    const sent = lastSent()
    expect(sent.menus).toHaveLength(1)
    expect(sent.menus[0].cuisines).toEqual(['BRUNCH'])
    expect(sent.menus[0].sections.map(s => s.labels[0].displayName)).toEqual(['Bakery', 'Coffee'])
    const coffee = sent.menus[0].sections[1].items
    // Matcha is off the menu; the new special has no price yet.
    expect(coffee.map(i => i.labels[0].displayName)).toEqual(['Flat white', 'Espresso'])
    expect(coffee[0].labels[0].description).toBe('Double shot, silky milk')
    expect(coffee[0].options).toEqual([{ labels: [{ displayName: 'Iced' }], attributes: { price: { currencyCode: 'EUR', units: '4', nanos: 200_000_000 } } }])
    expect(db.integration('google_business')).toMatchObject({ last_error: null, external: { menu_items: 3, menu_error: null, location: 'locations/1' } })
    expect(kept().menu_sent_at).toBeTruthy()
  })

  it('only a changed menu is sent', async () => {
    await push()
    expect(await push()).toEqual({ status: 'same', items: 3 })
    expect(await push()).toEqual({ status: 'same', items: 3 })
    expect(apis.google.menuEdits).toHaveLength(1)
    items[1].sell_price = 2.2
    expect((await push()).status).toBe('sent')
    expect(lastSent().menus[0].sections[1].items[1].attributes.price).toEqual({ currencyCode: 'EUR', units: '2', nanos: 200_000_000 })
    items[2].on_menu = false
    expect((await push()).status).toBe('sent')
    expect(lastSent().menus[0].sections.map(s => s.labels[0].displayName)).toEqual(['Coffee'])
    expect(apis.google.menuEdits).toHaveLength(3)
  })

  it('“Send to Google Maps now” sends it even when nothing changed', async () => {
    await push()
    const res = await sendNow()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'sent', items: 3 })
    expect(apis.google.menuEdits).toHaveLength(2)
  })

  it('the hours sync keeps what was sent of the menu', async () => {
    await push()
    const sentAt = kept().menu_sent_at
    expect((await integrations.request(`${APP}/api/integrations/google/sync`, { method: 'POST', headers: admin, body: '{}' }, env, ctx())).status).toBe(200)
    expect(db.integration('google_business').external).toMatchObject({ menu_sent_at: sentAt, menu_items: 3 })
    expect(await push()).toEqual({ status: 'same', items: 3 })
  })

  it('a listing Google won’t take a menu on: said plainly, kept for the Menu page, not tried again every minute', async () => {
    apis.google.canHaveMenu = false
    await expect(push()).rejects.toThrow(/only food and drink places/)
    expect(kept().menu_error).toMatch(/only food and drink places/)
    expect(await push()).toEqual({ status: 'same', items: 3 })
    expect(apis.google.menuEdits).toHaveLength(0)
    const res = await sendNow()
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toMatch(/only food and drink places/)
    // Allowed now (the category was changed on Google): the button sends it and the warning goes.
    apis.google.canHaveMenu = true
    expect((await sendNow()).status).toBe(200)
    expect(db.integration('google_business').external).toMatchObject({ menu_error: null, menu_failed: null })
  })

  it('nothing priced on the menu: the listing’s menu isn’t emptied', async () => {
    items = items.map(i => ({ ...i, sell_price: null }))
    expect(await push()).toEqual({ status: 'empty', items: 0 })
    expect(apis.google.menuEdits).toHaveLength(0)
    expect((await sendNow()).status).toBe(400)
  })

  it('a plan without Google Maps sends nothing', async () => {
    db.plan.features = ['apps']
    expect(await push()).toEqual({ status: 'paused', items: 0 })
    const res = await sendNow()
    expect((await res.json() as { error: string }).error).toMatch(/plan does not include Google Maps/)
    expect(apis.google.menuEdits).toHaveLength(0)
  })

  it('a Square read that changed the menu sends it to Google straight away', async () => {
    Object.assign(db.integration('square'), { status: 'connected', external: { locations: [{ id: 'L1', name: 'Easy Beans' }] } })
    db.table('integration_secrets').push({ provider: 'square', ciphertext: await seal(env.INTEGRATION_KEY!, { access_token: 'sq-token', refresh_token: 'r', expires_at: '2099-01-01T00:00:00Z' }) })
    db.table('settings')[0].menu_source = 'square'
    let result = { added: 0, changed: 0, off: 0 }
    db.rpcs.sync_square_menu = () => result
    const read = () => menuRoutes.request(`${APP}/api/menu/square/sync`, { method: 'POST', headers: admin, body: '{}' }, env, ctx())
    expect((await read()).status).toBe(200)
    expect(apis.google.menuEdits).toHaveLength(0)
    result = { added: 0, changed: 1, off: 0 }
    items[0].sell_price = 3.4
    expect((await read()).status).toBe(200)
    expect(apis.google.menuEdits).toHaveLength(1)
    expect(lastSent().menus[0].sections[1].items[0].attributes.price).toEqual({ currencyCode: 'EUR', units: '3', nanos: 400_000_000 })
  })
})

describe('The menu on Google Maps: not connected', () => {
  it('nothing is sent, and the button says to connect the listing', async () => {
    expect(await push()).toEqual({ status: 'not_connected', items: 0 })
    const res = await sendNow()
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toMatch(/Connect your Google listing/)
  })
})
