// The business's details a website shows, read from the app (GET /api/site/<business>/details,
// worker/site.ts): where it is, how to reach it, its social accounts and when it's open, with the
// closures on its Calendar. Changed on the Business and Opening hours pages, the website shows the
// change within minutes, the same as Google Maps (which is sent the same hours and closures).
//
// A contract with websites outside the app, like the menu (shared/websiteFeed.ts): fields are added,
// never renamed or removed, and `version` changes if one ever must. docs/WEBSITE.md says how to use it.
import { closingEvents } from './closures'
import { addDays, dayKey } from './time'
import { DAY_KEYS, type Business, type CalendarEvent, type DayKey } from './types'

/** Hours as "HH:MM", in the business's time zone. */
export interface SiteHours { open: string; close: string }

export interface SiteDetailsFeed {
  version: 1
  business: { id: number; name: string }
  /** The address as typed on the Business page, and its parts between commas ("C. Pizarro 8", "29670 San Pedro de Alcántara", "Málaga"). */
  address: string | null
  address_lines: string[]
  /** Google Maps for the business: its own listing when it's connected (or the app knows its place), else a search for its name and address. */
  maps_url: string | null
  phone: string | null
  /** The number people message on WhatsApp, and its wa.me link. */
  whatsapp: string | null
  whatsapp_url: string | null
  email: string | null
  website: string | null
  /** Each account the business has: its handle without the @, and its address. */
  social: { instagram: SiteSocial | null; tiktok: SiteSocial | null }
  /** The time zone the hours and dates are in (IANA: "Europe/Madrid"). */
  timezone: string
  /** The usual week, Monday first: null is closed that day. */
  hours: Record<DayKey, SiteHours | null>
  /** Days it's closed besides that, from today: a closure on its Calendar, or a public holiday it closes on. */
  closures: SiteClosure[]
  /** The next 14 days from today where it is, each with its hours that day (closures applied): for "open now" and ordering. */
  days: SiteDay[]
  /** When this answer was made. */
  generated_at: string
}

export interface SiteSocial { handle: string; url: string }
/** Dates YYYY-MM-DD, `to` included; `reason` as the Calendar names it ("Christmas Day", "Closed for a wedding"). */
export interface SiteClosure { from: string; to: string; reason: string }
export interface SiteDay {
  date: string
  day: DayKey
  /** Null when it's closed that day. */
  open: string | null
  close: string | null
  /** Why it's closed when its week says it's open (a closure); null otherwise. */
  closed_reason: string | null
}

/** How far ahead closures are listed, in days. */
export const CLOSURES_AHEAD = 120
/** Days in `days`. */
export const DAYS_AHEAD = 14

const hhmm = (v: string | undefined) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(v ?? '')
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}
const handle = (v: string | null | undefined) => (v ?? '').trim().replace(/^@+/, '') || null

export interface DetailsInput {
  business: Pick<Business, 'name' | 'address' | 'phone' | 'email' | 'instagram' | 'website' | 'timezone' | 'opening_hours'> & {
    id: number; whatsapp?: string | null; tiktok?: string | null
  }
  /** Calendar events from today on (holidays and the business's own). */
  events: CalendarEvent[]
  /** It closes on public holidays (Opening hours page). */
  closedOnHolidays: boolean
  /** Its Google Maps place, when known. */
  placeId?: string | null
  /** Its own page on Google Maps (the listing chosen on Connections), when known: used as it is. */
  mapsUrl?: string | null
  /** Today where the business is (YYYY-MM-DD). */
  today: string
  now?: Date
}

/** The details feed for a website. */
export function siteDetails(input: DetailsInput): SiteDetailsFeed {
  const b = input.business
  const address = b.address?.trim() || null
  const hours = Object.fromEntries(DAY_KEYS.map(k => {
    const h = b.opening_hours?.[k]
    const open = hhmm(h?.open), close = hhmm(h?.close)
    return [k, open && close ? { open, close } : null]
  })) as Record<DayKey, SiteHours | null>

  const until = addDays(input.today, CLOSURES_AHEAD)
  const closures = closingEvents(input.events, input.today, input.closedOnHolidays)
    .filter(e => e.starts_on <= until)
    .map(e => ({ from: e.starts_on < input.today ? input.today : e.starts_on, to: e.ends_on && e.ends_on > e.starts_on ? e.ends_on : e.starts_on, reason: e.title.trim() }))
    .sort((a, z) => a.from.localeCompare(z.from) || a.to.localeCompare(z.to))

  const days: SiteDay[] = Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const date = addDays(input.today, i)
    const day = dayKey(date)
    const usual = hours[day]
    const closure = usual ? closures.find(c => c.from <= date && date <= c.to) : undefined
    return {
      date, day,
      open: usual && !closure ? usual.open : null,
      close: usual && !closure ? usual.close : null,
      closed_reason: closure ? closure.reason : null,
    }
  })

  const digits = (b.whatsapp ?? '').replace(/\D/g, '')
  const ig = handle(b.instagram), tt = handle(b.tiktok)
  const query = [b.name, address].filter(Boolean).join(' ')
  const maps = input.mapsUrl && /^https:\/\//.test(input.mapsUrl) ? input.mapsUrl
    : input.placeId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || b.name)}&query_place_id=${encodeURIComponent(input.placeId)}`
    : address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null

  return {
    version: 1,
    business: { id: b.id, name: b.name },
    address,
    address_lines: address ? address.split(',').map(s => s.trim()).filter(Boolean) : [],
    maps_url: maps,
    phone: b.phone?.trim() || null,
    whatsapp: digits ? b.whatsapp!.trim() : null,
    whatsapp_url: digits ? `https://wa.me/${digits}` : null,
    email: b.email?.trim() || null,
    website: b.website?.trim() || null,
    social: {
      instagram: ig ? { handle: ig, url: `https://www.instagram.com/${ig}` } : null,
      tiktok: tt ? { handle: tt, url: `https://www.tiktok.com/@${tt}` } : null,
    },
    timezone: b.timezone,
    hours,
    closures,
    days,
    generated_at: (input.now ?? new Date()).toISOString(),
  }
}
