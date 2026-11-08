// A business in Ireland on Contracts, Competitions, Expenses, Cameras, Hiring and Sports: Ireland's own
// kinds, terms, rates, sign, job boards and GAA, while a business in Spain keeps Spain's.
import { afterEach, describe, expect, it } from 'vitest'
import { setCountry } from './country'
import { CONTRACT_KINDS, IRISH_CONTRACT_KINDS, contractKind, contractKinds, contractProblem, defaultContractKind } from './contracts'
import { DEFAULT_RULES, entryProblems, irishTerms, type Competition } from './competitions'
import { DEFAULT_MILEAGE_RATE, IRISH_MILEAGE, defaultMileageRate, mileageAmount } from './claims'
import { irishCctvSign } from './cameras'
import { boardLabel, contractLabel, hiringContracts, jobBoards } from './hiring'
import { fromSportsDb, isBigEvent } from './sports'

afterEach(() => setCountry('ES'))

describe('contracts in Ireland', () => {
  it('Ireland’s five kinds, permanent first; Spain’s as they were', () => {
    expect(contractKinds('IE').map(k => k.id)).toEqual(['permanent', 'permanent_part_time', 'fixed_term', 'specified_purpose', 'casual'])
    expect(IRISH_CONTRACT_KINDS.filter(k => k.temporary).map(k => k.id)).toEqual(['fixed_term', 'specified_purpose'])
    expect(contractKinds('ES')).toBe(CONTRACT_KINDS)
    expect(defaultContractKind('IE')).toBe('permanent')
    expect(defaultContractKind('ES')).toBe('indefinido')
    expect(contractKind('casual').label).toBe('Casual')
    // The Fixed-Term Work Act's 4 years, and the 2018 Act's zero hours, minimum payment and banded hours.
    expect(contractKind('fixed_term').summary).toMatch(/can’t add up to more than 4 years without an objective reason/)
    expect(contractKind('casual').summary).toMatch(/zero-hours contracts are otherwise banned/)
    expect(contractKind('casual').summary).toMatch(/at least 3 hours at the minimum wage/)
    expect(contractKind('casual').summary).toMatch(/band of hours/)
    expect(contractKind('indefinido').label).toBe('Permanent (indefinido)')
  })

  it('follows the business’s country, and a contract of either kind can be saved', () => {
    setCountry('IE')
    expect(contractKinds()).toBe(IRISH_CONTRACT_KINDS)
    expect(defaultContractKind()).toBe('permanent')
    const ok = { profile_id: 'p', starts_on: '2026-11-09' }
    expect(contractProblem({ ...ok, kind: 'specified_purpose' })).toBeNull()
    expect(contractProblem({ ...ok, kind: 'indefinido' })).toBeNull()
  })
})

