// Theme days: the coffees the business serves (each bag: where it's from, its roaster and roast, how it
// tastes, a photo), named themes for the day (Colombian day 🇨🇴, Irish day 🇮🇪…) that each serve a coffee
// and play a playlist, and when each runs: a weekly rotation, and one-off dates that override it
// (17 March: Irish day). The Calendar shows each day's theme and the Coffees page lists the coffees
// (the `theme_days` migration). The team reads them; admins change them.
import { msg } from './i18n'
import type { OpeningHours } from './types'
import { dayKey } from './time'

// ---------------------------------------------------------------------------------------------
// Coffees
// ---------------------------------------------------------------------------------------------
export type RoastLevel = 'light' | 'medium' | 'dark'
export const ROASTS: { id: RoastLevel; label: string }[] = [
  { id: 'light', label: msg('Light roast') },
  { id: 'medium', label: msg('Medium roast') },
  { id: 'dark', label: msg('Dark roast') },
]
export type CoffeeProcess = 'washed' | 'natural' | 'honey' | 'anaerobic' | 'other'
export const PROCESSES: { id: CoffeeProcess; label: string }[] = [
  { id: 'washed', label: msg('Washed') },
  { id: 'natural', label: msg('Natural') },
  { id: 'honey', label: msg('Honey') },
  { id: 'anaerobic', label: msg('Anaerobic') },
  { id: 'other', label: msg('Other process') },
]
export type BrewUse = 'espresso' | 'filter' | 'both'
export const BREWS: { id: BrewUse; label: string }[] = [
  { id: 'espresso', label: msg('Espresso') },
  { id: 'filter', label: msg('Filter') },
  { id: 'both', label: msg('Espresso and filter') },
]

/** Where coffee grows, and where blends are roasted for the guest coffees (ISO 3166 codes). */
export const COFFEE_COUNTRIES = [
  'BR', 'CO', 'ET', 'KE', 'GT', 'HN', 'CR', 'SV', 'NI', 'PA', 'PE', 'BO', 'EC', 'MX', 'JM', 'RW', 'BI', 'UG', 'TZ', 'CD',
  'YE', 'IN', 'ID', 'PG', 'VN', 'CN', 'TH', 'US', 'IE', 'GB', 'ES', 'PT', 'IT', 'FR', 'NL', 'DE',
] as const

