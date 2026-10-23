import { describe, expect, it } from 'vitest'
import { followUpDue, isOpen, pipeline } from './leads'

describe('leads and enquiries', () => {
  it('new, contacted and quoted are open; won and lost are closed', () => {
    expect(['new', 'contacted', 'quoted'].every(stage => isOpen({ stage: stage as never }))).toBe(true)
    expect(isOpen({ stage: 'won' }) || isOpen({ stage: 'lost' })).toBe(false)
  })

  it('a follow-up is due on its day and after, while the enquiry is open', () => {
    expect(followUpDue({ stage: 'new', follow_up_on: '2026-09-30' }, '2026-09-30')).toBe(true)
    expect(followUpDue({ stage: 'quoted', follow_up_on: '2026-09-29' }, '2026-09-30')).toBe(true) // overdue
    expect(followUpDue({ stage: 'contacted', follow_up_on: '2026-10-01' }, '2026-09-30')).toBe(false)
    expect(followUpDue({ stage: 'won', follow_up_on: '2026-09-29' }, '2026-09-30')).toBe(false)
    expect(followUpDue({ stage: 'new', follow_up_on: null }, '2026-09-30')).toBe(false)
  })

  it('the pipeline: open now, and won and lost since a day', () => {
    const p = pipeline([
      { stage: 'new', value: 180, closed_at: null }, { stage: 'quoted', value: 640, closed_at: null }, { stage: 'contacted', value: null, closed_at: null },
      { stage: 'won', value: 150, closed_at: '2026-09-12T10:00:00Z' }, { stage: 'won', value: 90, closed_at: '2026-08-20T10:00:00Z' },
      { stage: 'lost', value: 300, closed_at: '2026-09-26T10:00:00Z' },
    ], '2026-09-01')
    expect(p).toEqual({ open: 3, openValue: 820, won: 1, wonValue: 150, winRate: 50 })
    expect(pipeline([{ stage: 'new', value: 10, closed_at: null }], '2026-09-01').winRate).toBeNull()
  })
})
