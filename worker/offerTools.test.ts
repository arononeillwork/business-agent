// The offers and screens tools for AI assistants: the business's latest posts with the offer read from
// each caption, an offer made from the latest post with an offer (its photo kept in the café's storage)
// and put on the screens, a typed-in offer, changing one, and the screens with their offers. The SQL
// rules (admins only, this business's screens) are proven in the offers migration's database tests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOLS, runTool, toolsFor } from './tools'
import { seal } from './crypto'
import { serviceClient, type Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import type { Profile } from '../shared/types'

const put = vi.fn(async () => undefined)
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
  INTEGRATION_KEY: 'test-integration-key', META_GRAPH_VERSION: 'v23.0', MEDIA: { put },
} as unknown as Env
const admin = { id: 'admin-1', full_name: 'Aron', role: 'admin', active: true, can_see_pay: true } as Profile
const employee = { id: 'staff-1', full_name: 'Julio', role: 'employee', active: true, can_see_pay: false } as Profile
const ORIGIN = 'https://app.test'
const NOW = Date.parse('2026-11-03T10:15:30Z') // Tuesday 11:15 in Madrid

let db: FakeSupabase
let media: Row[]
let fetched: string[]
let pagePosts: Row[]
const run = (name: string, args: unknown, me = admin, withEnv = true) =>
  runTool(TOOLS.find(t => t.name === name)!, { sb: serviceClient(env), me, ...(withEnv ? { env, origin: ORIGIN } : {}) }, args)

const IG_PHOTO = 'https://scontent-mad1-1.cdninstagram.com/v/t51/latte.jpg?oe=6730'

