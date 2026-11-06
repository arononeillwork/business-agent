import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REPORTS, MAX_RECIPIENTS, REPORTS, dueNow, newSchedule, nextSend, parseEmails, readReports, reportEmail, reportRange, reportSendProblem, scheduleProblem, sendsOn,
} from './reports'

describe('reports', () => {
  it('has each report once, in the email’s order', () => {
    expect(REPORTS.map(r => r.kind)).toEqual(['takings', 'best_sellers', 'team', 'stock', 'waste', 'fresh', 'jobs'])
  })

  it('reads the saved choice, keeping only what makes sense', () => {
    expect(readReports(undefined)).toEqual(DEFAULT_REPORTS)
    expect(readReports({ kinds: ['jobs', 'nonsense', 'takings'], period: 'month', team: ['p-1', 3], contacts: ['c-1'], emails: ['a@b.es', 'not an email'] }))
      .toEqual({ kinds: ['jobs', 'takings'], period: 'month', team: ['p-1'], contacts: ['c-1'], emails: ['a@b.es'] })
    expect(readReports({ kinds: [], period: 'year' })).toMatchObject({ kinds: [], period: 'week' })
  })

  it('takes addresses typed or pasted, each once, and says which aren’t', () => {
    expect(parseEmails(' Torquino71@gmail.com, <daniel.cruz.luna@bbva.com>; torquino71@GMAIL.com\nlola@gestoria.es  bob ')).toEqual({
      emails: ['torquino71@gmail.com', 'daniel.cruz.luna@bbva.com', 'lola@gestoria.es'], bad: ['bob'],
    })
  })

  it('writes the email: each report under its heading, its lines as bullets, then who sent it', () => {
    const mail = reportEmail({
      business: 'Easy Beans Coffee', period: 'This week', dates: '28 Sep – 30 Sep', from: 'Aron', subject: 'Easy Beans Coffee: report for this week',
      heading: 'Easy Beans Coffee: this week (28 Sep – 30 Sep)', footer: 'Sent by Aron from The Business Agent.',
      sections: [{ title: 'Takings and breakeven', lines: ['Takings: €1,200.00', 'Breakeven: €900.00'] }, { title: 'Jobs to do', lines: ['3 open'] }],
    })
    expect(mail.subject).toBe('Easy Beans Coffee: report for this week')
    expect(mail.text).toBe([
      'Easy Beans Coffee: this week (28 Sep – 30 Sep)', '',
      'TAKINGS AND BREAKEVEN', '• Takings: €1,200.00', '• Breakeven: €900.00', '',
      'JOBS TO DO', '• 3 open', '', '—', 'Sent by Aron from The Business Agent.',
    ].join('\n'))
  })

  it('checks it before sending: someone to send to (20 at most, real addresses), a subject and something in it', () => {
    const ok = { to: ['a@b.es'], subject: 'Report', text: 'Takings' }
    expect(reportSendProblem(ok)).toBeNull()
    expect(reportSendProblem({ ...ok, to: [] })).toBe('Pick who gets it')
    expect(reportSendProblem({ ...ok, to: Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `p${i}@b.es`) })).toBe('Send it to 20 people at most at a time')
    expect(reportSendProblem({ ...ok, to: ['a@b.es', 'nope'] })).toBe('One of the addresses isn’t an email address')
    expect(reportSendProblem({ ...ok, subject: ' ' })).toBe('The report needs a subject')
    expect(reportSendProblem({ ...ok, text: '' })).toBe('Pick at least one report')
    expect(reportSendProblem({ ...ok, text: 'x'.repeat(50_001) })).toBe('The report is too long to email')
  })
})

describe('report periods', () => {
  // Wednesday 30 September 2026.
  const day = '2026-09-30'
  it('covers yesterday, last week and last month whole, against the same length before', () => {
    expect(reportRange('yesterday', day)).toEqual({ from: '2026-09-29', to: '2026-09-29', prevFrom: '2026-09-22', prevTo: '2026-09-22' })
    expect(reportRange('last_week', day)).toEqual({ from: '2026-09-21', to: '2026-09-27', prevFrom: '2026-09-14', prevTo: '2026-09-20' })
    expect(reportRange('last_month', day)).toEqual({ from: '2026-08-01', to: '2026-08-31', prevFrom: '2026-07-01', prevTo: '2026-07-31' })
    expect(reportRange('last_month', '2026-03-05')).toMatchObject({ from: '2026-02-01', to: '2026-02-28' })
    expect(reportRange('week', day)).toMatchObject({ from: '2026-09-28', to: day })
  })
  it('keeps a saved period of either kind', () => {
    expect(readReports({ kinds: ['jobs'], period: 'last_week' })).toMatchObject({ period: 'last_week' })
  })
})

