// Sports fixtures: what the café may show on TV and which nights may be busy.
// Sources (all free, no key): fixturedownload.com (whole seasons of the big leagues and the
// Champions League), TheSportsDB (other leagues, cups, national teams, boxing; the free tier only
// gives a few events per call) and Wikipedia's list of scheduled UFC events.

export type Sport = 'football' | 'ufc' | 'boxing'

export type SportsSource = 'fixturedownload' | 'thesportsdb' | 'wikipedia'

/** One of a person's favourites: a team (by name, as fixtures write it) or a competition (by code). */
export interface SportsFavourite { kind: 'team' | 'competition'; ref: string }

export interface SportsCompetition {
  code: string
  source: SportsSource
  source_id: string
  name: string
  sport: Sport
  region: string
  kind: 'league' | 'cup' | 'national' | 'fight'
  season_style: 'split' | 'year'
  followed: boolean
  sort: number
  refreshed_at: string | null
  last_error: string | null
}

export interface SportsEvent {
  id: string
  competition: string
  sport: Sport
  starts_at: string
  /** Only the day is known: show "time TBC" (starts_at is then that day's evening, UTC). */
  time_tbc: boolean
  title: string
  home: string | null
  away: string | null
  home_badge: string | null
  away_badge: string | null
  round: string | null
  venue: string | null
  city: string | null
  country: string | null
  status: 'scheduled' | 'live' | 'finished' | 'postponed'
  big: boolean
  image: string | null
}

/** A raw TheSportsDB event (only the fields we use). */
export interface SportsDbEvent {
  idEvent: string
  strEvent: string | null
  strTimestamp?: string | null
  dateEvent?: string | null
  strTime?: string | null
  strHomeTeam?: string | null
  strAwayTeam?: string | null
  strHomeTeamBadge?: string | null
  strAwayTeamBadge?: string | null
  intRound?: string | null
  strVenue?: string | null
  strCity?: string | null
  strCountry?: string | null
  strStatus?: string | null
  strPostponed?: string | null
  strThumb?: string | null
  strPoster?: string | null
  strSeason?: string | null
}

// Clubs whose matches fill bars on the Costa del Sol (Spanish giants, the big English and
// Dutch clubs, and Málaga as the local side).
const BIG_CLUBS = [
  'real madrid', 'barcelona', 'atletico madrid', 'atlético madrid', 'sevilla', 'real betis', 'malaga', 'málaga',
  'manchester united', 'manchester city', 'liverpool', 'arsenal', 'chelsea', 'tottenham',
  'atletico de madrid', 'atlético de madrid',
  'ajax', 'psv', 'feyenoord', 'celtic', 'rangers', 'bayern', 'juventus', 'inter', 'internazionale', 'ac milan', 'milan', 'psg', 'paris sg',
  'paris saint germain', 'benfica', 'porto', 'sporting cp',
]
const HOME_NATIONS = ['spain', 'england', 'netherlands', 'scotland', 'ireland', 'wales', 'germany', 'france', 'portugal', 'belgium', 'italy']