async function connectInstagram() {
  Object.assign(db.integration('instagram'), { status: 'connected', account_label: 'easy.beans.coffee', external: { username: 'easy.beans.coffee', user_id: '1789' } })
  db.table('integration_secrets').push({ provider: 'instagram', ciphertext: await seal(env.INTEGRATION_KEY!, { access_token: 'ig-token', expires_at: '2099-01-01T00:00:00Z', user_id: '1789' }) })
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  db = new FakeSupabase()
  db.rpcs.current_business_id = () => 1
  db.tables.screens = [
    { id: 's-tv', name: 'Café TV', active: true, orientation: 'landscape', slides: [{ id: 'a', kind: 'image', url: 'https://x.test/a.jpg', active: true }, { id: 'b', kind: 'menu', active: false }] },
    { id: 's-window', name: 'Window tablet', active: true, orientation: 'portrait', slides: [] },
    { id: 's-old', name: 'Old TV', active: false, orientation: 'landscape', slides: [] },
  ]
  db.tables.screen_status = [{ screen_id: 's-tv', last_seen_at: '2026-11-03T10:14:00Z' }]
  db.tables.offers = []
  media = [
    { id: '1801', caption: 'Sunset on the terrace 🌅 #sanpedro', media_type: 'IMAGE', media_url: 'https://scontent-mad1-1.cdninstagram.com/sunset.jpg', permalink: 'https://www.instagram.com/p/C3/', timestamp: '2026-11-03T08:00:00+0000' },
    { id: '1800', caption: '☕️ 2x1 iced lattes this weekend! ☕️\nBring a friend 👯\n#easybeans #coffee', media_type: 'IMAGE', media_url: IG_PHOTO, permalink: 'https://www.instagram.com/p/C2/', timestamp: '2026-11-02T08:00:00+0000' },
    { id: '1799', caption: 'Pumpkin spice latte €3.80 (usually €4.50)', media_type: 'VIDEO', media_url: 'https://x.cdninstagram.com/v.mp4', thumbnail_url: 'https://x.cdninstagram.com/v.jpg', permalink: 'https://www.instagram.com/reel/C1/', timestamp: '2026-10-20T08:00:00+0000' },
  ]
  fetched = []
  pagePosts = []
  put.mockClear()
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init)
    if (res) return res
    fetched.push(url)
    if (url.startsWith('https://graph.instagram.com/') && url.includes('me/media')) return Response.json({ data: media })
    if (url.startsWith('https://graph.facebook.com/') && url.includes('/pg1/posts')) return Response.json({ data: pagePosts })
    if (new URL(url).hostname.endsWith('.cdninstagram.com')) return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } })
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Offers and screens: the AI tools', () => {
  it('are for admins', () => {
    const names = ['latest_social_posts', 'list_screens', 'list_offers', 'save_offer']
    expect(toolsFor(admin).map(t => t.name)).toEqual(expect.arrayContaining(names))
    expect(toolsFor(employee).map(t => t.name).filter(n => names.includes(n))).toEqual([])
  })

  it('reads the latest posts on Instagram with the offer in each caption, and which is the latest with one', async () => {
    await connectInstagram()
    const out = await run('latest_social_posts', { limit: 3 }) as { source: string; account: string; latest_offer_post: string; posts: Row[] }
    expect(out).toMatchObject({ source: 'instagram', account: '@easy.beans.coffee', latest_offer_post: '1800' })
    expect(out.posts.map(p => [p.post_id, p.offer_found])).toEqual([['1801', false], ['1800', true], ['1799', true]])
    expect(out.posts[1]).toMatchObject({
      posted: 'Mon 2 Nov 2026 09:00', photo: IG_PHOTO, link: 'https://www.instagram.com/p/C2/',
      offer: { title: '2x1 iced lattes this weekend', price: '2 for 1', was_price: null, details: 'Bring a friend', runs: 'weekend' },
    })
    // A reel's cover is its photo.
    expect(out.posts[2]).toMatchObject({ photo: 'https://x.cdninstagram.com/v.jpg', video: true, offer: { price: '€3.80', was_price: '€4.50' } })
    expect(fetched.find(u => u.includes('me/media'))).toContain('limit=3')
  })

  it('reads the Facebook Page’s posts while Instagram isn’t connected', async () => {
    Object.assign(db.integration('facebook'), { status: 'connected', account_label: 'Easy Beans Coffee', external: { page_id: 'pg1' } })
    db.table('integration_secrets').push({ provider: 'facebook', ciphertext: await seal(env.INTEGRATION_KEY!, { pages: { pg1: 'page-token' } }) })
    pagePosts = [
      { id: 'pg1_9', message: 'Brunch for two €18, este fin de semana', created_time: '2026-11-01T09:30:00+0000', permalink_url: 'https://www.facebook.com/pg1/posts/9', full_picture: 'https://scontent.fbcdn.net/brunch.jpg' },
    ]
    const out = await run('latest_social_posts', {}) as { source: string; account: string; posts: Row[]; latest_offer_post: string; note: string }
    expect(out).toMatchObject({ source: 'facebook', account: 'Easy Beans Coffee', latest_offer_post: 'pg1_9' })
    expect(out.posts[0]).toMatchObject({ photo: 'https://scontent.fbcdn.net/brunch.jpg', offer: { price: '€18', runs: 'weekend' } })
    expect(out.note).toContain('Connect Instagram')
  })

  it('says to connect Instagram when neither it nor the Facebook Page is connected', async () => {
    await expect(run('latest_social_posts', {})).rejects.toThrow('Connect Instagram')
  })

  it('puts the special in the latest post on the screens that are on, from now, its photo kept in the café’s storage', async () => {
    await connectInstagram()
    const out = await run('save_offer', { from_post: 'latest' }) as { offer: Row; from_post: Row; note: string }
    const saved = db.table('offers')[0]
    expect(saved).toMatchObject({
      title: '2x1 iced lattes this weekend', price: '2 for 1', was_price: null, details: 'Bring a friend',
      starts_at: '2026-11-03T10:15:00.000Z', ends_at: '2026-11-08T22:59:00.000Z', // until Sunday 23:59 in Madrid
      screen_ids: ['s-tv', 's-window'], screen_mode: 'turns', seconds: 15, active: true,
    })
    expect(saved.image_url).toMatch(/^https:\/\/app\.test\/media\/posts\/[0-9a-f-]{36}\.jpg$/)
    expect(put).toHaveBeenCalledOnce()
    expect(out.from_post).toEqual({ post_id: '1800', link: 'https://www.instagram.com/p/C2/', source: 'instagram' })
    expect(out.offer).toMatchObject({ state: 'live now', shows_on: ['Café TV', 'Window tablet'] })
    expect(out.note).toBe('On Café TV, Window tablet now until Sun 8 Nov 23:59, then it comes off by itself.')
  })

  it('takes what is given over what the post says, and picks screens by name', async () => {
    await connectInstagram()
    await run('save_offer', { from_post: '1799', title: 'PSL', length: 'today', screens: ['café tv'], screen_mode: 'only' })
    expect(db.table('offers')[0]).toMatchObject({
      title: 'PSL', price: '€3.80', was_price: '€4.50', ends_at: '2026-11-03T22:59:00.000Z', screen_ids: ['s-tv'], screen_mode: 'only',
    })
    // The reel's cover, kept in the café's storage.
    expect(db.table('offers')[0].image_url).toMatch(/^https:\/\/app\.test\/media\/posts\//)
    expect(fetched).toContain('https://x.cdninstagram.com/v.jpg')
  })

  it('says when none of the latest posts has an offer', async () => {
    await connectInstagram()
    media = [media[0]]
    await expect(run('save_offer', { from_post: 'latest' })).rejects.toThrow('None of the latest 1 posts on Instagram has an offer in it')
  })

  it('adds a typed-in offer at a time in the business’s time zone, and changes it', async () => {
    const out = await run('save_offer', { title: 'Happy hour', price: '€2', was_price: '€3', starts: '2026-11-04 16:00', length: '2h', screens: ['Window'] }) as { offer: Row }
    expect(db.table('offers')[0]).toMatchObject({ starts_at: '2026-11-04T15:00:00.000Z', ends_at: '2026-11-04T17:00:00.000Z', screen_ids: ['s-window'], image_url: null })
    expect(out.offer).toMatchObject({ state: 'coming up', when: 'Wed 4 Nov 16:00 – Wed 4 Nov 18:00' })

    const id = 'a6f0c2de-5b1e-4c1f-9d3a-2f5e8b7c9d10'
    db.table('offers')[0].id = id
    await run('save_offer', { offer_id: id, starts: '2026-11-05 16:00', price: '€1.50' })
    // Moved, same length; the rest as it was.
    expect(db.table('offers')[0]).toMatchObject({ title: 'Happy hour', price: '€1.50', was_price: '€3', starts_at: '2026-11-05T15:00:00.000Z', ends_at: '2026-11-05T17:00:00.000Z', screen_ids: ['s-window'] })
  })

  it('refuses what the offers page would refuse', async () => {
    await expect(run('save_offer', {})).rejects.toThrow('Give the offer a title')
    await expect(run('save_offer', { title: 'X', starts: '2026-11-05 16:00', ends: '2026-11-05 15:00' })).rejects.toThrow('has to end after it starts')
    await expect(run('save_offer', { title: 'X', screens: ['Kitchen'] })).rejects.toThrow('No screen called "Kitchen". Screens: Café TV, Old TV, Window tablet')
    await expect(run('save_offer', { title: 'X', ends: '2026-11-05', length: '2h' })).rejects.toThrow('not both')
    expect(db.table('offers')).toEqual([])
  })

  it('lists the screens with their offers, and the offers with their screens', async () => {
    await run('save_offer', { title: 'Happy hour', price: '€2', length: '3h', screens: ['all'] })
    const screens = await run('list_screens', {}) as { screens: Row[] }
    expect(screens.screens.find(s => s.name === 'Café TV')).toMatchObject({ on: true, slides: 1, last_seen: 'Tue 3 Nov 11:14', offers: ['Happy hour (live now, Tue 3 Nov 11:15 – Tue 3 Nov 14:15)'] })
    expect(screens.screens.find(s => s.name === 'Old TV')).toMatchObject({ on: false, last_seen: 'never opened', offers: [] })
    const offers = await run('list_offers', {}) as { offers: Row[] }
    expect(offers.offers).toEqual([expect.objectContaining({ title: 'Happy hour', state: 'live now', shows_on: ['Café TV', 'Window tablet'], on_screen: 'in turn with the slides, 15 s each time' })])
  })
})
