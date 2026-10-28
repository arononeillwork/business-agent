// Website & SEO page: the Worker fetches the business's website (the homepage, robots.txt, the
// sitemap and up to 10 pages it links to) and checks what Google and shared links see
// (shared/seo.ts), and asks Google's PageSpeed Insights how fast and well-made it is. The last
// results are kept (public.website_checks) so the page opens straight away; a new check runs only
// when an admin asks, and not twice within a couple of minutes.
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, requestDb, userClient, type Env } from './supabase'
import { googleSession } from './connections'
import * as google from './providers/google'
import { cleanWebsite } from '../shared/connections'
import { checkSite, pageSpeedOf, parsePage, scoreOf, sitemapUrls, type Expected, type ListingFacts, type PageFacts, type Strategy, type WebsiteReport } from '../shared/seo'
import type { OpeningHours } from '../shared/types'

export const website = new Hono<{ Bindings: Env }>()

for (const path of ['/api/website', '/api/website/*']) {
  website.use(path, async (c, next) => {
    const token = bearer(c.req.header('authorization'))
    const { data } = token ? await userClient(c.env, token, 'app').rpc('is_admin') : { data: false }
    if (data !== true) return c.json({ error: 'Only an admin can check the website' }, 403)
    await next()
  })
}

/** Website checks fetch pages as this (some sites block requests without a name). */
const AGENT = 'Mozilla/5.0 (compatible; BusinessAgentSEOCheck/1.0; +https://businesssagent.com)'
const MAX_PAGES = 10
const MAX_HEADS = 25
const MAX_HTML = 3 * 1024 * 1024
/** A check asked for again within this long gets the one just made. */
const FRESH_MS = 2 * 60_000

class WebsiteError extends Error {}

async function get(url: string, method: 'GET' | 'HEAD' = 'GET') {
  return fetch(url, { method, redirect: 'follow', headers: { 'user-agent': AGENT, accept: method === 'GET' ? 'text/html,application/xml;q=0.9,*/*;q=0.8' : '*/*' },
    signal: AbortSignal.timeout(10_000) })
}
async function text(res: Response) {
  const body = await res.text()
  return body.length > MAX_HTML ? body.slice(0, MAX_HTML) : body
}
/** A small text file (robots.txt, sitemap.xml) that's really there, or null. */
async function optional(url: string, looksRight: (s: string) => boolean) {
  try {
    const res = await get(url)
    if (!res.ok) return null
    const body = await text(res)
    return looksRight(body) ? body : null
  } catch { return null }
}

/** The business as the app has it, to compare with the website and Google. */
async function expected(db: SupabaseClient): Promise<{ website: string | null; expected: Expected }> {
  const { data } = await db.from('business').select('name, phone, address, opening_hours, website').single()
  const b = (data ?? {}) as { name?: string; phone?: string | null; address?: string | null; opening_hours?: OpeningHours; website?: string | null }
  return { website: cleanWebsite(b.website), expected: { name: b.name ?? '', phone: b.phone ?? null, address: b.address ?? null, opening_hours: b.opening_hours ?? {} } }
}

/** The Google listing's details, when Google Maps is connected (left out quietly when it can't be read). */
async function listing(env: Env, db: SupabaseClient): Promise<ListingFacts | null> {
  const { data } = await db.from('integrations').select('status, external').eq('provider', 'google_business').single()
  if (data?.status !== 'connected' || !(data.external as { location?: string })?.location) return null
  try {
    const s = await googleSession(env, db)
    return await google.listingFacts(s.token, s.location!)
  } catch { return null }
}

