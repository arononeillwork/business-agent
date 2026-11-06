// Newsletter sign-ups from the business's own website (worker/newsletter.ts), through the Worker against a
// stand-in for Supabase. What must never break:
//   - nothing is taken until the business turns it on; off, or a number that's no business, is the same
//     "not found" (the numbers can't be used to list who's here); one business's switch is its own
//   - a sign-up saves the person with the topics the business has (keys and their tags), says back the
//     ones it doesn't, and says which way it came (the form the app hosts, a website, a list)
//   - an email that isn't one, or a phone that isn't one, is refused with a reason the form can show
//   - a robot filling in the hidden field is told it worked, and nothing is saved
//   - from one address, five an hour (kept as an HMAC, never the address); a website's server with the
//     business's key skips that, and only it may say when someone signed up or unsubscribe someone
//   - the form page speaks the visitor's language, asks what the business wants, and escapes its words
//   - only an admin makes the key (shown once; only its hash is kept) and brings in a list
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newsletter, IMPORT_BATCH } from './newsletter'
import { formPage, inkOn } from '../shared/newsletterForm'
import type { Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import type { NewsletterInterest } from '../shared/newsletter'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key',
} as unknown as Env
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

const TOPICS: NewsletterInterest[] = [
  { key: 'english', label: 'Learning English', labels: { en: 'Learning English', es: 'Aprender inglés' } },
  { key: 'offers', label: 'Offers', labels: { es: 'Ofertas' } },
]
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('')

let db: FakeSupabase
let signups: Row[]
let unsubscribes: Row[]

