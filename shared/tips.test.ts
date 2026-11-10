import { describe, expect, it } from 'vitest'
import { minutesWorked, myTips, splitTips, tipsByPerson, type MemberTips, type TipPool } from './tips'

describe('tips', () => {
  it('by hours worked, to the cent, always adding up to the total', () => {
    const shares = splitTips(100, [{ profile_id: 'a', minutes: 600 }, { profile_id: 'b', minutes: 600 }, { profile_id: 'c', minutes: 600 }], 'hours')
    expect(shares.map(s => s.amount)).toEqual([33.34, 33.33, 33.33])
    const uneven = splitTips(103, [{ profile_id: 'julio', minutes: 2013 }, { profile_id: 'maria', minutes: 1874 }, { profile_id: 'cleaner', minutes: 333 }], 'hours')
    expect(Math.round(uneven.reduce((s, x) => s + x.amount, 0) * 100)).toBe(10300)
    expect(uneven[0].amount).toBeGreaterThan(uneven[1].amount)
  })

  it('by hours, someone with none gets nothing; equally, everyone ticked gets the same', () => {
    expect(splitTips(50, [{ profile_id: 'a', minutes: 300 }, { profile_id: 'b', minutes: 0 }], 'hours')).toEqual([{ profile_id: 'a', minutes: 300, amount: 50 }])
    expect(splitTips(10, [{ profile_id: 'a', minutes: 300 }, { profile_id: 'b', minutes: 0 }, { profile_id: 'c', minutes: 60 }], 'equal').map(s => s.amount)).toEqual([3.34, 3.33, 3.33])
    expect(splitTips(0, [{ profile_id: 'a', minutes: 300 }], 'hours')).toEqual([{ profile_id: 'a', minutes: 300, amount: 0 }])
  })

  it('minutes worked come from the timecards in the period', () => {
    const m = minutesWorked([
      { profile_id: 'a', work_date: '2026-09-21', paid_minutes: 420 }, { profile_id: 'a', work_date: '2026-09-27', paid_minutes: 300 },
      { profile_id: 'a', work_date: '2026-09-28', paid_minutes: 999 }, { profile_id: 'b', work_date: '2026-09-22', paid_minutes: 240 },
    ], '2026-09-21', '2026-09-27')
    expect([...m]).toEqual([['a', 720], ['b', 240]])
  })

  it('my tips: from pools shared out with me, and what’s still to be paid', () => {
    const pool = (status: TipPool['status'], amount: number): TipPool => ({ id: status, starts_on: '2026-09-21', ends_on: '2026-09-27', cash: amount, card: 0,
      split: 'hours', status, notes: null, created_at: '', shares: [{ profile_id: 'me', minutes: 60, amount }, { profile_id: 'other', minutes: 60, amount: 1 }] })
    const mine = myTips([pool('paid', 40), pool('shared', 12.5), pool('draft', 99)], 'me')
    expect(mine.total).toBe(52.5)
    expect(mine.unpaid).toBe(12.5)
    expect(mine.list).toHaveLength(2)
  })

  it('tips on Square: owners get everyone linked and what nobody here took; anyone else only their own', () => {
    const byMember: Record<string, MemberTips> = {
      TM_julio: { tips: 3.5, tipped: 3, days: { '2026-09-29': { tips: 2, tipped: 2 }, '2026-09-28': { tips: 1.5, tipped: 1 } } },
      TM_aron: { tips: 1, tipped: 1, days: { '2026-09-28': { tips: 1, tipped: 1 } } },
      '': { tips: 0.25, tipped: 1, days: { '2026-09-29': { tips: 0.25, tipped: 1 } } },
    }
    // Maria is linked but left no tips; Aron's Square login isn't linked to him.
    const links = [{ profile_id: 'maria', team_member_id: 'TM_maria' }, { profile_id: 'julio', team_member_id: 'TM_julio' }]
    const owner = tipsByPerson(byMember, links, { me: 'aron', everyone: true })
    expect(owner.status).toBe('ok')
    expect(owner.people.map(p => [p.profile_id, p.tips, p.tipped])).toEqual([['julio', 3.5, 3], ['maria', 0, 0]])
    expect(owner.people[0].days).toEqual([{ date: '2026-09-28', tips: 1.5, tipped: 1 }, { date: '2026-09-29', tips: 2, tipped: 2 }])
    expect(owner.unlinked).toEqual({ tips: 1.25, tipped: 2 })
    const julio = tipsByPerson(byMember, links, { me: 'julio', everyone: false })
    expect(julio.people.map(p => p.profile_id)).toEqual(['julio'])
    expect(julio.unlinked).toBeNull()
    expect(tipsByPerson(byMember, links, { me: 'aron', everyone: false })).toEqual({ status: 'not_linked', people: [], unlinked: null })
  })
})
