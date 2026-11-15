// Ideas from the Instagram Ideas chat (shared/instagramIdeas.ts). What must never break:
//   - every post, reel, photo or video in the chat is an idea, from either side, under who sent it
//   - a reel is told from a post by its address; a shared post whose link is only its picture keeps the picture
//   - what's written just after a post (or just before, with no post before it) is its note; the other side's words aren't
//   - the Ideas chat is the business's chat with itself, or the one with the account an admin chose, whatever its case
import { describe, expect, it } from 'vitest'
import { ideaChatIn, ideasIn, permalinkOf } from './instagramIdeas'
import type { InboxMessage } from './messages'

const chat = { with: { id: 'igsid-aron', username: 'aron.oneill' } }
const at = (min: number) => new Date(Date.UTC(2026, 10, 15, 9, min)).toISOString()
const m = (id: string, min: number, x: Partial<InboxMessage> = {}): InboxMessage => ({ id, at: at(min), fromMe: false, text: '', kind: 'text', ...x })

describe('ideas in the Ideas chat', () => {
  it('posts, reels, photos and videos, from either side, oldest first', () => {
    const ideas = ideasIn(chat, [
      m('4', 40, { kind: 'video', mediaUrl: 'https://lookaside.fbsbx.test/v.mp4' }),
      m('1', 0, { kind: 'share', link: 'https://www.instagram.com/reel/DfReel01/?igsh=abc', mediaUrl: 'https://lookaside.fbsbx.test/r.jpg' }),
      m('2', 10, { kind: 'share', link: 'https://lookaside.fbsbx.test/ig_messaging_cdn/?asset_id=9' }),
      m('3', 20, { kind: 'image', fromMe: true, mediaUrl: 'https://lookaside.fbsbx.test/p.jpg' }),
      m('5', 50, { kind: 'text', text: 'hello' }),
      m('6', 55, { kind: 'audio', mediaUrl: 'https://lookaside.fbsbx.test/a.mp4' }),
    ], 'easy.beans.coffee')
    expect(ideas.map(i => [i.message_id, i.kind, i.username])).toEqual([
      ['1', 'reel', 'aron.oneill'], ['2', 'post', 'aron.oneill'], ['3', 'photo', 'easy.beans.coffee'], ['4', 'video', 'aron.oneill'],
    ])
    expect(ideas[0]).toMatchObject({ permalink: 'https://www.instagram.com/reel/DfReel01/', media_url: 'https://lookaside.fbsbx.test/r.jpg', shared_at: at(0) })
    // Instagram gave only the shared post's picture: kept as its picture, with nowhere to open it.
    expect(ideas[1]).toMatchObject({ permalink: null, media_url: 'https://lookaside.fbsbx.test/ig_messaging_cdn/?asset_id=9' })
  })

  it('what the same side writes around a post is its note', () => {
    const ideas = ideasIn(chat, [
      m('t0', 0, { text: 'For the summer menu:' }),
      m('p1', 2, { kind: 'share', link: 'https://www.instagram.com/p/DfPost01/', mediaUrl: 'https://x.test/1.jpg' }),
      m('t1', 3, { text: 'love the cups' }),
      m('t2', 3, { text: 'ask Julio', fromMe: true }),
      m('p2', 30, { kind: 'share', link: 'https://www.instagram.com/p/DfPost02/', mediaUrl: 'https://x.test/2.jpg', fromMe: true }),
      m('t3', 33, { text: 'this one too', fromMe: true }),
      m('t4', 50, { text: 'too late to be a note' }),
    ], 'easy.beans.coffee')
    expect(ideas.map(i => i.note)).toEqual(['For the summer menu:\nlove the cups', 'this one too'])
  })

  it('a shared post’s caption is its note', () => {
    const [idea] = ideasIn(chat, [m('p', 0, { kind: 'share', link: 'https://instagram.com/p/DfPost03', text: 'Matcha cloud ☁️' })], null)
    expect(idea).toMatchObject({ note: 'Matcha cloud ☁️', permalink: 'https://instagram.com/p/DfPost03/', media_url: null })
  })

  it('knows a post’s own address', () => {
    expect(permalinkOf('https://www.instagram.com/someone/p/DfPost04/?img_index=2')).toBe('https://www.instagram.com/someone/p/DfPost04/')
    expect(permalinkOf('https://www.instagram.com/reels/DfReel02')).toBe('https://www.instagram.com/reels/DfReel02/')
    expect(permalinkOf('https://www.instagram.com/aron.oneill/')).toBeNull()
    expect(permalinkOf(undefined)).toBeNull()
  })

  it('the Ideas chat is the business’s chat with itself, or the one with the account an admin chose', () => {
    const self = { id: '1784', username: 'easy.beans.coffee' }
    const chats = [{ with: { id: '1', username: 'lucia.marbella' } }, { with: { id: '2', username: 'Aron.ONeill' } }, { with: { id: 'igsid-9', username: 'Easy.Beans.Coffee' } }]
    expect(ideaChatIn(chats, null, self)?.with.id).toBe('igsid-9')
    expect(ideaChatIn([{ with: { id: '1784', username: 'instagram user' } }], null, self)?.with.id).toBe('1784')
    expect(ideaChatIn(chats, 'aron.oneill', self)?.with.id).toBe('2')
    expect(ideaChatIn(chats, 'someone.else', self)).toBeUndefined()
    expect(ideaChatIn(chats.slice(0, 2), null, self)).toBeUndefined()
  })
})
