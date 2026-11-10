// Menu images through Higgsfield and the screens' links, end to end through the Worker's routes
// against stand-ins for Supabase, Higgsfield and R2. What must never break:
//   - a Higgsfield key is kept only once Higgsfield accepts it, and only encrypted
//   - each image is asked for once (idempotency key), with a signed webhook only Higgsfield knows
//   - a finished image is copied into the café's storage (Higgsfield keeps it a week), once
//   - failures say why in plain words; a key Higgsfield stops taking turns the connection red
//   - a screen's link loads only its own slides, and never with a wrong link
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seal, unseal } from './crypto'
import { RECONNECT_FOR_PRICES, checkWaitingImages, menu, pushSquarePrices, syncSquareMenuIfChosen } from './menu'
import { screens } from './screens'
import { businessDb, type Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'

const APP = 'https://app.test'
const HF = 'https://api.higgsfield.ai'
const CDN = 'https://cdn.higgsfield.test'

let db: FakeSupabase
let r2: Map<string, { body: Uint8Array; type: string }>
let env: Env
/** What reached Higgsfield: each request's method, address, headers and body. */
let sent: { method: string; url: URL; headers: Headers; body: Record<string, unknown> | null }[]
/** Higgsfield's answers: the status of each request, and whether it takes the key. */
let hf: { keyOk: boolean; status: Record<string, Row>; submit: (url: URL) => Response | null }
let waits: Promise<unknown>[]
/**
 * Square's item library: its pages, whether the token may read it, and how often it was asked; whether it
 * may change items (ITEMS_WRITE), the changes sent (each batch-upsert's body), and answers to give them
 * instead (a version mismatch, Square being down).
 */
let sq: { pages: Row[][]; scopes: boolean; asked: number; writeScope: boolean; upserts: Row[]; refuse: Response[] }
const ctx = () => ({ waitUntil(p: Promise<unknown>) { waits.push(p) }, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])

beforeEach(() => {
  db = new FakeSupabase()
  r2 = new Map()
  waits = []
  sent = []
  env = {
    SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
    INTEGRATION_KEY: 'test-integration-key',
    MEDIA: {
      put: async (key: string, body: ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }) => {
        r2.set(key, { body: new Uint8Array(body as ArrayBuffer), type: opts?.httpMetadata?.contentType ?? '' })
      },
    },
  } as unknown as Env
  hf = { keyOk: true, status: {}, submit: () => null }
  sq = { pages: [], scopes: true, asked: 0, writeScope: true, upserts: [], refuse: [] }
  db.tables.brand = [{ id: 1, colours: [{ name: 'Rose', hex: '#F79BA4', role: 'primary' }] }]
  db.tables.menu_designs = [{ id: 'd1', name: 'Counter menu', format: 'physical', size: 'a4_portrait', mode: 'background', categories: [], title: null, subtitle: null,
    footer: 'Prices include IVA', image_id: null }]
  db.tables.recipes = [{ id: 'r1', name: 'Flat white', description: 'Silky', category: 'Coffee' }]
  db.tables.menu_images = []
  db.rpcs.menu_list = () => [{ id: 'r1', name: 'Flat white', category: 'Coffee', sell_price: 3.2, vat_rate: 10, description: 'Silky', photo_url: null,
    featured: false, on_menu: true, menu_sort: 1, variants: [] }]
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const fromDb = db.handle(url.href, init)
    if (fromDb) return fromDb
    if (url.origin === CDN) return new Response(PNG, { headers: { 'content-type': 'image/png' } })
    if (url.origin === 'https://connect.squareup.com' && url.pathname === '/v2/catalog/list') {
      sq.asked++
      if (new Headers(init.headers).get('authorization') !== 'Bearer sq-token') return json({ errors: [{ code: 'UNAUTHORIZED' }] }, 401)
      if (!sq.scopes) return json({ errors: [{ code: 'INSUFFICIENT_SCOPES', detail: 'The merchant has not given your application sufficient permissions' }] }, 403)
      expect(url.searchParams.get('types')).toBe('ITEM,CATEGORY,MODIFIER_LIST,IMAGE')
      const page = Number(url.searchParams.get('cursor') ?? 0)
      return json({ objects: sq.pages[page], ...(page + 1 < sq.pages.length ? { cursor: String(page + 1) } : {}) })
    }
    if (url.origin === 'https://connect.squareup.com' && url.pathname === '/v2/catalog/batch-retrieve') {
      const { object_ids } = JSON.parse(String(init.body)) as { object_ids: string[] }
      return json({ objects: sq.pages.flat().filter(o => object_ids.includes(o.id as string)) })
    }
    if (url.origin === 'https://connect.squareup.com' && url.pathname === '/v2/catalog/batch-upsert') {
      if (!sq.writeScope) return json({ errors: [{ code: 'INSUFFICIENT_SCOPES', detail: 'The merchant has not granted ITEMS_WRITE' }] }, 403)
      const refused = sq.refuse.shift()
      if (refused) return refused
      const body = JSON.parse(String(init.body)) as Row & { batches: { objects: Row[] }[] }
      sq.upserts.push(body)
      return json({ objects: body.batches[0].objects })
    }
    if (url.origin !== HF) throw new Error(`Unexpected request: ${init.method ?? 'GET'} ${url}`)
    const headers = new Headers(init.headers)
    sent.push({ method: init.method ?? 'GET', url, headers, body: init.body ? JSON.parse(String(init.body)) : null })
    if (headers.get('authorization') !== 'Key key-1234-abcd:the-secret' || !hf.keyOk) return json({ detail: 'Invalid credentials' }, 401)
    const status = url.pathname.match(/^\/requests\/([\w-]+)\/status$/)
    if (status) return hf.status[status[1]] ? json(hf.status[status[1]]) : json({ detail: 'Not found' }, 404)
    const custom = hf.submit(url)
    if (custom) return custom
    const id = `req-${sent.length}`
    hf.status[id] = { status: 'queued', request_id: id }
    return json({ status: 'queued', request_id: id, status_url: `${HF}/requests/${id}/status`, cancel_url: `${HF}/requests/${id}/cancel` })
  }))
})
afterEach(() => vi.unstubAllGlobals())

