// Set-up guide, "already open": the Worker reads a business's website for its brand, through its
// route against stand-ins for Supabase (who's asking), Firecrawl and the website. What must never break:
//   - only admins can ask, and only for a public website
//   - with FIRECRAWL_API_KEY, Firecrawl's branding is used (colours and fonts the page shows), the HTML fills the gaps
//   - without it (or when Firecrawl fails), the page's own HTML still gives the logo, colours, fonts and details
//   - the logo and icon come back as data: URLs; anything that isn't an image, or is too big, is left out
//   - the same site asked again within the hour costs no second Firecrawl credit
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { brandLookup } from './brandLookup'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import type { FoundBrand } from '../shared/brandLookup'

const APP = 'https://app.test'
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' } as unknown as Env
const withFirecrawl = { ...env, FIRECRAWL_API_KEY: 'fc-test' } as Env
const admin = { authorization: 'Bearer admin-token', 'content-type': 'application/json' }
const staff = { authorization: 'Bearer staff-token', 'content-type': 'application/json' }
const ctx = () => ({ waitUntil(p: Promise<unknown>) { void p }, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

const HOME = `<html><head><title>Café Lola | Coffee</title><meta name="theme-color" content="#2F5D50">
  <link rel="apple-touch-icon" href="/touch.png">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display&family=Lato" rel="stylesheet">
  <script type="application/ld+json">{"@type":"CafeOrCoffeeShop","name":"Café Lola","telephone":"+34 952 78 12 34","logo":"/logo.svg"}</script>
</head><body><a href="https://instagram.com/cafelola.sp">Instagram</a></body></html>`
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>'

let db: FakeSupabase
/** The website, path → response; and how Firecrawl answers. */
let site: Record<string, () => Response>
let firecrawl: () => Response
let calls: string[]
/** A stand-in for the edge cache, so a second ask can be answered from it. */
let cached: Map<string, Response>

beforeEach(() => {
  db = new FakeSupabase()
  calls = []
  cached = new Map()
  site = {
    '/': () => new Response(HOME, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    '/logo.svg': () => new Response(SVG, { headers: { 'content-type': 'image/svg+xml' } }),
    '/touch.png': () => new Response(PNG, { headers: { 'content-type': 'image/png' } }),
  }
  firecrawl = () => Response.json({ success: true, data: {
    branding: {
      colors: { primary: '#C8553D', secondary: '#E8C07D', background: '#FBF7F0' },
      typography: { fontFamilies: { heading: 'Fraunces', primary: 'Inter, sans-serif' } },
      images: { logo: 'https://cdn.cafelola.test/brand/logo.png', favicon: 'https://www.cafelola.test/favicon.ico' },
    },
    links: ['mailto:hola@cafelola.test'],
    metadata: { title: 'Café Lola | Coffee', url: 'https://www.cafelola.test/', statusCode: 200 },
  } })
  vi.stubGlobal('caches', { default: {
    match: async (r: Request) => cached.get(r.url)?.clone(),
    put: async (r: Request, res: Response) => { cached.set(r.url, res) },
  } })
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push(url)
    const u = new URL(url)
    if (u.host === 'www.cafelola.test' || u.host === 'cdn.cafelola.test') {
      const res = (u.host === 'cdn.cafelola.test' ? () => new Response(PNG, { headers: { 'content-type': 'image/png' } }) : site[u.pathname])?.()
        ?? new Response('Not found', { status: 404 })
      Object.defineProperty(res, 'url', { value: url })
      return res
    }
    if (url === 'https://api.firecrawl.dev/v2/scrape') {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer fc-test')
      expect(JSON.parse(String(init?.body))).toMatchObject({ url: 'https://www.cafelola.test/', formats: ['branding', 'links'] })
      return firecrawl()
    }
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const ask = (website: unknown, e = env, headers: Record<string, string> = admin) =>
  brandLookup.request(`${APP}/api/setup/brand`, { method: 'POST', headers, body: JSON.stringify({ website }) }, e, ctx())

describe('Set-up guide: the brand from the website', () => {
  it('only admins ask, and only for a public website', async () => {
    expect((await brandLookup.request(`${APP}/api/setup/brand`, { method: 'POST', body: '{}' }, env, ctx())).status).toBe(403)
    expect((await ask('www.cafelola.test', env, staff)).status).toBe(403)
    for (const bad of ['', 'localhost', 'http://169.254.169.254/latest']) {
      const res = await ask(bad)
      expect(res.status, bad).toBe(400)
      expect(await res.json()).toEqual({ error: 'Enter your website’s address, like www.yourbusiness.com' })
    }
    expect(calls.some(u => u.includes('169.254'))).toBe(false)
  })

  it('without Firecrawl: the page’s own HTML gives the logo, icon, colour, fonts and details', async () => {
    const res = await ask('www.cafelola.test')
    expect(res.status).toBe(200)
    const { found } = await res.json() as { found: FoundBrand }
    expect(found).toMatchObject({
      website: 'https://www.cafelola.test/', source: 'website', name: 'Café Lola', phone: '+34 952 78 12 34', instagram: 'cafelola.sp',
      colours: [{ name: 'Primary', hex: '#2F5D50', role: 'primary' }], heading_font: 'Playfair Display', body_font: 'Lato',
    })
    expect(found.logo).toBe(`data:image/svg+xml;base64,${btoa(SVG)}`)
    expect(found.icon).toMatch(/^data:image\/png;base64,/)
    expect(calls).not.toContain('https://api.firecrawl.dev/v2/scrape')
  })

  it('with Firecrawl: its colours, fonts and logo, and the HTML for the rest; asked again, the cache answers', async () => {
    const { found } = await (await ask('https://www.cafelola.test', withFirecrawl)).json() as { found: FoundBrand }
    expect(found).toMatchObject({ source: 'firecrawl', heading_font: 'Fraunces', body_font: 'Inter', email: 'hola@cafelola.test', phone: '+34 952 78 12 34' })
    expect(found.colours.map(c => c.hex)).toEqual(['#C8553D', '#E8C07D', '#FBF7F0'])
    expect(found.logo).toMatch(/^data:image\/png;base64,/)
    expect(calls).toContain('https://cdn.cafelola.test/brand/logo.png')
    // The touch icon (the favicon Firecrawl gave is an .ico).
    expect(calls).toContain('https://www.cafelola.test/touch.png')

    const again = await (await ask('https://www.cafelola.test', withFirecrawl)).json() as { found: FoundBrand }
    expect(again.found).toEqual(found)
    expect(calls.filter(u => u === 'https://api.firecrawl.dev/v2/scrape')).toHaveLength(1)
  })

  it('Firecrawl out of credit: the HTML alone still answers', async () => {
    firecrawl = () => Response.json({ success: false, error: 'Payment Required: Insufficient credits' }, { status: 402 })
    const { found } = await (await ask('www.cafelola.test', withFirecrawl)).json() as { found: FoundBrand }
    expect(found).toMatchObject({ source: 'website', heading_font: 'Playfair Display', name: 'Café Lola' })
  })

  it('leaves out what isn’t an image or is too big, and says so when the site doesn’t open', async () => {
    site['/logo.svg'] = () => new Response('<html>Not here</html>', { headers: { 'content-type': 'text/html' } })
    site['/touch.png'] = () => new Response(new Uint8Array(500_000), { headers: { 'content-type': 'image/png' } })
    const { found } = await (await ask('www.cafelola.test')).json() as { found: FoundBrand }
    expect(found.logo).toBeNull()
    expect(found.icon).toBeNull()
    expect(found.name).toBe('Café Lola')

    // An hour later (the cache has let it go), the site is down.
    cached.clear()
    site['/'] = () => new Response('Gone', { status: 500 })
    const down = await ask('www.cafelola.test')
    expect(down.status).toBe(422)
    expect(await down.json()).toEqual({ error: 'That website didn’t open. Check the address, or add your details yourself.' })
  })

  it('a site that says nothing about itself gets a message, not an empty list', async () => {
    site['/'] = () => new Response('<html><body><p>Coming soon</p></body></html>', { headers: { 'content-type': 'text/html' } })
    const res = await ask('www.cafelola.test')
    expect(res.status).toBe(422)
    expect((await res.json() as { error: string }).error).toMatch(/doesn’t say much about your brand/)
  })
})
