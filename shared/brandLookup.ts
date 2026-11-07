// Set-up guide, "already open": what a business's website says about its brand (logo, app icon,
// colours, fonts) and its details (name, phone, email, address, Instagram, opening hours). The
// Worker reads the site (worker/brandLookup.ts): with Firecrawl's branding when FIRECRAWL_API_KEY is
// set (the colours and fonts the page really shows), and from the page's own HTML either way (its
// structured data, links, theme colour and Google Fonts). The guide shows what was found, and the
// owner keeps only what they tick. Pure functions here, so they're tested without the network.
import { msg } from './i18n'
import { attrs, decode, parsePage } from './seo'
import type { BrandColour, OpeningHours, TeamSize } from './types'

/** The choices for "How many people work there?" (the owner included). */
export const TEAM_SIZES: { value: TeamSize; label: string }[] = [
  { value: '1', label: msg('Just me') },
  { value: '2-5', label: '2–5' },
  { value: '6-15', label: '6–15' },
  { value: '16-50', label: '16–50' },
  { value: '50+', label: msg('More than 50') },
]

/** What the guide shows after reading the website. */
export interface FoundBrand {
  /** The address that was read (after any redirects). */
  website: string
  /** firecrawl: read by Firecrawl too (colours and fonts as the page shows them); website: its HTML only. */
  source: 'firecrawl' | 'website'
  name: string | null
  description: string | null
  /** The logo and the small square icon, as data: URLs ready for the Brand page; null when none was found. */
  logo: string | null
  icon: string | null
  colours: BrandColour[]
  heading_font: string | null
  body_font: string | null
  phone: string | null
  email: string | null
  address: string | null
  /** Instagram username, without the @. */
  instagram: string | null
  hours: OpeningHours | null
}

/** What reading the site gives before the images are fetched: their addresses. */
export type SiteRead = Omit<FoundBrand, 'website' | 'source' | 'logo' | 'icon'> & { logo_url: string | null; icon_url: string | null }

export const EMPTY_READ: SiteRead = {
  name: null, description: null, logo_url: null, icon_url: null, colours: [], heading_font: null, body_font: null,
  phone: null, email: null, address: null, instagram: null, hours: null,
}

/** A website address someone typed, made whole and checked: a public http(s) site, or null. */
export function siteAddress(typed: string | null | undefined): string | null {
  const w = (typed ?? '').trim()
  if (!w) return null
  let u: URL
  try { u = new URL(/^https?:\/\//i.test(w) ? w : `https://${w.replace(/^\/+/, '')}`) } catch { return null }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null
  const host = u.hostname.toLowerCase()
  // A name with a dot that isn't a number: no localhost, no IP addresses, no internal names.
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || /(^|\.)(localhost|local|internal|home\.arpa)$/.test(host)) return null
  u.hash = ''
  return u.href
}

// ---------------------------------------------------------------------------------------------
// Colours and fonts
// ---------------------------------------------------------------------------------------------

/** #RGB, #RRGGBB, #RRGGBBAA or rgb()/rgba() as #RRGGBB (upper case); null for anything else or a see-through one. */
export function hexOf(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  const rgb = s.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/i)
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? Number(rgb[4].slice(0, -1)) / 100 : Number(rgb[4])
    if (alpha < 0.5) return null
    const parts = [rgb[1], rgb[2], rgb[3]].map(Number)
    if (parts.some(n => n > 255)) return null
    return `#${parts.map(n => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
  }
  const hex = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)?.[1]
  if (!hex) return null
  if (hex.length === 8 && parseInt(hex.slice(6), 16) < 128) return null
  const six = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex.slice(0, 6)
  return `#${six}`.toUpperCase()
}

/** Each colour once (the first role it was found in wins), up to six. */
export function uniqueColours(list: BrandColour[]): BrandColour[] {
  const seen = new Set<string>()
  return list.filter(c => !seen.has(c.hex) && !!seen.add(c.hex)).slice(0, 6)
}

/** Families that only say "the system's font": no brand font. */
const GENERIC_FONTS = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|-apple-system|blinkmacsystemfont|inherit|initial|unset|segoe ui|roboto fallback|arial|helvetica|helvetica neue|times new roman|times|georgia|verdana|tahoma)$/i

