import { describe, expect, it } from 'vitest'
import { boardMove, hiringLanes, keepUntil, matchesCandidate, overdue, stageCounts, type Applicant, type JobOpening } from './hiring'

describe('hiring', () => {
  it('applicants are kept a year from applying (the month’s last day when it has fewer)', () => {
    expect(keepUntil('2025-09-12')).toBe('2026-09-12')
    expect(keepUntil('2028-02-29')).toBe('2029-02-28')
  })

  it('past their day and not hired: their details should go', () => {
    expect(overdue({ stage: 'rejected', keep_until: '2026-09-12' }, '2026-09-30')).toBe(true)
    expect(overdue({ stage: 'applied', keep_until: '2026-09-12' }, '2026-09-30')).toBe(true)
    expect(overdue({ stage: 'hired', keep_until: '2026-09-12' }, '2026-09-30')).toBe(false)
    expect(overdue({ stage: 'rejected', keep_until: '2026-09-30' }, '2026-09-30')).toBe(false)
  })

  it('counts applicants at each stage', () => {
    const n = stageCounts([{ stage: 'applied' }, { stage: 'interview' }, { stage: 'interview' }, { stage: 'hired' }])
    expect(n).toMatchObject({ applied: 1, interview: 2, hired: 1, offer: 0, rejected: 0 })
  })

  const job = (o: Partial<JobOpening> & { id: string }): JobOpening => ({ title: o.id, position_id: null, contract: 'part_time', hours_per_week: null, pay: null,
    description: null, status: 'open', posted_on: [], opened_on: '2026-10-01', closes_on: null, created_at: '2026-10-01T09:00:00Z', ...o })
  const person = (a: Partial<Applicant> & { id: string; opening_id: string }): Applicant => ({ full_name: a.id, email: null, phone: null, source: 'other', stage: 'applied',
    interview_at: null, rating: null, cv_link: null, notes: null, applied_on: '2026-10-10', keep_until: '2027-10-10', profile_id: null, ...a })

  it('the board has a lane per job, open ones first, and a column per stage with the newest first', () => {
    const jobs = [job({ id: 'old', status: 'filled', opened_on: '2025-09-01' }), job({ id: 'paused', status: 'paused', opened_on: '2026-10-20' }),
      job({ id: 'barista', opened_on: '2026-10-01' }), job({ id: 'kitchen', opened_on: '2026-10-15' })]
    const people = [person({ id: 'Tom', opening_id: 'barista', applied_on: '2026-10-20' }), person({ id: 'Sara', opening_id: 'barista', applied_on: '2026-10-25' }),
      person({ id: 'Lucía', opening_id: 'barista', stage: 'interview' }), person({ id: 'Julio', opening_id: 'old', stage: 'hired' })]
    const lanes = hiringLanes(jobs, people)
    expect(lanes.map(l => l.opening.id)).toEqual(['kitchen', 'barista', 'paused'])
    const barista = lanes[1]
    expect(barista.byStage.applied.map(a => a.id)).toEqual(['Sara', 'Tom'])
    expect(barista.byStage.interview.map(a => a.id)).toEqual(['Lucía'])
    expect(barista.byStage.offer).toEqual([])
    expect(barista.total).toBe(3)
    // A filled job comes back when asked for, and stays while someone is still in the running.
    expect(hiringLanes(jobs, people, true).map(l => l.opening.id)).toEqual(['kitchen', 'barista', 'paused', 'old'])
    expect(hiringLanes(jobs, [...people, person({ id: 'Ana', opening_id: 'old', stage: 'offer' })]).map(l => l.opening.id)).toContain('old')
  })

  it('a card dropped on the board changes its stage, and its job when it lands in another lane', () => {
    expect(boardMove({ opening_id: 'barista', stage: 'applied' }, { opening_id: 'barista', stage: 'applied' })).toBeNull()
    expect(boardMove({ opening_id: 'barista', stage: 'applied' }, { opening_id: 'barista', stage: 'interview' })).toEqual({ stage: 'interview' })
    expect(boardMove({ opening_id: 'barista', stage: 'applied' }, { opening_id: 'kitchen', stage: 'applied' })).toEqual({ opening_id: 'kitchen', stage: 'applied' })
  })

  it('candidates are found by name, email or phone', () => {
    const lucia = { full_name: 'Lucía Romero', email: 'lucia.romero@example.es', phone: '+34 611 908 334' }
    expect(matchesCandidate(lucia, '')).toBe(true)
    expect(matchesCandidate(lucia, 'romero')).toBe(true)
    expect(matchesCandidate(lucia, 'EXAMPLE.ES')).toBe(true)
    expect(matchesCandidate(lucia, '611 908')).toBe(true)
    expect(matchesCandidate(lucia, 'sara')).toBe(false)
    expect(matchesCandidate(lucia, '6')).toBe(false)
  })
})