/** 'CO' → 🇨🇴 (two regional indicator letters); '' for anything that isn't a country code. */
export const flagOf = (country: string | null | undefined) =>
  country && /^[A-Za-z]{2}$/.test(country) ? String.fromCodePoint(...[...country.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : ''

export interface Coffee {
  id: string
  name: string
  /** Where it's from (ISO 3166 code, e.g. CO), or null for a blend from several. */
  country: string | null
  /** Region or farm: "Huila", "Finca La Esperanza". */
  region: string | null
  roaster: string | null
  roast: RoastLevel | null
  process: CoffeeProcess | null
  tasting_notes: string | null
  brew: BrewUse
  /** The bag it comes in: its size and what it costs (both optional). */
  bag_grams: number | null
  bag_price: number | null
  /** In use now; one no longer bought stays for the record. */
  active: boolean
  /** A photo of the bag, made small in the browser, as a data: URL (null: none yet). */
  photo: string | null
  sort: number
  created_at: string
}
export type CoffeeInput = Partial<Omit<Coffee, 'id' | 'created_at'>> & Pick<Coffee, 'name'> & { id?: string }

/** The same limits as the database's. */
export const COFFEE_LIMITS = { name: 80, region: 120, roaster: 80, tasting_notes: 300, photo: 1_000_000 }

/** What's wrong with a coffee before it's saved (the database says the same), or null. */
export function coffeeProblem(c: Partial<CoffeeInput>): string | null {
  const name = (c.name ?? '').trim()
  if (!name) return msg('Give the coffee a name')
  if (name.length > COFFEE_LIMITS.name) return msg('Keep the name to 80 characters')
  if ((c.region ?? '').trim().length > COFFEE_LIMITS.region) return msg('Keep the region or farm to 120 characters')
  if ((c.roaster ?? '').trim().length > COFFEE_LIMITS.roaster) return msg('Keep the roaster to 80 characters')
  if ((c.tasting_notes ?? '').trim().length > COFFEE_LIMITS.tasting_notes) return msg('Keep the tasting notes to 300 characters')
  if (c.country && !/^[A-Z]{2}$/.test(c.country)) return msg('Pick the country from the list')
  if (c.bag_grams != null && (!Number.isInteger(c.bag_grams) || c.bag_grams < 1 || c.bag_grams > 100_000)) return msg('The bag size is in grams, like 1000')
  if (c.bag_price != null && (!Number.isFinite(c.bag_price) || c.bag_price < 0)) return msg('The price can’t be below zero')
  if (c.photo && (!/^data:image\/(jpeg|png|webp);base64,/.test(c.photo) || c.photo.length > COFFEE_LIMITS.photo)) return msg('That photo can’t be used. Try another.')
  return null
}

/** What a kilo costs, from the bag's price and size; null without both. */
export const pricePerKg = (c: Pick<Coffee, 'bag_grams' | 'bag_price'>) =>
  c.bag_grams && c.bag_price != null ? Math.round((c.bag_price / c.bag_grams) * 100_000) / 100 : null

// ---------------------------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------------------------
/** The playlist a theme plays: one of the café's, or any YouTube Music or Spotify playlist by its link. */
export interface ThemePlaylist { id: string; name: string; url: string; image?: string; tracks?: number; provider?: 'youtube' | 'spotify' }

export interface DayTheme {
  id: string
  name: string
  /** A flag or emoji: 🇨🇴. */
  emoji: string | null
  /** Its colour on the calendar (#RRGGBB). */
  colour: string
  description: string | null
  /** The coffee it serves. */
  coffee_id: string | null
  playlist: ThemePlaylist | null
  /** Anything else for the day: a food special, the decorations. */
  notes: string | null
  sort: number
}
export type DayThemeInput = Partial<Omit<DayTheme, 'id'>> & Pick<DayTheme, 'name'> & { id?: string }

export const THEME_LIMITS = { name: 60, emoji: 16, description: 300, notes: 500 }
/** Colours to pick from: the three flags' and the roast's, then the brand's. */
export const THEME_COLOURS = ['#FCD116', '#169B62', '#009C3B', '#6B4226', '#CE1126', '#003893', '#F79BA4', '#B7A3D8', '#6B8E4E', '#2B2522']
/** Quick picks for a theme's flag or emoji. */
export const THEME_EMOJIS = ['🇨🇴', '🇮🇪', '🇧🇷', '🇪🇹', '🇰🇪', '🇬🇹', '🇵🇪', '🇲🇽', '🇪🇸', '🇮🇹', '☕', '🎉']

/** What's wrong with a theme before it's saved, or null. */
export function themeProblem(t: Partial<DayThemeInput>): string | null {
  const name = (t.name ?? '').trim()
  if (!name) return msg('Give the theme a name')
  if (name.length > THEME_LIMITS.name) return msg('Keep the name to 60 characters')
  if ([...(t.emoji ?? '').trim()].length > THEME_LIMITS.emoji) return msg('One flag or emoji is enough')
  if (t.colour != null && !/^#[0-9A-Fa-f]{6}$/.test(t.colour)) return msg('Pick a colour')
  if ((t.description ?? '').trim().length > THEME_LIMITS.description) return msg('Keep the description to 300 characters')
  if ((t.notes ?? '').trim().length > THEME_LIMITS.notes) return msg('Keep the notes to 500 characters')
  if (t.playlist && (!t.playlist.name.trim() || !/^https:\/\//.test(t.playlist.url))) return msg('That playlist link can’t be used')
  return null
}

/**
 * A playlist from a link someone pastes: YouTube Music or YouTube (…?list=ID) or Spotify
 * (open.spotify.com/playlist/ID). Null for anything else.
 */
export function playlistFromLink(link: string, name: string): ThemePlaylist | null {
  const text = link.trim()
  let url: URL
  try { url = new URL(text) } catch { return null }
  if (url.protocol !== 'https:') return null
  const host = url.hostname.replace(/^www\./, '')
  if (['music.youtube.com', 'youtube.com', 'm.youtube.com'].includes(host)) {
    const id = url.searchParams.get('list')
    return id && /^[A-Za-z0-9_-]{2,64}$/.test(id)
      ? { id, name: name.trim(), url: `https://music.youtube.com/playlist?list=${id}`, provider: 'youtube' } : null
  }
  if (host === 'open.spotify.com') {
    const m = /^\/(?:intl-[a-z-]+\/)?playlist\/([A-Za-z0-9]{10,40})/.exec(url.pathname)
    return m ? { id: m[1], name: name.trim(), url: `https://open.spotify.com/playlist/${m[1]}`, provider: 'spotify' } : null
  }
  return null
}

/** The text that reads well on a theme's colour: dark on a light colour, white on a dark one. */
export function inkOn(colour: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour)
  if (!m) return '#FFFFFF'
  const [r, g, b] = m.slice(1).map(h => {
    const c = parseInt(h, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // White on it, or the espresso ink: whichever has more contrast.
  return (1.05) / (light + 0.05) >= (light + 0.05) / (0.0195 + 0.05) ? '#FFFFFF' : '#2B2522'
}

// ---------------------------------------------------------------------------------------------
// When each theme runs
// ---------------------------------------------------------------------------------------------
/** 1 Monday … 7 Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]
export const WEEKDAY_NAMES = [msg('Monday'), msg('Tuesday'), msg('Wednesday'), msg('Thursday'), msg('Friday'), msg('Saturday'), msg('Sunday')]
export const WEEKDAY_SHORT = [msg('Mon'), msg('Tue'), msg('Wed'), msg('Thu'), msg('Fri'), msg('Sat'), msg('Sun')]

/** The ISO weekday of a date (yyyy-MM-dd): 1 Monday … 7 Sunday. */
export const isoWeekday = (date: string) => (((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1) as Weekday

/** One date set apart from the rotation: a theme, or none that day. */
export interface ThemeDate { day: string; theme_id: string | null; note: string | null }

export interface ThemeDays {
  themes: DayTheme[]
  /** Weekday (1–7) → theme id; a weekday that isn't here has no theme. */
  rotation: Partial<Record<Weekday, string>>
  dates: ThemeDate[]
}

/** The business's opening hours say it's closed on that date's weekday. */
export const closedOn = (date: string, hours: OpeningHours | null | undefined) => !!hours && Object.keys(hours).length > 0 && !hours[dayKey(date)]

export interface ThemeOn {
  theme: DayTheme | null
  /** Where it comes from: that date (set apart from the rotation), the weekly rotation, or nothing. */
  source: 'date' | 'rotation' | null
  /** Closed that day (by the opening hours or a closure on the calendar): the rotation gives it no theme. */
  closed: boolean
}

/**
 * The theme on a date: a date set apart first (a theme, or none that day), then the weekly rotation,
 * unless the business is closed that day (by its opening hours, or a closure on the calendar).
 */
export function themeOn(date: string, days: ThemeDays | null | undefined, opts: { hours?: OpeningHours | null; closures?: Set<string> } = {}): ThemeOn {
  const closed = closedOn(date, opts.hours) || !!opts.closures?.has(date)
  if (!days) return { theme: null, source: null, closed }
  const byId = (id: string | null | undefined) => (id ? days.themes.find(t => t.id === id) ?? null : null)
  const set = days.dates.find(d => d.day === date)
  if (set) return { theme: byId(set.theme_id), source: 'date', closed }
  if (closed) return { theme: null, source: null, closed }
  const theme = byId(days.rotation[isoWeekday(date)])
  return { theme, source: theme ? 'rotation' : null, closed }
}

/** The weekdays a theme is on in the rotation, in order: [2, 5] for Tuesday and Friday. */
export const weekdaysOf = (themeId: string, rotation: ThemeDays['rotation']) => WEEKDAYS.filter(w => rotation[w] === themeId)

/** Themes in their order. */
export const sortThemes = <T extends Pick<DayTheme, 'sort' | 'name'>>(themes: T[]) => [...themes].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
/** Coffees in their order, those in use first. */
export const sortCoffees = <T extends Pick<Coffee, 'sort' | 'name' | 'active'>>(coffees: T[]) =>
  [...coffees].sort((a, b) => Number(b.active) - Number(a.active) || a.sort - b.sort || a.name.localeCompare(b.name))
