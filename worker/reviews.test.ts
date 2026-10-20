// Reviews and Website & SEO, end to end through the Worker's routes against stand-ins for Supabase,
// Google (Business Profile, Places, PageSpeed) and the business's website. What must never break:
//   - reviews come from the business's own profile when connected (with replies), else Places
//   - each new review is noticed once; admins hear about recent ones, low stars flagged
//   - only admins read reviews, reply or check the website
//   - the website check finds what's wrong and says how to fix it; PageSpeed's quota is explained
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { checkReviews, reviews } from './reviews'
import { website } from './website'
import { serviceClient, type Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret',
} as unknown as Env
const withPlaces = { ...env, GOOGLE_PLACES_API_KEY: 'places-key', GOOGLE_PLACE_ID: 'ChIJeasybeans' } as Env

let db: FakeSupabase
let apis: FakeProviders
/** The business's website, page by page (path → HTML, or a status for a page that isn't there). */
let site: Record<string, string | number>
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  site = {}
  db.table('business')[0] = { id: 1, name: 'Easy Beans Coffee', phone: '+34 695 415 335', address: 'C. Pizarro, 8, 29670 San Pedro de Alcántara',
    website: 'https://www.easybeans.test/', opening_hours: { mon: { open: '08:00', close: '18:00' } }, timezone: 'Europe/Madrid' }
  db.tables.reviews = []
  db.tables.website_checks = [{ id: 1, url: null, report: null, checked_at: null, pagespeed: {} }]
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const u = new URL(url)
    if (u.host === 'www.easybeans.test') {
      const page = site[u.pathname]
      const res = typeof page === 'string' ? new Response(init?.method === 'HEAD' ? null : page, { headers: { 'content-type': u.pathname.endsWith('.txt') ? 'text/plain' : 'text/html' } })
        : new Response('Not found', { status: typeof page === 'number' ? page : 404 })
      Object.defineProperty(res, 'url', { value: url })
      return res
    }
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const admin = { authorization: 'Bearer admin-token', 'content-type': 'application/json' }
const staff = { authorization: 'Bearer staff-token' }
const call = (app: typeof reviews, path: string, init: RequestInit = {}, e = env) => app.request(`${APP}${path}`, init, e, ctx())
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

async function connectMaps() {
  const start = await integrations.request(`${APP}/api/integrations/google/start`, { method: 'POST', headers: admin, body: '{}' }, env, ctx())
  const state = new URL((await start.json() as { url: string }).url).searchParams.get('state')!
  await integrations.request(`${APP}/api/integrations/google/callback?code=c&state=${encodeURIComponent(state)}`, {}, env, ctx())
  expect(db.integration('google_business')).toMatchObject({ status: 'connected', external: { location: 'locations/1', account: 'accounts/1' } })
}
const profileReview = (id: string, stars: string, comment: string, name: string, ago: number) =>
  ({ name: `accounts/1/locations/1/reviews/${id}`, reviewId: id, starRating: stars, comment, createTime: daysAgo(ago), reviewer: { displayName: name } })

