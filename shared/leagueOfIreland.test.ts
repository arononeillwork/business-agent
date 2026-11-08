// The League of Ireland on the Sports page: the Premier Division, the First Division and the FAI Cup in the
// catalogue (the league_of_ireland migration, and the demo's), offered first in Ireland after the GAA, with
// the last round and the FAI Cup final as the big nights.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fromSportsDb, homeFirst, isBigEvent, type SportsCompetition } from './sports'
import { demoSports } from '../src/data/demoSports'

const premier = { code: 'ie-premier-division', sport: 'football' as const, kind: 'league' as const }
const first = { code: 'ie-first-division', sport: 'football' as const, kind: 'league' as const }
const cup = { code: 'ie-fai-cup', sport: 'football' as const, kind: 'cup' as const }
const match = (round: string | null, home = 'Shelbourne', away = 'Shamrock Rovers') => ({ sport: 'football' as const, title: `${home} vs ${away}`, home, away, round })

describe('the League of Ireland in the catalogue', () => {
  const migration = readFileSync(join(import.meta.dirname, '../supabase/migrations/20261108000194_league_of_ireland.sql'), 'utf8')
  const rows = [...migration.matchAll(/\('(ie-[a-z-]+)',\s*'(\d+)',\s*'([^']+)',\s*'(league|cup)',\s*(\d+)\)/g)]
    .map(([, code, id, name, kind, sort]) => ({ code, source_id: id, name, kind, sort: Number(sort) }))

  it('TheSportsDB’s league ids, as its API lists them (search_all_leagues, Ireland, Soccer)', () => {
    expect(rows).toEqual([
      { code: 'ie-premier-division', source_id: '4643', name: 'League of Ireland Premier Division', kind: 'league', sort: 105 },
      { code: 'ie-first-division', source_id: '4757', name: 'League of Ireland First Division', kind: 'league', sort: 106 },
      { code: 'ie-fai-cup', source_id: '5638', name: 'FAI Cup', kind: 'cup', sort: 107 },
    ])
    expect(migration).toMatch(/'thesportsdb', x\.source_id, x\.name, 'football', 'Ireland', x\.kind, 'year', false, x\.sort/)
  })

  it('the demo has the same, followed by nobody, after the GAA', () => {
    const { competitions } = demoSports('2026-11-08')
    const irish = competitions.filter(c => c.code.startsWith('ie-'))
    expect(irish.map(c => ({ code: c.code, name: c.name, kind: c.kind, sort: c.sort }))).toEqual(rows.map(({ code, name, kind, sort }) => ({ code, name, kind, sort })))
    expect(irish.every(c => c.sport === 'football' && c.region === 'Ireland' && !c.followed)).toBe(true)
    const gaa = competitions.filter(c => c.sport === 'gaa')
    expect(Math.min(...irish.map(c => c.sort))).toBeGreaterThan(Math.max(...gaa.map(c => c.sort)))
  })

  it('offered first in Ireland; in Spain, the order stays as it was', () => {
    const { competitions } = demoSports('2026-11-08')
    const football = (country: string) => [...new Set(homeFirst(competitions, country).filter(c => c.sport === 'football').map(c => c.region))]
    expect(football('IE')).toEqual(['Ireland', 'Spain', 'England', 'Scotland', 'Netherlands', 'Europe', 'National teams'])
    expect(football('ES')).toEqual(['Spain', 'England', 'Scotland', 'Netherlands', 'Europe', 'National teams', 'Ireland'])
    expect(homeFirst(competitions, 'ES')).toBe(competitions)
    // The GAA keeps its place, first in Ireland (the Sports page puts its sport first).
    expect(homeFirst(competitions, 'IE').slice(0, 8).map(c => c.code)).toEqual(
      ['gaa-football-championship', 'gaa-hurling-championship', 'gaa-football-league', 'gaa-hurling-league-1a', 'gaa-hurling-league-1b',
        'ie-premier-division', 'ie-first-division', 'ie-fai-cup'])
  })
})

describe('the League of Ireland’s big nights', () => {
  it('the last round of each division, when every match kicks off together, and not the rounds before', () => {
    expect(isBigEvent(match('36'), premier)).toBe(true)
    expect(isBigEvent(match('35'), premier)).toBe(false)
    expect(isBigEvent(match('1', 'Bohemians', 'Shamrock Rovers'), premier)).toBe(false) // even the Dublin derby on the first night
    expect(isBigEvent(match('36', 'Kerry', 'Cork City'), first)).toBe(true)
    expect(isBigEvent(match('18', 'Kerry', 'Cork City'), first)).toBe(false)
    expect(isBigEvent(match('0', 'UCD', 'Drogheda United'), premier)).toBe(false) // the play-off, listed as round 0
  })

  it('the FAI Cup final, and not the rounds before it (nor two Celtics meeting in the first round)', () => {
    expect(isBigEvent(match('200', 'Derry City', 'Waterford'), cup)).toBe(true)
    expect(isBigEvent(match('150', 'Cork City', 'St Patrick’s Athletic'), cup)).toBe(false) // a semi-final
    expect(isBigEvent(match('0', 'Galway United', 'Derry City'), cup)).toBe(false)
    expect(isBigEvent(match('1', 'Leicester Celtic', 'Bangor Celtic'), cup)).toBe(false)
  })

  it('a TheSportsDB fixture, as it sends them: the 2026 FAI Cup final (league 5638)', () => {
    const c: Pick<SportsCompetition, 'code' | 'sport' | 'kind'> = cup
    const e = fromSportsDb({ idEvent: '2300001', strEvent: 'Derry City vs Waterford', strTimestamp: '2026-11-08T15:00:00', dateEvent: '2026-11-08',
      strHomeTeam: 'Derry City', strAwayTeam: 'Waterford', intRound: '200', strSeason: '2026', strStatus: 'NS' }, c)
    expect(e).toMatchObject({ competition: 'ie-fai-cup', sport: 'football', starts_at: '2026-11-08T15:00:00.000Z', status: 'scheduled', big: true })
  })
})
