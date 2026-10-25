// Website & SEO: what Google (and people sharing a link) see on the business's website. The Worker
// fetches the homepage and a few pages it links to; these checks read the HTML (no browser, no
// heavy parser: the tags that matter are simple to find) and say what passes, what to look at and
// what to fix, in plain words. The name, address, phone and hours are checked against the app.
import { DAY_KEYS, type DayKey, type OpeningHours } from './types'
import { msg } from './i18n'

export type CheckLevel = 'pass' | 'warn' | 'fail'

/** One finding. `title` and `fix` are English shown with t(title, vars); `vars` fill them in. */
export interface SeoItem {
  id: string
  level: CheckLevel
  title: string
  fix?: string
  vars?: Record<string, string | number>
  /** The page it's about, when it isn't the homepage. */
  pages?: string[]
}

/** What one page says about itself. */
export interface PageFacts {
  url: string
  status: number
  bytes: number
  title: string | null
  description: string | null
  h1: string[]
  canonical: string | null
  lang: string | null
  viewport: boolean
  /** og:title, og:description, og:image… and twitter:card… */
  social: Record<string, string>
  /** LocalBusiness (or a kind of it, like CafeOrCoffeeShop) from the page's JSON-LD. */
  business: SiteBusiness | null
  images: number
  imagesWithoutAlt: number
  /** Links to other pages on the same site (absolute, no #fragment). */
  links: string[]
  noindex: boolean
}

/** The business as the website describes it in its structured data. */
export interface SiteBusiness { type: string; name: string | null; phone: string | null; address: string | null; hours: OpeningHours | null }

export interface SeoReport {
  url: string
  checked_at: string
  pages: { url: string; status: number; title: string | null }[]
  items: SeoItem[]
  /** The website's own name, address, phone and hours (structured data), for the consistency card. */
  site_business: SiteBusiness | null
  score: { pass: number; warn: number; fail: number }
}

// ---------------------------------------------------------------------------------------------
// Reading the HTML
// ---------------------------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export const decode = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (all, n: string) => ENTITIES[n.toLowerCase()] ?? all)
const clean = (s: string) => decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()

/** The attributes of one tag: <meta name="description" content="…"> → { name, content }. */
export function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const k = m[1].toLowerCase()
    if (k in out) continue
    out[k] = decode(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return out
}
const tags = (html: string, name: string) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(m => attrs(m[0].slice(name.length + 1, -1)))

/** Remove comments, scripts' code and styles, so tags inside them aren't counted (JSON-LD is read separately). */
const visible = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, '')

const DAYS: Record<string, DayKey> = {
  monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun',
  mo: 'mon', tu: 'tue', we: 'wed', th: 'thu', fr: 'fri', sa: 'sat', su: 'sun',
}
const hm = (s: unknown) => (typeof s === 'string' && /^\d{1,2}:\d{2}/.test(s) ? s.slice(0, 5).padStart(5, '0') : null)

/** Opening hours from structured data: openingHoursSpecification objects, or "Mo-Fr 08:00-18:00" text. */
export function hoursOf(b: Record<string, unknown>): OpeningHours | null {
  const out: OpeningHours = {}
  const spec = b.openingHoursSpecification
  for (const s of (Array.isArray(spec) ? spec : spec ? [spec] : []) as Record<string, unknown>[]) {
    const days = (Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek]).map(d => DAYS[String(d ?? '').split('/').pop()!.toLowerCase()]).filter(Boolean)
    const open = hm(s.opens), close = hm(s.closes)
    for (const d of days) out[d] = open && close && !(open === '00:00' && close === '00:00') ? { open, close } : null
  }
  const text = b.openingHours
  for (const line of (Array.isArray(text) ? text : text ? [text] : []) as string[]) {
    const m = String(line).match(/^([A-Za-z]{2})(?:\s*-\s*([A-Za-z]{2}))?(?:\s*,\s*([A-Za-z,\s]+?))?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/)
    if (!m) continue
    const from = DAY_KEYS.indexOf(DAYS[m[1].toLowerCase()]), to = m[2] ? DAY_KEYS.indexOf(DAYS[m[2].toLowerCase()]) : from
    if (from < 0 || to < 0) continue
    for (let i = from; i <= to; i++) out[DAY_KEYS[i]] = { open: hm(m[4])!, close: hm(m[5])! }
  }
  return Object.keys(out).length ? out : null
}

