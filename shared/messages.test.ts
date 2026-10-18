import { describe, expect, it } from 'vitest'
import { matchesFilter, needsReply, preview, replyUntil, type InboxConversation, type InboxMessage } from './messages'

const NOW = Date.parse('2026-10-18T12:00:00Z')
const m = (hoursAgo: number, fromMe: boolean, extra: Partial<InboxMessage> = {}): InboxMessage =>
  ({ id: String(hoursAgo), at: new Date(NOW - hoursAgo * 3_600_000).toISOString(), fromMe, text: 'hi', kind: 'text', ...extra })
const chat = (recent: InboxMessage[]): InboxConversation =>
  ({ id: 'c', platform: 'instagram', with: { id: 'u', username: 'ana' }, updatedAt: recent[0].at, recent })

describe('Messages rules', () => {
  it('a reply is possible for 24 hours after the customer’s last message, whoever wrote since', () => {
    expect(replyUntil([m(30, false), m(2, false), m(1, true)], NOW)).toBe(new Date(NOW + 22 * 3_600_000).toISOString())
    expect(replyUntil([m(25, false), m(1, true)], NOW)).toBeNull()
    expect(replyUntil([m(1, true)], NOW)).toBeNull()
  })

  it('needs a reply while the customer wrote last', () => {
    expect(needsReply(chat([m(1, false), m(2, true)]))).toBe(true)
    expect(needsReply(chat([m(1, true), m(2, false)]))).toBe(false)
  })

  it('filters by what customers sent: mentions, story replies, shared posts', () => {
    const mention = chat([m(1, false, { kind: 'story_mention' })])
    const mine = chat([m(1, true, { kind: 'share' })])
    expect(matchesFilter(mention, 'mentions')).toBe(true)
    expect(matchesFilter(mention, 'shares')).toBe(false)
    expect(matchesFilter(mine, 'shares')).toBe(false) // only what customers sent counts
    expect(matchesFilter(mine, 'all')).toBe(true)
  })

  it('previews say what a message is', () => {
    expect(preview(m(1, false, { kind: 'story_mention', text: '' }))).toBe('Mentioned you in their story')
    expect(preview(m(1, false, { kind: 'story_reply', text: 'Iced?' }))).toBe('Replied to your story: Iced?')
    expect(preview(m(1, true, { text: 'See you' }))).toBe('You: See you')
    expect(preview(undefined)).toBe('No messages yet')
  })
})
