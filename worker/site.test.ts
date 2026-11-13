// The menu on the business's own website (worker/site.ts, shared/websiteFeed.ts), through the Worker
// against a stand-in for Supabase. What must never break:
//   - nothing is shared until the business turns it on; off, or a number that's no business, is the
//     same "not found" (the numbers can't be used to list who's here)
//   - one business's switch is its own: Easy Beans sharing doesn't share business 2's menu
//   - the website gets what customers read: sections in the menu's order, only what's on the menu,
//     each way it's sold with its whole price, in the business's currency, and no costs
//   - allergens only when all of an item's are known (never a guess)
//   - any website may read it (CORS), and may keep it a minute
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { site } from './site'
import type { Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import type { SiteMenuFeed } from '../shared/websiteFeed'
import type { SiteDetailsFeed } from '../shared/websiteDetails'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
} as unknown as Env
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

let db: FakeSupabase
let items: Row[]

const item = (id: string, name: string, category: string | null, price: number | null, more: Partial<Row> = {}): Row => ({
  id, name, category, sell_price: price, price_label: null, vat_rate: 10, description: null, photo_url: null, featured: false, on_menu: true,
  menu_sort: 1, variants: [], square_id: null, ...more,
})

beforeEach(() => {
  db = new FakeSupabase()
  items = [
    item('r1', 'Flat White', 'Classics', 3.8, { price_label: 'Hot', variants: [{ id: 'v1', name: 'Iced', price_change: 1 }], square_id: 'SQ-FW', photo_url: 'https://img.test/fw.jpg' }),
    item('r2', 'Espresso', 'Classics', 2, { menu_sort: 2 }),
    item('r3', 'Croissant', 'Bakery', 2.7, { featured: true, description: 'Baked this morning.' }),
    item('r4', 'Pumpkin Latte', 'Classics', 5, { on_menu: false, menu_sort: 3 }),
    item('r5', 'Syrup', 'Extras', 0.5, { description: 'Vanilla, Caramel' }),
  ]
  db.rpcs.menu_list = () => items
  db.rpcs.display_menu_allergens = () => ({
    dishes: [
      { id: 'r1', name: 'Flat White', category: 'Classics', variants: [], lines: [{ item_id: 's-milk', quantity: 1, unit: 'ml', variant_id: null, replaces_item_id: null }] },
      { id: 'r3', name: 'Croissant', category: 'Bakery', variants: [], lines: [{ item_id: 's-flour', quantity: 1, unit: 'g', variant_id: null, replaces_item_id: null }, { item_id: 's-butter', quantity: 1, unit: 'g', variant_id: null, replaces_item_id: null }] },
    ],
    items: [
      { id: 's-milk', name: '', allergens: ['milk'], may_contain: [], diet: 'vegetarian' },
      { id: 's-flour', name: '', allergens: ['gluten'], may_contain: ['sesame'], diet: 'vegan' },
      // Nobody has said yet: the croissant's allergens aren't all known.
      { id: 's-butter', name: '', allergens: null, may_contain: [], diet: null },
    ],
  })
  db.table('business')[0] = { id: 1, name: 'Easy Beans Coffee', currency: 'EUR' }
  db.tables.settings = [
    { id: 1, business_id: 1, website_menu: false, menu_sections: ['Bakery', 'Classics', 'Extras'], menu_source: 'square', menu_synced_at: '2026-11-05T08:16:58Z' },
    { id: 1, business_id: 2, website_menu: false, menu_sections: [], menu_source: 'custom', menu_synced_at: null },
  ]
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const get = (path: string, init: RequestInit = {}) => site.request(`${APP}${path}`, init, env, ctx())
const share = (business: number, on = true) => { db.table('settings').find(s => s.business_id === business)!.website_menu = on }

describe('the menu on the website', () => {
  it('is not shared until the business turns it on, and says so as "not found"', async () => {
    const res = await get('/api/site/1/menu')
    expect(res.status).toBe(404)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(await res.json()).toEqual({ error: 'This business doesn’t share its menu with a website.' })
  })

  it('answers a number that is no business, or no number, the same way', async () => {
    share(1)
    for (const path of ['/api/site/7/menu', '/api/site/0/menu', '/api/site/abc/menu', '/api/site/-1/menu', '/api/site/1e3/menu']) {
      const res = await get(path)
      expect(res.status, path).toBe(404)
      expect(await res.json(), path).toEqual({ error: 'This business doesn’t share its menu with a website.' })
    }
  })

  it('keeps each business’s switch its own', async () => {
    share(1)
    expect((await get('/api/site/1/menu')).status).toBe(200)
    expect((await get('/api/site/2/menu')).status).toBe(404)
  })

  it('gives what customers read: the menu’s sections in order, only what’s on it, whole prices, no costs', async () => {
    share(1)
    const res = await get('/api/site/1/menu')
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('cache-control')).toContain('max-age=60')
    const feed = await res.json() as SiteMenuFeed
    expect(feed).toMatchObject({ version: 1, business: { id: 1, name: 'Easy Beans Coffee', currency: 'EUR' }, source: 'square', synced_at: '2026-11-05T08:16:58Z' })
    expect(feed.sections.map(s => [s.name, s.extras, s.items.map(i => i.name)])).toEqual([
      ['Bakery', false, ['Croissant']],
      ['Classics', false, ['Flat White', 'Espresso']],
      ['Extras', true, ['Syrup']],
    ])
    expect(feed.sections[1].items[0]).toEqual({
      id: 'r1', name: 'Flat White', description: null, photo_url: 'https://img.test/fw.jpg', featured: false,
      price: 3.8, price_label: 'Hot', variants: [{ name: 'Iced', price: 4.8 }], square_id: 'SQ-FW',
      allergens: { contains: ['milk'], may_contain: [], vegan: false, vegetarian: true },
    })
    // Nothing from Menu costing beyond what customers read.
    expect(JSON.stringify(feed)).not.toMatch(/vat_rate|cost|margin|lines|menu_sort|on_menu/)
  })

  it('gives allergens only when all of an item’s are known', async () => {
    share(1)
    const feed = await (await get('/api/site/1/menu')).json() as SiteMenuFeed
    const byName = new Map(feed.sections.flatMap(s => s.items).map(i => [i.name, i]))
    expect(byName.get('Croissant')!.allergens).toBeNull()
    expect(byName.get('Espresso')!.allergens).toBeNull()
  })

  it('still gives the menu when the allergens can’t be read', async () => {
    share(1)
    // The database can't be reached for that one read.
    db.rpcs.display_menu_allergens = () => { throw new Error('down') }
    const res = await get('/api/site/1/menu')
    expect(res.status).toBe(200)
    const feed = await res.json() as SiteMenuFeed
    expect(feed.sections.flatMap(s => s.items).map(i => i.name)).toEqual(['Croissant', 'Flat White', 'Espresso', 'Syrup'])
    expect(feed.sections.flatMap(s => s.items).every(i => i.allergens === null)).toBe(true)
  })

  it('leaves an unpriced item’s ways of selling unpriced too', async () => {
    share(1)
    items.push(item('r6', 'New Special', 'Classics', null, { menu_sort: 4, variants: [{ id: 'v6', name: 'Iced', price_change: 1 }] }))
    const feed = await (await get('/api/site/1/menu')).json() as SiteMenuFeed
    expect(feed.sections[1].items.at(-1)).toMatchObject({ name: 'New Special', price: null, variants: [{ name: 'Iced', price: null }] })
  })

  it('marks no section as extras when the menu is kept in the app', async () => {
    share(1)
    db.table('settings').find(s => s.business_id === 1)!.menu_source = 'custom'
    const feed = await (await get('/api/site/1/menu')).json() as SiteMenuFeed
    expect(feed.source).toBe('custom')
    expect(feed.synced_at).toBeNull()
    expect(feed.sections.some(s => s.extras)).toBe(false)
  })

  it('lets any website ask first (CORS preflight)', async () => {
    const res = await get('/api/site/1/menu', { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toContain('GET')
  })
})

// The business's details (GET /api/site/<business>/details, shared/websiteDetails.ts). What must never break:
//   - nothing is shared until the business turns it on; off, or a number that's no business, is the same 404
//   - what the Business and Opening hours pages say, with the Calendar's closures, from the business's own today
//   - one business's details are its own; any website may read them (CORS) and keep them a minute
describe('the business’s details on the website', () => {
  const details = (business: number, on = true) => { db.table('settings').find(s => s.business_id === business)!.website_details = on }
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse('2026-12-21T09:00:00Z'), toFake: ['Date'] })
    db.tables.business = [
      { id: 1, name: 'Easy Beans Coffee', currency: 'EUR', timezone: 'Europe/Madrid', address: 'C. Pizarro 8, 29670 San Pedro de Alcántara, Málaga',
        phone: '+34 952 000 000', email: 'hola@easybeans.example', instagram: '@easy.beans.coffee', website: null, whatsapp: '+34 695 415 335', tiktok: 'easybeanscoffee',
        opening_hours: { mon: { open: '08:00', close: '15:00' }, tue: { open: '08:00', close: '15:00' }, wed: { open: '08:00', close: '15:00' },
          thu: { open: '08:00', close: '15:00' }, fri: { open: '08:00', close: '15:00' }, sat: { open: '09:00', close: '15:00' }, sun: null } },
      { id: 2, name: 'Bar Dos', currency: 'EUR', timezone: 'Europe/Dublin', address: 'Main St, Dingle', phone: null, email: null, instagram: null,
        website: null, whatsapp: null, tiktok: null, opening_hours: { mon: { open: '12:00', close: '23:00' } } },
    ]
    db.tables.calendar_events = [
      { id: 'e1', business_id: 1, starts_on: '2026-12-24', ends_on: '2026-12-25', starts_at: null, title: 'Closed for Christmas', category: 'business',
        town: null, competition: null, source: 'manual', confirmed: true, visibility: 'all' },
      { id: 'e2', business_id: 1, starts_on: '2027-01-06', ends_on: null, starts_at: null, title: 'Epifanía del Señor', category: 'national',
        town: null, competition: null, source: 'import', confirmed: true, visibility: 'all' },
      { id: 'e3', business_id: 2, starts_on: '2026-12-22', ends_on: null, starts_at: null, title: 'Closed for a funeral', category: 'business',
        town: null, competition: null, source: 'manual', confirmed: true, visibility: 'all' },
    ]
  })
  afterEach(() => vi.useRealTimers())

  it('is not shared until the business turns it on; off, or no such business, is the same 404', async () => {
    for (const path of ['/api/site/1/details', '/api/site/7/details', '/api/site/abc/details']) {
      const res = await get(path)
      expect(res.status, path).toBe(404)
      expect(await res.json()).toEqual({ error: 'This business doesn’t share its details with a website.' })
    }
  })

  it('gives what the Business and Opening hours pages say, with the Calendar’s closures, for any website', async () => {
    details(1)
    const res = await get('/api/site/1/details')
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('cache-control')).toContain('max-age=60')
    const d = await res.json() as SiteDetailsFeed
    expect(d).toMatchObject({
      version: 1, business: { id: 1, name: 'Easy Beans Coffee' }, address_lines: ['C. Pizarro 8', '29670 San Pedro de Alcántara', 'Málaga'],
      whatsapp_url: 'https://wa.me/34695415335', email: 'hola@easybeans.example',
      social: { instagram: { handle: 'easy.beans.coffee' }, tiktok: { handle: 'easybeanscoffee' } }, timezone: 'Europe/Madrid',
      hours: { mon: { open: '08:00', close: '15:00' }, sun: null },
      // Not closed on public holidays unless the Opening hours page says so.
      closures: [{ from: '2026-12-24', to: '2026-12-25', reason: 'Closed for Christmas' }],
    })
    expect(d.days.slice(2, 5).map(x => [x.date, x.open, x.closed_reason])).toEqual([
      ['2026-12-23', '08:00', null], ['2026-12-24', null, 'Closed for Christmas'], ['2026-12-25', null, 'Closed for Christmas'],
    ])
    // Business 2's closure isn't Easy Beans'.
    expect(JSON.stringify(d)).not.toContain('funeral')
  })

  it('closed on public holidays when the Opening hours page says so', async () => {
    details(1)
    db.integration('google_business').external = { closed_on_holidays: true }
    const d = await (await get('/api/site/1/details')).json() as SiteDetailsFeed
    expect(d.closures.map(c => c.reason)).toEqual(['Closed for Christmas', 'Epifanía del Señor'])
  })

  it('keeps each business’s switch and details its own, each in its own time zone', async () => {
    details(2)
    expect((await get('/api/site/1/details')).status).toBe(404)
    const d = await (await get('/api/site/2/details')).json() as SiteDetailsFeed
    expect(d).toMatchObject({ business: { id: 2, name: 'Bar Dos' }, timezone: 'Europe/Dublin', whatsapp: null, social: { instagram: null, tiktok: null } })
    expect(d.closures).toEqual([{ from: '2026-12-22', to: '2026-12-22', reason: 'Closed for a funeral' }])
  })
})