const admin = { authorization: 'Bearer admin-token', 'content-type': 'application/json' }
const call = (path: string, init: RequestInit = {}) => menu.request(`${APP}${path}`, init, env, ctx())
const post = (path: string, body: unknown, headers: Record<string, string> = admin) => call(path, { method: 'POST', headers, body: JSON.stringify(body) })
const connect = () => post('/api/menu/ai/connect', { key_id: 'key-1234-abcd', key_secret: 'the-secret' })
const image = (id: unknown) => db.table('menu_images').find(i => i.id === id)!

describe('Higgsfield: the business’s own API key', () => {
  it('is kept, encrypted, only once Higgsfield accepts it (asked without spending credits)', async () => {
    const wrong = await post('/api/menu/ai/connect', { key_id: 'key-1234-abcd', key_secret: 'nope' })
    expect(wrong.status).toBe(400)
    expect((await wrong.json() as { error: string }).error).toMatch(/didn’t accept the API key/)
    expect(db.secret('higgsfield')).toBeUndefined()

    expect((await connect()).status).toBe(200)
    // Proven by asking about a request that doesn't exist: 404 for a good key.
    expect(sent.at(-1)!.url.pathname).toBe('/requests/00000000-0000-4000-8000-000000000000/status')
    expect(await unseal(env.INTEGRATION_KEY!, db.secret('higgsfield')!.ciphertext as string)).toEqual({ key_id: 'key-1234-abcd', key_secret: 'the-secret' })
    expect(db.integration('higgsfield')).toMatchObject({ status: 'connected', account_label: 'Key key-…abcd', connected_by: 'admin-1', last_error: null })
  })

  it('takes the key pasted as one “id:secret”, and only from admins', async () => {
    expect((await post('/api/menu/ai/connect', { key_id: 'key-1234-abcd:the-secret' })).status).toBe(200)
    const staff = await post('/api/menu/ai/connect', { key_id: 'a', key_secret: 'b' }, { authorization: 'Bearer staff-token', 'content-type': 'application/json' })
    expect(staff.status).toBe(403)
    expect((await post('/api/menu/ai/connect', { key_id: 'only-the-id' })).status).toBe(400)
  })
})