describe('competition terms in Ireland', () => {
  const c: Pick<Competition, 'name' | 'kind' | 'channels' | 'starts_on' | 'ends_on' | 'draw_on' | 'prize' | 'prize_value' | 'winners' | 'reserves' | 'how_to_enter' | 'rules'> = {
    name: 'Christmas giveaway', kind: 'instagram_giveaway', channels: ['instagram'], starts_on: '2026-12-01', ends_on: '2026-12-20', draw_on: '2026-12-21',
    prize: 'a €25 gift card', prize_value: 25, winners: 1, reserves: 2, how_to_enter: ['Follow @dailygrind on Instagram', 'Like the post'],
    rules: { ...DEFAULT_RULES },
  }
  const b = { name: 'The Daily Grind', tax_id: 'IE1234567T', address: '1 Main Street, Cork', email: 'hello@dailygrind.example', website: 'https://dailygrind.example' }

  it('English terms: who runs it, the dates, who can enter, the prize, the winner, GDPR, Meta and Irish law', () => {
    const terms = irishTerms(c, b)
    expect(terms).toMatch(/^TERMS AND CONDITIONS: “Christmas giveaway”/)
    expect(terms).toContain('The Daily Grind (IE1234567T), 1 Main Street, Cork (“the Promoter”) runs this promotion on Instagram.')
    expect(terms).toContain('opens on 1 December 2026 and closes at 23:59 Irish time on 20 December 2026. The winner will be drawn on 21 December 2026.')
    expect(terms).toContain('Anyone aged 18 or over who lives in the Republic of Ireland, except the Promoter’s staff')
    expect(terms).toContain('1. Follow @dailygrind on Instagram\n2. Like the post')
    expect(terms).toContain('A €25 gift card, worth €25 (including VAT). There will be one winner and 2 reserves.')
    expect(terms).toContain('drawn at random from all valid entries. The winner will be contacted by direct message or a reply to their comment within 3 days')
    expect(terms).toContain('General Data Protection Regulation (GDPR) and the Data Protection Acts 1988 to 2018')
    expect(terms).toContain('writing to hello@dailygrind.example. You can also complain to the Data Protection Commission')
    expect(terms).toContain('8. Instagram and Facebook\nThis promotion is not sponsored, endorsed or administered by')
    expect(terms).toContain('9. General\n')
    expect(terms).toContain('governed by Irish law. They are published at https://dailygrind.example.')
    expect(terms).not.toMatch(/IRPF|España|RGPD/)
  })

  it('in the café, judged and without details: no Meta section, placeholders to fill in', () => {
    const terms = irishTerms({ ...c, kind: 'name_a_drink', channels: ['in_cafe'], prize: null, prize_value: null, winners: 3, reserves: 0, how_to_enter: [],
      rules: { ...DEFAULT_RULES, spain_only: false, marketing_signup: true } }, { name: 'The Daily Grind' })
    expect(terms).toContain('runs this promotion on the premises.')
    expect(terms).toContain('The winner will be chosen on')
    expect(terms).toContain('Anyone aged 18 or over, except')
    expect(terms).toContain('[How to enter]')
    expect(terms).toContain('you agree to get the Promoter’s news and offers')
    expect(terms).toContain('[Prize]. There will be 3 winners.')
    expect(terms).toContain('[the Promoter’s email]')
    expect(terms).not.toContain('Instagram and Facebook')
    expect(terms).toContain('8. General')
  })

  it('Ireland’s warnings: 16 to give details online, a draw you buy into; no IRPF', () => {
    const problems = (country: 'ES' | 'IE', x: Partial<typeof c>) => {
      setCountry(country)
      return entryProblems({ ...c, ...x }).map(p => p.text).join('\n')
    }
    const irish = problems('IE', { prize_value: 400, rules: { ...DEFAULT_RULES, min_age: 15 } })
    expect(irish).toMatch(/under 16s need a parent’s consent/)
    expect(irish).not.toMatch(/IRPF|Under 14s/)
    expect(problems('IE', { kind: 'in_cafe', channels: ['in_cafe'] })).toMatch(/count as a lottery/)
    // On 7 November 2026 the Gambling Regulation Act 2024's lottery rules weren't in force: the 1956 to 2019 Acts were.
    expect(problems('IE', { kind: 'in_cafe', channels: ['in_cafe'] })).toMatch(/Gaming and Lotteries Acts 1956 to 2019/)
    expect(irish).toMatch(/Data Protection Act 2018/)
    expect(problems('IE', { how_to_enter: ['Buy any drink in the café'] })).toMatch(/count as a lottery/)
    expect(problems('IE', {})).not.toMatch(/lottery/)
    // Spain's as they were.
    const spanish = problems('ES', { prize_value: 400, rules: { ...DEFAULT_RULES, min_age: 12 }, kind: 'in_cafe' })
    expect(spanish).toMatch(/IRPF/)
    expect(spanish).toMatch(/Under 14s/)
    expect(spanish).not.toMatch(/lottery|under 16s/)
  })
})

