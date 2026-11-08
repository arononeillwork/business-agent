// Competition ideas on Ireland's calendar for a business there: its bank holidays (a long weekend's giveaway
// drawn on the Thursday before), Mothering Sunday and Easter worked out from Easter, Father's Day, back to
// school, Halloween with the October bank holiday, and an All-Ireland final on Sports; Spain's as they were.
import { afterEach, describe, expect, it } from 'vitest'
import { setCountry } from './country'
import { irishMoments, spanishMoments, suggest, type SuggestInput } from './competitions'

afterEach(() => setCountry('ES'))

const business = { name: 'Cork Roast', instagram: '@corkroast' }
const dates = (from: string, year: string) => Object.fromEntries(irishMoments(from).filter(m => m.date.startsWith(year)).map(m => [m.key, m.date]))
const draws = (from: string, year: string) => Object.fromEntries(irishMoments(from).filter(m => m.date.startsWith(year) && m.draw).map(m => [m.key, m.draw]))

describe('Ireland’s moments', () => {
  it('2026: each on its day, the movable ones worked out', () => {
    expect(dates('2025-12-31', '2026')).toEqual({
      brigid: '2026-02-02',     // 1 February is a Sunday: the bank holiday is the Monday
      valentines: '2026-02-14',
      patrick: '2026-03-17',
      mothers: '2026-03-15',    // Mothering Sunday, the fourth Sunday of Lent: three weeks before Easter (5 April)
      easter: '2026-04-05',
      may: '2026-05-04',
      june: '2026-06-01',
      fathers: '2026-06-21',    // the third Sunday of June
      august: '2026-08-03',
      school: '2026-08-31',     // the last week of August
      halloween: '2026-10-31',
      blackfriday: '2026-11-27',
      christmas: '2026-12-25',
    })
    // Long weekends are drawn on the Thursday before; Halloween's before the October bank holiday (Monday 26th).
    expect(draws('2025-12-31', '2026')).toEqual({
      brigid: '2026-01-29', easter: '2026-04-02', may: '2026-04-30', june: '2026-05-28', august: '2026-07-30', halloween: '2026-10-22',
    })
  })

  it('2027: St Brigid’s on the 1st (a Monday), Easter in March, and the rest moved with the calendar', () => {
    expect(dates('2026-12-31', '2027')).toEqual({
      brigid: '2027-02-01',
      valentines: '2027-02-14',
      patrick: '2027-03-17',
      mothers: '2027-03-07',
      easter: '2027-03-28',
      may: '2027-05-03',
      june: '2027-06-07',
      fathers: '2027-06-20',
      august: '2027-08-02',
      school: '2027-08-30',
      halloween: '2027-10-31',
      blackfriday: '2027-11-26',
      christmas: '2027-12-25',
    })
    expect(draws('2026-12-31', '2027')).toEqual({
      brigid: '2027-01-28', easter: '2027-03-25', may: '2027-04-29', june: '2027-06-03', august: '2027-07-29', halloween: '2027-10-21',
    })
  })

  it('come round in order from any day, a year ahead', () => {
    const m = irishMoments('2026-11-08')
    expect(m[0]).toMatchObject({ key: 'blackfriday', date: '2026-11-27' })
    expect(m.map(x => x.date)).toEqual([...m.map(x => x.date)].sort())
    expect(m.at(-1)).toMatchObject({ key: 'christmas', date: '2027-12-25' })
  })
})

