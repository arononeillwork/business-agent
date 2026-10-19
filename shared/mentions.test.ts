import { describe, expect, it } from 'vitest'
import { mentionTitle, mentionsIn } from './mentions'
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
  })
})