beforeEach(() => {
  db = new FakeSupabase()
  signups = []
  unsubscribes = []
  db.rpcs.newsletter_signup = a => { signups.push(a); return 'c-1' }
  db.rpcs.newsletter_unsubscribe = a => { unsubscribes.push(a); return a.p_email === 'lucia@example.com' }
  db.tables.business = [{ id: 1, name: 'Easy Beans Coffee' }, { id: 2, name: 'Bar <Dos>' }]
  db.tables.brand = [{ id: 1, business_id: 1, colours: [{ name: 'Rose Pink', hex: '#F79BA4', role: 'primary' }] }]
  db.tables.newsletter = [
    { id: 1, business_id: 1, enabled: false, interests: TOPICS, ask_name: false, ask_phone: true, heading: null, intro: null, key_hash: null, key_hint: null, key_made_at: null },
  ]
  db.tables.newsletter_events = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const call = (path: string, init: RequestInit = {}) => newsletter.request(`${APP}${path}`, init, env, ctx())
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  call(path, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', ...headers }, body: JSON.stringify(body) })
const turnOn = (business = 1, more: Row = {}) => Object.assign(db.table('newsletter').find(r => r.business_id === business)!, { enabled: true, ...more })

describe('newsletter sign-ups', () => {
  it('takes none until the business turns it on, and says so as "not found"', async () => {
    const res = await post('/api/site/1/signup', { email: 'lucia@example.com' })
    expect(res.status).toBe(404)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(await res.json()).toEqual({ error: 'This business doesn’t take newsletter sign-ups here.' })
    expect(signups).toEqual([])
  })

  it('answers a business with none, or a number that is no business, the same way', async () => {
    turnOn()
    for (const path of ['/api/site/2/signup', '/api/site/7/signup', '/api/site/0/signup', '/api/site/abc/signup']) {
      const res = await post(path, { email: 'lucia@example.com' })
      expect(res.status, path).toBe(404)
      expect(await res.json()).toEqual({ error: 'This business doesn’t take newsletter sign-ups here.' })
    }
    expect(signups).toEqual([])
  })

  it('lets any website send them from a browser (CORS), the key included', async () => {
    const res = await call('/api/site/1/signup', { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
    expect(res.headers.get('access-control-allow-headers')).toBe('content-type, authorization')
  })

  it('saves someone from a website’s form with the business’s topics, and says back the ones it doesn’t have', async () => {
    turnOn()
    const res = await post('/api/site/1/signup', { email: ' Lucia@Example.com ', phone: '600 111 222', interests: ['english', 'Ofertas', 'yoga'], lang: 'es',
      source: 'first_visit_popup', signed_up_at: '2026-01-01' }, { origin: 'https://www.easybeanscoffee.com' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, interests: ['english', 'offers'], ignored: ['yoga'] })
    expect(signups).toEqual([{
      p_email: 'lucia@example.com', p_first_name: null, p_last_name: null, p_phone: '+34 600 111 222', p_interests: ['english', 'offers'],
      p_tags: ['Learning English', 'Offers'], p_lang: 'es', p_place: 'first_visit_popup', p_via: 'website', p_ip_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      // Only a website's server (with the key) says when someone signed up.
      p_at: null,
    }])
    expect(JSON.stringify(signups)).not.toContain('203.0.113.7')
  })

  it('says which came through the form the app hosts', async () => {
    turnOn()
    await post('/api/site/1/signup', { email: 'ana@example.com', name: 'Ana Ruiz' }, { origin: APP })
    expect(signups[0]).toMatchObject({ p_via: 'form', p_first_name: 'Ana', p_last_name: 'Ruiz' })
  })

  it('refuses an email or phone that isn’t one, with a reason the form can show', async () => {
    turnOn()
    let res = await post('/api/site/1/signup', { email: 'lucia@' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Enter a valid email.', problem: 'invalidEmail' })
    res = await post('/api/site/1/signup', { email: 'lucia@example.com', phone: '12' })
    expect(await res.json()).toMatchObject({ problem: 'invalidPhone' })
    res = await call('/api/site/1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' })
    expect(res.status).toBe(400)
    expect(signups).toEqual([])
  })

  it('tells a robot that filled in the hidden field it worked, and saves nothing', async () => {
    turnOn()
    const res = await post('/api/site/1/signup', { email: 'bot@example.com', website: 'https://spam.test' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, interests: [], ignored: [] })
    expect(signups).toEqual([])
  })

  it('takes five an hour from one address; another address, or an older sign-up, still gets in', async () => {
    turnOn()
    await post('/api/site/1/signup', { email: 'first@example.com' })
    const hash = signups[0].p_ip_hash as string
    const now = Date.now()
    for (let i = 0; i < 5; i++) db.table('newsletter_events').push({ business_id: 1, ip_hash: hash, created_at: new Date(now - i * 60_000).toISOString() })
    const res = await post('/api/site/1/signup', { email: 'sixth@example.com' })
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ problem: 'tooMany' })
    expect((await post('/api/site/1/signup', { email: 'neighbour@example.com' }, { 'cf-connecting-ip': '198.51.100.1' })).status).toBe(200)
    db.table('newsletter_events').forEach(e => { e.created_at = new Date(now - 2 * 3600_000).toISOString() })
    expect((await post('/api/site/1/signup', { email: 'later@example.com' })).status).toBe(200)
    expect(signups.map(s => s.p_email)).toEqual(['first@example.com', 'neighbour@example.com', 'later@example.com'])
  })

  it('lets the website’s server in with its key: no limit, older sign-ups dated, a wrong key refused', async () => {
    turnOn(1, { key_hash: await sha256('nl_good') })
    db.table('newsletter_events').push(...Array.from({ length: 5 }, () => ({ business_id: 1, ip_hash: 'x', created_at: new Date().toISOString() })))
    const res = await post('/api/site/1/signup', { email: 'old@example.com', interests: ['offers'], signed_up_at: '2026-10-17T09:00:00Z' }, { authorization: 'Bearer nl_good' })
    expect(res.status).toBe(200)
    expect(signups[0]).toMatchObject({ p_via: 'import', p_ip_hash: null, p_at: '2026-10-17T09:00:00.000Z' })
    await post('/api/site/1/signup', { email: 'new@example.com' }, { authorization: 'Bearer nl_good' })
    expect(signups[1]).toMatchObject({ p_via: 'website', p_at: null })
    const wrong = await post('/api/site/1/signup', { email: 'x@example.com' }, { authorization: 'Bearer nl_bad' })
    expect(wrong.status).toBe(401)
    expect(signups).toHaveLength(2)
  })

  it('unsubscribes someone only for the website’s server, with its key', async () => {
    turnOn(1, { key_hash: await sha256('nl_good') })
    expect((await post('/api/site/1/unsubscribe', { email: 'lucia@example.com' })).status).toBe(401)
    expect((await post('/api/site/1/unsubscribe', { email: 'lucia@example.com' }, { authorization: 'Bearer nl_bad' })).status).toBe(401)
    let res = await post('/api/site/1/unsubscribe', { email: ' Lucia@example.com ' }, { authorization: 'Bearer nl_good' })
    expect(await res.json()).toEqual({ ok: true, found: true })
    res = await post('/api/site/1/unsubscribe', { email: 'nobody@example.com' }, { authorization: 'Bearer nl_good' })
    expect(await res.json()).toEqual({ ok: true, found: false })
    expect(unsubscribes).toEqual([{ p_email: 'lucia@example.com', p_via: 'website' }, { p_email: 'nobody@example.com', p_via: 'website' }])
  })

  it('keeps one business’s switch its own', async () => {
    db.table('newsletter').push({ id: 1, business_id: 2, enabled: true, interests: [], ask_name: true, ask_phone: false, heading: null, intro: null, key_hash: null })
    expect((await post('/api/site/1/signup', { email: 'a@example.com' })).status).toBe(404)
    expect((await post('/api/site/2/signup', { email: 'a@example.com' })).status).toBe(200)
  })
})

describe('the form page', () => {
  it('is "not found" until the business turns it on', async () => {
    const res = await call('/api/site/1/newsletter?lang=en')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('This newsletter isn’t taking sign-ups just now.')
  })

  it('speaks the visitor’s language, asks what the business wants, in its colour, and may be shown inside any website', async () => {
    turnOn()
    const res = await call('/api/site/1/newsletter', { headers: { 'accept-language': 'es-ES,es;q=0.9' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('x-frame-options')).toBeNull()
    expect(res.headers.get('content-security-policy')).not.toContain('frame-ancestors')
    const html = await res.text()
    expect(html).toContain('<html lang="es">')
    expect(html).toContain('Suscríbete a nuestra newsletter')
    expect(html).toContain('Novedades, ofertas y eventos de Easy Beans Coffee')
    expect(html).toContain('value="english"> Aprender inglés')
    expect(html).toContain('value="offers"> Ofertas')
    expect(html).toContain('name="phone"')
    expect(html).not.toContain('name="name"')
    expect(html).toContain('--accent:#F79BA4;--ink:#1f1f1f')
    expect(html).toContain('action="/api/site/1/signup"')
  })

  it('uses the business’s own words, and escapes everything that is the business’s', async () => {
    db.table('newsletter').push({ id: 1, business_id: 2, enabled: true, interests: [{ key: 'x', label: '<script>alert(1)</script>', labels: {} }],
      ask_name: true, ask_phone: false, heading: 'Únete a "Dos"', intro: null, key_hash: null })
    const html = await (await call('/api/site/2/newsletter?lang=en&place=footer')).text()
    expect(html).toContain('<h1>Únete a &quot;Dos&quot;</h1>')
    expect(html).toContain('News, offers and events from Bar &lt;Dos&gt;')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('name="name"')
    expect(html).toContain('<input type="hidden" name="place" value="footer">')
    expect(html).toContain('--accent:#1f1f1f;--ink:#ffffff')
  })

  it('works without JavaScript: a plain form post shows the page again, saying how it went', async () => {
    turnOn()
    const form = (fields: string) => call('/api/site/1/signup', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: APP }, body: fields })
    let res = await form('lang=en&email=ana%40example.com&interests=english&interests=offers&place=footer')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('You’re on the list. Thank you!')
    expect(signups[0]).toMatchObject({ p_email: 'ana@example.com', p_interests: ['english', 'offers'], p_via: 'form', p_place: 'footer' })
    res = await form('lang=es&email=nope')
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('Escribe un email válido.')
  })

  it('writes on a colour in whichever reads better', () => {
    expect(inkOn('#F79BA4')).toBe('#1f1f1f')
    expect(inkOn('#6B8E4E')).toBe('#ffffff')
    expect(formPage({ business: 1, name: 'X', colour: null, lang: 'en', place: null, settings: { interests: [], ask_name: false, ask_phone: false,
      heading: null, intro: null }, said: 'done' })).toContain('You’re on the list. Thank you!')
  })
})

describe('the admins’ side', () => {
  const admin = { authorization: 'Bearer admin-token' }
  const staff = { authorization: 'Bearer staff-token' }

  it('makes the website key for an admin only: shown once, only its hash kept, and it works', async () => {
    expect((await call('/api/newsletter/key', { method: 'POST', headers: staff })).status).toBe(403)
    expect((await call('/api/newsletter/key', { method: 'POST' })).status).toBe(403)
    const res = await call('/api/newsletter/key', { method: 'POST', headers: admin })
    expect(res.status).toBe(200)
    const made = await res.json() as { key: string; key_hint: string }
    expect(made.key).toMatch(/^nl_[A-Za-z0-9]{40}$/)
    const row = db.table('newsletter').find(r => r.business_id === 1)!
    expect(row).toMatchObject({ key_hash: await sha256(made.key), key_hint: made.key.slice(-4) })
    expect(JSON.stringify(db.tables.newsletter)).not.toContain(made.key)
    turnOn()
    expect((await post('/api/site/1/signup', { email: 'a@example.com' }, { authorization: `Bearer ${made.key}` })).status).toBe(200)
    expect((await call('/api/newsletter/key', { method: 'DELETE', headers: admin })).status).toBe(200)
    expect(row).toMatchObject({ key_hash: null, key_hint: null, key_made_at: null })
    expect((await post('/api/site/1/signup', { email: 'a@example.com' }, { authorization: `Bearer ${made.key}` })).status).toBe(401)
  })

  it('brings in a list for an admin: each person dated as on the list, the ones without an email left out', async () => {
    const rows = [
      { email: 'ana@example.com', interests: ['offers', 'yoga'], signed_up_at: '2026-10-17T09:00:00Z', place: 'first_visit_popup', lang: 'es' },
      { email: 'not-an-email' },
      { email: 'ben@example.com', name: 'Ben Smith' },
    ]
    expect((await call('/api/newsletter/import', { method: 'POST', headers: { ...staff, 'content-type': 'application/json' }, body: JSON.stringify({ rows }) })).status).toBe(403)
    const res = await call('/api/newsletter/import', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify({ rows }) })
    expect(await res.json()).toEqual({ added: 2, skipped: 1, unknown: ['yoga'] })
    expect(signups).toEqual([
      expect.objectContaining({ p_email: 'ana@example.com', p_interests: ['offers'], p_tags: ['Offers'], p_via: 'import', p_at: '2026-10-17T09:00:00.000Z', p_lang: 'es' }),
      expect.objectContaining({ p_email: 'ben@example.com', p_first_name: 'Ben', p_last_name: 'Smith', p_via: 'import', p_at: null }),
    ])
    const many = Array.from({ length: IMPORT_BATCH + 1 }, (_, i) => ({ email: `p${i}@example.com` }))
    const tooMany = await call('/api/newsletter/import', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify({ rows: many }) })
    expect(tooMany.status).toBe(400)
  })
})
