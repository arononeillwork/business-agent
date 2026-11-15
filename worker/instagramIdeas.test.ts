// The Instagram Ideas chat (To Do List → Ideas), end to end through the Worker against stand-ins for
// Supabase, Instagram and the business's storage. What must never break:
//   - with no Ideas chat chosen, nothing is asked of Instagram
//   - the posts in the Ideas chat are kept as ideas once, with their notes; other chats' aren't
//   - pictures are copied into the business's own storage, a couple a run; a failing one is tried a few times, then left
//   - the Ideas chat isn't on the Messages page
//   - Check now is for the team, and reads the chat's 20 latest messages
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { ideas, maybeMore, readIdeasChat, COPY_TRIES } from './instagramIdeas'
import { businessDb, type Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import type { InboxMessage } from '../shared/messages'

const APP = 'https://app.test'
const stored: { key: string; type?: string }[] = []
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', INSTAGRAM_APP_ID: 'ig-app', INSTAGRAM_APP_SECRET: 'ig-secret',
  MEDIA: { put: async (key: string, _body: unknown, o?: { httpMetadata?: { contentType?: string } }) => { stored.push({ key, type: o?.httpMetadata?.contentType }); return {} } },
} as unknown as Env

let db: FakeSupabase
let apis: FakeProviders
/** Instagram's links to the chat's pictures: what each answers (gone: 404). */
let cdn: Record<string, { type: string } | 'gone'>
const asked: string[] = []
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext
const as = (who: 'admin' | 'staff') => ({ authorization: `Bearer ${who}-token`, 'content-type': 'application/json' })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-15T10:00:00Z'))
  db = new FakeSupabase()
  apis = new FakeProviders()
  stored.length = 0
  asked.length = 0
  cdn = {}
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    asked.push(url)
    if (url.startsWith('https://lookaside.fbsbx.test/')) {
      const file = cdn[url]
      if (!file || file === 'gone') return new Response('Not found', { status: 404 })
      return new Response(new Uint8Array([255, 216, 255, 0]), { headers: { 'content-type': file.type } })
    }
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

async function connectInstagram() {
  apis.instagram.permissions = 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_messages'
  const start = await integrations.request(`${APP}/api/integrations/instagram/start`, { method: 'POST', headers: as('admin'), body: '{}' }, env, ctx())
  const state = new URL((await start.json() as { url: string }).url).searchParams.get('state')!
  const res = await integrations.request(`${APP}/api/integrations/instagram/callback?code=c&state=${encodeURIComponent(state)}`, {}, env, ctx())
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe('instagram')
}

const ME = { id: '17841400000000001', username: 'easy.beans.coffee' }
const ARON = { id: 'igsid-aron', username: 'aron.oneill' }
const msg = (id: string, minute: number, from: typeof ME, more: Row = {}) =>
  ({ id, created_time: `2026-11-15T09:${String(minute).padStart(2, '0')}:00+0000`, from, message: '', ...more })
const shared = (asset: string) => ({ shares: { data: [{ link: `https://lookaside.fbsbx.test/${asset}` }] } })
/** The Ideas chat: Aron and the café sharing posts (newest first, as Instagram lists them). */
function ideasChat(messages: Row[]) {
  return { id: 'conv-ideas', updated_time: messages[0].created_time, participants: { data: [ME, ARON] }, messages: { data: messages } }
}
const kept = () => (db.tables.instagram_ideas ?? []).sort((a, b) => String(a.shared_at).localeCompare(String(b.shared_at)))
const read = (force = false) => readIdeasChat(env, businessDb(env, 1), APP, force)
const chooseChat = (username: string | null) => { db.tables.settings[0].idea_chat = username }