describe('Reviews', () => {
  it('only admins read reviews or reply', async () => {
    expect((await call(reviews, '/api/reviews')).status).toBe(403)
    expect((await call(reviews, '/api/reviews', { headers: staff })).status).toBe(403)
    expect((await call(reviews, '/api/reviews/reply', { method: 'PUT', headers: staff, body: '{}' })).status).toBe(403)
  })

  it('with nothing set up, the page is told to connect Google Maps', async () => {
    const s = await (await call(reviews, '/api/reviews', { headers: admin })).json() as { feed: null; problem: string; reviews: unknown[] }
    expect(s).toMatchObject({ feed: null, reviews: [] })
    expect(s.problem).toMatch(/Connect Google Maps/)
  })

  it('the business’s own profile: every review, with replies; a new one is noticed once and admins hear about it', async () => {
    await connectMaps()
    apis.google.reviews = [
      profileReview('new', 'TWO', 'Tardaron mucho en servirnos el café', 'Tom', 1),
      profileReview('old', 'FIVE', 'Lovely coffee and really friendly staff\n\n(Translated by Google)\nCafé precioso', 'Ana López', 60),
    ]
    apis.google.replies.set('accounts/1/locations/1/reviews/old', 'Thank you Ana!')
    const s = await (await call(reviews, '/api/reviews', { headers: admin })).json() as { feed: string; can_reply: boolean; reviews: Record<string, unknown>[] }
    expect(s).toMatchObject({ feed: 'business_profile', can_reply: true })
    expect(s.reviews.map(r => r.id)).toEqual(['accounts/1/locations/1/reviews/new', 'accounts/1/locations/1/reviews/old'])
    expect(s.reviews[0]).toMatchObject({ rating: 2, language: 'es', reviewer: 'Tom', reply: null })
    expect(s.reviews[1]).toMatchObject({ rating: 5, language: 'en', text: 'Lovely coffee and really friendly staff', reply: 'Thank you Ana!' })
    // Only the recent one is news; the 60-day-old one was simply there already. Low stars are flagged.
    const notes = db.table('notifications').filter(n => n.kind === 'review')
    // One for each active admin.
    expect(notes.map(n => [n.profile_id, n.title])).toEqual([['admin-1', 'New 2★ review from Tom: worth a reply'], ['admin-2', 'New 2★ review from Tom: worth a reply']])
    expect(notes[0]).toMatchObject({ link: '/reviews', data: { review: 'accounts/1/locations/1/reviews/new', low: true } })
    // Looking again finds nothing new.
    expect((await checkReviews(env, serviceClient(env))).added).toBe(0)
    expect(db.table('notifications').filter(n => n.kind === 'review')).toHaveLength(2)
  })

  it('a reply goes to Google and is kept; the notification about it is marked read', async () => {
    await connectMaps()
    apis.google.reviews = [profileReview('new', 'TWO', 'Slow service', 'Tom', 1)]
    await call(reviews, '/api/reviews', { headers: admin })
    const id = 'accounts/1/locations/1/reviews/new'
    expect((await call(reviews, '/api/reviews/reply', { method: 'PUT', headers: admin, body: JSON.stringify({ id, text: '  ' }) })).status).toBe(400)
    const res = await call(reviews, '/api/reviews/reply', { method: 'PUT', headers: admin, body: JSON.stringify({ id, text: 'Sorry Tom, we’d love to make it up to you.' }) })
    expect(res.status).toBe(200)
    expect(apis.google.replies.get(id)).toBe('Sorry Tom, we’d love to make it up to you.')
    expect(db.table('reviews').find(r => r.id === id)).toMatchObject({ reply: 'Sorry Tom, we’d love to make it up to you.' })
    expect(db.table('notifications').filter(n => n.kind === 'review').every(n => n.read_at)).toBe(true)
    expect((await call(reviews, '/api/reviews/reply', { method: 'DELETE', headers: admin, body: JSON.stringify({ id }) })).status).toBe(200)
    expect(apis.google.replies.has(id)).toBe(false)
  })

  it('until the profile is connected: Places’ five newest, with Google’s own totals and no replying', async () => {
    apis.places.reviews = [{ name: 'places/ChIJeasybeans/reviews/p1', rating: 5, publishTime: daysAgo(2), originalText: { text: 'Riquísimo todo', languageCode: 'es' },
      authorAttribution: { displayName: 'Marta' }, googleMapsUri: 'https://maps.google.com/?r=p1' }]
    const s = await (await call(reviews, '/api/reviews', { headers: admin }, withPlaces)).json() as { feed: string; can_reply: boolean; google_rating: number; google_count: number; reviews: Record<string, unknown>[] }
    expect(s).toMatchObject({ feed: 'places', can_reply: false, google_rating: 4.7, google_count: 38 })
    expect(s.reviews[0]).toMatchObject({ id: 'places/ChIJeasybeans/reviews/p1', language: 'es', url: 'https://maps.google.com/?r=p1' })
    const res = await call(reviews, '/api/reviews/reply', { method: 'PUT', headers: admin, body: JSON.stringify({ id: 'places/ChIJeasybeans/reviews/p1', text: 'Gracias' }) }, withPlaces)
    expect(res.status).toBe(400)
  })
})

