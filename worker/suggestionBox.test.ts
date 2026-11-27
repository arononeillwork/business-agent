// The suggestion box (worker/suggestionBox.ts), through the Worker against a stand-in for Supabase. What
// must never break:
//   - an idea a customer sends is on the Suggestions page: that business's, not sorted yet, from the
//     "Suggestion box", on the business's own day, with their name when they gave one
//   - a number that's no business is "not found", for the page and for an idea
//   - an empty or overlong idea is refused with a reason the page can show, and nothing is saved
//   - a robot filling in the hidden field is told it worked, and nothing is saved
//   - from one address, five an hour (kept as an HMAC, never the address); a business, sixty an hour
//   - the page speaks the customer's language, and escapes the business's name and what was typed
//   - without JavaScript, a plain form post gets the page back saying how it went
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { suggestionBox, LIMIT_BUSINESS_PER_HOUR, LIMIT_PER_HOUR } from './suggestionBox'
import { readIdea, suggestionBoxPage, suggestionBoxUrl } from '../shared/suggestionBox'
import { isUsualSource, SUGGESTION_BOX_SOURCE } from '../shared/suggestions'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key',
} as unknown as Env
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

let db: FakeSupabase

beforeEach(() => {
  db = new FakeSupabase()
  db.tables.business = [
    { id: 1, name: 'Easy Beans Coffee', country: 'ES', timezone: 'Europe/Madrid' },
    { id: 2, name: 'Bar <Dos>', country: 'IE', timezone: 'Europe/Dublin' },
  ]
  db.tables.brand = [{ id: 1, business_id: 1, colours: [{ name: 'Rose Pink', hex: '#F79BA4', role: 'primary' }] }]
  db.tables.customer_suggestions = []
  db.tables.suggestion_box_sends = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const call = (path: string, init: RequestInit = {}) => suggestionBox.request(`${APP}${path}`, init, env, ctx())
const send = (business: number | string, body: unknown, ip = '203.0.113.7', headers: Record<string, string> = {}) =>
  call(`/api/site/${business}/suggestion`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers }, body: JSON.stringify(body) })
const ideas = () => db.table('customer_suggestions')

