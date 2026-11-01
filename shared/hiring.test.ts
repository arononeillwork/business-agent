import { describe, expect, it } from 'vitest'
import {
  availableBy, boardMove, cleanRoles, cvKind, cvPreview, cvProblem, cvSize, hiringLanes, keepUntil, matchesCandidate, matchesPoolCandidate, onAJob, overdue,
  poolOrder, poolRoles, stageCounts, suits, MAX_CV_SIZE, type Applicant, type JobOpening,
} from './hiring'

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
    interview_at: null, rating: null, cv_link: null, notes: null, applied_on: '2026-10-10', keep_until: '2027-10-10', profile_id: null,
    roles: [], available_from: null, availability: null, ...a })

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

  describe('the CV pool', () => {
    const pooled = (a: Partial<Applicant> & { id: string }): Applicant => ({ ...person({ ...a, opening_id: '' }), opening_id: null })
    const marta = pooled({ id: 'Marta Jiménez', phone: '+34 633 120 554', roles: ['Barista', 'Front of house'], availability: 'Weekends',
      notes: 'Three summers at a beach bar', available_from: '2026-12-01', applied_on: '2026-10-20' })
    const daniel = pooled({ id: 'Daniel Ortega', roles: ['Kitchen', 'barista'], applied_on: '2026-10-01' })

    it('is everyone with no job; nobody in it is on the board', () => {
      expect([marta, person({ id: 'Tom', opening_id: 'barista' })].filter(onAJob).map(a => a.id)).toEqual(['Tom'])
      const lanes = hiringLanes([job({ id: 'barista' })], [marta, daniel, person({ id: 'Tom', opening_id: 'barista' })])
      expect(lanes[0].total).toBe(1)
    })

    it('the roles typed are trimmed, each once whatever its capitals, up to 10', () => {
      expect(cleanRoles([' Barista ', 'barista', '', 'Front  of house', 'BARISTA'])).toEqual(['Barista', 'Front of house'])
      expect(cleanRoles(Array.from({ length: 12 }, (_, i) => `Role ${i}`))).toHaveLength(10)
      expect(cleanRoles(['x'.repeat(80)])[0]).toHaveLength(60)
    })

    it('filters by the roles they’d suit and when they can start', () => {
      expect(poolRoles([marta, daniel])).toEqual(['Barista', 'Front of house', 'Kitchen'])
      expect(suits(daniel, 'Barista')).toBe(true)
      expect(suits(marta, 'Kitchen')).toBe(false)
      expect(availableBy(marta, '2026-11-15')).toBe(false)
      expect(availableBy(marta, '2026-12-01')).toBe(true)
      expect(availableBy(daniel, '2026-11-15')).toBe(true)
    })

    it('is searched by name, phone, the roles, when they can work and the notes; the newest first', () => {
      expect(matchesPoolCandidate(marta, '')).toBe(true)
      expect(matchesPoolCandidate(marta, 'jiménez')).toBe(true)
      expect(matchesPoolCandidate(marta, '633 120')).toBe(true)
      expect(matchesPoolCandidate(marta, 'front of')).toBe(true)
      expect(matchesPoolCandidate(marta, 'weekend')).toBe(true)
      expect(matchesPoolCandidate(marta, 'beach')).toBe(true)
      expect(matchesPoolCandidate(marta, 'kitchen')).toBe(false)
      expect(poolOrder([daniel, marta]).map(a => a.id)).toEqual(['Marta Jiménez', 'Daniel Ortega'])
    })

    it('a CV is a PDF, a Word document or a picture, up to 10 MB; PDFs and pictures show in the page', () => {
      expect(cvKind({ name: 'Marta CV.pdf', type: 'application/pdf' })).toBe('pdf')
      expect(cvKind({ name: 'cv.PDF' })).toBe('pdf')
      expect(cvKind({ name: 'photo.jpg', type: 'image/jpeg' })).toBe('image')
      expect(cvKind({ name: 'CV.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe('document')
      expect(cvKind({ name: 'CV.doc', type: 'application/octet-stream' })).toBe('document')
      expect(cvKind({ name: 'IMG_0042.HEIC', type: 'image/heic' })).toBe('document')
      expect(cvKind({ name: 'song.mp3', type: 'audio/mpeg' })).toBeNull()
      expect(cvPreview({ file_name: 'CV.pdf', mime_type: 'application/pdf' })).toBe('pdf')
      expect(cvPreview({ file_name: 'CV.png', mime_type: 'image/png' })).toBe('image')
      expect(cvPreview({ file_name: 'CV.docx', mime_type: null })).toBeNull()
      expect(cvProblem({ name: 'CV.pdf', type: 'application/pdf', size: 84_000 })).toBeNull()
      expect(cvProblem({ name: 'CV.pdf', size: 0 })).toBe('That file is empty')
      expect(cvProblem({ name: 'CV.pdf', size: MAX_CV_SIZE + 1 })).toBe('A CV can be up to 10 MB')
      expect(cvProblem({ name: 'song.mp3', type: 'audio/mpeg', size: 1000 })).toBe('A CV is a PDF, a Word document or a picture')
      expect(cvSize(84_211)).toBe('82 KB')
      expect(cvSize(1_652_275)).toBe('1.6 MB')
    })
  })
})
