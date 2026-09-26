// Sample fixtures for the demo: the next three weeks of football, UFC and boxing around today.
import type { SportsCompetition, SportsEvent } from '../../shared/sports'
import { isBigEvent } from '../../shared/sports'
import { addDays, zonedIso } from '../../shared/time'

const comp = (code: string, name: string, sport: SportsCompetition['sport'], region: string,
  kind: SportsCompetition['kind'], sort: number, followed = true): SportsCompetition => ({
  code, source: 'thesportsdb', source_id: code, name, sport, region, kind, season_style: kind === 'fight' || kind === 'national' ? 'year' : 'split',
  followed, sort, refreshed_at: new Date(Date.now() - 95 * 60_000).toISOString(), last_error: null,
})

export function demoSports(from: string): { competitions: SportsCompetition[]; events: SportsEvent[] } {
  const competitions = [
    comp('es-laliga', 'La Liga', 'football', 'Spain', 'league', 10),
    comp('es-segunda', 'La Liga 2', 'football', 'Spain', 'league', 11, false),
    comp('en-premier', 'Premier League', 'football', 'England', 'league', 20),
    comp('en-championship', 'Championship', 'football', 'England', 'league', 21, false),
    comp('sc-premiership', 'Scottish Premiership', 'football', 'Scotland', 'league', 30, false),
    comp('nl-eredivisie', 'Eredivisie', 'football', 'Netherlands', 'league', 40),
    comp('uefa-cl', 'Champions League', 'football', 'Europe', 'cup', 60),
    comp('uefa-nations', 'Nations League', 'football', 'National teams', 'national', 80),
    comp('ufc', 'UFC', 'ufc', 'Fights', 'fight', 90),
    comp('boxing', 'Boxing', 'boxing', 'Fights', 'fight', 91),
  ]
  const byCode = new Map(competitions.map(c => [c.code, c]))
  let n = 0
  const ev = (code: string, day: number, time: string, home: string | null, away: string | null, extra: Partial<SportsEvent> = {}): SportsEvent => {
    const c = byCode.get(code)!
    const e: SportsEvent = {
      id: `demo:${++n}`, competition: code, sport: c.sport, starts_at: zonedIso(addDays(from, day), time), time_tbc: false,
      title: extra.title ?? `${home} vs ${away}`, home, away, home_badge: null, away_badge: null,
      round: null, venue: null, city: null, country: null, status: 'scheduled', big: false, image: null, ...extra,
    }
    e.big = isBigEvent(e, c)
    return e
  }
  const events = [
    ev('es-laliga', 0, '21:00', 'Real Betis', 'Sevilla', { round: '8', venue: 'Estadio La Cartuja', city: 'Seville' }),
    ev('en-premier', 0, '16:00', 'Arsenal', 'Newcastle', { round: '7', venue: 'Emirates Stadium', city: 'London' }),
    ev('ufc', 0, '04:00', null, null, { title: 'UFC Fight Night: Perth', venue: 'RAC Arena', city: 'Perth', country: 'Australia' }),
    ev('en-premier', 1, '17:30', 'Liverpool', 'Manchester United', { round: '7', venue: 'Anfield', city: 'Liverpool' }),
    ev('nl-eredivisie', 1, '14:30', 'Ajax', 'AZ Alkmaar', { round: '8', venue: 'Johan Cruijff ArenA', city: 'Amsterdam' }),
    ev('uefa-cl', 3, '21:00', 'Real Madrid', 'Manchester City', { round: '3', venue: 'Santiago Bernabéu', city: 'Madrid' }),
    ev('uefa-cl', 4, '21:00', 'Celtic', 'Barcelona', { round: '3', venue: 'Celtic Park', city: 'Glasgow' }),
    ev('boxing', 6, '22:00', null, null, { title: 'Undisputed heavyweight title: Usyk vs Dubois III', city: 'London', country: 'England' }),
    ev('es-laliga', 7, '16:15', 'Villarreal', 'Getafe', { round: '9' }),
    ev('es-laliga', 7, '21:00', 'Atlético Madrid', 'Real Madrid', { round: '9', venue: 'Metropolitano', city: 'Madrid' }),
    ev('ufc', 7, '22:00', null, null, { time_tbc: true, title: 'UFC 322: Makhachev vs Topuria', venue: 'T-Mobile Arena', city: 'Las Vegas', country: 'USA' }),
    ev('en-premier', 8, '15:00', 'Chelsea', 'Tottenham', { round: '8', venue: 'Stamford Bridge', city: 'London' }),
    ev('uefa-nations', 11, '20:45', 'Spain', 'Netherlands', { round: '5', city: 'Seville' }),
    ev('uefa-nations', 12, '20:45', 'England', 'Scotland', { round: '5', venue: 'Wembley Stadium', city: 'London' }),
    ev('es-laliga', 14, '18:30', 'Barcelona', 'Real Madrid', { round: '10', venue: 'Spotify Camp Nou', city: 'Barcelona' }),
    ev('nl-eredivisie', 15, '12:15', 'PSV Eindhoven', 'Feyenoord', { round: '10', city: 'Eindhoven' }),
    ev('boxing', 17, '23:00', null, null, { title: 'Canelo vs Crawford II, WBC super-middleweight', city: 'Riyadh', country: 'Saudi Arabia' }),
    ev('uefa-cl', 19, '21:00', 'Liverpool', 'Bayern Munich', { round: '4', venue: 'Anfield', city: 'Liverpool' }),
  ]
  return { competitions, events }
}