describe('Menu images', () => {
  it('without Higgsfield connected, says to connect it', async () => {
    const res = await post('/api/menu/images', { design_id: 'd1', prompt: 'Terracotta', model: 'ideogram' })
    expect(res.status).toBe(409)
    expect((await res.json() as { error: string }).error).toMatch(/Connect Higgsfield first/)
  })

  it('asks Higgsfield once, with the brand’s colours, a signed webhook and the image’s own id as the idempotency key', async () => {
    await connect()
    const res = await post('/api/menu/images', { design_id: 'd1', prompt: 'Terracotta and olive branches', model: 'recraft' })
    expect(res.status).toBe(200)
    const { image: img } = await res.json() as { image: Row }
    expect(img).toMatchObject({ design_id: 'd1', source: 'ai', model: 'recraft', prompt: 'Terracotta and olive branches', status: 'queued' })
    const req = sent.at(-1)!
    expect(req.method).toBe('POST')
    expect(req.url.pathname).toBe('/recraft/v4.1/text-to-image')
    expect(req.headers.get('idempotency-key')).toBe(String(img.id))
    expect(req.url.searchParams.get('hf_webhook')).toMatch(new RegExp(`^${APP}/api/hooks/higgsfield/${img.id}/[0-9a-f]{32}$`))
    expect(req.body).toMatchObject({ aspect_ratio: '10:14', output_format: 'jpg', colors: [{ rgb: [247, 155, 164] }] })
    expect(req.body!.prompt).toMatch(/^Terracotta and olive branches\. Background artwork for a printed café menu, portrait\..*No text/)
    expect(image(img.id)).toMatchObject({ request_id: 'req-2', status_url: `${HF}/requests/req-2/status`, created_by: 'admin-1' })
  })

  it('writes the menu’s items and prices into a whole-menu image', async () => {
    await connect()
    db.tables.menu_designs[0].mode = 'full'
    await post('/api/menu/images', { design_id: 'd1', prompt: 'Chalkboard', model: 'ideogram' })
    expect(sent.at(-1)!.url.pathname).toBe('/ideogram/v4.0')
    expect(String(sent.at(-1)!.body!.prompt)).toMatch(/The heading reads "Easy Beans"\..*COFFEE: Flat white 3,20\s€/)
    // A business in Ireland: its prices as Ireland writes them, whoever makes the design.
    db.tables.business[0].country = 'IE'
    await post('/api/menu/images', { design_id: 'd1', prompt: 'Chalkboard', model: 'ideogram' })
    expect(String(sent.at(-1)!.body!.prompt)).toMatch(/COFFEE: Flat white €3\.20/)
  })

  it('a finished image comes by webhook, is copied into the café’s storage, once', async () => {
    await connect()
    const { image: img } = await (await post('/api/menu/images', { design_id: 'd1', prompt: 'Terracotta', model: 'ideogram' })).json() as { image: Row }
    const hook = new URL(sent.at(-1)!.url.searchParams.get('hf_webhook')!)
    const deliver = (path: string, body: unknown) => call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const done = { request_id: 'req-2', status: 'completed', error: null, payload: { images: [{ url: `${CDN}/out.png`, content_type: 'image/png' }] } }

    expect((await deliver(hook.pathname.replace(/[0-9a-f]{32}$/, '0'.repeat(32)), done)).status).toBe(404)
    expect((await deliver(hook.pathname, { hello: 'there' })).status).toBe(400)
    expect((await deliver(hook.pathname, done)).status).toBe(200)
    await Promise.all(waits)
    const kept = image(img.id)
    expect(kept).toMatchObject({ status: 'ready', stored: true, error: null })
    expect(kept.url).toMatch(new RegExp(`^${APP}/media/menu/[\\w-]+\\.png$`))
    expect(r2.size).toBe(1)
    expect([...r2.values()][0]).toEqual({ body: PNG, type: 'image/png' })

    // Higgsfield may deliver twice: acknowledged, nothing kept again.
    expect((await deliver(hook.pathname, done)).status).toBe(200)
    await Promise.all(waits)
    expect(r2.size).toBe(1)
  })

  it('the page asks how it’s going: being made, then ready', async () => {
    await connect()
    const { image: img } = await (await post('/api/menu/images', { item_id: 'r1', prompt: '', model: 'qwen' })).json() as { image: Row }
    expect(sent.at(-1)!.body!.prompt).toMatch(/^A professional photograph of Flat white: Silky/)
    hf.status['req-2'] = { status: 'in_progress' }
    expect((await (await post(`/api/menu/images/${img.id}/check`, {})).json() as { image: Row }).image.status).toBe('working')
    hf.status['req-2'] = { status: 'completed', images: [{ url: `${CDN}/photo.png` }] }
    expect((await (await post(`/api/menu/images/${img.id}/check`, {})).json() as { image: Row }).image).toMatchObject({ status: 'ready', stored: true })
  })

  it('with no storage of its own, keeps Higgsfield’s address (for its week)', async () => {
    env = { ...env, MEDIA: undefined } as Env
    await connect()
    const { image: img } = await (await post('/api/menu/images', { design_id: 'd1', prompt: 'Terracotta', model: 'ideogram' })).json() as { image: Row }
    hf.status['req-2'] = { status: 'completed', images: [{ url: `${CDN}/out.png` }] }
    await post(`/api/menu/images/${img.id}/check`, {})
    expect(image(img.id)).toMatchObject({ status: 'ready', stored: false, url: `${CDN}/out.png` })
  })

  it('a refused image says why; nothing more is asked', async () => {
    await connect()
    const { image: img } = await (await post('/api/menu/images', { design_id: 'd1', prompt: 'Terracotta', model: 'ideogram' })).json() as { image: Row }
    hf.status['req-2'] = { status: 'nsfw', request_id: 'req-2' }
    await post(`/api/menu/images/${img.id}/check`, {})
    expect(image(img.id)).toMatchObject({ status: 'failed' })
    expect(image(img.id).error).toMatch(/safety check/)
    const asked = sent.length
    await post(`/api/menu/images/${img.id}/check`, {})
    expect(sent.length).toBe(asked)
  })

  it('a key Higgsfield stops taking fails the image and turns the connection red', async () => {
    await connect()
    hf.keyOk = false
    const res = await post('/api/menu/images', { design_id: 'd1', prompt: 'Terracotta', model: 'ideogram' })
    expect(res.status).toBe(400)
    expect(db.table('menu_images')[0]).toMatchObject({ status: 'failed' })
    expect(db.integration('higgsfield')).toMatchObject({ status: 'error' })
    expect(db.table('notifications').some(n => n.title === 'Higgsfield stopped working')).toBe(true)
  })

  it('asks for words for artwork, a change for an edit, and makes at most four at once', async () => {
    await connect()
    expect((await (await post('/api/menu/images', { design_id: 'd1', prompt: ' ', model: 'ideogram' })).json() as { error: string }).error).toMatch(/Describe the look/)
    db.tables.menu_images.push({ id: 'ready-1', design_id: 'd1', item_id: null, url: `${APP}/media/menu/a.png`, status: 'ready' })
    expect((await (await post('/api/menu/images', { design_id: 'd1', prompt: '', model: 'qwen', edit_of: 'ready-1' })).json() as { error: string }).error).toBe('Say what to change')
    const edit = await post('/api/menu/images', { design_id: 'd1', prompt: 'Make it warmer', model: 'qwen', edit_of: 'ready-1' })
    expect(edit.status).toBe(200)
    expect(sent.at(-1)!.url.pathname).toBe('/alibaba/qwen-image-3/edit')
    expect(sent.at(-1)!.body).toMatchObject({ prompt: 'Make it warmer', image_urls: [`${APP}/media/menu/a.png`] })
    for (let i = 0; i < 4; i++) db.tables.menu_images.push({ id: `w${i}`, design_id: 'd1', status: 'queued', created_at: new Date().toISOString() })
    const fifth = await post('/api/menu/images', { design_id: 'd1', prompt: 'Terracotta', model: 'ideogram' })
    expect(fifth.status).toBe(429)
  })

  it('the cron asks about images whose webhook didn’t come, and gives up on ones Higgsfield never finished', async () => {
    await connect()
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
    hf.status['old'] = { status: 'completed', images: [{ url: `${CDN}/late.png` }] }
    db.tables.menu_images.push(
      { id: 'lost', design_id: 'd1', status: 'working', status_url: `${HF}/requests/old/status`, created_at: minutesAgo(10) },
      { id: 'fresh', design_id: 'd1', status: 'queued', status_url: `${HF}/requests/new/status`, created_at: minutesAgo(0.5) },
      { id: 'stuck', design_id: 'd1', status: 'queued', status_url: `${HF}/requests/x/status`, created_at: minutesAgo(200) })
    await checkWaitingImages(env, businessDb(env, 1))
    expect(image('lost')).toMatchObject({ status: 'ready', stored: true })
    expect(image('fresh')).toMatchObject({ status: 'queued' })
    expect(image('stuck')).toMatchObject({ status: 'failed' })
  })
})

