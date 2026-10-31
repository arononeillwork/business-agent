import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureSportsSources, fetchCompetition, SOURCE_TIMEOUT_MS } from './sports'
import type { SportsCompetition } from '../shared/sports'

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
