import { describe, expect, it } from 'vitest'
import { COUNTRY_FLAGS, findCrest, flagUrl, searchNamesFor, teamKey } from './crests'

const teams = [
  { strTeam: 'Manchester United', strTeamShort: 'MUN', strTeamAlternate: 'Man United, Man Utd', strBadge: 'mu.png', strSport: 'Soccer' },
  { strTeam: 'Atletico Madrid', strTeamShort: 'ATM', strTeamAlternate: 'Club Atlético de Madrid', strBadge: 'atm.png', strSport: 'Soccer' },
  { strTeam: 'Tottenham Hotspur', strTeamAlternate: '', strBadge: 'spurs.png', strSport: 'Soccer' },
  { strTeam: 'Real Madrid', strBadge: 'rm.png', strSport: 'Basketball' },
]

describe('team crests', () => {
  it('ignores accents and filler words when comparing names', () => {
    expect(teamKey('Atlético de Madrid')).toBe('atletico madrid')
    expect(teamKey('FC Barcelona')).toBe(teamKey('Barcelona'))
    expect(teamKey('Bodø/Glimt')).toBe('bodo glimt')
  })

  it('matches short names through the club\'s other names or the alias list', () => {
    expect(findCrest('Man Utd', teams)).toBe('mu.png')
    expect(findCrest('Atleti', teams)).toBe('atm.png')
    expect(findCrest('Atlético de Madrid', teams)).toBe('atm.png')
    expect(findCrest('Spurs', teams)).toBe('spurs.png')
  })

  it('never takes a crest from another sport, and says so when nothing matches', () => {
    expect(findCrest('Real Madrid', teams)).toBeNull()
    expect(findCrest('Fulham', teams)).toBeNull()
  })

  it('tries other spellings for clubs the usual name misses', () => {
    expect(searchNamesFor("Nott'm Forest")).toEqual(['Nottingham Forest', 'Nottingham_Forest', 'Nottingham', "Nott'm Forest", "Nott'm_Forest"])
    expect(findCrest('Bodø/Glimt', [{ strTeam: 'Bodo/Glimt', strBadge: 'bg.png', strSport: 'Soccer' }])).toBe('bg.png')
  })

  it('gives national teams their flag', () => {
    expect(flagUrl(COUNTRY_FLAGS.Spain)).toBe('https://flagcdn.com/w80/es.png')
    expect(COUNTRY_FLAGS.Scotland).toBe('gb-sct')
  })
})
