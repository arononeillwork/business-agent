import { describe, expect, it } from 'vitest'
import { creatorBoard } from './creators'
import type { PostImpact } from './postImpact'

const post = (id: string, username: string | null, more: Partial<PostImpact> = {}): PostImpact => ({
  id, by: username ? 'collab' : 'you', username, url: null, caption: '', at: '2026-11-01T10:00:00Z', thumbnail: null, video: true,
  views: null, reach: null, likes: null, comments: null, shares: null, saves: null, follows: null,
  gained: null, usual: null, days: 0, shared: false, soon: false, added: false, ...more,
})

describe('Who posts about the café', () => {
  it('one line each, best first: followers over the usual, then views; the café’s own posts aren’t on it', () => {
    const board = creatorBoard([
      post('own', null, { gained: 99, usual: 1, days: 3 }),
      post('n1', 'nora.eats.mbl', { views: 14200, likes: 1180, comments: 64, gained: 54, usual: 15, days: 3, at: '2026-11-07T18:00:00Z' }),
      post('n2', 'Nora.Eats.MBL', { by: 'story', video: false, gained: 20, usual: 18, days: 3, at: '2026-11-02T18:00:00Z' }),
      post('b1', 'marbella.brunchclub', { views: 38600, likes: 2940, gained: 40, usual: 39, days: 3 }),
      post('t1', 'tomas.runs', { views: 2100, likes: 214 }),
      post('l1', 'lola.runs', { views: 5000 }),
    ])
    expect(board.map(c => [c.username, c.extra])).toEqual([['nora.eats.mbl', 41], ['marbella.brunchclub', 1], ['lola.runs', null], ['tomas.runs', null]])
    expect(board[0]).toMatchObject({ reels: 1, views: 14200, likes: 1180, comments: 64, gained: 74, last_at: '2026-11-07T18:00:00Z' })
    expect(board[0].posts.map(p => p.id)).toEqual(['n1', 'n2'])
  })

  it('a post with followers but no usual counts in what came in, not in what’s over the usual', () => {
    const [c] = creatorBoard([post('a', 'x', { gained: 30, usual: null, days: 3 }), post('b', 'x', { gained: 10, usual: 4, days: 3 })])
    expect(c).toMatchObject({ gained: 40, extra: 6 })
  })
})
