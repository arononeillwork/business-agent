// QR codes (Business section; the owner calls them barcodes): the business's codes, each a link (the
// menu on the tables, the competition on the café screen), a Wi-Fi network (scan to join) or some
// text, with where it's used, its colours and the logo in the middle if wanted. They're drawn in the
// browser with qrcode-generator and downloaded as a PNG or an SVG, or printed (the `qr_codes` migration).
import qrcode from 'qrcode-generator'
import { msg } from './i18n'

export type QrKind = 'link' | 'wifi' | 'text'
export const QR_KINDS: { id: QrKind; label: string }[] = [
  { id: 'link', label: msg('Link') },
  { id: 'wifi', label: msg('Wi-Fi') },
  { id: 'text', label: msg('Text') },
]

/** How the network is locked, as the WIFI: code says it (T:): WPA covers WPA2 and WPA3 too. */
export type WifiSecurity = 'WPA' | 'WEP' | 'nopass'
export const WIFI_SECURITY: { id: WifiSecurity; label: string }[] = [
  { id: 'WPA', label: msg('WPA, WPA2 or WPA3 (most networks)') },
  { id: 'WEP', label: msg('WEP (older routers)') },
  { id: 'nopass', label: msg('None: an open network') },
]

export interface QrCode {
  id: string
  name: string
  kind: QrKind
  /** Link: the address it opens. */
  url: string | null
  /** Text: what the phone shows when it's scanned. */
  content: string | null
  /** Wi-Fi: the network's name, its password, how it's locked and whether it's hidden. */
  wifi_ssid: string | null
  wifi_password: string | null
  wifi_security: WifiSecurity
  wifi_hidden: boolean
  /** Where it's used: "On the tables". */
  used_where: string | null
  /** The line printed under it ("Scan for the menu"); null: the usual one for its kind. */
  caption: string | null
  /** The code's colour and its background (#RRGGBB); null: the brand's dark colour, and white. */
  dark_colour: string | null
  light_colour: string | null
  /** The brand's logo in the middle (the code is then made sturdier, so it still scans). */
  logo: boolean
  sort: number
  created_at: string
  updated_at: string
}
export type QrCodeInput = Partial<Omit<QrCode, 'id' | 'created_at' | 'updated_at'>> & Pick<QrCode, 'name'> & { id?: string }

/** The same limits as the database's. A network's name is at most 32 bytes; a WPA password 63 letters (or 64 hex digits). */
export const QR_LIMITS = { name: 60, url: 2000, content: 1000, ssid: 32, password: 64, used_where: 80, caption: 80 }

/** Where codes usually go, offered when saying where one's used. */
export const QR_PLACES = [msg('On the tables'), msg('On the café screen'), msg('On the counter'), msg('In the window'), msg('On flyers'), msg('On the receipts')]

const HEX = /^#[0-9A-Fa-f]{6}$/
const tidy = (s: string | null | undefined) => (s ?? '').trim()

