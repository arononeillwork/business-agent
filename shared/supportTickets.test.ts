// Support tickets' rules (shared/supportTickets.ts), as public.create_support_ticket() and
// public.alert_support_tickets() keep them (supabase/tests/zzzzzzzzzzzzzzz_support_tickets.test.sql proves the
// database's own): five a day, a minimum length, the same words twice in a day being the one sent, and what the
// notifications say.
import { describe, expect, it } from 'vitest'
import { SUPPORT, alertText, answerText, cleanDraft, excerpt, hqOrder, messageProblem, newTicketCheck, sameText, type SupportDraft } from './supportTickets'

const NOW = Date.parse('2026-11-10T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
const draft = (d: Partial<SupportDraft> = {}): SupportDraft => ({
  kind: 'not_working', message: 'The rota went blank on my phone.', page: '/rota', app_version: 'index-abc123', browser: 'Mozilla/5.0', error_fingerprint: null, ...d,
})

describe('sending a support ticket', () => {
  it('needs at least 10 characters, and at most 2,000', () => {
    expect(messageProblem('   Too short  ')).toBe('Say a little more: at least 10 characters')
    expect(messageProblem('Ten chars!')).toBeNull()
    expect(messageProblem('x'.repeat(SUPPORT.MAX_LENGTH))).toBeNull()
    expect(messageProblem('x'.repeat(SUPPORT.MAX_LENGTH + 1))).toBe('Keep it to 2,000 characters')
  })

  it('counts five in the last 24 hours, not more', () => {
    const mine = [1, 2, 3, 4].map(i => ({ id: i, message: `Question number ${i} about the rota`, created_at: hoursAgo(i) }))
    expect(newTicketCheck(mine, 'Another question entirely', NOW)).toEqual({ duplicate: null, full: false, sentToday: 4 })
    const five = [...mine, { id: 5, message: 'And a fifth one, about tips', created_at: hoursAgo(23.9) }]
    expect(newTicketCheck(five, 'Another question entirely', NOW).full).toBe(true)
    // The oldest is more than a day old: room for one more.
    five[4].created_at = hoursAgo(24.1)
    expect(newTicketCheck(five, 'Another question entirely', NOW)).toMatchObject({ full: false, sentToday: 4 })
  })

  it('takes the same words again, whatever the spaces and capitals, as the one already sent that day', () => {
    const mine = [{ id: 7, message: 'How do I add a second café?', created_at: hoursAgo(3) }]
    expect(sameText('  how do I add a SECOND\n café? ')).toBe(sameText('How do I add a second café?'))
    expect(newTicketCheck(mine, '  how do I add a SECOND\n café? ', NOW).duplicate).toBe(7)
    expect(newTicketCheck(mine, 'How do I add a third café?', NOW).duplicate).toBeNull()
    // A day later, the same words are a new one.
    expect(newTicketCheck([{ ...mine[0], created_at: hoursAgo(25) }], 'How do I add a second café?', NOW).duplicate).toBeNull()
    // Even when five are in: it's still the one they sent, not a refusal.
    const five = [1, 2, 3, 4].map(i => ({ id: i, message: `Question ${i} about something`, created_at: hoursAgo(1) })).concat(mine)
    expect(newTicketCheck(five, 'How do I add a second café?', NOW)).toMatchObject({ duplicate: 7, full: true })
  })

  it('sends the page as a path only, nothing too long, and an error only with a problem report', () => {
    const fp = '6f1c0a9e2b7d4c3e8a5f1b0d9c7e6a21'
    expect(cleanDraft(draft({ message: '  It went blank.  ', page: '/screens/abc123def456ghi789jkl0/edit?token=secret#x', error_fingerprint: fp })))
      .toEqual({ kind: 'not_working', message: 'It went blank.', page: '/screens/:token/edit', app_version: 'index-abc123', browser: 'Mozilla/5.0', error_fingerprint: fp })
    expect(cleanDraft(draft({ kind: 'question', error_fingerprint: fp })).error_fingerprint).toBeNull()
    expect(cleanDraft(draft({ error_fingerprint: 'not-one' })).error_fingerprint).toBeNull()
    expect(cleanDraft(draft({ page: 'https://example.com/rota' })).page).toBeNull()
    expect(cleanDraft(draft({ browser: 'x'.repeat(500), app_version: '' }))).toMatchObject({ browser: 'x'.repeat(SUPPORT.BROWSER), app_version: null })
    expect(cleanDraft(draft({ kind: 'complaint' as never })).kind).toBe('question')
  })
})

describe('what the notifications say (the database writes the same)', () => {
  it('tells HQ how many problem reports came in, with the latest one’s words', () => {
    expect(alertText(1, 'The rota went blank.')).toEqual({ title: '1 new problem report', body: 'Latest: “The rota went blank.”. On Businesses, under Support.' })
    expect(alertText(3, 'Clocking in\nfails').title).toBe('3 new problem reports')
    expect(alertText(3, 'Clocking in\nfails').body).toBe('Latest: “Clocking in fails”. On Businesses, under Support.')
    expect(excerpt('x'.repeat(150), 100)).toBe(`${'x'.repeat(99)}…`)
  })

  it('tells the person HQ replied, with the reply, or that it’s closed, with what they wrote', () => {
    expect(answerText('Fixed now: reload the app.', 'The rota went blank.')).toEqual({ title: 'The Business Agent answered your request', body: 'Fixed now: reload the app.' })
    expect(answerText(null, 'The rota went blank.')).toEqual({ title: 'Your request is closed', body: 'You wrote: “The rota went blank.”' })
  })
})

describe('HQ’s list', () => {
  it('puts open ones first, then being looked at, answered and closed, the newest first in each', () => {
    const t = (id: number, status: 'open' | 'looking' | 'answered' | 'closed', h: number) => ({ id, status, created_at: hoursAgo(h) })
    expect(hqOrder([t(1, 'closed', 0), t(2, 'open', 5), t(3, 'answered', 1), t(4, 'open', 1), t(5, 'looking', 9)]).map(x => x.id)).toEqual([4, 2, 5, 3, 1])
  })
})
