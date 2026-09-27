// Keeps sports_events fresh: each followed competition is refreshed every 6 hours from its free
// source, a couple per cron minute. TheSportsDB's free key is shared and answers 429 when called
// quickly, so its calls are spaced out and only one of its competitions is done per run.
// Past events are dropped two days after.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fixtureDownloadFeed, fromFixtureDownload, fromSportsDb, parseWikiDate, wikiText,
  type FixtureDownloadMatch, type SportsCompetition, type SportsDbEvent, type SportsEvent, isBigEvent, seasonFor,
} from '../shared/sports'
import { addDays, today } from '../shared/time'
import { COUNTRY_FLAGS, TEAM_ALIASES, findCrest, flagUrl, type TsdbTeam } from '../shared/crests'

const TSDB = 'https://www.thesportsdb.com/api/v1/json/3'
const STALE_HOURS = 6
const ROUNDS_AHEAD = 4
const FIGHT_DAYS = 8
const TSDB_GAP_MS = 2100
const UA = { 'user-agent': 'EasyBeansCafe/1.0 (team app; fixtures for the cafe TV)' }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`)
  const text = await res.text()
  try { return JSON.parse(text) as T } catch { throw new Error(`${new URL(url).hostname} sent something that isn't JSON`) }
}

let lastTsdb = 0
let tsdbGap = TSDB_GAP_MS
let tsdbRetries = 1
let tsdbBackoff = 5000
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** The GitHub sync has time to spare, so it calls TheSportsDB slowly and waits out refusals. */
export function configureTheSportsDb(o: { gapMs?: number; retries?: number; backoffMs?: number }) {
  tsdbGap = o.gapMs ?? tsdbGap
  tsdbRetries = o.retries ?? tsdbRetries
  tsdbBackoff = o.backoffMs ?? tsdbBackoff
}

/** A TheSportsDB call, spaced from the last one, retried once after a pause if rate-limited. */
async function tsdb<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastTsdb + tsdbGap - Date.now()
    if (wait > 0) await sleep(wait)
    lastTsdb = Date.now()
    try {
      return await getJson<T>(`${TSDB}/${path}`)
    } catch (e) {
      if (attempt >= tsdbRetries || !/answered 429/.test(String(e))) throw e
      await sleep(tsdbBackoff * (attempt + 1))
    }
  }
}

/** Upcoming events for one competition. `complete` = the source gave the whole season. */
export async function fetchCompetition(c: SportsCompetition, day = today()): Promise<{ events: SportsEvent[]; complete: boolean }> {
  if (c.source === 'fixturedownload') {
    const feed = fixtureDownloadFeed(c.source_id, c.season_style, day)
    const rows = await getJson<FixtureDownloadMatch[]>(`https://fixturedownload.com/feed/json/${feed}`)
    if (!Array.isArray(rows)) throw new Error(`No fixtures for ${feed}`)
    return { events: rows.map(m => fromFixtureDownload(m, c, feed)).filter((e): e is SportsEvent => !!e), complete: true }
  }
  if (c.source === 'wikipedia') {
    return { events: await wikipediaUfc(c), complete: true }
  }
  // TheSportsDB free tier: the next event, then (for leagues and cups) a few rounds from it.
  const next = (await tsdb<{ events: SportsDbEvent[] | null }>(`eventsnextleague.php?id=${c.source_id}`)).events ?? []
  const raw = new Map(next.map(e => [e.idEvent, e]))
  const first = next[0]
  const round = Number(first?.intRound)
  if (c.sport === 'football' && first && round > 0 && round < 100) {
    const season = first.strSeason || seasonFor(c.season_style, day)
    for (let r = round; r < round + ROUNDS_AHEAD; r++) {
      const res = await tsdb<{ events: SportsDbEvent[] | null }>(`eventsround.php?id=${c.source_id}&r=${r}&s=${season}`)
      for (const e of res.events ?? []) raw.set(e.idEvent, e)
    }
  }
  // Fights: the day listing (league filter) for the next eight days.
  if (c.sport !== 'football') {
    for (let d = 0; d < FIGHT_DAYS; d++) {
      const res = await tsdb<{ events: SportsDbEvent[] | null }>(`eventsday.php?d=${addDays(day, d)}&l=${c.source_id}`)
      for (const e of res.events ?? []) raw.set(e.idEvent, e)
    }
  }
  return { events: [...raw.values()].map(e => fromSportsDb(e, c)).filter((e): e is SportsEvent => !!e), complete: false }
}

/**
 * UFC: the "Scheduled events" table on Wikipedia's List of UFC events (event, date, venue, location).
 * Rows are `|-` separated; cells start with `|` (or `||` inline). Only the date is listed, so the
 * time shows as TBC. A `rowspan` venue carries on to the next row.
 */