const BUSINESS_TYPES = /^(LocalBusiness|FoodEstablishment|CafeOrCoffeeShop|Restaurant|Bakery|BarOrPub|Store|Organization)$/
function addressOf(a: unknown): string | null {
  if (typeof a === 'string') return a
  if (!a || typeof a !== 'object') return null
  const x = a as Record<string, unknown>
  return [x.streetAddress, x.postalCode, x.addressLocality, x.addressRegion].filter(v => typeof v === 'string' && v).join(', ') || null
}

/** The first LocalBusiness-like thing in the page's JSON-LD (inside @graph too). */
export function businessIn(html: string): SiteBusiness | null {
  const found: Record<string, unknown>[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return }
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    if (Array.isArray(o['@graph'])) walk(o['@graph'])
    const types = (Array.isArray(o['@type']) ? o['@type'] : [o['@type']]).map(String)
    if (types.some(t => BUSINESS_TYPES.test(t))) found.push(o)
  }
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())) } catch { /* a broken block: the check below says there's none */ }
  }
  // A specific kind (a café) beats a plain Organization.
  const b = found.find(o => !/Organization/.test(String(o['@type']))) ?? found[0]
  if (!b) return null
  return {
    type: (Array.isArray(b['@type']) ? b['@type'] : [b['@type']]).map(String).join(', '),
    name: typeof b.name === 'string' ? b.name : null,
    phone: typeof b.telephone === 'string' ? b.telephone : null,
    address: addressOf(b.address),
    hours: hoursOf(b),
  }
}

/** Read one page. `url` is where it ended up (after redirects). */
export function parsePage(url: string, html: string, status = 200): PageFacts {
  const body = visible(html)
  const meta = tags(body, 'meta')
  const metaOf = (k: string) => meta.find(m => (m.name ?? m.property)?.toLowerCase() === k)?.content?.trim() || null
  const social: Record<string, string> = {}
  for (const m of meta) {
    const k = (m.property ?? m.name ?? '').toLowerCase()
    if (/^(og|twitter):/.test(k) && m.content) social[k] = m.content
  }
  const title = body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const canonical = tags(body, 'link').find(l => l.rel?.toLowerCase().split(/\s+/).includes('canonical'))?.href ?? null
  const images = tags(body, 'img')
  const base = new URL(url)
  const links = new Set<string>()
  for (const a of tags(body, 'a')) {
    if (!a.href || /^(mailto|tel|javascript|whatsapp|sms):/i.test(a.href)) continue
    try {
      const u = new URL(a.href, base)
      if (u.host !== base.host || !/^https?:$/.test(u.protocol)) continue
      u.hash = ''
      if (!/\.(jpe?g|png|gif|webp|svg|pdf|mp4|zip)$/i.test(u.pathname)) links.add(u.href)
    } catch { /* not a link */ }
  }
  const robots = metaOf('robots') ?? ''
  return {
    url, status, bytes: new TextEncoder().encode(html).length,
    title: title === undefined ? null : clean(title),
    description: metaOf('description'),
    h1: [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => clean(m[1])),
    canonical,
    lang: html.match(/<html\b[^>]*>/i) ? attrs(html.match(/<html\b[^>]*>/i)![0].slice(5, -1)).lang || null : null,
    viewport: !!metaOf('viewport'),
    social,
    business: businessIn(html),
    images: images.length,
    imagesWithoutAlt: images.filter(i => !('alt' in i)).length,
    links: [...links],
    noindex: /noindex/i.test(robots),
  }
}