// ---------------------------------------------------------------------------------------------
// What a code says when it's scanned
// ---------------------------------------------------------------------------------------------
/** A Wi-Fi code's field, with the characters the format uses escaped (\ ; , : and "). */
export const wifiEscape = (s: string) => s.replace(/([\\;,:"])/g, '\\$1')

/**
 * What a phone reads to join a network: WIFI:T:WPA;S:<name>;P:<password>;H:false;; (the format
 * phones' cameras understand; an open network has no password).
 */
export function wifiPayload(w: { ssid: string; password?: string | null; security: WifiSecurity; hidden?: boolean }): string {
  const password = w.security === 'nopass' ? '' : `P:${wifiEscape(w.password ?? '')};`
  return `WIFI:T:${w.security};S:${wifiEscape(w.ssid)};${password}H:${w.hidden ? 'true' : 'false'};;`
}

/** A link as typed, with https:// in front when it was left off ("easybeanscoffee.com/menu"). */
export function cleanUrl(url: string | null | undefined): string | null {
  const u = tidy(url)
  if (!u) return null
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u.replace(/^\/+/, '')}`
}

const isWebAddress = (u: string) => {
  if (!/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(u)) return false
  try { return Boolean(new URL(u).hostname) } catch { return false }
}

type Content = Pick<QrCode, 'kind' | 'url' | 'content' | 'wifi_ssid' | 'wifi_password' | 'wifi_security'> & Partial<Pick<QrCode, 'wifi_hidden'>>

/** What it still needs before it can be used (and downloaded), or null when it's ready. */
export function qrMissing(c: Content): string | null {
  if (c.kind === 'wifi') {
    const ssid = tidy(c.wifi_ssid), password = c.wifi_password ?? ''
    if (c.wifi_security === 'nopass') return ssid ? null : msg('Add the network name')
    if (!ssid && !password) return msg('Add the network name and password')
    if (!ssid) return msg('Add the network name')
    return password ? null : msg('Add the password')
  }
  if (c.kind === 'text') return tidy(c.content) ? null : msg('Add the text it shows')
  return tidy(c.url) ? null : msg('Add the link it opens')
}

/** What the code says when it's scanned, or null while something's missing. */
export function qrPayload(c: Content): string | null {
  if (qrMissing(c)) return null
  if (c.kind === 'wifi') return wifiPayload({ ssid: tidy(c.wifi_ssid), password: c.wifi_password, security: c.wifi_security, hidden: c.wifi_hidden })
  if (c.kind === 'text') return tidy(c.content)
  return cleanUrl(c.url)
}

/** What's wrong with a code before it's saved (the database says the same), or null. Missing content isn't wrong: it waits. */
export function qrProblem(c: QrCodeInput): string | null {
  const name = tidy(c.name)
  if (!name) return msg('Give the code a name')
  if (name.length > QR_LIMITS.name) return msg('Keep the name to 60 characters')
  const url = cleanUrl(c.url)
  if ((c.kind ?? 'link') === 'link' && url && (!isWebAddress(url) || url.length > QR_LIMITS.url)) return msg('The link should be a web address, like https://example.com/menu')
  if (tidy(c.content).length > QR_LIMITS.content) return msg('Keep the text to 1,000 characters')
  if (new TextEncoder().encode(tidy(c.wifi_ssid)).length > QR_LIMITS.ssid) return msg('A network name is at most 32 characters')
  const password = c.wifi_password ?? ''
  if (password.length > QR_LIMITS.password) return msg('A Wi-Fi password is at most 64 characters')
  if (c.kind === 'wifi' && (c.wifi_security ?? 'WPA') === 'WPA' && password && password.length < 8) return msg('A WPA password is at least 8 characters')
  if (tidy(c.used_where).length > QR_LIMITS.used_where) return msg('Keep where it’s used to 80 characters')
  if (tidy(c.caption).length > QR_LIMITS.caption) return msg('Keep the line under it to 80 characters')
  for (const colour of [c.dark_colour, c.light_colour]) if (colour && !HEX.test(colour)) return msg('Pick the colours from the colour picker')
  return null
}

/** The line printed under it, in English (shown with t()): its own, or the usual one for its kind. */
export function qrCaption(c: Pick<QrCode, 'kind' | 'caption'>): string {
  return tidy(c.caption) || (c.kind === 'wifi' ? msg('Scan to join the Wi-Fi') : msg('Scan with your phone’s camera'))
}

/** The code in their order. */
export const sortQrCodes = (codes: QrCode[]) => [...codes].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))

/** A file name for the code's downloads: "menu-qr-code". */
export function qrFileName(name: string) {
  const slug = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'qr'}-qr-code`
}

// ---------------------------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------------------------
export const QR_LIGHT = '#FFFFFF'
export const QR_DARK = '#000000'

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** How far apart two colours are, 1 (the same) to 21 (black on white), as WCAG measures it. */
export function contrastRatio(a: string, b: string) {
  if (!HEX.test(a) || !HEX.test(b)) return 1
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The brand's darkest colour when it's dark enough to scan well on white, else black. */
export function brandDark(colours: { hex: string }[] | null | undefined): string {
  const dark = (colours ?? []).map(c => c.hex).filter(h => HEX.test(h) && contrastRatio(h, QR_LIGHT) >= 4.5)
    .sort((a, b) => luminance(a) - luminance(b))
  return dark[0]?.toUpperCase() ?? QR_DARK
}

/** The colours it's drawn in. */
export function qrColours(c: Pick<QrCode, 'dark_colour' | 'light_colour'>, brand: { hex: string }[] | null | undefined) {
  return { dark: c.dark_colour ?? brandDark(brand), light: c.light_colour ?? QR_LIGHT }
}

/** Colours a phone may struggle with, or null. */
export function colourProblem(dark: string, light: string): string | null {
  if (luminance(dark) >= luminance(light)) return msg('Make the code darker than its background, or some phones won’t read it')
  if (contrastRatio(dark, light) < 3) return msg('The two colours are too alike for phones to read it. Pick a darker colour for the code')
  return null
}

// ---------------------------------------------------------------------------------------------
// Drawing it
// ---------------------------------------------------------------------------------------------
// Phones read Wi-Fi names and text as UTF-8 (the library's own reading keeps one byte a letter).
qrcode.stringToBytes = (s: string) => Array.from(new TextEncoder().encode(s))

/** The light border all round, in modules: the four the standard asks for. */
export const QUIET_ZONE = 4
/** How much of the code's width the logo takes (it stays readable at error correction H). */
export const LOGO_SHARE = 0.22

/**
 * The code's modules (true: dark), row by row, without the quiet zone. Error correction M (15% can be
 * lost), or H (30%) with a logo over the middle. Throws when it's too long for any QR code.
 */
export function qrModules(payload: string, withLogo = false): boolean[][] {
  const qr = qrcode(0, withLogo ? 'H' : 'M')
  try {
    qr.addData(payload, 'Byte')
    qr.make()
  } catch {
    throw new Error(msg('That’s too long for a QR code. Shorten it'))
  }
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, col) => qr.isDark(r, col)))
}

