// Set-up guide, "already open": read the business's website for its logo, colours, fonts and
// details (shared/brandLookup.ts). Admins only. With FIRECRAWL_API_KEY, Firecrawl's branding (the
// colours and fonts the page really shows, and its logo, even on a site built in the browser); the
// page's own HTML is read either way, for its structured data and links, and on its own when there's
// no key or Firecrawl can't help. The logo and icon are fetched here and handed back as data: URLs,
// the way the Brand page keeps them. A site read in the last day is answered from the cache, so
// asking again costs no Firecrawl credit (one a look-up; the live tests ask once a deploy). Nothing is saved: the guide saves what the owner ticks.
import { Hono } from 'hono'
import { bearer, type Env } from './supabase'
import { signInCheck } from './signedIn'
import { foundAnything, mergeReads, readFirecrawl, readHtml, siteAddress, type FirecrawlScrape, type FoundBrand } from '../shared/brandLookup'

export const brandLookup = new Hono<{ Bindings: Env }>()

/** The website is fetched as this (some sites refuse requests without a name). */
const AGENT = 'Mozilla/5.0 (compatible; BusinessAgentSetup/1.0; +https://businesssagent.com)'
const MAX_HTML = 3 * 1024 * 1024
/** Bytes: as base64 it stays under the Brand page's 700,000 characters. */
const MAX_IMAGE = 450_000
/** A brand doesn't change by the hour, and Firecrawl is asked for a copy up to a day old too. */
const CACHE_SECONDS = 86_400
const FIRECRAWL = 'https://api.firecrawl.dev/v2/scrape'

export class LookupError extends Error {}

/** The page's HTML and where it ended up, or null when it doesn't open. */
async function fetchPage(url: string): Promise<{ url: string; html: string } | null> {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(10_000) })
    if (!res.ok || !/html/i.test(res.headers.get('content-type') ?? 'text/html')) return null
    const body = await res.text()
    return { url: res.url || url, html: body.length > MAX_HTML ? body.slice(0, MAX_HTML) : body }
  } catch { return null }
}

/** Firecrawl's branding and links for the page, or null when it couldn't (no credit left, a site it can't open…). */
async function firecrawl(url: string, key: string): Promise<{ url: string; data: FirecrawlScrape } | null> {
  try {
    const res = await fetch(FIRECRAWL, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      // A copy Firecrawl made in the last day is fine: a brand doesn't change by the hour.
      body: JSON.stringify({ url, formats: ['branding', 'links'], onlyMainContent: false, timeout: 30_000, maxAge: 86_400_000 }),
      signal: AbortSignal.timeout(40_000),
    })
    const json = await res.json().catch(() => null) as { success?: boolean; data?: FirecrawlScrape; error?: string } | null
    if (!res.ok || !json?.success || !json.data) {
      console.log(`brand lookup: Firecrawl ${res.status} ${json?.error ?? ''}`.trim())
      return null
    }
    const status = json.data.metadata?.statusCode
    if (status && status >= 400) return null
    return { url: json.data.metadata?.url || url, data: json.data }
  } catch (e) {
    console.log(`brand lookup: Firecrawl ${String(e)}`)
    return null
  }
}

const base64 = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** An image as a data: URL, when it really is an image (PNG, JPEG, WebP, GIF or SVG) and not too big. */
export async function imageData(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': AGENT, accept: 'image/*' }, signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(type)) return null
    if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (!bytes.length || bytes.length > MAX_IMAGE) return null
    return `data:${type};base64,${base64(bytes)}`
  } catch { return null }
}

/** Read the site: Firecrawl (with a key) and its HTML side by side, then the logo and icon. */
export async function lookUpBrand(env: Pick<Env, 'FIRECRAWL_API_KEY'>, address: string): Promise<FoundBrand> {
  const [fc, page] = await Promise.all([env.FIRECRAWL_API_KEY ? firecrawl(address, env.FIRECRAWL_API_KEY) : null, fetchPage(address)])
  if (!fc && !page) throw new LookupError('That website didn’t open. Check the address, or add your details yourself.')
  const read = mergeReads(fc ? readFirecrawl(fc.data, fc.url) : null, page ? readHtml(page.url, page.html) : null)
  const [logo, icon] = await Promise.all([imageData(read.logo_url), imageData(read.icon_url)])
  const { logo_url: _logo, icon_url: _icon, ...details } = read
  return { ...details, website: page?.url ?? fc?.url ?? address, source: fc ? 'firecrawl' : 'website', logo, icon }
}

const edgeCache = () => {
  try { return (caches as unknown as { default: Cache }).default } catch { return null }
}

brandLookup.post('/api/setup/brand', async c => {
  const token = bearer(c.req.header('authorization'))
  const { data } = token ? await signInCheck(c.env, token, 'is_admin') : { data: false }
  if (data !== true) return c.json({ error: 'Only an admin can set up the business' }, 403)
  const body = await c.req.json().catch(() => ({})) as { website?: unknown }
  const address = siteAddress(typeof body.website === 'string' ? body.website : null)
  if (!address) return c.json({ error: 'Enter your website’s address, like www.yourbusiness.com' }, 400)

  const cache = edgeCache()
  const key = new Request(`https://brand-lookup.internal/${c.env.FIRECRAWL_API_KEY ? 'firecrawl' : 'html'}?site=${encodeURIComponent(address)}`)
  const hit = await cache?.match(key)
  if (hit) return c.json(await hit.json() as { found: FoundBrand })
  try {
    const found = await lookUpBrand(c.env, address)
    if (!foundAnything(found)) return c.json({ error: 'Your website opened, but it doesn’t say much about your brand. Add your details yourself instead.' }, 422)
    const result = { found }
    if (cache) c.executionCtx.waitUntil(cache.put(key, new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CACHE_SECONDS}` } })))
    return c.json(result)
  } catch (e) {
    if (e instanceof LookupError) return c.json({ error: e.message }, 422)
    throw e
  }
})
