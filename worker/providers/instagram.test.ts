// Every kind of Instagram message the Messages page shows, from the shapes Instagram sends.
import { describe, expect, it } from 'vitest'
import { toInboxMessage, type RawMessage } from './instagram'

const me = { id: '178', username: 'easy.beans.coffee' }
const msg = (extra: Partial<RawMessage>): RawMessage => ({ id: 'm', created_time: '2026-10-18T10:00:00+0000', from: { id: 'igsid', username: 'ana' }, message: '', ...extra })

describe('Instagram messages', () => {
  it('text, and who sent it (by id, or by username when Instagram gives another id)', () => {
    expect(toInboxMessage(msg({ message: 'Hola' }), me)).toMatchObject({ kind: 'text', text: 'Hola', fromMe: false })
    expect(toInboxMessage(msg({ from: { id: '178' } }), me).fromMe).toBe(true)
    expect(toInboxMessage(msg({ from: { id: 'other', username: 'easy.beans.coffee' } }), me).fromMe).toBe(true)
  })

  it('story mentions and story replies, in either shape Instagram uses', () => {
    expect(toInboxMessage(msg({ story: { mention: { link: 'https://s/1.jpg', id: '1' } } }), me)).toMatchObject({ kind: 'story_mention', mediaUrl: 'https://s/1.jpg' })
    expect(toInboxMessage(msg({ story: { reply_to: { link: 'https://s/2.jpg', id: '2' } }, message: 'Iced?' }), me)).toMatchObject({ kind: 'story_reply', text: 'Iced?' })
    expect(toInboxMessage(msg({ story: { data: [{ type: 'story_mention', url: 'https://s/3.jpg' }] } }), me)).toMatchObject({ kind: 'story_mention', mediaUrl: 'https://s/3.jpg' })
  })

  it('shared posts and reels keep their link', () => {
    expect(toInboxMessage(msg({ shares: { data: [{ url: 'https://instagram.com/p/x', name: 'Cake' }] } }), me))
      .toMatchObject({ kind: 'share', link: 'https://instagram.com/p/x', text: 'Cake' })
  })

  it('photos, videos, voice messages and files', () => {
    expect(toInboxMessage(msg({ attachments: { data: [{ image_data: { url: 'https://i.jpg' } }] } }), me)).toMatchObject({ kind: 'image', mediaUrl: 'https://i.jpg' })
    expect(toInboxMessage(msg({ attachments: { data: [{ video_data: { url: 'https://v.mp4', preview_url: 'https://v.jpg' } }] } }), me)).toMatchObject({ kind: 'video', mediaUrl: 'https://v.jpg' })
    expect(toInboxMessage(msg({ attachments: { data: [{ file_url: 'https://a.m4a', mime_type: 'audio/mp4' }] } }), me)).toMatchObject({ kind: 'audio' })
    expect(toInboxMessage(msg({ attachments: { data: [{ file_url: 'https://f.pdf', name: 'menu.pdf' }] } }), me)).toMatchObject({ kind: 'file', mediaUrl: 'https://f.pdf' })
  })

  it('messages Instagram won’t share, and reactions', () => {
    expect(toInboxMessage(msg({ is_unsupported: true }), me).kind).toBe('unsupported')
    expect(toInboxMessage(msg({ message: 'Thanks', reactions: { data: [{ reaction: 'love', emoji: '❤️' }] } }), me).reactions).toEqual(['❤️'])
  })
})
