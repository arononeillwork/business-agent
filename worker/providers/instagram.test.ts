// Every kind of Instagram message the Messages page shows, from the shapes Instagram sends.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { conversation, fillLeftOut, leftOut, person, sendText, toInboxMessage, type RawMessage } from './instagram'

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
    // As webhooks say it: the story inside reply_to, its address as `url`.
    expect(toInboxMessage(msg({ story: { reply_to: { story: { url: 'https://s/4.jpg', id: '4' } } } }), me)).toMatchObject({ kind: 'story_reply', mediaUrl: 'https://s/4.jpg' })
  })

  it('a story reply that sent a photo, GIF, sticker or voice note shows what was sent, not the story', () => {
    const story = { reply_to: { link: 'https://s/story.jpg', id: '9' } }
    expect(toInboxMessage(msg({ story, attachments: { data: [{ image_data: { url: 'https://gif.gif' } }] } }), me))
      .toMatchObject({ kind: 'story_reply', mediaUrl: 'https://gif.gif', attached: 'image' })
    expect(toInboxMessage(msg({ story, attachments: { data: [{ file_url: 'https://a.m4a', mime_type: 'audio/mp4' }] } }), me))
      .toMatchObject({ kind: 'story_reply', mediaUrl: 'https://a.m4a', attached: 'audio' })
    // An attachment with nothing in it: the story's picture, as before.
    expect(toInboxMessage(msg({ story, attachments: { data: [{}] } }), me)).toMatchObject({ kind: 'story_reply', mediaUrl: 'https://s/story.jpg' })
    expect(toInboxMessage(msg({ story, attachments: { data: [{}] } }), me).attached).toBeUndefined()
  })

  it('what a chat’s read left out: a story reply without words or anything sent, or a message with nothing at all', () => {
    const story = { reply_to: { link: 'https://s/story.jpg', id: '9' } }
    expect(leftOut(toInboxMessage(msg({ story }), me))).toBe(true)
    expect(leftOut(toInboxMessage(msg({ story, message: '😍' }), me))).toBe(false)
    expect(leftOut(toInboxMessage(msg({ story, attachments: { data: [{ image_data: { url: 'https://gif.gif' } }] } }), me))).toBe(false)
    expect(leftOut(toInboxMessage(msg({ story: { mention: { link: 'https://s/1.jpg' } } }), me))).toBe(false) // a mention says nothing
    expect(leftOut(toInboxMessage(msg({ story: { mention: {} } }), me))).toBe(true)
    expect(leftOut(toInboxMessage(msg({ shares: { data: [{}] } }), me))).toBe(true)
    expect(leftOut(toInboxMessage(msg({ message: 'Hola' }), me))).toBe(false)
    expect(leftOut(toInboxMessage(msg({ is_unsupported: true }), me))).toBe(false)
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
    const fetch = answer({ id: 'igsid', name: 'Ana', username: 'ana', profile_pic: 'https://p.jpg', follower_count: 2300 })
    vi.stubGlobal('fetch', fetch)
    expect(await person(cfg, 'igsid')).toEqual({ name: 'Ana', username: 'ana', picture: 'https://p.jpg', followers: 2300 })
    expect(await person(cfg, 'igsid')).toEqual({ name: 'Ana', username: 'ana', picture: 'https://p.jpg', followers: 2300 })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe('https://graph.instagram.com/v23.0/igsid?fields=name,username,profile_pic,follower_count')
  })

  it('asks again without followers when Instagram refuses that field', async () => {
    const fetch = vi.fn(async (url: string) => (String(url).includes('follower_count')
      ? new Response(JSON.stringify({ error: { message: '(#100) Tried accessing nonexisting field (follower_count)' } }), { status: 400 })
      : new Response(JSON.stringify({ id: 'igsid2', name: 'Bea', username: 'bea', profile_pic: 'https://b.jpg' }), { status: 200 })))
    vi.stubGlobal('fetch', fetch)
    expect(await person(cfg, 'igsid2')).toEqual({ name: 'Bea', username: 'bea', picture: 'https://b.jpg' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('a failed lookup is no photo, never an error', async () => {
    vi.stubGlobal('fetch', answer({ error: { message: '(#100) The user can not be found' } }, 400))
    expect(await person(cfg, 'blocked')).toEqual({})
    expect(await person(cfg, '')).toEqual({})
  })

  it('an opened chat reads a story reply it got empty again on its own, keeping who sent it and its reactions', async () => {
    const empty = msg({ id: 'sr', story: { reply_to: { link: 'https://s/story.jpg', id: '9' } }, reactions: { data: [{ emoji: '❤️' }] } })
    const fetch = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/sr?')) return new Response(JSON.stringify({ id: 'sr', created_time: '2026-10-18T10:00:00+0000', message: 'Iced please!', story: { reply_to: { link: 'https://s/story.jpg', id: '9' } } }))
      if (u.includes('/chat1?')) {
        return new Response(JSON.stringify({ id: 'chat1', updated_time: '2026-10-18T10:00:00+0000', participants: { data: [{ id: 'igsid', username: 'ana' }, { id: '178', username: 'easy.beans.coffee' }] },
          messages: { data: [empty, msg({ id: 'hi', message: 'Hola', created_time: '2026-10-18T09:00:00+0000' })] } }))
      }
      return new Response(JSON.stringify({}))
    })
    vi.stubGlobal('fetch', fetch)
    const { messages } = await conversation(cfg, me, 'chat1', true)
    expect(messages.map(m => [m.id, m.kind, m.text])).toEqual([['hi', 'text', 'Hola'], ['sr', 'story_reply', 'Iced please!']])
    expect(messages[1]).toMatchObject({ fromMe: false, reactions: ['❤️'], mediaUrl: 'https://s/story.jpg' })
    // Only the empty one is read on its own; a reply sent from here doesn't (`fill` off).
    expect(fetch.mock.calls.filter(c => String((c as unknown[])[0]).includes('/sr?'))).toHaveLength(1)
    fetch.mockClear()
    await conversation(cfg, me, 'chat1')
    expect(fetch.mock.calls.filter(c => String((c as unknown[])[0]).includes('/sr?'))).toHaveLength(0)
  })

  it('still empty on its own (or refused): the chat’s read stays, and only the newest few are asked for', async () => {
    const story = { reply_to: { link: 'https://s/story.jpg', id: '9' } }
    const raw = Array.from({ length: 9 }, (_, i) => msg({ id: `e${i}`, created_time: `2026-10-18T10:0${i}:00+0000`, story }))
    const fetch = vi.fn(async (url: string) => (String(url).includes('/e8?')
      ? new Response(JSON.stringify({ error: { message: '(#100) Message has been deleted' } }), { status: 400 })
      : new Response(JSON.stringify({ id: 'x', created_time: '2026-10-18T10:00:00+0000', story }))))
    vi.stubGlobal('fetch', fetch)
    const filled = await fillLeftOut(cfg, me, raw)
    expect(filled.map(m => m.id)).toEqual(raw.map(m => m.id))
    expect(filled.every(m => leftOut(toInboxMessage(m, me)))).toBe(true)
    // The 6 newest (e8 … e3); each read plainly, then with its parts named as it's still empty.
    const asked = new Set(fetch.mock.calls.map(c => String((c as unknown[])[0]).match(/\/(e\d)\?/)?.[1]))
    expect([...asked].sort()).toEqual(['e3', 'e4', 'e5', 'e6', 'e7', 'e8'])
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