/** A font family as a page names it ("'Playfair Display', serif") as the family alone, or null when it's a system font. */
export function fontFamily(v: unknown): string | null {
  if (typeof v !== 'string') return null
  for (const raw of v.split(',')) {
    const f = raw.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim()
    if (!f || GENERIC_FONTS.test(f) || f.startsWith('var(') || f.startsWith('__')) continue
    return f.length <= 60 ? f : null
  }
  return null
}

/** The families a page loads from Google Fonts (css and css2 links), in order. */
export function googleFontsIn(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>)]+)/gi)) {
    const query = decode(m[1])
    for (const part of query.split('&')) {
      const [k, v] = part.split('=')
      if (k !== 'family' || !v) continue
      for (const fam of decodeURIComponent(v.replace(/\+/g, ' ')).split('|')) {
        const name = fam.split(':')[0].trim()
        if (name && !out.includes(name)) out.push(name)
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Details: name, email, phone, Instagram
// ---------------------------------------------------------------------------------------------

const HOME_WORDS = /^(home|homepage|home page|inicio|página principal|pagina principal|welcome|bienvenid[oa]s?|accueil|start)$/i

/** The business's name from a page title: "Home | Café Lola – Coffee in Marbella" → "Café Lola". */
export function nameFromTitle(title: string | null | undefined): string | null {
  const parts = (title ?? '').split(/\s+[|–—·•:-]\s+/).map(s => s.trim()).filter(s => s && !HOME_WORDS.test(s))
  const name = parts[0] ?? null
  return name && name.length <= 120 ? name : null
}

/** Paths on instagram.com that aren't someone's profile. */
const NOT_PROFILES = new Set(['p', 'reel', 'reels', 'tv', 'explore', 'accounts', 'stories', 'about', 'developer', 'legal', 'direct', 'share'])

/** The Instagram username in a link to a profile, or null. */
export function instagramOf(link: string): string | null {
  const m = link.match(/^(?:https?:)?\/\/(?:www\.)?instagr(?:am\.com|\.am)\/([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/i)
  if (!m || NOT_PROFILES.has(m[1].toLowerCase())) return null
  return m[1]
}

/** The address in a mailto: link, without ?subject=… */
export function emailOf(link: string): string | null {
  const m = link.match(/^mailto:([^?]+)/i)
  if (!m) return null
  let e: string
  try { e = decodeURIComponent(m[1]).trim() } catch { e = m[1].trim() }
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120 ? e.toLowerCase() : null
}

/** The number in a tel: link, as written (digits, spaces and a leading +). */
export function phoneOf(link: string): string | null {
  const m = link.match(/^tel:(.+)$/i)
  if (!m) return null
  let p: string
  try { p = decodeURIComponent(m[1]) } catch { p = m[1] }
  p = p.replace(/[^\d+\s]/g, ' ').replace(/(?!^)\+/g, '').replace(/\s+/g, ' ').trim()
  return p.replace(/\D/g, '').length >= 6 ? p : null
}

/** Details from a page's links (mailto:, tel:, Instagram), the first of each. */
export function detailsFromLinks(links: string[]): Pick<SiteRead, 'email' | 'phone' | 'instagram'> {
  let email: string | null = null, phone: string | null = null, instagram: string | null = null
  for (const l of links) {
    email ??= emailOf(l)
    phone ??= phoneOf(l)
    instagram ??= instagramOf(l)
  }
  return { email, phone, instagram }
}

// ---------------------------------------------------------------------------------------------
// Reading the page's HTML
// ---------------------------------------------------------------------------------------------

const tagsIn = (html: string, name: string) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(m => attrs(m[0].slice(name.length + 1, -1)))

/** An address on the page, made absolute; null for data: or anything not http(s). */
function absolute(href: string | undefined | null, base: string): string | null {
  if (!href) return null
  try {
    const u = new URL(href.trim(), base)
    return /^https?:$/.test(u.protocol) ? u.href : null
  } catch { return null }
}

/** The logo, email and Instagram from the page's JSON-LD (an Organization or LocalBusiness's logo, email and sameAs). */
function structuredExtras(html: string): { logo: string | null; email: string | null; links: string[] } {
  let logo: string | null = null, email: string | null = null
  const links: string[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return }
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    if (Array.isArray(o['@graph'])) walk(o['@graph'])
    const l = o.logo
    logo ??= typeof l === 'string' ? l : l && typeof l === 'object' && typeof (l as { url?: unknown }).url === 'string' ? (l as { url: string }).url : null
    if (typeof o.email === 'string') email ??= emailOf(`mailto:${o.email.replace(/^mailto:/i, '')}`)
    const same = o.sameAs
    for (const s of Array.isArray(same) ? same : same ? [same] : []) if (typeof s === 'string') links.push(s)
  }
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())) } catch { /* a broken block */ }
  }
  return { logo, email, links }
}