/** The square in the middle the logo sits on, in modules from the top left of the code itself (whole modules, centred). */
export function logoBox(size: number) {
  let side = Math.round(size * LOGO_SHARE)
  if ((size - side) % 2) side += 1
  const at = (size - side) / 2
  return { at, side }
}

const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The code as an SVG: one square a module, rows joined into runs, with the quiet zone; the logo (a
 * data: URL or https address) on a light square in the middle. `title` names it for screen readers.
 */
export function qrSvg(payload: string, o: { dark: string; light: string; logo?: string | null; title?: string; px?: number }): string {
  const modules = qrModules(payload, !!o.logo)
  const n = modules.length
  const total = n + 2 * QUIET_ZONE
  const box = o.logo ? logoBox(n) : null
  const covered = (r: number, c: number) => !!box && r >= box.at && r < box.at + box.side && c >= box.at && c < box.at + box.side
  let path = ''
  modules.forEach((row, r) => {
    for (let c = 0; c < n; c++) {
      if (!row[c] || covered(r, c)) continue
      let run = 1
      while (c + run < n && row[c + run] && !covered(r, c + run)) run++
      path += `M${c + QUIET_ZONE} ${r + QUIET_ZONE}h${run}v1h-${run}z`
      c += run - 1
    }
  })
  const size = o.px ? ` width="${o.px}" height="${o.px}"` : ''
  const title = o.title ? `<title>${escXml(o.title)}</title>` : ''
  let logo = ''
  if (box && o.logo) {
    const at = box.at + QUIET_ZONE, pad = box.side * 0.08
    logo = `<rect x="${at}" y="${at}" width="${box.side}" height="${box.side}" rx="${box.side * 0.18}" fill="${o.light}"/>`
      + `<image href="${escXml(o.logo)}" x="${at + pad}" y="${at + pad}" width="${box.side - 2 * pad}" height="${box.side - 2 * pad}" preserveAspectRatio="xMidYMid meet"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${size} shape-rendering="crispEdges">${title}`
    + `<rect width="${total}" height="${total}" fill="${o.light}"/><path d="${path}" fill="${o.dark}"/>${logo}</svg>`
}

// ---------------------------------------------------------------------------------------------
// Suggestions for a business starting out
// ---------------------------------------------------------------------------------------------
export type QrSuggestionKey = 'menu' | 'competition' | 'wifi' | 'review'
export interface QrSuggestion { key: QrSuggestionKey; label: string; description: string; code: QrCodeInput }

/** An address on the business's website: ("https://example.com/", "menu") → https://example.com/menu. */
export function onWebsite(website: string | null | undefined, path: string): string | null {
  const site = cleanUrl(website)
  if (!site) return null
  try { return new URL(path, site.endsWith('/') ? site : `${site}/`).toString() } catch { return null }
}

/** Google's "write a review" page for a place on Google Maps. */
export const googleReviewUrl = (placeId: string) => `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`

/**
 * The usual codes a business starts with, in English (shown with t()), less any it already has: the
 * menu (from its website, when it has one), its competition, its Wi-Fi and, when its Google place is
 * known, a Google review. One already there under its English name, or its name in the person's
 * language (`translate`), isn't suggested again.
 */
export function qrSuggestions(have: Pick<QrCode, 'name' | 'kind' | 'url'>[],
  o: { website?: string | null; placeId?: string | null; translate?: (english: string) => string }): QrSuggestion[] {
  const names = new Set(have.map(c => c.name.trim().toLowerCase()))
  const named = (n: string) => names.has(n.toLowerCase()) || names.has((o.translate?.(n) ?? n).toLowerCase())
  const review = o.placeId ? googleReviewUrl(o.placeId) : null
  const all: (QrSuggestion & { have: boolean })[] = [
    { key: 'menu', label: msg('Menu'), description: msg('For the tables: the menu on the phone'), have: named('Menu'),
      code: { name: msg('Menu'), kind: 'link', url: onWebsite(o.website, 'menu'), used_where: msg('On the tables'), caption: msg('Scan for the menu') } },
    { key: 'competition', label: msg('Competition'), description: msg('For the screen or a poster: how to enter'), have: named('Competition'),
      code: { name: msg('Competition'), kind: 'link', url: onWebsite(o.website, 'competition'), used_where: msg('On the café screen'), caption: msg('Scan to enter the competition') } },
    { key: 'wifi', label: msg('Wi-Fi'), description: msg('Customers join the Wi-Fi without typing the password'), have: have.some(c => c.kind === 'wifi'),
      code: { name: msg('Wi-Fi'), kind: 'wifi', wifi_security: 'WPA', used_where: msg('On the counter'), caption: msg('Scan to join the Wi-Fi') } },
    { key: 'review', label: msg('Google review'), description: msg('Straight to leaving a review on Google'), have: !review || named('Google review') || have.some(c => c.url === review),
      code: { name: msg('Google review'), kind: 'link', url: review, used_where: msg('On the receipts'), caption: msg('Enjoyed it? Scan to leave us a review') } },
  ]
  return all.filter(s => !s.have).map(s => ({ key: s.key, label: s.label, description: s.description, code: s.code }))
}