/** Page addresses listed in a sitemap.xml (a sitemap index's own sitemaps are left out). */
export const sitemapUrls = (xml: string) =>
  [...xml.matchAll(/<url>\s*<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => decode(m[1]))

/** Does robots.txt shut every search engine out of the whole site? */
export function blocksEverything(robots: string) {
  let all = false
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const [k, ...v] = line.split(':')
    const val = v.join(':').trim()
    if (/^user-agent$/i.test(k)) all = val === '*'
    else if (all && /^disallow$/i.test(k) && val === '/') return true
  }
  return false
}

// ---------------------------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------------------------

export interface Expected { name: string; phone: string | null; address: string | null; opening_hours: OpeningHours }

/** The last 9 digits: Spanish numbers with or without +34, spaces or dots. */
export const phoneDigits = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-9)
export const samePhone = (a: string | null | undefined, b: string | null | undefined) => !!phoneDigits(a) && phoneDigits(a) === phoneDigits(b)

/** The same address when the postcode matches and the street's first word does (accents and case aside). */
export function sameAddress(a: string | null | undefined, b: string | null | undefined) {
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  if (!a || !b) return false
  const pa = a.match(/\b\d{5}\b/)?.[0], pb = b.match(/\b\d{5}\b/)?.[0]
  if (pa && pb && pa !== pb) return false
  const street = (s: string) => norm(s).replace(/^(c\/|calle|c\.|avda\.?|avenida|plaza|pza\.?)\s*/, '').match(/\p{L}{3,}/u)?.[0] ?? ''
  return street(a) !== '' && street(a) === street(b)
}

/** The days whose hours differ (a day missing on one side counts when the other says it's open). */
export function hoursDiffer(a: OpeningHours, b: OpeningHours): DayKey[] {
  return DAY_KEYS.filter(d => {
    const x = a[d] ?? null, y = b[d] ?? null
    if (!x && !y) return false
    return !x || !y || x.open !== y.open || x.close !== y.close
  })
}

const item = (id: string, level: CheckLevel, title: string, fix?: string, vars?: SeoItem['vars'], pages?: string[]): SeoItem =>
  ({ id, level, title, ...(fix ? { fix } : {}), ...(vars ? { vars } : {}), ...(pages?.length ? { pages } : {}) })

/**
 * Every check, homepage first, then what the other pages share. `broken`: internal links that
 * answered with an error. `robots` / `sitemap`: their text, or null when there's none.
 */
