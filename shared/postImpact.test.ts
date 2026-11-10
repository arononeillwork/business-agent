import { describe, expect, it } from 'vitest'
import { extraFollowers, followerDays, ownPost, postAbout, postImpacts } from './postImpact'
import type { Mention } from './mentions'

// New followers each day: about 5 a day, then Nora's reel on the 10th brings a jump.
const DAYS: Record<string, number> = {
  '2026-11-03': 4, '2026-11-04': 6, '2026-11-05': 5, '2026-11-06': 5, '2026-11-07': 4, '2026-11-08': 6, '2026-11-09': 5,
  '2026-11-10': 36, '2026-11-11': 22, '2026-11-12': 9, '2026-11-13': 5,
}
const days = new Map(Object.entries(DAYS))
const collab: Mention = {
  id: 'collab:DfNora0001', kind: 'collab', username: 'nora.eats.mbl', media_url: 'https://cdn.example/nora.jpg', permalink: 'https://www.instagram.com/reel/DfNora0001/',
  caption: 'Best ube latte', mentioned_at: '2026-11-10T18:30:00+0000', video: true, likes: 1180, comments: 64, views: 14200, shares: null, saves: null,
}
const own = ownPost({ id: 'ig-1', url: 'https://www.instagram.com/p/1/', caption: 'Autumn menu', at: '2026-11-05T09:00:00.000Z', thumbnail: null,
  reach: 900, likes: 80, comments: 4, saves: 10, shares: 2, views: 1800, follows: 3, video: false })

describe('What each post did', () => {
  it('the followers gained the day it went out and the two after, against the week before', () => {
    const [nora] = postImpacts([postAbout(collab)], days)
    expect(nora).toMatchObject({ by: 'collab', username: 'nora.eats.mbl', video: true, likes: 1180, views: 14200, gained: 67, days: 3, shared: false, soon: false, added: false })
    // A usual day of the 7 before: 5 new followers, so 15 in three days.
    expect(nora.usual).toBe(15)
    expect(extraFollowers(nora)).toBe(52)
  })

  it('a post from yesterday counts the days in so far; one from today is too soon to tell', () => {
    const late = { ...collab, id: 'late', mentioned_at: '2026-11-12T10:00:00Z' }
    const today = { ...collab, id: 'today', mentioned_at: '2026-11-14T10:00:00Z' }
    const [t, l] = postImpacts([postAbout(late), postAbout(today)], days)
    // Its week before has Nora's jump in it: a usual day is still 5 (the middle one), so 10 in two days.
    expect(l).toMatchObject({ id: 'late', gained: 14, days: 2, usual: 10 })
    expect(t).toMatchObject({ id: 'today', gained: null, usual: null, days: 0, soon: true })
  })

  it('days not known (before Instagram’s 30 days and before the app kept them): not known, not zero', () => {
    const old = { ...collab, id: 'old', mentioned_at: '2026-09-01T10:00:00Z' }
    expect(postImpacts([postAbout(old)], days)[0]).toMatchObject({ gained: null, usual: null, soon: false })
    // Fewer than three days before it to go by: no usual, the gain still shows.
    expect(postImpacts([postAbout({ ...collab, mentioned_at: '2026-11-04T10:00:00Z' })], days)[0]).toMatchObject({ gained: 16, usual: null })
  })

  it('a post about the café within the same days shares the followers (the café’s own are in the usual); newest first', () => {
    const out = postImpacts([own, ownPost({ ...own, id: 'ig-2', at: '2026-11-11T09:00:00Z' }), postAbout({ ...collab, id: 'a', mentioned_at: '2026-11-06T10:00:00Z' }), postAbout(collab)], days)
    expect(out.map(p => [p.id, p.shared])).toEqual([['ig-2', true], ['collab:DfNora0001', false], ['a', false], ['ig-1', true]])
    expect(out[3]).toMatchObject({ by: 'you', reach: 900, follows: 3, gained: 14 })
  })

  it('what Instagram says now goes over what was kept', () => {
    const merged = followerDays([{ date: '2026-11-01', value: 3 }, { date: '2026-11-02', value: 4 }], [{ date: '2026-11-02', value: 7 }])
    expect([...merged]).toEqual([['2026-11-01', 3], ['2026-11-02', 7]])
    expect(postAbout({ ...collab, added_by: 'admin-1' } as Mention & { added_by: string }).added).toBe(true)
  })
})
