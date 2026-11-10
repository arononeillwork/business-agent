import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureSportsSources, fetchCompetition, refreshCompetition, SOURCE_TIMEOUT_MS } from './sports'
import type { SportsCompetition } from '../shared/sports'
import { businessDb, type Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'

const laLiga: SportsCompetition = {
  code: 'laliga', source: 'fixturedownload', source_id: 'la-liga', name: 'La Liga', sport: 'football', region: 'Spain',
  kind: 'league', season_style: 'split', followed: true, sort: 1, refreshed_at: null, last_error: null,
}

/** A site that never answers: the request only ends when its signal gives up. */
function silentSite() {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
  }))
}

describe('sports sources', () => {
  afterEach(() => { vi.unstubAllGlobals(); configureSportsSources({ timeoutMs: SOURCE_TIMEOUT_MS }) })

  it('a source that never answers is given up on, with a reason to show, instead of the refresh waiting for ever', async () => {
    configureSportsSources({ timeoutMs: 50 })
    const fetch = silentSite()
    vi.stubGlobal('fetch', fetch)
    const started = Date.now()
    await expect(fetchCompetition(laLiga, '2026-10-31')).rejects.toThrow('fixturedownload.com didn\'t answer within 0.05 s')
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(fetch.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('every call has the limit, 10 s unless changed, and a source that answers in time is read as before', async () => {
    expect(SOURCE_TIMEOUT_MS).toBe(10_000)
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify([]), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await expect(fetchCompetition(laLiga, '2026-10-31')).resolves.toEqual({ events: [], complete: true })
    expect(fetch.mock.calls[0][0]).toBe('https://fixturedownload.com/feed/json/la-liga-2026')
  })

  it('a source that answers with an error still says so', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })))
    await expect(fetchCompetition(laLiga, '2026-10-31')).rejects.toThrow('fixturedownload.com answered 503')
  })
})

describe('the season a competition is read for', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('is today’s where the business is: at 23:30 on New Year’s Eve in Dublin it’s still the old year there, the new one in Madrid', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-12-31T23:30:00Z'), toFake: ['Date'] })
    const leagueOfIreland: SportsCompetition = { ...laLiga, code: 'loi', source_id: 'league-of-ireland', name: 'League of Ireland', region: 'Ireland', season_style: 'year' }
    const db = new FakeSupabase()
    db.tables.sports_competitions = [{ ...leagueOfIreland }]
    db.tables.sports_events = []
    const asked: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const res = db.handle(url, init)
      if (res) return res
      asked.push(url)
      return new Response('[]', { status: 200 })
    }))
    const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' } as unknown as Env
    db.tables.business[0].timezone = 'Europe/Dublin'
    await refreshCompetition(businessDb(env, 1), leagueOfIreland)
    db.tables.business[0].timezone = 'Europe/Madrid'
    await refreshCompetition(businessDb(env, 1), leagueOfIreland)
    expect(asked).toEqual(['https://fixturedownload.com/feed/json/league-of-ireland-2026', 'https://fixturedownload.com/feed/json/league-of-ireland-2027'])
  })
})