export function checkSite(home: PageFacts, others: PageFacts[], extra: { robots: string | null; sitemap: string | null; broken: { url: string; status: number }[] }, expected: Expected): SeoItem[] {
  const out: SeoItem[] = []
  const all = [home, ...others]

  out.push(home.url.startsWith('https://')
    ? item('https', 'pass', msg('The site is served over HTTPS'))
    : item('https', 'fail', msg('The site isn’t served over HTTPS'), msg('Ask your web host to switch on HTTPS (a free certificate) and send http:// to https://.')))

  const tl = home.title?.length ?? 0
  if (!home.title) out.push(item('title', 'fail', msg('The homepage has no title'), msg('Add a <title> of 30 to 60 characters: the business, what it is and where, e.g. “Easy Beans Coffee · Specialty café in San Pedro”.')))
  else if (tl < 30 || tl > 60) out.push(item('title', 'warn', msg('The title is {n} characters long'), msg('Aim for 30 to 60 characters, so Google shows it whole and it says what and where.'), { n: tl, text: home.title }))
  else out.push(item('title', 'pass', msg('The title is a good length ({n} characters)'), undefined, { n: tl, text: home.title }))

  const dl = home.description?.length ?? 0
  if (!home.description) out.push(item('description', 'fail', msg('The homepage has no meta description'), msg('Add a meta description of 70 to 160 characters: it’s the text under the title in Google’s results.')))
  else if (dl < 70 || dl > 160) out.push(item('description', 'warn', msg('The meta description is {n} characters long'), msg('Aim for 70 to 160 characters, so Google shows it whole.'), { n: dl, text: home.description }))
  else out.push(item('description', 'pass', msg('The meta description is a good length ({n} characters)'), undefined, { n: dl, text: home.description }))

  if (home.h1.length === 0) out.push(item('h1', 'fail', msg('The homepage has no main heading (h1)'), msg('Give the page one main heading that says what the business is.')))
  else if (home.h1.length > 1) out.push(item('h1', 'warn', msg('The homepage has {n} main headings (h1)'), msg('Keep one h1 and make the others smaller headings (h2).'), { n: home.h1.length }))
  else out.push(item('h1', 'pass', msg('One main heading (h1)'), undefined, { text: home.h1[0] }))

  out.push(home.viewport
    ? item('viewport', 'pass', msg('Set up for phones (viewport)'))
    : item('viewport', 'fail', msg('Not set up for phones (no viewport tag)'), msg('Add <meta name="viewport" content="width=device-width, initial-scale=1"> so phones show it at the right size.')))
  out.push(home.canonical
    ? item('canonical', 'pass', msg('The homepage names its main address (canonical)'))
    : item('canonical', 'warn', msg('No canonical address'), msg('Add <link rel="canonical"> so Google knows which address is the real one (with or without www).')))
  out.push(home.lang
    ? item('lang', 'pass', msg('The language is set ({lang})'), undefined, { lang: home.lang })
    : item('lang', 'warn', msg('The page doesn’t say its language'), msg('Add lang="es" (or the page’s language) to the <html> tag.')))
  if (home.noindex) out.push(item('noindex', 'fail', msg('The homepage asks Google not to list it (noindex)'), msg('Remove “noindex” from the robots meta tag, or Google won’t show the site.')))

  const missingSocial = ['og:title', 'og:description', 'og:image'].filter(k => !home.social[k])
  out.push(missingSocial.length
    ? item('social', 'warn', msg('Shared links are missing: {tags}'), msg('Add Open Graph tags (og:title, og:description, og:image) so a link shared on WhatsApp, Instagram or Facebook shows a picture and a title.'), { tags: missingSocial.join(', ') })
    : item('social', 'pass', msg('Shared links show a title, a description and a picture')))

  // The business itself: Google reads name, address, phone and hours from structured data.
  const b = all.map(p => p.business).find(Boolean) ?? null
  if (!b) {
    out.push(item('business', 'fail', msg('No structured data for the business'), msg('Add LocalBusiness (CafeOrCoffeeShop) JSON-LD with the name, address, phone and opening hours, so Google can show them in search and Maps.')))
  } else {
    out.push(item('business', 'pass', msg('Structured data for the business ({type})'), undefined, { type: b.type }))
    if (expected.phone && b.phone && !samePhone(b.phone, expected.phone)) {
      out.push(item('business_phone', 'warn', msg('The website’s phone ({site}) isn’t the one on the Business page ({app})'), msg('Use the same number everywhere: Google trusts details that match.'), { site: b.phone, app: expected.phone }))
    }
    if (expected.address && b.address && !sameAddress(b.address, expected.address)) {
      out.push(item('business_address', 'warn', msg('The website’s address doesn’t match the Business page'), msg('Use the same address everywhere: Google trusts details that match.'), { site: b.address, app: expected.address }))
    }
    if (!b.hours) out.push(item('business_hours', 'warn', msg('The structured data has no opening hours'), msg('Add openingHoursSpecification so Google shows when you’re open.')))
    else {
      const days = hoursDiffer(b.hours, expected.opening_hours)
      if (days.length) out.push(item('business_hours', 'warn', msg('The website’s opening hours differ from the app on {days}'), msg('Update the website’s hours (or the app’s) so they match.'), { days: days.join(', ') }))
    }
  }

  const noAlt = all.reduce((n, p) => n + p.imagesWithoutAlt, 0)
  out.push(noAlt
    ? item('alt', 'warn', msg('{n} images have no description (alt text)'), msg('Describe each photo in its alt text (“Flat white with latte art”): it helps people using screen readers and Google Images.'), { n: noAlt },
      all.filter(p => p.imagesWithoutAlt).map(p => p.url))
    : item('alt', 'pass', msg('Every image has a description (alt text)')))

  if (extra.robots === null) out.push(item('robots', 'warn', msg('No robots.txt'), msg('Add a robots.txt that points to the sitemap. Google still visits without one.')))
  else if (blocksEverything(extra.robots)) out.push(item('robots', 'fail', msg('robots.txt shuts search engines out of the whole site'), msg('Remove “Disallow: /” for “User-agent: *” in robots.txt.')))
  else out.push(item('robots', 'pass', msg('robots.txt lets search engines in')))
  out.push(extra.sitemap === null
    ? item('sitemap', 'warn', msg('No sitemap.xml'), msg('Add a sitemap.xml listing the pages, and submit it in Search Console.'))
    : item('sitemap', 'pass', msg('sitemap.xml lists {n} pages'), undefined, { n: sitemapUrls(extra.sitemap).length }))

  out.push(extra.broken.length
    ? item('broken', 'fail', msg('{n} links lead to a page that isn’t there'), msg('Fix or remove these links.'), { n: extra.broken.length }, extra.broken.map(x => `${x.url} (${x.status})`))
    : item('broken', 'pass', msg('No broken links found')))

  const noTitle = others.filter(p => !p.title).map(p => p.url)
  const noDesc = others.filter(p => !p.description).map(p => p.url)
  if (noTitle.length) out.push(item('pages_title', 'warn', msg('{n} other pages have no title'), msg('Give every page its own title.'), { n: noTitle.length }, noTitle))
  if (noDesc.length) out.push(item('pages_description', 'warn', msg('{n} other pages have no meta description'), msg('Give every page its own meta description.'), { n: noDesc.length }, noDesc))

  const kb = Math.round(home.bytes / 1024)
  out.push(kb > 500
    ? item('weight', 'warn', msg('The homepage’s HTML is {n} KB'), msg('That’s heavy before any photos: ask your web developer to slim it down (PageSpeed below shows what loads slowly).'), { n: kb })
    : item('weight', 'pass', msg('The homepage’s HTML is light ({n} KB)'), undefined, { n: kb }))

  // Problems first.
  const order: Record<CheckLevel, number> = { fail: 0, warn: 1, pass: 2 }
  return out.sort((a, z) => order[a.level] - order[z.level])
}