describe('A screen’s link', () => {
  const open = (token: string) => screens.request(`${APP}/api/display/${token}`, {}, env, ctx())

  it('loads its slides, never cached; a wrong or old link loads nothing', async () => {
    const token = 'c0ffee00beef00c0ffee00beef00cafe'
    db.tables.screens = [{ id: 'screen-1', token, business_id: 1 }]
    db.rpcs.display_feed = ({ p_token }) => (p_token === token ? { screen: { name: 'Counter TV', slides: [] }, business: { name: 'Easy Beans', logo: null }, menus: {} } : null)
    const res = await open(token)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    // Whose screen it is goes with it (Easy Beans, business 1, has a bundled logo for its menus).
    expect(await res.json()).toMatchObject({ screen: { name: 'Counter TV' }, business: { name: 'Easy Beans', id: 1 } })
    expect((await open('0123456789abcdef0123456789abcdef')).status).toBe(404)
    expect((await open('not-a-token')).status).toBe(404)
  })
})

describe('A screen’s short link', () => {
  const open = (path: string) => screens.request(`${APP}/api${path}`, {}, env, ctx())
  const playing = async (path: string) => ((await (await open(path)).json()) as { screen?: { name: string } }).screen?.name

  it('finds the screen by the link name in the business the link names; without a name, its first screen (or slideshow)', async () => {
    db.tables.screens = [
      { id: 's1', token: 'a'.repeat(32), slug: 'cafe-tv', kind: 'screen', business_id: 1, created_at: '2026-11-01T10:00:00Z' },
      { id: 's2', token: 'b'.repeat(32), slug: 'cake-promo', kind: 'screen', business_id: 1, created_at: '2026-11-03T10:00:00Z' },
      { id: 's3', token: 'c'.repeat(32), slug: 'window', kind: 'slideshow', business_id: 1, created_at: '2026-11-04T10:00:00Z' },
      { id: 's4', token: 'd'.repeat(32), slug: 'cafe-tv', kind: 'screen', business_id: 2, created_at: '2026-11-02T10:00:00Z' },
    ]
    db.rpcs.display_feed = ({ p_token }) => ({ screen: { name: `screen ${String(p_token)[0]}`, slides: [] }, business: { name: 'Easy Beans', logo: null }, menus: {} })
    expect(await playing('/display-menu')).toBe('screen a')
    expect(await playing('/display-menu/cafe-tv')).toBe('screen a')
    expect(await playing('/display-menu/cake-promo')).toBe('screen b')
    expect(await playing('/slideshow/window')).toBe('screen c')
    expect(await playing('/slideshow')).toBe('screen c')
    // Another business's: its number in the link; the same name is its own screen.
    expect(await playing('/display-menu/2/cafe-tv')).toBe('screen d')
    expect(await playing('/display-menu/2')).toBe('screen d')
    expect(((await (await open('/display-menu/2/cafe-tv')).json()) as { business: { id: number } }).business.id).toBe(2)
    const res = await open('/display-menu/cafe-tv')
    expect(res.headers.get('cache-control')).toBe('no-store')
    for (const gone of ['/display-menu/nope', '/display-menu/3/cafe-tv', '/display-menu/0/cafe-tv', '/display-menu/Cafe%20TV', '/display-menu/2/cake-promo']) {
      expect((await open(gone)).status, gone).toBe(404)
    }
  })
})