/** Sizes like "180x180 32x32" → the largest side. */
const largest = (sizes: string | undefined) => Math.max(0, ...(sizes ?? '').split(/\s+/).map(s => Number(s.split(/x/i)[0]) || 0))

/** The square icon: an apple-touch-icon, else the largest PNG or SVG icon (a .ico is too small to use). */
export function iconIn(html: string, base: string): string | null {
  const links = tagsIn(html, 'link').filter(l => l.href)
  const rels = (l: Record<string, string>) => (l.rel ?? '').toLowerCase().split(/\s+/)
  const touch = links.find(l => rels(l).some(r => r.startsWith('apple-touch-icon')))
  if (touch) return absolute(touch.href, base)
  const icons = links.filter(l => rels(l).includes('icon') && !/\.ico(\?|$)/i.test(l.href) && (!l.type || /png|svg|webp/i.test(l.type)))
    .sort((a, b) => (/svg/i.test(b.type ?? b.href) ? 1e4 : largest(b.sizes)) - (/svg/i.test(a.type ?? a.href) ? 1e4 : largest(a.sizes)))
  return icons[0] ? absolute(icons[0].href, base) : null
}

/** The logo: the structured data's, else the first <img> that says it's the logo (its class, id, alt or file name). */
export function logoIn(html: string, base: string, structured: string | null): string | null {
  if (structured) return absolute(structured, base)
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, '')
  for (const img of tagsIn(body, 'img')) {
    const src = img.src || img['data-src'] || img.srcset?.split(/\s+/)[0]
    if (!src || src.startsWith('data:')) continue
    if ([img.class, img.id, img.alt, src.split('?')[0].split('/').pop()].some(x => /logo/i.test(x ?? ''))) return absolute(src, base)
  }
  return null
}

/** Everything the page's own HTML says (no Firecrawl). `url` is where it ended up, after redirects. */
export function readHtml(url: string, html: string): SiteRead {
  const facts = parsePage(url, html)
  const extras = structuredExtras(html)
  const links: string[] = []
  for (const a of tagsIn(html, 'a')) if (a.href) links.push(absolute(a.href, url) ?? a.href)
  const fromLinks = detailsFromLinks([...links, ...extras.links])
  const theme = tagsIn(html, 'meta').find(m => (m.name ?? '').toLowerCase() === 'theme-color')?.content
  const themeHex = hexOf(theme)
  const fonts = googleFontsIn(html)
  return {
    name: facts.business?.name?.trim() || facts.social['og:site_name']?.trim() || nameFromTitle(facts.title),
    description: facts.description ?? facts.social['og:description'] ?? null,
    logo_url: logoIn(html, url, extras.logo),
    icon_url: iconIn(html, url),
    colours: themeHex ? [{ name: msg('Primary'), hex: themeHex, role: 'primary' }] : [],
    heading_font: fonts[0] ?? null,
    body_font: fonts[1] ?? fonts[0] ?? null,
    phone: facts.business?.phone ?? fromLinks.phone,
    email: extras.email ?? fromLinks.email,
    address: facts.business?.address ?? null,
    instagram: fromLinks.instagram,
    hours: facts.business?.hours ?? null,
  }
}

// ---------------------------------------------------------------------------------------------
// Firecrawl's answer (POST /v2/scrape with formats ["branding", "links"])
// ---------------------------------------------------------------------------------------------