describe('competition ideas for a business in Ireland', () => {
  const input = (today: string, more: Partial<SuggestInput> = {}): SuggestInput => ({ today, business, country: 'IE', ...more })
  const moments = (i: SuggestInput) => suggest(i).filter(x => x.key.startsWith('moment-'))

  it('the May and June bank holidays: drawn on the Thursday before each long weekend', () => {
    const [may, june] = moments(input('2026-04-15'))
    expect(may).toMatchObject({ key: 'moment-may-2026', starts_on: '2026-04-15', ends_on: '2026-04-29', draw_on: '2026-04-30' })
    expect(may.title).toEqual({ text: '{moment} giveaway', vars: { moment: 'May bank holiday' } })
    expect(may.why.text).toMatch(/^The \{moment\} is on \{date\}: a long weekend/)
    expect(may.caption).toContain('🎁 May bank holiday giveaway!')
    expect(may.caption).toContain('Drawn on 30/04/2026')
    expect(june).toMatchObject({ key: 'moment-june-2026', starts_on: '2026-05-15', ends_on: '2026-05-27', draw_on: '2026-05-28' })
  })

  it('Mothering Sunday and St Patrick’s Day in 2027, not Spain’s days', () => {
    const ideas = moments(input('2027-02-20'))
    expect(ideas.map(i => i.key)).toEqual(['moment-mothers-2027', 'moment-patrick-2027'])
    expect(ideas[0]).toMatchObject({ ends_on: '2027-03-05', draw_on: '2027-03-06', title: { vars: { moment: 'Mother’s Day' } } })
    expect(ideas[1]).toMatchObject({ starts_on: '2027-03-03', ends_on: '2027-03-15', draw_on: '2027-03-16' })
    // In Spain the same day brings Father's Day (19 March) instead.
    expect(moments({ ...input('2027-02-20'), country: 'ES' }).map(i => i.key)).toEqual(['moment-padre-2027'])
  })

  it('Halloween with the October bank holiday, and Christmas with St Stephen’s Day', () => {
    const halloween = moments(input('2026-09-30'))[0]
    expect(halloween).toMatchObject({ key: 'moment-halloween-2026', starts_on: '2026-10-09', ends_on: '2026-10-21', draw_on: '2026-10-22' })
    expect(halloween.why).toMatchObject({ text: expect.stringMatching(/^Halloween is big in Ireland/), vars: { holiday: '2026-10-26' } })
    const [blackFriday, christmas] = moments(input('2026-11-12'))
    expect(blackFriday.key).toBe('moment-blackfriday-2026')
    expect(christmas).toMatchObject({ key: 'moment-christmas-2026', draw_on: '2026-12-24', prize_value: 25, title: { vars: { moment: 'Christmas and St Stephen’s Day' } } })
  })

  it('back to school at the end of August', () => {
    const ideas = moments(input('2027-08-10'))
    expect(ideas.map(i => i.key)).toEqual(['moment-school-2027'])
    expect(ideas[0].why).toEqual({ text: expect.stringMatching(/^Schools go back the week of \{date\}/), vars: { date: '2027-08-30' } })
  })

  it('an All-Ireland final the business follows on Sports becomes a moment of its own (only in Ireland)', () => {
    const bigMatches = [
      { starts_at: '2026-07-19T14:30:00Z', title: 'Galway vs Limerick', competition: 'gaa-hurling-championship', round: '200' },
      { starts_at: '2026-07-05T14:00:00Z', title: 'Cork vs Clare', competition: 'gaa-hurling-championship', round: '150' }, // a semi-final
    ]
    const ideas = moments(input('2026-07-01', { bigMatches }))
    expect(ideas.map(i => i.key)).toEqual(['moment-allireland-hurling-2026', 'moment-august-2026'])
    expect(ideas[0]).toMatchObject({ ends_on: '2026-07-17', draw_on: '2026-07-18' })
    expect(ideas[0].why).toEqual({ text: expect.stringMatching(/the counties in it will be watching/),
      vars: { moment: 'All-Ireland hurling final', date: '2026-07-19', match: 'Galway vs Limerick' } })
    expect(moments({ ...input('2026-07-01', { bigMatches }), country: 'ES' }).map(i => i.key)).not.toContain('moment-allireland-hurling-2026')
  })

  it('follows the business’s country when none is given', () => {
    setCountry('IE')
    expect(moments({ today: '2026-04-15', business }).map(i => i.key)).toEqual(['moment-may-2026', 'moment-june-2026'])
    setCountry('ES')
    expect(moments({ today: '2026-04-15', business }).map(i => i.key)).toEqual(['moment-madre-2026'])
  })

  it('Spain’s moments are as they were', () => {
    expect(spanishMoments('2026-12-31').filter(m => m.date < '2028').map(m => m.key)).toEqual(
      ['reyes', 'valentin', 'padre', 'madre', 'verano', 'halloween', 'blackfriday', 'navidad'])
  })
})
