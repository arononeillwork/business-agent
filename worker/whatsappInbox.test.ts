// WhatsApp chats on the Messages page, end to end through the Worker's routes, against stand-ins for
// Supabase (tables and storage) and Meta. What must never break:
//   - every message is kept as the webhook delivers it (once, however often Meta retries), with its photo
//   - replies go only within WhatsApp's 24 hours, and show in the chat with how far they got
//   - Data retention: choosing a shorter time deletes what's now too old straight away, files included
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drainOutbox, integrations } from './integrations'
import { purge, templateText } from './whatsappInbox'
import { businessDb, type Env } from './supabase'
import { hmacHex } from './crypto'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import type { InboxConversation, InboxThread } from '../shared/messages'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', META_ACCESS_TOKEN: 'meta-token', WHATSAPP_PHONE_NUMBER_ID: '555', META_APP_SECRET: 'meta-secret',
  WHATSAPP_VERIFY_TOKEN: 'verify', META_GRAPH_VERSION: 'v23.0',
} as unknown as Env

let db: FakeSupabase
let apis: FakeProviders
let background: Promise<unknown>[]
const ctx = () => ({ waitUntil: (p: Promise<unknown>) => { background.push(p) }, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  background = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const as = (who: 'admin' | 'staff') => ({ authorization: `Bearer ${who}-token`, 'content-type': 'application/json' })
const post = (path: string, body: unknown = {}, who: 'admin' | 'staff' = 'admin') =>
  integrations.request(`${APP}${path}`, { method: 'POST', headers: as(who), body: JSON.stringify(body) }, env, ctx())
const get = (path: string, who: 'admin' | 'staff' = 'admin') => integrations.request(`${APP}${path}`, { headers: as(who) }, env, ctx())

const SOFIA = '34611222333'
const unix = (msAgo: number) => String(Math.floor((Date.now() - msAgo) / 1000))
const HOUR = 3_600_000, DAY = 24 * HOUR

/** Meta calls the webhook, signed with the app secret; waits for the photos to be copied. */
async function webhook(value: Record<string, unknown>) {
  const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', ...value } }] }] })
  const res = await integrations.request(`${APP}/api/webhooks/whatsapp`, {
    method: 'POST', body: raw, headers: { 'x-hub-signature-256': `sha256=${await hmacHex('meta-secret', raw)}`, 'content-type': 'application/json' },
  }, env, ctx())
  await Promise.all(background)
  return res
}
const from = (who: string, name: string, messages: Record<string, unknown>[]) =>
  webhook({ contacts: [{ wa_id: who, profile: { name } }], messages: messages.map(m => ({ from: who, ...m })) })

const inbox = async () => ((await (await get('/api/integrations/whatsapp/inbox')).json()) as { conversations: InboxConversation[] }).conversations
const chat = async (waId: string) => (await (await get(`/api/integrations/whatsapp/inbox/${waId}`)).json()) as InboxThread

describe('WhatsApp chats', () => {
  it('keeps each message the webhook delivers, once, named after the person', async () => {
    const text = { id: 'wamid.in1', timestamp: unix(5 * 60_000), type: 'text', text: { body: 'Is the terrace open?' } }
    expect((await from(SOFIA, 'Sofía Martín', [text])).status).toBe(200)
    await from(SOFIA, 'Sofía Martín', [text]) // Meta retries: no second copy
    expect(db.table('whatsapp_messages')).toHaveLength(1)

    const [c] = await inbox()
    expect(c).toMatchObject({ id: SOFIA, platform: 'whatsapp', with: { id: SOFIA, username: `+${SOFIA}`, name: 'Sofía Martín' } })
    expect(c.recent[0]).toMatchObject({ fromMe: false, kind: 'text', text: 'Is the terrace open?' })
  })

  it('rejects webhooks Meta didn’t sign', async () => {
    const res = await integrations.request(`${APP}/api/webhooks/whatsapp`, { method: 'POST', body: '{"entry":[]}', headers: { 'x-hub-signature-256': 'sha256=nope' } }, env, ctx())
    expect(res.status).toBe(401)
    expect(db.table('whatsapp_messages')).toHaveLength(0)
  })

  it('copies photos into private storage and hands the page a signed link', async () => {
    apis.whatsapp.media.set('media-1', { type: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2]) })
    await from(SOFIA, 'Sofía', [
      { id: 'wamid.p1', timestamp: unix(60_000), type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'This table?' } },
      { id: 'wamid.p2', timestamp: unix(30_000), type: 'audio', audio: { id: 'media-gone', mime_type: 'audio/ogg' } },
    ])
    const [photo, voice] = db.table('whatsapp_messages')
    expect(photo.media_path).toMatch(new RegExp(`^\\d{4}-\\d{2}-\\d{2}/${SOFIA}/\\d+\\.jpg$`))
    expect(db.buckets.has('whatsapp-media')).toBe(true) // made on first use
    expect(db.files.get(`whatsapp-media/${photo.media_path}`)?.bytes).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 1, 2]))
    expect(voice.media_path ?? null).toBeNull()
    expect(voice.media_error).toBe('Media not found')

    const { messages } = await chat(SOFIA)
    expect(messages[0]).toMatchObject({ kind: 'image', text: 'This table?', mediaUrl: expect.stringContaining('/object/sign/whatsapp-media/') })
    expect(messages[1]).toMatchObject({ kind: 'audio', text: '(Media not found)' })
    expect(messages[1].mediaUrl).toBeUndefined()
  })

  it('reads locations, reactions and kinds it can’t show', async () => {
    await from(SOFIA, 'Sofía', [
      { id: 'wamid.l1', timestamp: unix(60_000), type: 'location', location: { latitude: 36.48, longitude: -5.0, name: 'Easy Beans' } },
      { id: 'wamid.o1', timestamp: unix(50_000), type: 'order', order: {} },
    ])
    const { messages } = await chat(SOFIA)
    expect(messages[0]).toMatchObject({ kind: 'location', text: 'Easy Beans', link: 'https://www.google.com/maps/search/?api=1&query=36.48,-5' })
    expect(messages[1]).toMatchObject({ kind: 'other' })
    await from(SOFIA, 'Sofía', [{ id: 'wamid.r1', type: 'reaction', reaction: { message_id: 'wamid.l1', emoji: '👍' } }])
    expect((await chat(SOFIA)).messages[0].reactions).toEqual(['👍'])
  })

  it('replies within 24 hours; the chat shows it and how far it got', async () => {
    await from(SOFIA, 'Sofía', [{ id: 'wamid.in1', timestamp: unix(2 * HOUR), type: 'text', text: { body: 'Hola!' } }])
    const res = await post(`/api/integrations/whatsapp/inbox/${SOFIA}/reply`, { text: '  Yes, until 6!  ' })
    expect(res.status).toBe(200)
    expect(apis.whatsapp.texts).toEqual([{ to: SOFIA, text: 'Yes, until 6!' }])
    const { id } = await res.json() as { id: string }

    // Receipts: delivered, then read; a late "delivered" doesn't step back.
    await webhook({ statuses: [{ id, status: 'delivered' }] })
    await webhook({ statuses: [{ id, status: 'read' }] })
    await webhook({ statuses: [{ id, status: 'delivered' }] })
    const { messages } = await chat(SOFIA)
    expect(messages.at(-1)).toMatchObject({ fromMe: true, text: 'Yes, until 6!', status: 'read' })
    expect((await inbox())[0].recent[0].fromMe).toBe(true) // answered: no longer waiting
  })

  it('refuses a reply more than 24 hours after their last message (only templates may go)', async () => {
    await from(SOFIA, 'Sofía', [{ id: 'wamid.old', timestamp: unix(25 * HOUR), type: 'text', text: { body: 'Hola' } }])
    const res = await post(`/api/integrations/whatsapp/inbox/${SOFIA}/reply`, { text: 'Sorry for the wait' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('within 24 hours')
    expect(apis.whatsapp.texts).toEqual([])
    // Nobody wrote at all: nothing to reply to.
    expect((await post('/api/integrations/whatsapp/inbox/34999888777/reply', { text: 'Hi' })).status).toBe(400)
  })

  it('only admins read or answer the chats', async () => {
    await from(SOFIA, 'Sofía', [{ id: 'wamid.in1', timestamp: unix(60_000), type: 'text', text: { body: 'Hola' } }])
    expect((await get('/api/integrations/whatsapp/inbox', 'staff')).status).toBe(403)
    expect((await get(`/api/integrations/whatsapp/inbox/${SOFIA}`, 'staff')).status).toBe(403)
    expect((await post(`/api/integrations/whatsapp/inbox/${SOFIA}/reply`, { text: 'x' }, 'staff')).status).toBe(403)
    expect((await get('/api/integrations/whatsapp/inbox/not-a-number')).status).toBe(404)
  })

  it('the café’s alerts from the outbox appear in the team member’s chat as they read it', async () => {
    db.table('profiles').find(p => p.id === 'staff-1')!.phone = '+34 600 111 222'
    db.table('outbox').push({ id: 1, kind: 'whatsapp', status: 'pending', payload: { to: '34600111222', template: 'shift_reminder', params: ['Julio', '08:00', 'Barista'] } })
    await drainOutbox(env, 1)
    const [c] = await inbox()
    expect(c).toMatchObject({ id: '34600111222', with: { name: 'Julio' } })
    expect(c.recent[0]).toMatchObject({ fromMe: true, text: 'Hola Julio, tu turno empieza a las 08:00 (Barista). ¡Hasta ahora!', status: 'sent' })
    expect(templateText('something_new', ['a', 'b'])).toBe('something_new · a · b')
  })
})