export async function wikipediaUfc(c: Pick<SportsCompetition, 'code' | 'sport' | 'kind' | 'source_id'>): Promise<SportsEvent[]> {
  const base = `https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&page=${encodeURIComponent(c.source_id)}`
  const sections = (await getJson<{ parse?: { sections: { index: string; line: string }[] } }>(`${base}&prop=sections`)).parse?.sections ?? []
  const s = sections.find(x => /scheduled/i.test(x.line))
  if (!s) throw new Error('Wikipedia has no "Scheduled events" section')
  const text = (await getJson<{ parse?: { wikitext: string } }>(`${base}&prop=wikitext&section=${s.index}`)).parse?.wikitext ?? ''
  return parseUfcTable(text, c)
}

export function parseUfcTable(text: string, c: Pick<SportsCompetition, 'code' | 'sport' | 'kind'>): SportsEvent[] {
  const table = text.slice(text.indexOf('{|'))
  const rows = table.split(/\n\|-[^\n]*/).slice(1)
  const out: SportsEvent[] = []
  let carry: string[] = []
  for (const row of rows) {
    const rawCells = row.replace(/\n\|\}[\s\S]*$/, '').split(/\n[|!]|\|\|/).map(x => x.trim()).filter(Boolean)
    const spanned = rawCells.some(x => /^[^[{]*rowspan="?\d/i.test(x))
    const cells = rawCells.map(x => x.replace(/^[^|[\]{}]*?(?:style|scope|rowspan|colspan|align|data-sort-value)="[^"]*"\s*\|/i, ''))
    if (cells.length < 2) continue
    const dateIdx = cells.findIndex(x => parseWikiDate(x) != null && /\d{4}/.test(x))
    const title = wikiText(cells.find((x, i) => i !== dateIdx && /UFC/.test(x)) ?? '')
    const day = dateIdx >= 0 ? parseWikiDate(cells[dateIdx]) : null
    if (!title || !day) continue
    let rest = cells.slice(dateIdx + 1).map(wikiText).filter(Boolean)
    if (rest.length === 0) rest = carry
    carry = spanned ? rest : []
    const [venue, location] = rest
    const place = (location ?? '').split(',').map(x => x.trim()).filter(Boolean)
    const e: SportsEvent = {
      id: `wiki:ufc:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      competition: c.code, sport: c.sport, starts_at: `${day}T20:00:00.000Z`, time_tbc: true, title,
      home: null, away: null, home_badge: null, away_badge: null, round: null,
      venue: venue ?? null, city: place[0] ?? null, country: place.length > 1 ? place[place.length - 1] : null,
      status: 'scheduled', big: false, image: null,
    }
    e.big = isBigEvent(e, { kind: c.kind, code: c.code })
    out.push(e)
  }
  return out
}

/** Refresh one competition: upsert its events, drop ones the source no longer lists, note the result. */
export async function refreshCompetition(db: SupabaseClient, c: SportsCompetition): Promise<number> {
  const now = new Date().toISOString()
  try {
    const { events, complete } = await fetchCompetition(c)
    const keep = events.filter(e => Date.parse(e.starts_at) > Date.now() - 2 * 86_400_000)
    if (keep.length) {
      const { error } = await db.from('sports_events').upsert(keep.map(e => ({ ...e, updated_at: now })), { onConflict: 'id' })
      if (error) throw new Error(error.message)
    }
    // A whole-season source is the truth: upcoming rows it no longer has were moved or cancelled.
    if (complete && keep.length) {
      const ids = new Set(keep.map(e => e.id))
      const { data: existing } = await db.from('sports_events').select('id').eq('competition', c.code).gte('starts_at', now)
      const gone = (existing ?? []).map(r => r.id as string).filter(id => !ids.has(id))
      if (gone.length) await db.from('sports_events').delete().in('id', gone)
    }
    await db.from('sports_competitions').update({ refreshed_at: now, last_error: null }).eq('code', c.code)
    return keep.length
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // Back off: try again in an hour (three when the source says we're calling too often).
    const wait = /answered 429/.test(message) ? 3 : 1
    const retry = new Date(Date.now() - (STALE_HOURS - wait) * 3_600_000).toISOString()
    await db.from('sports_competitions').update({ refreshed_at: retry, last_error: message.slice(0, 300) }).eq('code', c.code)
    throw e
  }
}

/**
 * Cron: refresh the stalest followed competitions (up to `max`) and clear out old events.
 * `sources` limits which sources to use (the admin button only does the quick ones).
 */
export async function refreshStaleSports(db: SupabaseClient, max = 2, sources?: SportsCompetition['source'][]) {
  const cutoff = new Date(Date.now() - STALE_HOURS * 3_600_000).toISOString()
  let q = db.from('sports_competitions').select('*').eq('followed', true)
    .or(`refreshed_at.is.null,refreshed_at.lt.${cutoff}`).order('refreshed_at', { ascending: true, nullsFirst: true }).order('sort').limit(max + 6)
  if (sources) q = q.in('source', sources)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  // At most one TheSportsDB competition per run; the rest wait for the next minute.
  const due = ((data ?? []) as SportsCompetition[])
    .filter((c, i, all) => c.source !== 'thesportsdb' || all.findIndex(x => x.source === 'thesportsdb') === i)
    .slice(0, max)
  let n = 0
  for (const c of due) {
    n += await refreshCompetition(db, c).catch(e => { console.error(`sports ${c.code} failed`, e); return 0 })
  }
  if (due.length) await db.from('sports_events').delete().lt('starts_at', new Date(Date.now() - 2 * 86_400_000).toISOString())
  return n
}

/**
 * Admin "Refresh now": mark every followed competition due, update the quick whole-season sources
 * straight away (a second or two), and leave TheSportsDB ones to the background refresh.
 */
export async function refreshAllSports(db: SupabaseClient) {
  await db.from('sports_competitions').update({ refreshed_at: null }).eq('followed', true)
  await refreshStaleSports(db, 4, ['fixturedownload', 'wikipedia'])
  const { count } = await db.from('sports_events').select('id', { count: 'exact', head: true }).gte('starts_at', new Date().toISOString())
  return count ?? 0
}

/** Leagues whose whole team list (one call each) covers most club names in the followed fixtures. */
const CREST_LEAGUES = ['English Premier League', 'Spanish La Liga', 'Dutch Eredivisie', 'English League Championship', 'Spanish La Liga 2']
const CREST_RETRY_DAYS = 30

/**
 * Finds crests for teams in upcoming fixtures that don't have one: flags for countries, then
 * TheSportsDB league team lists, then a name search for the rest (at most `maxSearches` a run,
 * so the free key isn't hammered; the rest wait for the next run). Misses are retried monthly.
 */
export async function syncCrests(db: SupabaseClient, maxSearches = 40): Promise<{ found: number; missing: number; searched: number }> {
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { data: rows, error } = await db.from('sports_events').select('home, away, home_badge, away_badge').gte('starts_at', since)
  if (error) throw new Error(error.message)
  const needed = new Set<string>()
  for (const r of rows ?? []) {
    if (r.home && !r.home_badge) needed.add(r.home as string)
    if (r.away && !r.away_badge) needed.add(r.away as string)
  }
  const { data: known } = await db.from('sports_teams').select('name, badge, checked_at')
  const retryBefore = Date.now() - CREST_RETRY_DAYS * 86_400_000
  for (const k of known ?? []) {
    if (k.badge || Date.parse(k.checked_at as string) > retryBefore) needed.delete(k.name as string)
  }
  const found: { name: string; badge: string | null; source: string; checked_at: string }[] = []
  const now = new Date().toISOString()
  const save = (name: string, badge: string | null, source: string) => { found.push({ name, badge, source, checked_at: now }); needed.delete(name) }

  for (const name of [...needed]) if (COUNTRY_FLAGS[name]) save(name, flagUrl(COUNTRY_FLAGS[name]), 'flag')

  if (needed.size) {
    for (const league of CREST_LEAGUES) {
      try {
        const { teams } = await tsdb<{ teams: TsdbTeam[] | null }>(`search_all_teams.php?l=${encodeURIComponent(league)}`)
        for (const name of [...needed]) {
          const badge = findCrest(name, teams ?? [])
          if (badge) save(name, badge, 'thesportsdb')
        }
      } catch { /* one league list failing just leaves more for the name search */ }
      if (!needed.size) break
    }
  }
  let searched = 0
  for (const name of [...needed]) {
    if (searched >= maxSearches) break
    searched++
    try {
      const { teams } = await tsdb<{ teams: TsdbTeam[] | null }>(`searchteams.php?t=${encodeURIComponent(TEAM_ALIASES[name] ?? name)}`)
      save(name, findCrest(name, teams ?? []) ?? (teams ?? []).find(t => t.strSport === 'Soccer' && t.strBadge)?.strBadge ?? null, 'thesportsdb')
    } catch { /* try again next run */ }
  }
  if (found.length) {
    const { error: e } = await db.from('sports_teams').upsert(found, { onConflict: 'name' })
    if (e) throw new Error(e.message)
  }
  return { found: found.filter(f => f.badge).length, missing: needed.size + found.filter(f => !f.badge).length, searched }
}
