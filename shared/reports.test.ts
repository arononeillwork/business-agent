import { describe, expect, it } from 'vitest'
import { DEFAULT_REPORTS, MAX_RECIPIENTS, REPORTS, parseEmails, readReports, reportEmail, reportSendProblem } from './reports'

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
      heading: 'Easy Beans Coffee: this week (28 Sep – 30 Sep)', footer: 'Sent by Aron from Business Agent.',
      sections: [{ title: 'Takings and breakeven', lines: ['Takings: €1,200.00', 'Breakeven: €900.00'] }, { title: 'Jobs to do', lines: ['3 open'] }],
    })
    expect(mail.subject).toBe('Easy Beans Coffee: report for this week')
    expect(mail.text).toBe([
      'Easy Beans Coffee: this week (28 Sep – 30 Sep)', '',
      'TAKINGS AND BREAKEVEN', '• Takings: €1,200.00', '• Breakeven: €900.00', '',
      'JOBS TO DO', '• 3 open', '', '—', 'Sent by Aron from Business Agent.',
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
