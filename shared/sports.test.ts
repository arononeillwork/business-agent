// Parsers tested against real responses captured from each source (Sept 2026).
import { describe, expect, it } from 'vitest'
import { fixtureDownloadFeed, fromFixtureDownload, fromSportsDb, isBigEvent, parseWikiDate, seasonFor, wikiText } from './sports'
import { parseUfcTable } from '../worker/sports'

const laliga = { code: 'es-laliga', sport: 'football' as const, kind: 'league' as const, source_id: 'la-liga' }

describe('fixturedownload', () => {
  it('turns a match into a row', () => {
    const e = fromFixtureDownload({ MatchNumber: 93, RoundNumber: 2, DateUtc: '2026-10-13 19:00:00Z', Location: 'Stadio San Siro',
      HomeTeam: 'Inter', AwayTeam: 'Club Brugge', Group: null, HomeTeamScore: null, AwayTeamScore: null }, { ...laliga, code: 'uefa-cl', kind: 'cup' }, 'champions-league-2026')!
    expect(e).toMatchObject({ id: 'fd:champions-league-2026:93', starts_at: '2026-10-13T19:00:00.000Z', time_tbc: false,
      title: 'Inter vs Club Brugge', round: '2', venue: 'Stadio San Siro', status: 'scheduled', big: true })
  })
  it('marks played matches finished and midnight kick-offs as time TBC', () => {
    const played = fromFixtureDownload({ MatchNumber: 1, RoundNumber: 1, DateUtc: '2026-08-15 17:30:00Z', Location: 'Mendizorroza',
      HomeTeam: 'Deportivo Alavés', AwayTeam: 'Getafe CF', HomeTeamScore: 3, AwayTeamScore: 0 }, laliga, 'la-liga-2026')!
    expect(played.status).toBe('finished')
    const tbc = fromFixtureDownload({ MatchNumber: 380, RoundNumber: 38, DateUtc: '2027-05-30 00:00:00Z', Location: null,
      HomeTeam: 'Real Madrid', AwayTeam: 'Barcelona', HomeTeamScore: null, AwayTeamScore: null }, laliga, 'la-liga-2026')!
    expect(tbc).toMatchObject({ time_tbc: true, starts_at: '2027-05-30T20:00:00.000Z', big: true })
  })
  it('skips matches whose teams are not known yet', () => {
    expect(fromFixtureDownload({ MatchNumber: 200, RoundNumber: null, DateUtc: '2027-05-29 19:00:00Z', Location: null,
      HomeTeam: 'To be announced', AwayTeam: 'To be announced', HomeTeamScore: null, AwayTeamScore: null }, laliga, 'x')).toBeNull()
  })
  it('picks the feed for the season', () => {
    expect(fixtureDownloadFeed('la-liga', 'split', '2026-09-26')).toBe('la-liga-2026')
    expect(fixtureDownloadFeed('la-liga', 'split', '2027-03-01')).toBe('la-liga-2026')
    expect(seasonFor('split', '2026-07-01')).toBe('2026-2027')
    expect(seasonFor('year', '2026-09-26')).toBe('2026')
  })
})

describe('TheSportsDB', () => {
  it('turns an event into a row', () => {
    const e = fromSportsDb({ idEvent: '2548280', strEvent: 'Prime Video Boxing 16 Inoue vs Nasukawa II', strTimestamp: '2026-09-27T07:30:00',
      dateEvent: '2026-09-27', strTime: '07:30:00', strVenue: 'Toyota Arena Tokyo', strCountry: 'Japan', strStatus: 'NS' },
      { code: 'boxing', sport: 'boxing', kind: 'fight' })!
    expect(e).toMatchObject({ id: 'tsdb:2548280', starts_at: '2026-09-27T07:30:00.000Z', time_tbc: false, status: 'scheduled', big: true })
  })
  it('treats a missing time as TBC and FT as finished', () => {
    const e = fromSportsDb({ idEvent: '1', strEvent: 'Lithuania vs Azerbaijan', dateEvent: '2026-09-27', strTime: '00:00:00',
      strTimestamp: '2026-09-27T00:00:00', strHomeTeam: 'Lithuania', strAwayTeam: 'Azerbaijan', strStatus: 'FT' },
      { code: 'uefa-nations', sport: 'football', kind: 'national' })!
    expect(e).toMatchObject({ time_tbc: true, starts_at: '2026-09-27T20:00:00.000Z', status: 'finished', big: false })
  })
})