describe('mileage in Ireland', () => {
  it('starts at Revenue’s band 1 rate for the smallest engines, from the source checked', () => {
    expect(IRISH_MILEAGE.rate).toBe(0.418)
    expect(IRISH_MILEAGE.rate).toBe(Math.min(...Object.values(IRISH_MILEAGE.band1)))
    expect(IRISH_MILEAGE.electric).toBe(IRISH_MILEAGE.band1.from1201To1500cc)
    expect(IRISH_MILEAGE.source).toMatch(/^https:\/\/www\.revenue\.ie\//)
    expect(defaultMileageRate('IE')).toBe(0.418)
    expect(defaultMileageRate('ES')).toBe(DEFAULT_MILEAGE_RATE)
    setCountry('IE')
    expect(defaultMileageRate()).toBe(0.418)
    expect(mileageAmount(12, defaultMileageRate(), true)).toBe(10.03)
  })

  it('the starting rate is tax free whatever the car for the first 5,500 business km of a year, and over band 3’s after', () => {
    // Revenue's civil service rates from 1 September 2022, as its page and Tax and Duty Manual Part 05-01-06 give them.
    expect(IRISH_MILEAGE.since).toBe('2022-09-01')
    expect(IRISH_MILEAGE.band1).toEqual({ upTo1200cc: 0.418, from1201To1500cc: 0.434, from1501cc: 0.5182 })
    expect(IRISH_MILEAGE.rate).toBeLessThan(Math.min(...Object.values(IRISH_MILEAGE.band2)))
    expect(IRISH_MILEAGE.taxFreeUpToKm).toBe(5500)
    expect(IRISH_MILEAGE.rate).toBeGreaterThan(Math.max(...Object.values(IRISH_MILEAGE.band3)))
    expect(IRISH_MILEAGE.checked).toBe('2026-11-08')
  })
})

describe('the CCTV sign in Ireland', () => {
  it('says the cameras record, who runs them, what for, and how to get in touch', () => {
    expect(irishCctvSign({ name: 'The Daily Grind', email: 'hello@dailygrind.example', phone: '+353 21 123 4567', website: 'https://dailygrind.example' })).toBe([
      'CCTV in operation',
      'Images are recorded by The Daily Grind for the safety of staff and customers and to prevent crime.',
      'To ask about the recordings, contact hello@dailygrind.example or +353 21 123 4567.',
      'More information: https://dailygrind.example',
    ].join('\n'))
    expect(irishCctvSign({ name: ' ', email: null, phone: '' })).toBe([
      'CCTV in operation',
      'Images are recorded by [business name] for the safety of staff and customers and to prevent crime.',
      'To ask about the recordings, contact [email or phone].',
    ].join('\n'))
  })
})

describe('hiring in Ireland', () => {
  it('Ireland’s job boards first, Spain’s InfoJobs only in Spain, and one already picked kept', () => {
    expect(jobBoards('IE').map(b => b.label)).toEqual(['IrishJobs.ie', 'Jobs.ie', 'Indeed Ireland', 'JobsIreland.ie', 'LinkedIn', 'Instagram', 'Sign in the window', 'Word of mouth', 'Other'])
    expect(jobBoards('ES').map(b => b.id)).toEqual(['infojobs', 'indeed', 'linkedin', 'instagram', 'window', 'referral', 'other'])
    expect(jobBoards('IE', ['infojobs']).map(b => b.id).at(-1)).toBe('infojobs')
    expect(jobBoards('ES', ['jobsie']).map(b => b.id)).toContain('jobsie')
    expect(boardLabel('jobsireland')).toBe('JobsIreland.ie')
  })

  it('seasonal work without Spain’s fijo discontinuo', () => {
    expect(contractLabel('seasonal', 'IE')).toBe('Seasonal')
    expect(contractLabel('seasonal', 'ES')).toBe('Seasonal (fijo discontinuo)')
    expect(hiringContracts('IE').map(c => c.id)).toEqual(hiringContracts('ES').map(c => c.id))
  })
})

describe('GAA on the Sports page', () => {
  const championship = { code: 'gaa-hurling-championship', sport: 'gaa' as const, kind: 'cup' as const }
  const event = (round: string) => ({ sport: 'gaa' as const, title: 'Galway vs Limerick', home: 'Galway GAA Hurling', away: 'Limerick GAA Hurling', round })

  it('a TheSportsDB GAA fixture, as it sends them', () => {
    // The 2026 All-Ireland hurling final, as TheSportsDB listed it (league 5565).
    const e = fromSportsDb({ idEvent: '2400001', strEvent: 'Galway GAA Hurling vs Limerick GAA Hurling', strTimestamp: '2026-07-19T14:30:00',
      dateEvent: '2026-07-19', strHomeTeam: 'Galway GAA Hurling', strAwayTeam: 'Limerick GAA Hurling', intRound: '200', strSeason: '2026', strStatus: 'FT' }, championship)
    expect(e).toMatchObject({ sport: 'gaa', competition: 'gaa-hurling-championship', starts_at: '2026-07-19T14:30:00.000Z', status: 'finished', big: true })
  })

  it('the knock-outs are the big days; a league round isn’t', () => {
    expect(isBigEvent(event('125'), championship)).toBe(true) // quarter-final
    expect(isBigEvent(event('150'), championship)).toBe(true) // semi-final
    expect(isBigEvent(event('200'), championship)).toBe(true) // final
    expect(isBigEvent(event('Final'), { code: 'gaa-football-league', kind: 'league' })).toBe(true)
    expect(isBigEvent(event('3'), { code: 'gaa-football-league', kind: 'league' })).toBe(false)
    expect(isBigEvent(event('22'), championship)).toBe(false)
  })
})
