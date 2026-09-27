// Google Business Profile: keep opening hours, holiday closures and phone in sync with the app,
// and publish posts. OAuth 2.0 with offline access (refresh token) for the listing owner.
import type { CalendarEvent, OpeningHours } from '../../shared/types'
import { DAY_KEYS } from '../../shared/types'

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/business.manage', 'openid', 'email']

const DAY_NAMES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const

interface GTime { hours?: number; minutes?: number }
interface GPeriod { openDay: string; openTime: GTime; closeDay: string; closeTime: GTime }
interface GDate { year: number; month: number; day: number }
export interface GSpecialPeriod { startDate: GDate; endDate?: GDate; closed?: boolean; openTime?: GTime; closeTime?: GTime }

const toTime = (hm: string): GTime => {
  const [h, m] = hm.split(':').map(Number)
  return m ? { hours: h, minutes: m } : { hours: h }
}
const fromTime = (t: GTime) => `${String(t.hours ?? 0).padStart(2, '0')}:${String(t.minutes ?? 0).padStart(2, '0')}`
const toDate = (d: string): GDate => {
  const [year, month, day] = d.split('-').map(Number)
  return { year, month, day }
}

/** App opening hours → Google regularHours. */
export function toGoogleHours(hours: OpeningHours): { periods: GPeriod[] } {
  const periods: GPeriod[] = []
  DAY_KEYS.forEach((k, i) => {
    const h = hours[k]
    if (h) periods.push({ openDay: DAY_NAMES[i], openTime: toTime(h.open), closeDay: DAY_NAMES[i], closeTime: toTime(h.close) })
  })
  return { periods }
}

/** Google regularHours → app opening hours (first period per day). */
export function fromGoogleHours(regular: { periods?: GPeriod[] } | undefined): OpeningHours {
  const out: OpeningHours = {}
  DAY_KEYS.forEach(k => { out[k] = null })
  for (const p of regular?.periods ?? []) {
    const i = DAY_NAMES.indexOf(p.openDay as typeof DAY_NAMES[number])
    if (i >= 0 && !out[DAY_KEYS[i]]) out[DAY_KEYS[i]] = { open: fromTime(p.openTime), close: fromTime(p.closeTime) }
  }
  return out
}

/**
 * Days the café is closed that Google should show: public holidays it closes on, and business
 * closures. Future dates only. Holidays count as closed only when `closedOnHolidays` is true.
 */
export function toSpecialHours(events: CalendarEvent[], fromDate: string, closedOnHolidays: boolean): { specialHourPeriods: GSpecialPeriod[] } {
  const closing = events.filter(e => e.confirmed && (e.ends_on ?? e.starts_on) >= fromDate &&
    (e.category === 'business' ? /closed|cerrad|closure/i.test(e.title)
      : closedOnHolidays && ['national', 'regional', 'local'].includes(e.category)))
  return {
    specialHourPeriods: closing.map(e => ({
      startDate: toDate(e.starts_on),
      ...(e.ends_on && e.ends_on !== e.starts_on ? { endDate: toDate(e.ends_on) } : {}),
      closed: true,
    })),
  }
}

export interface GoogleOAuthConfig { clientId: string; clientSecret: string; redirectUri: string }

export function authUrl(cfg: GoogleOAuthConfig, state: string, scopes = GOOGLE_SCOPES) {
  const p = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', scope: scopes.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: scopes === GOOGLE_SCOPES ? 'true' : 'false', state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body),
  })
  const json = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; error?: string }
  if (!res.ok || !json.access_token) throw new Error(json.error_description ?? json.error ?? 'Google sign-in failed')
  return json
}

export const exchangeCode = (cfg: GoogleOAuthConfig, code: string) =>
  tokenRequest({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code' })

export const refreshAccess = (cfg: GoogleOAuthConfig, refreshToken: string) =>
  tokenRequest({ refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token' })

async function gfetch<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers } })
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message ?? `Google error ${res.status}`)
  return json
}

export interface GoogleLocation { name: string; title: string; account: string; address?: string }

/** All locations the signed-in Google user manages. */
export async function listLocations(token: string): Promise<GoogleLocation[]> {
  const { accounts = [] } = await gfetch<{ accounts?: { name: string }[] }>(token,
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts')
  const out: GoogleLocation[] = []
  for (const a of accounts) {
    const { locations = [] } = await gfetch<{ locations?: { name: string; title: string; storefrontAddress?: { addressLines?: string[]; locality?: string } }[] }>(token,
      `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`)
    for (const l of locations) {
      out.push({ name: l.name, title: l.title, account: a.name,
        address: [...(l.storefrontAddress?.addressLines ?? []), l.storefrontAddress?.locality].filter(Boolean).join(', ') })
    }
  }
  return out
}

export async function getLocationHours(token: string, location: string) {
  const l = await gfetch<{ regularHours?: { periods?: GPeriod[] } }>(token,
    `https://mybusinessbusinessinformation.googleapis.com/v1/${location}?readMask=regularHours`)
  return fromGoogleHours(l.regularHours)
}

export async function updateLocation(token: string, location: string, patch: {
  regularHours?: { periods: GPeriod[] }; specialHours?: { specialHourPeriods: GSpecialPeriod[] }; phone?: string | null
}) {
  const body: Record<string, unknown> = {}
  const mask: string[] = []
  if (patch.regularHours) { body.regularHours = patch.regularHours; mask.push('regularHours') }
  if (patch.specialHours) { body.specialHours = patch.specialHours; mask.push('specialHours') }
  if (patch.phone) { body.phoneNumbers = { primaryPhone: patch.phone }; mask.push('phoneNumbers.primaryPhone') }
  return gfetch(token, `https://mybusinessbusinessinformation.googleapis.com/v1/${location}?updateMask=${mask.join(',')}`,
    { method: 'PATCH', body: JSON.stringify(body) })
}

/** Google Business post. Events show dates on the listing. */
export async function createPost(token: string, account: string, location: string, post: {
  caption: string; image_url?: string | null; title?: string | null; starts_on?: string | null; ends_on?: string | null
}) {
  const locationId = location.split('/').pop()
  const body: Record<string, unknown> = { languageCode: 'es', summary: post.caption.slice(0, 1500), topicType: 'STANDARD' }
  if (post.title && post.starts_on) {
    body.topicType = 'EVENT'
    body.event = { title: post.title.slice(0, 58), schedule: { startDate: toDate(post.starts_on), endDate: toDate(post.ends_on ?? post.starts_on) } }
  }
  if (post.image_url) body.media = [{ mediaFormat: 'PHOTO', sourceUrl: post.image_url }]
  return gfetch<{ name: string }>(token, `https://mybusiness.googleapis.com/v4/${account}/locations/${locationId}/localPosts`,
    { method: 'POST', body: JSON.stringify(body) })
}