// Whole words only: "Inter" is big, "Winterthur" isn't.
const has = (name: string | null | undefined, list: string[]) => {
  const n = ` ${(name ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  return list.some(x => n.includes(` ${x} `))
}

/** Is this a night the café should expect fans (and have the TV on)? */
export function isBigEvent(e: Pick<SportsEvent, 'sport' | 'title' | 'home' | 'away' | 'round'>, c: Pick<SportsCompetition, 'kind' | 'code'>) {
  if (e.sport === 'ufc') return /\bUFC \d{3}\b/.test(e.title)                                     // numbered pay-per-views
  if (e.sport === 'boxing') return /title|championship|world|undisputed|vs/i.test(e.title) && !/prelim/i.test(e.title)
  if (c.kind === 'national') return has(e.home, HOME_NATIONS) || has(e.away, HOME_NATIONS)
  const bothBig = has(e.home, BIG_CLUBS) && has(e.away, BIG_CLUBS)
  if (bothBig) return true
  if (c.kind === 'cup' && (c.code.startsWith('uefa-') || /final/i.test(e.round ?? ''))) return has(e.home, BIG_CLUBS) || has(e.away, BIG_CLUBS)
  return false
}

const STATUS_FINISHED = /^(FT|AET|PEN|AP|Match Finished|Finished|AWD|WO)$/i
const STATUS_LIVE = /^(1H|2H|HT|ET|BT|P|LIVE|In Progress)$/i

/** TheSportsDB event → our row. Returns null for events without a usable time. */
export function fromSportsDb(raw: SportsDbEvent, c: Pick<SportsCompetition, 'code' | 'sport' | 'kind'>): SportsEvent | null {
  const clock = raw.strTimestamp ? raw.strTimestamp.replace(' ', 'T').slice(11, 16) : (raw.strTime ?? '').slice(0, 5)
  const tbc = !clock || clock === '00:00'
  const ts = tbc && raw.dateEvent ? `${raw.dateEvent}T20:00:00Z`
    : raw.strTimestamp ? `${raw.strTimestamp.replace(' ', 'T').replace(/(\+00:00|Z)?$/, '')}Z`
    : raw.dateEvent ? `${raw.dateEvent}T${clock}:00Z` : null
  if (!ts || Number.isNaN(Date.parse(ts))) return null
  const status: SportsEvent['status'] = raw.strPostponed === 'yes' || /postpon|cancel/i.test(raw.strStatus ?? '') ? 'postponed'
    : STATUS_FINISHED.test(raw.strStatus ?? '') ? 'finished'
    : STATUS_LIVE.test(raw.strStatus ?? '') ? 'live' : 'scheduled'
  const title = (raw.strEvent ?? '').trim() || [raw.strHomeTeam, raw.strAwayTeam].filter(Boolean).join(' vs ')
  const e: SportsEvent = {
    id: `tsdb:${raw.idEvent}`,
    competition: c.code,
    sport: c.sport,
    starts_at: new Date(ts).toISOString(),
    time_tbc: tbc,
    title,
    home: raw.strHomeTeam || null,
    away: raw.strAwayTeam || null,
    home_badge: raw.strHomeTeamBadge || null,
    away_badge: raw.strAwayTeamBadge || null,
    round: raw.intRound || null,
    venue: raw.strVenue || null,
    city: raw.strCity || null,
    country: raw.strCountry || null,
    status,
    big: false,
    image: raw.strThumb || raw.strPoster || null,
  }
  e.big = isBigEvent(e, c)
  return e
}

/** The season label TheSportsDB uses for a date: "2026-2027" (Aug–Jul) or "2026". */
export function seasonFor(style: 'split' | 'year', day: string) {
  const [y, m] = day.split('-').map(Number)
  if (style === 'year') return String(y)
  return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

/** A fixturedownload.com match. */
export interface FixtureDownloadMatch {
  MatchNumber: number
  RoundNumber: number | null
  DateUtc: string
  Location: string | null
  HomeTeam: string | null
  AwayTeam: string | null
  Group?: string | null
  HomeTeamScore: number | null
  AwayTeamScore: number | null
}

const TBD = /^(to be (announced|confirmed)|tbd|tba|tbc|winner|loser|runner)/i

/** fixturedownload.com match → our row. Skips matches whose teams aren't known yet. */
export function fromFixtureDownload(m: FixtureDownloadMatch, c: Pick<SportsCompetition, 'code' | 'sport' | 'kind' | 'source_id'>, feed: string): SportsEvent | null {
  // Kick-off times not set yet come as midnight UTC (no European match starts at 1-2am).
  const tbc = / 00:00:00Z?$/.test(m.DateUtc)
  const at = Date.parse(tbc ? `${m.DateUtc.slice(0, 10)}T20:00:00Z` : m.DateUtc.replace(' ', 'T').replace(/Z?$/, 'Z'))
  if (Number.isNaN(at) || !m.HomeTeam || !m.AwayTeam || TBD.test(m.HomeTeam) || TBD.test(m.AwayTeam)) return null
  const e: SportsEvent = {
    id: `fd:${feed}:${m.MatchNumber}`,
    competition: c.code,
    sport: c.sport,
    starts_at: new Date(at).toISOString(),
    time_tbc: tbc,
    title: `${m.HomeTeam} vs ${m.AwayTeam}`,
    home: m.HomeTeam, away: m.AwayTeam, home_badge: null, away_badge: null,
    round: m.RoundNumber != null ? String(m.RoundNumber) : null,
    venue: m.Location || null, city: null, country: null,
    status: m.HomeTeamScore != null && m.AwayTeamScore != null ? 'finished' : 'scheduled',
    big: false, image: null,
  }
  e.big = isBigEvent(e, c)
  return e
}

/** The fixturedownload feed for a season: "la-liga-2026" covers 2026-27. */
export function fixtureDownloadFeed(slug: string, style: 'split' | 'year', day: string) {
  return `${slug}-${seasonFor(style, day).slice(0, 4)}`
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "September 26, 2026" / "26 September 2026" / "2026-09-26" → "2026-09-26" (or null). */
export function parseWikiDate(text: string): string | null {
  const t = text.replace(/\{\{[^}]*\}\}/g, m => m.replace(/[{}|]/g, ' ')).replace(/\[\[|\]\]/g, '').trim()
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/(\d{4}) ([A-Za-z]{3,}) (\d{1,2})\b/)  // {{dts|2026|Dec|12}}
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
    if (mo >= 0) return `${m[1]}-${String(mo + 1).padStart(2, '0')}-${m[3].padStart(2, '0')}`
  }
  m = t.match(/([A-Za-z]{3,})\.? (\d{1,2}),? (\d{4})/) ?? null
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase())
    if (mo >= 0) return `${m[3]}-${String(mo + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  m = t.match(/(\d{1,2}) ([A-Za-z]{3,}) (\d{4})/)
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
    if (mo >= 0) return `${m[3]}-${String(mo + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

/** Wiki markup → plain text: [[a|b]] → b, templates and refs dropped. */
export function wikiText(cell: string) {
  return cell
    .replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{(?:flagicon|flag|sortname)[^}]*\}\}/gi, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}