const HOME = `<html lang="es"><head><title>Easy Beans Coffee · Specialty café in San Pedro</title>
<meta name="viewport" content="width=device-width"><link rel="canonical" href="https://www.easybeans.test/">
<script type="application/ld+json">{"@type":"CafeOrCoffeeShop","name":"Easy Beans Coffee","telephone":"+34 600 111 222"}</script></head>
<body><h1>Easy Beans</h1><img src="a.jpg"><a href="/menu">Menu</a><a href="/old">Old</a></body></html>`

describe('Website & SEO', () => {
  it('only admins check the website', async () => {
    expect((await call(website, '/api/website/check', { method: 'POST', headers: staff })).status).toBe(403)
  })

  it('checks the homepage and the pages it links to, and says what to fix', async () => {
    site = { '/': HOME, '/menu': '<html><head><title>Menu</title></head><body><a href="/gone">x</a></body></html>', '/old': 404, '/robots.txt': 'User-agent: *\nAllow: /' }
    const res = await call(website, '/api/website/check', { method: 'POST', headers: admin })
    expect(res.status).toBe(200)
    const { report } = await res.json() as { report: { items: { id: string; level: string; fix?: string; pages?: string[] }[]; pages: { url: string }[]; site_business: unknown } }
    const find = (id: string) => report.items.find(i => i.id === id)
    expect(find('description')).toMatchObject({ level: 'fail' })
    expect(find('description')!.fix).toMatch(/meta description/)
    expect(find('broken')).toMatchObject({ level: 'fail', pages: ['https://www.easybeans.test/old (404)', 'https://www.easybeans.test/gone (404)'] })
    expect(find('business_phone')).toMatchObject({ level: 'warn' })
    expect(find('sitemap')).toMatchObject({ level: 'warn' })
    expect(find('alt')).toMatchObject({ level: 'warn' })
    expect(report.pages.map(p => p.url)).toEqual(['https://www.easybeans.test/', 'https://www.easybeans.test/menu'])
    expect(db.table('website_checks')[0]).toMatchObject({ url: 'https://www.easybeans.test/' })
    // Asked again straight away: the one just made, without fetching the site again.
    site = {}
    expect((await call(website, '/api/website/check', { method: 'POST', headers: admin })).status).toBe(200)
  })

  it('a website that doesn’t answer, or none on the Business page, is said plainly', async () => {
    expect(((await (await call(website, '/api/website/check', { method: 'POST', headers: admin })).json()) as { error: string }).error).toMatch(/answered with an error \(404\)/)
    db.table('business')[0].website = null
    expect(((await (await call(website, '/api/website/check', { method: 'POST', headers: admin })).json()) as { error: string }).error).toBe('Add the website on the Business page first.')
  })

  it('PageSpeed: the scores are kept per phone or computer; a used-up quota is explained', async () => {
    const res = await call(website, '/api/website/pagespeed', { method: 'POST', headers: admin, body: JSON.stringify({ strategy: 'mobile' }) })
    const { pagespeed } = await res.json() as { pagespeed: { scores: { performance: number }; vitals: { lcp_ms: number; field: boolean }; opportunities: string[] } }
    expect(pagespeed).toMatchObject({ scores: { performance: 62 }, vitals: { lcp_ms: 3200, field: false }, opportunities: ['Serve images in modern formats'] })
    expect(apis.pagespeed.calls).toEqual([{ url: 'https://www.easybeans.test/', strategy: 'mobile' }])
    expect((db.table('website_checks')[0].pagespeed as Record<string, unknown>).mobile).toBeTruthy()
    apis.pagespeed.quotaUsed = true
    const busy = await call(website, '/api/website/pagespeed', { method: 'POST', headers: admin, body: JSON.stringify({ strategy: 'desktop' }) })
    expect(busy.status).toBe(400)
    expect((await busy.json() as { error: string }).error).toMatch(/free allowance is used up/)
  })
})
