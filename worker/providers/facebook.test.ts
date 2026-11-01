// Messenger chats on the Messages page: who each one is with, and their profile photo where
// Messenger's User Profile API shares it. A photo that can't be had never costs the chat list.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { conversation, conversations, profile, toProfile } from './facebook'

const s = { graphVersion: 'v23.0', pageId: 'page-1', token: 'page-token' }
const chat = (id: string, psid: string, name?: string) => ({
  id, updated_time: '2026-10-30T10:00:00+0000',
  participants: { data: [{ id: psid, ...(name ? { name } : {}) }, { id: 'page-1', name: 'Easy Beans Coffee' }] },
  messages: { data: [{ id: `${id}-m`, created_time: '2026-10-30T10:00:00+0000', from: { id: psid }, message: 'Hola' }] },
})

/** Meta's Graph API: the Page's chats, and what the profile API says about each person (404 for anyone not in `people`). */
function meta(people: Record<string, object>, chats = [chat('t_1', 'psid-1', 'Carmen Ruiz'), chat('t_2', 'psid-2', 'Tom')]) {
  return vi.fn(async (input: string | URL) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/page-1/conversations')) return Response.json({ data: chats })
    const who = url.pathname.split('/').pop()!
    if (url.searchParams.get('fields') === 'first_name,last_name,profile_pic') {
      return who in people ? Response.json({ id: who, ...people[who] }) : Response.json({ error: { message: '(#100) No profile available for that user.', code: 100 } }, { status: 400 })
    }
    const one = chats.find(c => c.id === who)
    return one ? Response.json(one) : Response.json({ error: { message: 'Unsupported get request', code: 100 } }, { status: 400 })
  })
}

describe('Messenger profile photos', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps the profile API’s answer: full name, and the photo only when it’s an https link', () => {
    expect(toProfile({ first_name: 'Carmen', last_name: 'Ruiz', profile_pic: 'https://platform-lookaside.fbsbx.com/p.jpg' }))
      .toEqual({ name: 'Carmen Ruiz', picture: 'https://platform-lookaside.fbsbx.com/p.jpg' })
    expect(toProfile({ first_name: 'Tom' })).toEqual({ name: 'Tom' })
    expect(toProfile({ name: 'Hotel Puente Romano', profile_pic: 'http://insecure.test/p.jpg' })).toEqual({ name: 'Hotel Puente Romano' })
    expect(toProfile({ profile_pic: 'javascript:alert(1)' })).toEqual({})
  })

  it('looks a person up with the Page token, once while the cache keeps them', async () => {
    const store = new Map<string, Response>()
    vi.stubGlobal('caches', { default: {
      match: async (k: string) => store.get(k)?.clone(),
      put: async (k: string, r: Response) => { store.set(k, r.clone()) },
    } })
    const fetch = meta({ 'psid-1': { first_name: 'Carmen', last_name: 'Ruiz', profile_pic: 'https://p.test/carmen.jpg' } })
    vi.stubGlobal('fetch', fetch)
    expect(await profile(s, 'psid-1')).toEqual({ name: 'Carmen Ruiz', picture: 'https://p.test/carmen.jpg' })
    expect(await profile(s, 'psid-1')).toEqual({ name: 'Carmen Ruiz', picture: 'https://p.test/carmen.jpg' })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v23.0/psid-1?fields=first_name,last_name,profile_pic')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer page-token')
  })

  it('a failed lookup is no photo, never an error', async () => {
    vi.stubGlobal('fetch', meta({}))
    expect(await profile(s, 'psid-9')).toEqual({})
    expect(await profile(s, '')).toEqual({})
  })

  it('the chat list carries each person’s photo, and keeps a chat whose photo can’t be had (initials instead)', async () => {
    vi.stubGlobal('fetch', meta({ 'psid-1': { first_name: 'Carmen', last_name: 'Ruiz', profile_pic: 'https://p.test/carmen.jpg' } }))
    const chats = await conversations(s)
    expect(chats.map(c => c.with)).toEqual([
      { id: 'psid-1', username: 'Carmen Ruiz', name: 'Carmen Ruiz', picture: 'https://p.test/carmen.jpg' },
      { id: 'psid-2', username: 'Tom', name: 'Tom' },
    ])
    expect((await conversation(s, 't_1')).conversation.with.picture).toBe('https://p.test/carmen.jpg')
  })

  it('a chat Messenger gives no name for takes the profile’s name', async () => {
    vi.stubGlobal('fetch', meta({ 'psid-3': { first_name: 'Ana', profile_pic: 'https://p.test/ana.jpg' } }, [chat('t_3', 'psid-3')]))
    expect((await conversations(s))[0].with).toEqual({ id: 'psid-3', username: 'Ana', name: 'Ana', picture: 'https://p.test/ana.jpg' })
  })
})