describe('Data retention', () => {
  /** A saved message `days` old, with a stored photo. */
  function saved(n: number, days: number) {
    const path = `old/${SOFIA}/${n}.jpg`
    db.table('whatsapp_messages').push({ id: n, wa_message_id: `wamid.${n}`, wa_id: SOFIA, name: 'Sofía', from_me: false, kind: 'image', body: '',
      media_id: `m${n}`, media_path: path, at: new Date(Date.now() - days * DAY).toISOString() })
    db.buckets.add('whatsapp-media')
    db.files.set(`whatsapp-media/${path}`, { bytes: new Uint8Array([n]), type: 'image/jpeg' })
  }

  it('keeps 3 months unless changed; a shorter time deletes what’s now too old at once, photos included', async () => {
    saved(1, 10); saved(2, 45); saved(3, 80)
    expect(await purge(businessDb(env, 1))).toBe(0) // all within the default 3 months

    const res = await post('/api/integrations/whatsapp/retention', { days: 30 })
    expect(await res.json()).toEqual({ days: 30, deleted: 2 })
    expect(db.table('settings')[0].whatsapp_retention_days).toBe(30)
    expect(db.table('whatsapp_messages').map(r => r.id)).toEqual([1])
    expect([...db.files.keys()]).toEqual([`whatsapp-media/old/${SOFIA}/1.jpg`])
    expect((await chat(SOFIA)).messages).toHaveLength(1)

    // Longer again: nothing comes back, nothing more goes.
    expect(await (await post('/api/integrations/whatsapp/retention', { days: 365 })).json()).toEqual({ days: 365, deleted: 0 })
    expect(db.table('whatsapp_messages')).toHaveLength(1)
  })

  it('the nightly run deletes by the chosen time', async () => {
    db.table('settings')[0].whatsapp_retention_days = 180
    saved(1, 100); saved(2, 200)
    expect(await purge(businessDb(env, 1))).toBe(1)
    expect(db.table('whatsapp_messages').map(r => r.id)).toEqual([1])
  })

  it('takes only the offered times, and only from admins', async () => {
    const bad = await post('/api/integrations/whatsapp/retention', { days: 7 })
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { error: string }).error).toContain('1 month, 3 months')
    expect((await post('/api/integrations/whatsapp/retention', { days: 30 }, 'staff')).status).toBe(403)
    expect(db.table('settings')[0].whatsapp_retention_days).toBe(90)
  })
})