describe('the suggestion box', () => {
  it('saves an idea onto the business’s Suggestions page: not sorted yet, from the suggestion box, on its own day', async () => {
    // 23:30 in Dublin on the 27th is the 27th there, though it's past midnight in Madrid.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-27T23:30:00Z'))
    const res = await send(2, { idea: '  A   quiz night on Thursdays ', name: ' Siobhán ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(ideas()).toHaveLength(1)
    expect(ideas()[0]).toMatchObject({ business_id: 2, text: 'A quiz night on Thursdays', customer: 'Siobhán', source: 'Suggestion box', heard_on: '2026-11-27' })
    expect(ideas()[0].group_id ?? null).toBeNull()
    expect(SUGGESTION_BOX_SOURCE).toBe('Suggestion box')
    expect(isUsualSource(SUGGESTION_BOX_SOURCE)).toBe(true)
    // Counted for the limits as an HMAC of the address, never the address.
    const sends = db.table('suggestion_box_sends')
    expect(sends).toHaveLength(1)
    expect(sends[0].business_id).toBe(2)
    expect(sends[0].ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(sends)).not.toContain('203.0.113.7')
  })

  it('keeps no name when none is given', async () => {
    expect((await send(1, { idea: 'Oat milk at no extra cost' })).status).toBe(200)
    expect(ideas()[0]).toMatchObject({ business_id: 1, text: 'Oat milk at no extra cost', customer: null })
  })

  it('answers a number that is no business as "not found", and saves nothing', async () => {
    for (const business of [7, 0, 'abc']) {
      const res = await send(business, { idea: 'Hello' })
      expect(res.status, String(business)).toBe(404)
      expect(await res.json()).toMatchObject({ problem: 'off' })
      const page = await call(`/api/site/${business}/suggest`, { headers: { 'accept-language': 'en-GB' } })
      expect(page.status).toBe(404)
      expect(await page.text()).toContain('This suggestion box isn’t here.')
    }
    expect(ideas()).toEqual([])
  })

  it('refuses an empty or overlong idea, or an overlong name, with a reason the page shows', async () => {
    for (const [body, problem] of [[{ idea: '   ' }, 'empty'], [{ idea: 'x'.repeat(1001) }, 'tooLong'], [{ idea: 'Hi', name: 'n'.repeat(121) }, 'nameTooLong']] as const) {
      const res = await send(1, body)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ problem })
    }
    expect(readIdea({ idea: 'x'.repeat(1000) })).toEqual({ idea: { text: 'x'.repeat(1000), customer: null } })
    expect(ideas()).toEqual([])
  })

  it('tells a robot that fills in the hidden field it worked, and saves nothing', async () => {
    const res = await send(1, { idea: 'Buy cheap watches', website: 'https://spam.example' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(ideas()).toEqual([])
    expect(db.table('suggestion_box_sends')).toEqual([])
  })

  it('takes five an hour from one address, and sixty a business from everyone', async () => {
    for (let i = 0; i < LIMIT_PER_HOUR; i++) expect((await send(1, { idea: `Idea ${i}` })).status).toBe(200)
    const sixth = await send(1, { idea: 'One more' })
    expect(sixth.status).toBe(429)
    expect(await sixth.json()).toMatchObject({ problem: 'tooMany' })
    // Someone else at the café still can, and another business's box is its own.
    expect((await send(1, { idea: 'From the next table' }, '198.51.100.4')).status).toBe(200)
    expect((await send(2, { idea: 'Same phone, other bar' })).status).toBe(200)
    expect(ideas()).toHaveLength(LIMIT_PER_HOUR + 2)

    // A business has a cap an hour on top, for addresses that keep changing.
    const at = new Date(Date.now() - 60_000).toISOString()
    db.tables.suggestion_box_sends = Array.from({ length: LIMIT_BUSINESS_PER_HOUR }, (_, i) => ({ id: `s${i}`, business_id: 2, ip_hash: 'a'.repeat(64), created_at: at }))
    expect((await send(2, { idea: 'Too many today' }, '192.0.2.99')).status).toBe(429)
    expect((await send(1, { idea: 'Easy Beans still takes them' }, '192.0.2.99')).status).toBe(200)
  })

  it('lets go of sends older than a day', async () => {
    const old = new Date(Date.now() - 2 * 86_400_000).toISOString()
    db.tables.suggestion_box_sends = [{ id: 'old', business_id: 1, ip_hash: 'b'.repeat(64), created_at: old }, { id: 'theirs', business_id: 2, ip_hash: 'b'.repeat(64), created_at: old }]
    expect((await send(1, { idea: 'Brunch on Sundays' })).status).toBe(200)
    expect(db.table('suggestion_box_sends').map(r => r.id)).not.toContain('old')
    // Another business's are left for it.
    expect(db.table('suggestion_box_sends').map(r => r.id)).toContain('theirs')
  })
})

describe('the suggestion box page', () => {
  it('is in the customer’s language, in the business’s colour, and escapes its name', async () => {
    const es = await call('/api/site/1/suggest', { headers: { 'accept-language': 'es-ES,es;q=0.9' } })
    expect(es.status).toBe(200)
    expect(es.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    const html = await es.text()
    expect(html).toContain('<html lang="es">')
    expect(html).toContain('¿Tienes una idea para nosotros?')
    expect(html).toContain('Easy Beans Coffee')
    expect(html).toContain('--accent:#F79BA4')
    expect(html).toContain('action="/api/site/1/suggestion"')

    // An Irish business's page is in English for a browser that says neither; its name is escaped.
    const ie = await (await call('/api/site/2/suggest')).text()
    expect(ie).toContain('<html lang="en">')
    expect(ie).toContain('Got an idea for us?')
    expect(ie).toContain('Bar &lt;Dos&gt;')
    expect(ie).not.toContain('Bar <Dos>')
    // Asked for in the address, it wins.
    expect(await (await call('/api/site/2/suggest?lang=es')).text()).toContain('Tu idea')
  })

  it('without JavaScript: a plain form post gets the page back, thanking them or keeping what they typed to fix', async () => {
    const form = (body: Record<string, string>) => call('/api/site/1/suggestion', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': '203.0.113.9' }, body: new URLSearchParams(body).toString(),
    })
    const done = await form({ idea: 'Decaf oat flat white', name: 'Ana', lang: 'en' })
    expect(done.status).toBe(200)
    expect(done.headers.get('content-type')).toContain('text/html')
    expect(await done.text()).toContain('Thank you! Your idea is with the team.')
    expect(ideas()[0]).toMatchObject({ text: 'Decaf oat flat white', customer: 'Ana' })

    const empty = await form({ idea: ' ', name: '<b>Ana</b>', lang: 'es' })
    expect(empty.status).toBe(400)
    const html = await empty.text()
    expect(html).toContain('Escribe primero tu idea.')
    expect(html).toContain('value="&lt;b&gt;Ana&lt;/b&gt;"')
    expect(ideas()).toHaveLength(1)
  })

  it('keeps what was typed out of its script, and gives the code its address', () => {
    const html = suggestionBoxPage({ business: 1, name: '</script><script>alert(1)</script>', colour: null, lang: 'en' })
    expect(html).not.toContain('<script>alert(1)')
    expect(suggestionBoxUrl('https://businesssagent.com/', 1)).toBe('https://businesssagent.com/api/site/1/suggest')
  })
})