describe('The menu from Square', () => {
  let sent: unknown = null
  beforeEach(async () => {
    env = { ...env, SQUARE_APP_ID: 'sq-app', SQUARE_APP_SECRET: 'sq-secret' } as Env
    db.tables.settings = [{ id: 1, menu_source: 'custom', menu_sync_error: null }]
    sent = null
    db.rpcs.sync_square_menu = ({ p }) => { sent = p; return { added: 2, changed: 1, off: 0 } }
    sq.pages = [
      [{ type: 'CATEGORY', id: 'c1', category_data: { name: 'Classics' } },
        { type: 'ITEM', id: 'i-fw', item_data: { name: 'Flat White', categories: [{ id: 'c1' }], variations: [
          { id: 'a', item_variation_data: { name: 'Hot', ordinal: 0, price_money: { amount: 380 } } },
          { id: 'b', item_variation_data: { name: 'Iced', ordinal: 1, price_money: { amount: 480 } } }] } }],
      [{ type: 'ITEM', id: 'i-esp', item_data: { name: 'Espresso', categories: [{ id: 'c1' }], variations: [{ id: 'c', item_variation_data: { name: 'Regular', price_money: { amount: 200 } } }] } }],
    ]
  })
  const connectSquare = async () => {
    Object.assign(db.integration('square'), { status: 'connected', external: { locations: [{ id: 'L1', name: 'Easy Beans' }] } })
    db.table('integration_secrets').push({ provider: 'square', ciphertext: await seal(env.INTEGRATION_KEY!, { access_token: 'sq-token', refresh_token: 'r', expires_at: '2099-01-01T00:00:00Z' }) })
  }
  const sync = () => post('/api/menu/square/sync', {})

  it('needs Square connected', async () => {
    const res = await sync()
    expect(res.status).toBe(409)
    expect((await res.json() as { error: string }).error).toMatch(/Connect Square on the Connections page first/)
    expect(sq.asked).toBe(0)
  })

  it('reads every page of the item library into the menu', async () => {
    await connectSquare()
    const res = await sync()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ added: 2, changed: 1, off: 0, items: 2 })
    expect(sq.asked).toBe(2)
    expect(sent).toMatchObject({ sections: ['Classics'], items: [
      { square_id: 'i-fw', name: 'Flat White', category: 'Classics', sell_price: 3.8, price_label: 'Hot', variants: [{ name: 'Iced', price_change: 1 }] },
      { square_id: 'i-esp', name: 'Espresso', sell_price: 2, price_label: null }] })
  })

  it('a connection made before the app read items is asked to connect again, and the page is told', async () => {
    await connectSquare()
    sq.scopes = false
    const res = await sync()
    expect(res.status).toBe(409)
    expect((await res.json() as { error: string }).error).toMatch(/Connect Square again/)
    expect(db.table('settings')[0].menu_sync_error).toMatch(/Connect Square again/)
    expect(sent).toBeNull()
  })

  it('the hourly read happens only while the menu comes from Square', async () => {
    await connectSquare()
    await syncSquareMenuIfChosen(env, businessDb(env, 1))
    expect(sq.asked).toBe(0)
    db.table('settings')[0].menu_source = 'square'
    await syncSquareMenuIfChosen(env, businessDb(env, 1))
    expect(sq.asked).toBe(2)
    expect(sent).not.toBeNull()
  })
})