describe('big nights', () => {
  const cup = { kind: 'cup' as const, code: 'uefa-cl' }
  it('flags clásicos, big European nights, home nations and numbered UFC events', () => {
    expect(isBigEvent({ sport: 'football', title: '', home: 'Barcelona', away: 'Real Madrid', round: '10' }, { kind: 'league', code: 'es-laliga' })).toBe(true)
    expect(isBigEvent({ sport: 'football', title: '', home: 'Getafe CF', away: 'Villarreal', round: '10' }, { kind: 'league', code: 'es-laliga' })).toBe(false)
    expect(isBigEvent({ sport: 'football', title: '', home: 'Inter', away: 'Club Brugge', round: '2' }, cup)).toBe(true)
    expect(isBigEvent({ sport: 'football', title: '', home: 'Sabah', away: 'Slavia Praha', round: '2' }, cup)).toBe(false)
    expect(isBigEvent({ sport: 'football', title: '', home: 'FC Winterthur', away: 'Sabah', round: '2' }, cup)).toBe(false)
    expect(isBigEvent({ sport: 'football', title: '', home: 'Atlético Madrid', away: 'FC Barcelona', round: '9' }, { kind: 'league', code: 'es-laliga' })).toBe(true)
    expect(isBigEvent({ sport: 'football', title: '', home: 'Manchester City', away: 'Liverpool FC', round: '9' }, { kind: 'league', code: 'en-premier' })).toBe(true)
    expect(isBigEvent({ sport: 'football', title: '', home: 'England', away: 'Latvia', round: '1' }, { kind: 'national', code: 'x' })).toBe(true)
    expect(isBigEvent({ sport: 'ufc', title: 'UFC 334: Gane vs. Hokit', home: null, away: null, round: null }, { kind: 'fight', code: 'ufc' })).toBe(true)
    expect(isBigEvent({ sport: 'ufc', title: 'UFC Fight Night: Allen vs. Duncan', home: null, away: null, round: null }, { kind: 'fight', code: 'ufc' })).toBe(false)
  })
})

describe('Wikipedia', () => {
  it('reads dates and markup', () => {
    expect(parseWikiDate('{{dts|2026|Dec|12}}')).toBe('2026-12-12')
    expect(parseWikiDate('September 26, 2026')).toBe('2026-09-26')
    expect(parseWikiDate('26 September 2026')).toBe('2026-09-26')
    expect(wikiText('[[Al Rayyan (city)|Al Rayyan]], Qatar<ref name="x"/>')).toBe('Al Rayyan, Qatar')
  })
  it('parses the scheduled UFC events table', () => {
    const text = `==Scheduled events==
{| id="Scheduled events" class="sortable wikitable succession-box" style="font-size:90%; "
! scope="col" | Event
! scope="col" | Date
! scope="col" | Venue
! scope="col" | Location
! scope="col" | Ref.
|-
|[[UFC 334|UFC 334: Gane vs. Hokit]]
|{{dts|2026|Nov|14}}
|[[Madison Square Garden]]
|[[New York City]], [[New York (state)|New York]], U.S.
|<ref name="ufc334335"/>
|-
|[[UFC Fight Night: Bonfim vs. Brady]]
|{{dts|2026|Nov|7}}
|rowspan="2" |[[UFC Apex|Meta Apex]]
|rowspan="2" |[[Las Vegas]], [[Nevada]], U.S.
|<ref>{{Cite web|url=https://www.thescore.com/x|title=Brady-Bonfim to headline Nov. 7 UFC event|date=2026-08-16}}</ref>
|-
|[[UFC Fight Night: Moicano vs. Nolan]]
|{{dts|2026|Oct|31}}
|<ref>{{Cite web|url=https://heavy.com/x|title=UFC books first fight for UFC Vegas 123 event|date=2026-08-13}}</ref>
|-
|[[UFC 333|UFC 333: Volkanovski vs. Evloev]]
|{{dts|2026|Oct|24}}
|[[Etihad Arena]]
|[[Abu Dhabi]], United Arab Emirates
|<ref>{{Cite web|url=https://x|title=UFC 333 heading to Abu Dhabi|date=2026-07-25}}</ref>
|}`
    const events = parseUfcTable(text, { code: 'ufc', sport: 'ufc', kind: 'fight' })
    expect(events.map(e => [e.title, e.starts_at.slice(0, 10), e.venue, e.city, e.country, e.big])).toEqual([
      ['UFC 334: Gane vs. Hokit', '2026-11-14', 'Madison Square Garden', 'New York City', 'U.S.', true],
      ['UFC Fight Night: Bonfim vs. Brady', '2026-11-07', 'Meta Apex', 'Las Vegas', 'U.S.', false],
      ['UFC Fight Night: Moicano vs. Nolan', '2026-10-31', 'Meta Apex', 'Las Vegas', 'U.S.', false],
      ['UFC 333: Volkanovski vs. Evloev', '2026-10-24', 'Etihad Arena', 'Abu Dhabi', 'United Arab Emirates', true],
    ])
    expect(events.every(e => e.time_tbc)).toBe(true)
    expect(new Set(events.map(e => e.id)).size).toBe(4)
  })
})