/** Check the website now. */
export async function runCheck(env: Env, db: SupabaseClient): Promise<WebsiteReport> {
  const { website: url, expected: want } = await expected(db)
  if (!url) throw new WebsiteError('Add the website on the Business page first.')
  let res: Response
  try {
    res = await get(url)
  } catch {
    throw new WebsiteError(`The website didn’t answer (${new URL(url).host}). Check the address on the Business page.`)
  }
  if (!res.ok) throw new WebsiteError(`The website answered with an error (${res.status}). Check the address on the Business page.`)
  const finalUrl = res.url || url
  const home = parsePage(finalUrl, await text(res), res.status)
  const origin = new URL(finalUrl).origin

  const robots = await optional(`${origin}/robots.txt`, s => /user-agent|disallow|allow|sitemap/i.test(s) && !/<html/i.test(s))
  const sitemapAt = robots?.match(/^\s*sitemap:\s*(\S+)/im)?.[1] ?? `${origin}/sitemap.xml`
  const sitemap = await optional(sitemapAt, s => /<(urlset|sitemapindex)\b/i.test(s))

  // Other pages: what the homepage links to, then the sitemap's; each fetched once.
  const sameSite = (u: string) => { try { return new URL(u).host === new URL(origin).host } catch { return false } }
  const strip = (u: string) => u.replace(/\/$/, '')
  const candidates = [...new Set([...home.links, ...(sitemap ? sitemapUrls(sitemap) : [])].filter(sameSite).map(strip))]
    .filter(u => u !== strip(finalUrl) && u !== strip(url))
  const others: PageFacts[] = []
  const broken: { url: string; status: number }[] = []
  for (const u of candidates.slice(0, MAX_PAGES)) {
    try {
      const r = await get(u)
      if (r.status >= 400) { broken.push({ url: u, status: r.status }); continue }
      if ((r.headers.get('content-type') ?? 'text/html').includes('html')) others.push(parsePage(r.url || u, await text(r), r.status))
    } catch { broken.push({ url: u, status: 0 }) }
  }
  // The rest of the links found: a quick look that each one is there.
  const fetched = new Set(candidates.slice(0, MAX_PAGES))
  const rest = [...new Set(others.flatMap(p => p.links).map(strip))].filter(u => !fetched.has(u) && u !== strip(finalUrl) && sameSite(u)).slice(0, MAX_HEADS)
  for (const u of rest) {
    try {
      const r = await get(u, 'HEAD')
      // Some servers don't do HEAD (405/501): that isn't a broken link.
      if (r.status >= 400 && r.status !== 405 && r.status !== 501) broken.push({ url: u, status: r.status })
    } catch { /* a slow page isn't a broken one */ }
  }

  const items = checkSite(home, others, { robots, sitemap, broken }, want)
  return {
    url: finalUrl, checked_at: new Date().toISOString(),
    pages: [home, ...others].map(p => ({ url: p.url, status: p.status, title: p.title })),
    items, score: scoreOf(items),
    site_business: [home, ...others].map(p => p.business).find(Boolean) ?? null,
    google_listing: await listing(env, db),
  }
}

/** Google's PageSpeed test for the website, on a phone or a computer. */
export async function runPageSpeed(env: Env, url: string, strategy: Strategy) {
  const q = new URLSearchParams({ url, strategy })
  for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) q.append('category', c)
  if (env.GOOGLE_PAGESPEED_API_KEY) q.set('key', env.GOOGLE_PAGESPEED_API_KEY)
  let res: Response
  try {
    res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(60_000) })
  } catch {
    throw new WebsiteError('Google’s PageSpeed test took too long. Try again in a minute.')
  }
  const json = await res.json().catch(() => ({})) as Parameters<typeof pageSpeedOf>[0] & { error?: { message?: string; code?: number } }
  if (res.status === 429 || /quota/i.test(json.error?.message ?? '')) {
    throw new WebsiteError('Google’s PageSpeed test is busy: its free allowance is used up for now. Try again later, or add a PageSpeed API key (docs/INTEGRATIONS.md).')
  }
  if (!res.ok) throw new WebsiteError(`Google’s PageSpeed test couldn’t check the website: ${json.error?.message ?? res.status}`)
  return pageSpeedOf(json, strategy, new Date().toISOString())
}

const read = (db: SupabaseClient) => db.from('website_checks').select('url, report, checked_at, pagespeed').eq('id', 1).maybeSingle()
const fail = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })

// The last check and PageSpeed results, and the website they're for.
website.get('/api/website', async c => {
  const db = await requestDb(c)
  const [{ data }, { website: url }] = await Promise.all([read(db), expected(db)])
  return c.json({ website: url, report: data?.report ?? null, checked_at: data?.checked_at ?? null, pagespeed: data?.pagespeed ?? {} })
})

// Check the website now (the one just made, if it's under 2 minutes old and for the same address).
website.post('/api/website/check', async c => {
  const db = await requestDb(c)
  try {
    const [{ data }, { website: url }] = await Promise.all([read(db), expected(db)])
    if (data?.report && data.url === url && data.checked_at && Date.now() - Date.parse(data.checked_at) < FRESH_MS) return c.json({ report: data.report })
    const report = await runCheck(c.env, db)
    await db.from('website_checks').update({ url, report, checked_at: report.checked_at, updated_at: new Date().toISOString() }).eq('id', 1)
    return c.json({ report })
  } catch (e) {
    return c.json(fail(e), e instanceof WebsiteError ? 400 : 502)
  }
})

// PageSpeed now, for a phone or a computer: { strategy }.
website.post('/api/website/pagespeed', async c => {
  const db = await requestDb(c)
  const { strategy } = await c.req.json<{ strategy?: string }>().catch(() => ({} as { strategy?: string }))
  if (strategy !== 'mobile' && strategy !== 'desktop') return c.json({ error: 'Choose phone or computer' }, 400)
  try {
    const [{ data }, { website: url }] = await Promise.all([read(db), expected(db)])
    if (!url) throw new WebsiteError('Add the website on the Business page first.')
    const result = await runPageSpeed(c.env, url, strategy)
    const pagespeed = { ...((data?.pagespeed ?? {}) as Record<string, unknown>), [strategy]: result }
    await db.from('website_checks').update({ pagespeed, updated_at: new Date().toISOString() }).eq('id', 1)
    return c.json({ pagespeed: result })
  } catch (e) {
    return c.json(fail(e), e instanceof WebsiteError ? 400 : 502)
  }
})
