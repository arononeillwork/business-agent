import { describe, expect, it } from 'vitest'
import { initials, matchesFilter, needsReply, preview, replyUntil, replyWindow, type InboxConversation, type InboxMessage } from './messages'

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

  it('after 24 hours a person can still reply for 7 days (human agent); then it’s closed', () => {
    const h = (n: number) => new Date(NOW + n * 3_600_000).toISOString()
    expect(replyWindow([m(2, false)], NOW)).toEqual({ mode: 'normal', until: h(22) })
    expect(replyWindow([m(30, false), m(1, true)], NOW)).toEqual({ mode: 'human_agent', until: h(7 * 24 - 30) })
    expect(replyWindow([m(7 * 24, false)], NOW)).toEqual({ mode: 'closed', until: null })
    expect(replyWindow([m(1, true)], NOW)).toEqual({ mode: 'closed', until: null }) // they never wrote
  })

  it('initials when there’s no profile photo', () => {
    expect(initials({ username: 'lucia.marbella', name: 'Lucía García' })).toBe('LG')
    expect(initials({ username: 'tom_runs', name: 'Tom' })).toBe('T')
    expect(initials({ username: '_ana', name: '🌸' })).toBe('A')
    expect(initials({ username: '___' })).toBe('?')
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