export const scoreOf = (items: SeoItem[]) => ({
  pass: items.filter(i => i.level === 'pass').length, warn: items.filter(i => i.level === 'warn').length, fail: items.filter(i => i.level === 'fail').length,
})

// ---------------------------------------------------------------------------------------------
// Consistency: the same details on the website, in the app and on Google Maps
// ---------------------------------------------------------------------------------------------

export interface ListingFacts { name: string | null; phone: string | null; address: string | null; hours: OpeningHours | null }
export type ConsistencyField = 'name' | 'phone' | 'address' | 'hours'
export interface ConsistencyRow { field: ConsistencyField; app: string | null; website: string | null; google: string | null; matches: boolean | null }

const hoursText = (h: OpeningHours | null) => (h ? DAY_KEYS.map(d => `${d} ${h[d] ? `${h[d]!.open}–${h[d]!.close}` : '–'}`).join(', ') : null)
const sameName = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ')

/** Each detail as the app, the website and Google have it; matches is null when there's nothing to compare. */
export function consistency(app: Expected, website: SiteBusiness | null, google: ListingFacts | null): ConsistencyRow[] {
  const row = <T,>(field: ConsistencyField, a: T | null, w: T | null, g: T | null, same: (x: T, y: T) => boolean, show: (x: T | null) => string | null): ConsistencyRow => {
    const others = [w, g].filter((x): x is T => x !== null && x !== undefined)
    return { field, app: show(a), website: show(w), google: show(g), matches: a === null || !others.length ? null : others.every(x => same(a, x)) }
  }
  const id = (x: string | null) => x
  return [
    row('name', app.name, website?.name ?? null, google?.name ?? null, sameName, id),
    row('phone', app.phone, website?.phone ?? null, google?.phone ?? null, samePhone, id),
    row('address', app.address, website?.address ?? null, google?.address ?? null, sameAddress, id),
    row('hours', app.opening_hours, website?.hours ?? null, google?.hours ?? null, (x, y) => hoursDiffer(x, y).length === 0, hoursText),
  ]
}