describe('Menu prices back to Square', () => {
  beforeEach(async () => {
    env = { ...env, SQUARE_APP_ID: 'sq-app', SQUARE_APP_SECRET: 'sq-secret' } as Env
    db.tables.settings = [{ id: 1, menu_source: 'square' }]
    const v = (id: string, name: string, cents: number, ordinal: number) =>
      ({ id, type: 'ITEM_VARIATION', version: 11, item_variation_data: { item_id: 'i-fw', name, ordinal, pricing_type: 'FIXED_PRICING', price_money: { amount: cents, currency: 'EUR' } } })
    sq.pages = [[
      { type: 'ITEM', id: 'i-fw', version: 11, item_data: { name: 'Flat White', variations: [v('a', 'Hot', 380, 0), v('b', 'Iced', 480, 1)] } },
      { type: 'MODIFIER_LIST', id: 'm-syrup', modifier_list_data: { name: 'Syrup', modifiers: [] } },
    ]]
    db.tables.recipes = [
      { id: 'r-fw', name: 'Flat White', square_id: 'i-fw', sell_price: 4 },
      { id: 'r-syrup', name: 'Syrup', square_id: 'm-syrup', sell_price: 0.6 },
    ]
    db.tables.recipe_variants = [{ id: 'v1', recipe_id: 'r-fw', name: 'Iced', price_change: 1 }]
    db.tables.square_price_pushes = [{ recipe_id: 'r-fw', price: 4, queued_at: '2026-11-06T10:00:00.000Z', tries: 0, error: null, failed_at: null }]
    Object.assign(db.integration('square'), { status: 'connected', external: { locations: [{ id: 'L1', name: 'Easy Beans' }] } })
    db.table('integration_secrets').push({ provider: 'square', ciphertext: await seal(env.INTEGRATION_KEY!, { access_token: 'sq-token', refresh_token: 'r', expires_at: '2099-01-01T00:00:00Z' }) })
  })
  const push = () => post('/api/menu/square/prices', {})
  const waiting = () => db.table('square_price_pushes')

  it('sends a changed price to Square, each variation with its version, and it’s off the list', async () => {
    const res = await push()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sent: 1, refused: [], waiting: 0 })
    expect(sq.upserts).toHaveLength(1)
    const [up] = sq.upserts as { idempotency_key: string; batches: { objects: Row[] }[] }[]
    expect(up.idempotency_key).toBe(`price:r-fw:${Date.parse('2026-11-06T10:00:00.000Z')}`)
    expect(up.batches[0].objects).toEqual([
      expect.objectContaining({ id: 'a', type: 'ITEM_VARIATION', version: 11, item_variation_data: expect.objectContaining({ price_money: { amount: 400, currency: 'EUR' } }) }),
      expect.objectContaining({ id: 'b', version: 11, item_variation_data: expect.objectContaining({ price_money: { amount: 500, currency: 'EUR' } }) }),
    ])
    expect(waiting()).toEqual([])
    // Nothing left: Square isn't asked again.
    expect(await (await push()).json()).toEqual({ sent: 0, refused: [], waiting: 0 })
    expect(sq.upserts).toHaveLength(1)
  })

  it('a price already Square’s needs nothing sent', async () => {
    db.table('recipes')[0].sell_price = 3.8
    expect(await (await push()).json()).toMatchObject({ sent: 0, refused: [] })
    expect(sq.upserts).toEqual([])
    expect(waiting()).toEqual([])
  })

  it('a connection made before it could change items is asked to connect again; Square’s price stays', async () => {
    sq.writeScope = false
    const body = await (await push()).json() as { refused: { name: string; error: string }[] }
    expect(body.refused).toEqual([{ id: 'r-fw', name: 'Flat White', error: RECONNECT_FOR_PRICES }])
    expect(waiting()[0]).toMatchObject({ error: RECONNECT_FOR_PRICES })
    expect(waiting()[0].failed_at).toBeTruthy()
    // Refused: not tried again every minute.
    await pushSquarePrices(env, businessDb(env, 1))
    expect(sq.upserts).toEqual([])
  })

  it('extras are priced in Square, and say so', async () => {
    db.table('square_price_pushes').push({ recipe_id: 'r-syrup', price: 0.6, queued_at: '2026-11-06T10:01:00.000Z', tries: 0, error: null })
    const body = await (await push()).json() as { sent: number; refused: { name: string; error: string }[] }
    expect(body.sent).toBe(1)
    expect(body.refused).toEqual([{ id: 'r-syrup', name: 'Syrup', error: expect.stringMatching(/Extras/) }])
  })

  it('Square busy or changed meanwhile: tried again next minute, a few times, then given up on with why', async () => {
    const busy = () => json({ errors: [{ code: 'VERSION_MISMATCH', detail: 'Object version does not match' }] }, 400)
    sq.refuse = [busy(), json({ errors: [{ code: 'INTERNAL_SERVER_ERROR', detail: 'Down' }] }, 500)]
    expect(await (await push()).json()).toEqual({ sent: 0, refused: [], waiting: 1 })
    expect(waiting()[0]).toMatchObject({ tries: 1, error: null })
    await pushSquarePrices(env, businessDb(env, 1))
    expect(waiting()[0]).toMatchObject({ tries: 2, error: null })
    // Then it goes.
    await pushSquarePrices(env, businessDb(env, 1))
    expect(waiting()).toEqual([])
    expect(sq.upserts).toHaveLength(1)
    // Five times in a row, and it's given up on.
    db.table('square_price_pushes').push({ recipe_id: 'r-fw', price: 4.5, queued_at: '2026-11-06T11:00:00.000Z', tries: 4, error: null })
    db.table('recipes')[0].sell_price = 4.5
    sq.refuse = [busy()]
    await pushSquarePrices(env, businessDb(env, 1))
    expect(waiting()[0].error).toMatch(/version does not match/)
  })

  it('with the menu kept here again, nothing goes to Square', async () => {
    db.table('settings')[0].menu_source = 'custom'
    expect(await (await push()).json()).toEqual({ sent: 0, refused: [], waiting: 0 })
    expect(sq.upserts).toEqual([])
    expect(waiting()).toEqual([])
  })

  it('Square not connected: refused with why', async () => {
    db.integration('square').status = 'disconnected'
    const body = await (await push()).json() as { refused: { error: string }[] }
    expect(body.refused[0].error).toMatch(/isn’t connected/)
  })

  it('only admins send prices', async () => {
    expect((await post('/api/menu/square/prices', {}, { authorization: 'Bearer staff-token', 'content-type': 'application/json' })).status).toBe(403)
  })
})
