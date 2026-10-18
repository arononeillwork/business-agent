// Every kind of Instagram message the Messages page shows, from the shapes Instagram sends.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { person, sendText, toInboxMessage, type RawMessage } from './instagram'

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

describe('Instagram people and replies', () => {
  const cfg = { token: 't', userId: '178', graphVersion: 'v23.0' }
  afterEach(() => vi.unstubAllGlobals())
  const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

  it('a person’s name and photo; looked up again only after the cache has expired', async () => {
    const store = new Map<string, Response>()
    vi.stubGlobal('caches', { default: {
      match: async (k: string) => store.get(k)?.clone(),
      put: async (k: string, r: Response) => { store.set(k, r.clone()) },
    } })
    const fetch = answer({ id: 'igsid', name: 'Ana', username: 'ana', profile_pic: 'https://p.jpg' })
    vi.stubGlobal('fetch', fetch)
    expect(await person(cfg, 'igsid')).toEqual({ name: 'Ana', username: 'ana', picture: 'https://p.jpg' })
    expect(await person(cfg, 'igsid')).toEqual({ name: 'Ana', username: 'ana', picture: 'https://p.jpg' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe('https://graph.instagram.com/v23.0/igsid?fields=name,username,profile_pic')
  })

  it('a failed lookup is no photo, never an error', async () => {
    vi.stubGlobal('fetch', answer({ error: { message: '(#100) The user can not be found' } }, 400))
    expect(await person(cfg, 'blocked')).toEqual({})
    expect(await person(cfg, '')).toEqual({})
  })

  it('a reply after 24 hours carries the human agent tag', async () => {
    const fetch = answer({ message_id: 'mid' })
    vi.stubGlobal('fetch', fetch)
    await sendText(cfg, 'igsid', 'Hi', 'HUMAN_AGENT')
    await sendText(cfg, 'igsid', 'Hi again')
    const bodies = fetch.mock.calls.map(c => JSON.parse(String(((c as unknown[])[1] as RequestInit).body)))
    expect(bodies).toEqual([
      { recipient: { id: 'igsid' }, message: { text: 'Hi' }, messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' },
      { recipient: { id: 'igsid' }, message: { text: 'Hi again' } },
    ])
  })
})