// ---------------------------------------------------------------------------------------------
// PageSpeed Insights
// ---------------------------------------------------------------------------------------------

export type Strategy = 'mobile' | 'desktop'
export interface PageSpeed {
  strategy: Strategy
  checked_at: string
  /** 0–100, as Lighthouse scores them. */
  scores: { performance: number | null; accessibility: number | null; best_practices: number | null; seo: number | null }
  /** Core Web Vitals from real visitors (Chrome UX Report) when Google has enough of them; else from the lab test. */
  vitals: { lcp_ms: number | null; cls: number | null; inp_ms: number | null; field: boolean }
  /** The biggest savings Lighthouse suggests, by title. */
  opportunities: string[]
}

interface PsiJson {
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null }>
    audits?: Record<string, { title?: string; numericValue?: number; details?: { type?: string; overallSavingsMs?: number } }>
  }
  loadingExperience?: { metrics?: Record<string, { percentile?: number }> }
}

/** Google's PageSpeed answer in the few figures the page shows. */
export function pageSpeedOf(json: PsiJson, strategy: Strategy, at: string): PageSpeed {
  const cat = json.lighthouseResult?.categories ?? {}
  const pct = (k: string) => (typeof cat[k]?.score === 'number' ? Math.round(cat[k].score! * 100) : null)
  const field = json.loadingExperience?.metrics ?? {}
  const audits = json.lighthouseResult?.audits ?? {}
  const hasField = !!field.LARGEST_CONTENTFUL_PAINT_MS
  const lab = (k: string) => (typeof audits[k]?.numericValue === 'number' ? audits[k].numericValue! : null)
  const opportunities = Object.values(audits)
    .filter(a => a.details?.type === 'opportunity' && (a.details.overallSavingsMs ?? 0) >= 300 && a.title)
    .sort((a, b) => (b.details!.overallSavingsMs ?? 0) - (a.details!.overallSavingsMs ?? 0)).slice(0, 5).map(a => a.title!)
  return {
    strategy, checked_at: at,
    scores: { performance: pct('performance'), accessibility: pct('accessibility'), best_practices: pct('best-practices'), seo: pct('seo') },
    vitals: hasField
      ? { lcp_ms: field.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null, cls: field.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile !== undefined ? field.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile! / 100 : null,
          inp_ms: field.INTERACTION_TO_NEXT_PAINT?.percentile ?? null, field: true }
      : { lcp_ms: lab('largest-contentful-paint'), cls: lab('cumulative-layout-shift'), inp_ms: null, field: false },
    opportunities,
  }
}

/** A check as the Worker keeps it: the findings plus the Google listing's details (when Google Maps is connected). */
export type WebsiteReport = SeoReport & { google_listing: ListingFacts | null }

/** The Website & SEO page's data: the address checked, the last check and the last PageSpeed results. */
export interface WebsiteState {
  website: string | null
  report: WebsiteReport | null
  checked_at: string | null
  pagespeed: Partial<Record<Strategy, PageSpeed>>
}

/** Google's own thresholds: good, needs work, poor. */
export const vitalLevel = (k: 'lcp_ms' | 'cls' | 'inp_ms', v: number | null): CheckLevel | null => {
  if (v === null) return null
  const [good, poor] = k === 'lcp_ms' ? [2500, 4000] : k === 'cls' ? [0.1, 0.25] : [200, 500]
  return v <= good ? 'pass' : v <= poor ? 'warn' : 'fail'
}
export const scoreLevel = (n: number | null): CheckLevel | null => (n === null ? null : n >= 90 ? 'pass' : n >= 50 ? 'warn' : 'fail')