describe('scheduled reports', () => {
  const tz = 'Europe/Madrid'
  // 08:00 in Madrid on Monday 5 October 2026 is 06:00 UTC.
  const at = (iso: string) => Date.parse(iso)
  const monday = { ...newSchedule(), id: 's', name: 'Monday takings', team: ['p'], last_sent_at: null, last_error: null, updated_at: '2026-09-01T00:00:00Z', updated_by: 'p' }

  it('goes every day, on the days of the week picked, or on a day of the month', () => {
    expect(sendsOn({ frequency: 'daily', weekdays: [], month_day: null }, '2026-10-04')).toBe(true)
    expect(sendsOn({ frequency: 'weekly', weekdays: [1, 4], month_day: null }, '2026-10-05')).toBe(true) // a Monday
    expect(sendsOn({ frequency: 'weekly', weekdays: [1, 4], month_day: null }, '2026-10-06')).toBe(false)
    expect(sendsOn({ frequency: 'weekly', weekdays: [1, 4], month_day: null }, '2026-10-08')).toBe(true) // a Thursday
    expect(sendsOn({ frequency: 'monthly', weekdays: [], month_day: 1 }, '2026-10-01')).toBe(true)
    expect(sendsOn({ frequency: 'monthly', weekdays: [], month_day: 1 }, '2026-10-02')).toBe(false)
  })

  it('is due from its time, in the business’s time zone, once; not before, not after six hours', () => {
    expect(dueNow(monday, at('2026-10-05T05:59:00Z'), tz)).toBeNull()
    expect(dueNow(monday, at('2026-10-05T06:00:30Z'), tz)).toBe('2026-10-05T06:00:00.000Z')
    expect(dueNow({ ...monday, last_sent_at: '2026-10-05T06:00:00Z' }, at('2026-10-05T06:01:00Z'), tz)).toBeNull()
    expect(dueNow(monday, at('2026-10-05T12:01:00Z'), tz)).toBeNull() // six hours late: waits for next Monday
    expect(dueNow({ ...monday, active: false }, at('2026-10-05T06:00:30Z'), tz)).toBeNull()
    expect(dueNow(monday, at('2026-10-06T06:00:30Z'), tz)).toBeNull() // a Tuesday
  })

  it('never goes for a time before it was set up or changed', () => {
    expect(dueNow({ ...monday, updated_at: '2026-10-05T06:30:00Z' }, at('2026-10-05T07:00:00Z'), tz)).toBeNull()
  })

  it('a late-evening one missed before midnight still goes just after', () => {
    const late = { ...monday, frequency: 'daily' as const, send_at: '23:30' }
    expect(dueNow(late, at('2026-10-05T22:10:00Z'), tz)).toBe('2026-10-05T21:30:00.000Z') // 00:10 on the 6th in Madrid: the 5th's at 23:30
  })

  it('says when it goes next', () => {
    expect(nextSend(monday, at('2026-09-30T10:00:00Z'), tz)).toBe('2026-10-05T06:00:00.000Z')
    expect(nextSend({ ...monday, frequency: 'monthly', month_day: 1, send_at: '09:00' }, at('2026-09-30T10:00:00Z'), tz)).toBe('2026-10-01T07:00:00.000Z')
    expect(nextSend({ ...monday, active: false }, at('2026-09-30T10:00:00Z'), tz)).toBeNull()
  })

  it('says what stops one being saved', () => {
    const ok = { ...newSchedule(), name: 'Monday takings', team: ['p'] }
    expect(scheduleProblem(ok)).toBeNull()
    expect(scheduleProblem({ ...ok, name: ' ' })).toBe('Give the schedule a name')
    expect(scheduleProblem({ ...ok, kinds: [] })).toBe('Pick at least one report')
    expect(scheduleProblem({ ...ok, team: [] })).toBe('Pick who gets it')
    expect(scheduleProblem({ ...ok, emails: Array.from({ length: 20 }, (_, i) => `p${i}@b.es`) })).toBe('Send it to 20 people at most at a time')
    expect(scheduleProblem({ ...ok, weekdays: [] })).toBe('Pick the days it goes')
    expect(scheduleProblem({ ...ok, frequency: 'monthly', month_day: 31 })).toBe('Pick a day of the month from 1 to 28')
    expect(scheduleProblem({ ...ok, send_at: '25:00' })).toBe('Pick the time it goes')
  })
})
