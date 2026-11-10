import { describe, expect, it } from 'vitest'
import { STORY_REP_FOLLOWERS, collabMentions, mentionTitle, mentionsIn, peopleToPutForward, shortcodeOf, type Mention } from './mentions'
import type { InboxConversation, TaggedPost } from './messages'

const now = Date.parse('2026-10-20T12:00:00Z')
const chat = (recent: InboxConversation['recent']): InboxConversation =>
  ({ id: 'c1', platform: 'instagram', updatedAt: '2026-10-20T10:00:00Z', with: { id: 'u1', username: 'lucia.mbl' }, recent })

describe('Instagram mentions', () => {
  it('finds story mentions from other people and tagged posts, newest first', () => {
    const chats = [chat([
      { id: 'm1', at: '2026-10-20T09:00:00Z', fromMe: false, text: '', kind: 'story_mention', mediaUrl: 'https://cdn.example/story.jpg' },
      { id: 'm2', at: '2026-10-20T09:05:00Z', fromMe: false, text: 'Hola!', kind: 'text' },
      { id: 'm3', at: '2026-10-20T09:10:00Z', fromMe: true, text: '', kind: 'story_mention', mediaUrl: 'https://cdn.example/ours.jpg' },
    ])]
    const tagged: TaggedPost[] = [
      { id: 'p1', username: 'brunchclub', caption: 'Best flat white', mediaUrl: 'https://cdn.example/p1.jpg', permalink: 'https://instagram.com/p/p1', at: '2026-10-19T08:00:00Z' },
    ]
    expect(mentionsIn(chats, tagged, now).map(m => [m.id, m.kind, m.username])).toEqual([
      ['story:m1', 'story', 'lucia.mbl'], ['post:p1', 'post', 'brunchclub'],
    ])
  })

  it('leaves out mentions older than a week and ones without a photo or video', () => {
    const tagged: TaggedPost[] = [
      { id: 'old', username: 'a', mediaUrl: 'https://cdn.example/a.jpg', permalink: 'x', at: '2026-10-01T08:00:00Z' },
      { id: 'blank', username: 'b', permalink: 'y', at: '2026-10-20T08:00:00Z' },
    ]
    expect(mentionsIn([], tagged, now)).toEqual([])
  })

  it('names who mentioned the business', () => {
    expect(mentionTitle({ kind: 'story', username: 'lucia.mbl' })).toBe('@lucia.mbl mentioned you in their story')
    expect(mentionTitle({ kind: 'post', username: null })).toBe('Someone tagged you in a post')
    expect(mentionTitle({ kind: 'collab', username: 'nora.eats.mbl', video: true })).toBe('@nora.eats.mbl posted a reel with you')
    expect(mentionTitle({ kind: 'collab', username: 'nora.eats.mbl' })).toBe('@nora.eats.mbl posted with you')
  })
})

describe('Collab posts', () => {
  it('reads a post’s short code from its link, however it was shared', () => {
    expect(shortcodeOf('https://www.instagram.com/reel/DfjbumRCHYO/')).toBe('DfjbumRCHYO')
    expect(shortcodeOf('instagram.com/p/DfjbumRCHYO?igsh=abc')).toBe('DfjbumRCHYO')
    expect(shortcodeOf('https://www.instagram.com/nora.eats.mbl/reel/DfjbumRCHYO/')).toBe('DfjbumRCHYO')
    expect(shortcodeOf('https://www.instagram.com/easy.beans.coffee/')).toBeNull()
    expect(shortcodeOf('https://example.com/reel/DfjbumRCHYO/')).toBeNull()
  })

  it('every collab Instagram lists, however old, keyed by its short code, with its figures and the poster’s followers when known', () => {
    const chats = [{ ...chat([]), with: { id: 'u2', username: 'nora.eats.mbl', followers: 8900 } }]
    const out = collabMentions([
      { id: '1790', username: 'Nora.Eats.MBL', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/DfNora0001/',
        timestamp: '2026-06-01T18:30:00+0000', thumbnail_url: 'https://cdn.example/n.jpg', media_url: 'https://cdn.example/n.mp4',
        total_like_count: 1180, total_comments_count: 64, total_views_count: 14200 },
      { id: '1791', username: 'tomas.runs', media_type: 'IMAGE', timestamp: '2026-10-19T08:00:00+0000', media_url: 'https://cdn.example/t.jpg', like_count: 21 },
    ], chats, '2026-10-20T12:00:00Z')
    expect(out[0]).toMatchObject({ id: 'collab:1791', kind: 'collab', username: 'tomas.runs', video: false, media_url: 'https://cdn.example/t.jpg', likes: 21, views: null })
    expect(out[1]).toMatchObject({ id: 'collab:DfNora0001', username: 'nora.eats.mbl', video: true, media_url: 'https://cdn.example/n.jpg',
      likes: 1180, comments: 64, views: 14200, followers: 8900, figures_at: '2026-10-20T12:00:00Z' })
  })
})

describe('Putting the people who post about the café forward as reps', () => {
  const m = (id: string, kind: Mention['kind'], username: string | null, followers: number | null = null, at = '2026-10-19T10:00:00Z') =>
    ({ id, kind, username, followers, mentioned_at: at })

  it('anyone who posts a post or reel; a story only from 1,000 followers', () => {
    const out = peopleToPutForward([
      m('collab:a', 'collab', 'nora.eats.mbl'), m('post:b', 'post', 'tomas.runs', 200),
      m('story:c', 'story', 'small.account', 300), m('story:d', 'story', 'brunch.club', STORY_REP_FOLLOWERS), m('story:e', 'story', 'unknown.followers'),
    ], new Set(), 'easy.beans.coffee')
    expect(out.map(p => [p.username, p.mention_id])).toEqual([['nora.eats.mbl', 'collab:a'], ['tomas.runs', 'post:b'], ['brunch.club', 'story:d']])
  })

  it('not the café, not anyone known, one each for their latest post, with what their chat says about them', () => {
    const chats = [{ ...chat([]), with: { id: 'u3', username: 'nora.eats.mbl', name: 'Nora', picture: 'https://cdn.example/nora.jpg', followers: 8900 } }]
    const out = peopleToPutForward([
      m('collab:old', 'collab', 'Nora.Eats.MBL', null, '2026-10-01T10:00:00Z'), m('collab:new', 'collab', 'nora.eats.mbl', null, '2026-10-18T10:00:00Z'),
      m('post:self', 'post', 'easy.beans.coffee'), m('post:rep', 'post', 'sanpedro.eats'), m('post:x', 'post', null), m('post:y', 'post', 'not a handle'),
    ], new Set(['sanpedro.eats']), 'easy.beans.coffee', chats)
    expect(out).toEqual([{ username: 'nora.eats.mbl', mention_id: 'collab:new', followers: 8900, name: 'Nora', picture: 'https://cdn.example/nora.jpg' }])
  })
})