/** The parts of Firecrawl's scrape answer used here; every field may be missing. */
export interface FirecrawlScrape {
  branding?: {
    logo?: string | null
    colors?: Partial<Record<'primary' | 'secondary' | 'accent' | 'background' | 'textPrimary', string | null>> | null
    fonts?: { family?: string | null }[] | null
    typography?: { fontFamilies?: { primary?: string | null; heading?: string | null } | null } | null
    images?: { logo?: string | null; favicon?: string | null; ogImage?: string | null } | null
    /** Firecrawl's own guess at the brand's name. */
    brandName?: string | null
  } | null
  links?: string[] | null
  metadata?: {
    title?: string | string[] | null; description?: string | string[] | null; ogSiteName?: string | null; ogDescription?: string | null
    url?: string | null; sourceURL?: string | null; statusCode?: number | null
  } | null
}

const first = (v: string | string[] | null | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null

/** The colours Firecrawl saw, with the roles the Brand page uses (named in English; the guide saves them in the owner's language). */
const FIRECRAWL_COLOURS: { key: 'primary' | 'secondary' | 'accent' | 'background' | 'textPrimary'; name: string; role: BrandColour['role']; use?: string }[] = [
  { key: 'primary', name: msg('Primary'), role: 'primary' },
  { key: 'secondary', name: msg('Secondary'), role: 'secondary' },
  { key: 'accent', name: msg('Accent'), role: 'accent' },
  { key: 'background', name: msg('Background'), role: 'base' },
  { key: 'textPrimary', name: msg('Text'), role: 'base', use: msg('Text') },
]

export function readFirecrawl(data: FirecrawlScrape, base: string): SiteRead {
  const b = data.branding ?? {}
  const colours = uniqueColours(FIRECRAWL_COLOURS.flatMap(c => {
    const hex = hexOf(b.colors?.[c.key])
    return hex ? [{ name: c.name, hex, role: c.role, ...(c.use ? { use: c.use } : {}) }] : []
  }))
  const families = (b.fonts ?? []).map(f => fontFamily(f.family)).filter((f): f is string => !!f)
  const heading = fontFamily(b.typography?.fontFamilies?.heading) ?? families[0] ?? null
  const body = fontFamily(b.typography?.fontFamilies?.primary) ?? families.find(f => f !== heading) ?? heading
  const m = data.metadata ?? {}
  const links = (data.links ?? []).filter(l => typeof l === 'string')
  const icon = b.images?.favicon && !/\.ico(\?|$)/i.test(b.images.favicon) ? absolute(b.images.favicon, base) : null
  return {
    ...EMPTY_READ,
    ...detailsFromLinks(links),
    name: m.ogSiteName?.trim() || b.brandName?.trim() || nameFromTitle(first(m.title)),
    description: first(m.description) ?? m.ogDescription ?? null,
    logo_url: absolute(b.images?.logo ?? b.logo, base),
    icon_url: icon,
    colours,
    heading_font: heading,
    body_font: body,
  }
}

/** Firecrawl's read first (it sees the page as shown), the HTML's for whatever it didn't find. */
export function mergeReads(firecrawl: SiteRead | null, html: SiteRead | null): SiteRead {
  const a = firecrawl ?? EMPTY_READ, b = html ?? EMPTY_READ
  return {
    // The page's structured data (its name, phone, address and hours) is the business's own words: it wins.
    name: b.name ?? a.name,
    description: a.description ?? b.description,
    logo_url: a.logo_url ?? b.logo_url,
    icon_url: b.icon_url ?? a.icon_url,
    colours: a.colours.length ? a.colours : b.colours,
    heading_font: a.heading_font ?? b.heading_font,
    body_font: a.body_font ?? b.body_font,
    phone: b.phone ?? a.phone,
    email: b.email ?? a.email,
    address: b.address ?? a.address,
    instagram: a.instagram ?? b.instagram,
    hours: b.hours ?? a.hours,
  }
}

/** Anything worth showing? (A site that told us nothing gets a message instead.) */
export const foundAnything = (f: Pick<FoundBrand, 'logo' | 'icon' | 'colours' | 'heading_font' | 'name' | 'phone' | 'email' | 'address' | 'instagram'>) =>
  !!(f.logo || f.icon || f.colours.length || f.heading_font || f.name || f.phone || f.email || f.address || f.instagram)