describe('the Instagram Ideas chat', () => {
  it('asks nothing of Instagram until an Ideas chat is chosen', async () => {
    await connectInstagram()
    asked.length = 0
    expect(await read()).toEqual({ chat: 'none', added: 0, copied: 0 })
    expect(asked.some(u => u.includes('instagram.com'))).toBe(false)
  })

  it('keeps the posts in the Ideas chat once, with their notes, and copies their pictures', async () => {
    await connectInstagram()
    chooseChat('aron.oneill')
    cdn = { 'https://lookaside.fbsbx.test/cups.jpg': { type: 'image/jpeg' }, 'https://lookaside.fbsbx.test/latte.webp': { type: 'image/webp' } }
    apis.instagram.chats = [
      ideasChat([
        msg('m3', 12, ME, shared('latte.webp')),
        msg('m2', 6, ARON, { message: 'love these cups' }),
        msg('m1', 5, ARON, shared('cups.jpg')),
      ]),
      // A customer's chat: their shared post is no idea.
      { id: 'conv-lucia', updated_time: '2026-11-15T09:30:00+0000', participants: { data: [ME, { id: 'igsid-lucia', username: 'lucia.marbella' }] },
        messages: { data: [msg('l1', 30, { id: 'igsid-lucia', username: 'lucia.marbella' }, shared('cake.jpg'))] } },
    ]
    expect(await read()).toEqual({ chat: 'read', added: 2, copied: 2 })
    expect(kept().map(i => [i.message_id, i.kind, i.username, i.note, i.media_kept, i.media_type])).toEqual([
      ['m1', 'post', 'aron.oneill', 'love these cups', true, 'image'],
      ['m3', 'post', 'easy.beans.coffee', null, true, 'image'],
    ])
    expect(kept().every(i => String(i.media_url).startsWith(`${APP}/media/posts/`))).toBe(true)
    expect(stored.map(s => s.type).sort()).toEqual(['image/jpeg', 'image/webp'])
    // Only five messages here, none kept before: the chats list had them all, so the chat itself wasn't read.
    expect(asked.some(u => u.includes('/conv-ideas?'))).toBe(false)

    // Read again: nothing new, nothing copied twice.
    expect(await read()).toEqual({ chat: 'read', added: 0, copied: 0 })
    expect(kept()).toHaveLength(2)
  })

  it('reads the chat itself when its 5 latest are all new, and on Check now', async () => {
    const recent = (n: number): InboxMessage[] => Array.from({ length: n }, (_, i) =>
      ({ id: `m${i}`, at: `2026-11-15T09:0${i}:00.000Z`, fromMe: false, text: '', kind: 'share', link: 'https://x.test' }))
    const now = Date.parse('2026-11-15T10:00:00Z')
    expect(maybeMore(recent(5), new Set(), now)).toBe(true)
    expect(maybeMore(recent(4), new Set(), now)).toBe(false)
    expect(maybeMore(recent(5), new Set(['m0']), now)).toBe(false)
    expect(maybeMore(recent(5), new Set(), now + 2 * 86_400_000)).toBe(false)

    await connectInstagram()
    chooseChat('aron.oneill')
    apis.instagram.chats = [ideasChat([1, 2, 3, 4, 5].map(i => msg(`m${i}`, i, ARON, shared(`p${i}.jpg`))))]
    asked.length = 0
    expect((await read()).added).toBe(5)
    expect(asked.filter(u => u.includes('/conv-ideas?'))).toHaveLength(1)

    // The page's Check now: the team may, and it reads the chat itself.
    asked.length = 0
    const res = await ideas.request(`${APP}/api/ideas/instagram/check`, { method: 'POST', headers: as('staff') }, env, ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ chat: 'read', added: 0 })
    expect(asked.filter(u => u.includes('/conv-ideas?'))).toHaveLength(1)
    expect((await ideas.request(`${APP}/api/ideas/instagram/check`, { method: 'POST' }, env, ctx())).status).toBe(401)
  })

  it('a picture that won’t copy is tried a few times, then Instagram’s link is left', async () => {
    await connectInstagram()
    chooseChat('aron.oneill')
    apis.instagram.chats = [ideasChat([msg('m1', 5, ARON, shared('gone.jpg'))])]
    cdn = { 'https://lookaside.fbsbx.test/gone.jpg': 'gone' }
    for (let i = 0; i < COPY_TRIES + 2; i++) await read()
    expect(kept()[0]).toMatchObject({ media_kept: false, media_tries: COPY_TRIES, media_url: 'https://lookaside.fbsbx.test/gone.jpg' })
    expect(asked.filter(u => u === 'https://lookaside.fbsbx.test/gone.jpg')).toHaveLength(COPY_TRIES)
  })

  it('a video too big to hold in memory isn’t copied, nor tried again', async () => {
    await connectInstagram()
    chooseChat('aron.oneill')
    apis.instagram.chats = [ideasChat([msg('m1', 5, ARON, { attachments: { data: [{ video_data: { url: 'https://lookaside.fbsbx.test/long.mp4' } }] } })])]
    cdn = { 'https://lookaside.fbsbx.test/long.mp4': { type: 'video/mp4' } }
    expect(await read()).toEqual({ chat: 'read', added: 1, copied: 0 })
    expect(kept()[0]).toMatchObject({ kind: 'video', media_type: 'video', media_kept: false, media_tries: COPY_TRIES })
    expect(stored).toHaveLength(0)
  })

  it('with no storage connected, Instagram’s link is kept and nothing is downloaded', async () => {
    await connectInstagram()
    chooseChat('aron.oneill')
    apis.instagram.chats = [ideasChat([msg('m1', 5, ARON, shared('cups.jpg'))])]
    cdn = { 'https://lookaside.fbsbx.test/cups.jpg': { type: 'image/jpeg' } }
    const noStorage = { ...env, MEDIA: undefined } as Env
    expect(await readIdeasChat(noStorage, businessDb(noStorage, 1), APP)).toEqual({ chat: 'read', added: 1, copied: 0 })
    expect(kept()[0]).toMatchObject({ media_kept: false, media_tries: 0, media_url: 'https://lookaside.fbsbx.test/cups.jpg' })
    expect(asked.some(u => u.startsWith('https://lookaside.fbsbx.test/'))).toBe(false)
  })

  it('isn’t on the Messages page', async () => {
    await connectInstagram()
    apis.instagram.chats = [ideasChat([msg('m1', 5, ARON, shared('cups.jpg'))]), ...apis.instagram.chats]
    const inbox = async () => (await (await integrations.request(`${APP}/api/integrations/instagram/inbox`, { headers: as('admin') }, env, ctx()))
      .json() as { conversations: { id: string }[] }).conversations.map(c => c.id)
    expect(await inbox()).toEqual(['conv-ideas', 'conv-1'])
    chooseChat('aron.oneill')
    expect(await inbox()).toEqual(['conv-1'])
  })
})
