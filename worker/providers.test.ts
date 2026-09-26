import { describe, expect, it, vi, afterEach } from 'vitest'
import { fromGoogleHours, toGoogleHours, toSpecialHours } from './providers/google'
import { parseWebhook, sendTemplate, templateBody, verifySignature } from './providers/whatsapp'
import { publishPhoto } from './providers/instagram'
import { hmacHex, seal, signState, unseal, verifyState } from './crypto'
import type { CalendarEvent, OpeningHours } from '../shared/types'

const hours: OpeningHours = {
  mon: { open: '08:00', close: '18:00' }, tue: { open: '08:00', close: '18:00' }, wed: { open: '08:00', close: '18:00' },
  thu: { open: '08:00', close: '18:00' }, fri: { open: '08:00', close: '18:00' }, sat: { open: '09:00', close: '18:30' }, sun: null,
}
const ev = (starts_on: string, title: string, category: CalendarEvent['category'], ends_on: string | null = null): CalendarEvent => ({
  id: title, starts_on, ends_on, starts_at: null, title, category, town: null, competition: null, source: 'admin', confirmed: true, visibility: 'all',
})

afterEach(() => vi.unstubAllGlobals())

describe('Google opening hours', () => {
  it('converts both ways without losing anything', () => {
    const g = toGoogleHours(hours)
    expect(g.periods).toHaveLength(6)
    expect(g.periods[5]).toEqual({ openDay: 'SATURDAY', openTime: { hours: 9 }, closeDay: 'SATURDAY', closeTime: { hours: 18, minutes: 30 } })
    expect(fromGoogleHours(g)).toEqual(hours)
  })
  it('marks closures, and public holidays only when the café closes on them', () => {
    const events = [
      ev('2026-10-12', 'Fiesta Nacional', 'national'),
      ev('2026-10-20', 'Closed for staff training', 'business'),
      ev('2026-08-01', 'Closed summer break', 'business', '2026-08-15'),
      ev('2026-10-25', 'Coffee tasting', 'business'),
      ev('2026-09-01', 'Past closure: closed', 'business'),
    ]
    expect(toSpecialHours(events, '2026-09-26', false).specialHourPeriods).toEqual([
      { startDate: { year: 2026, month: 10, day: 20 }, closed: true },
    ])
    expect(toSpecialHours(events, '2026-09-26', true).specialHourPeriods).toHaveLength(2)
    expect(toSpecialHours(events, '2026-08-05', false).specialHourPeriods).toContainEqual({
      startDate: { year: 2026, month: 8, day: 1 }, endDate: { year: 2026, month: 8, day: 15 }, closed: true,
    })
  })
})

describe('WhatsApp', () => {
  it('builds template messages with body parameters', () => {
    expect(templateBody('34600111222', 'shift_reminder', ['Julio', '07:45'], 'es')).toEqual({
      messaging_product: 'whatsapp', to: '34600111222', type: 'template',
      template: { name: 'shift_reminder', language: { code: 'es' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Julio' }, { type: 'text', text: '07:45' }] }] },
    })
  })
  it('sends via the Cloud API and returns the message id, or the Meta error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Template name does not exist' } }), { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)
    const cfg = { token: 't', phoneNumberId: '123', graphVersion: 'v23.0', language: 'es' }
    expect(await sendTemplate(cfg, '346', 'hello_world', [])).toBe('wamid.1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://graph.facebook.com/v23.0/123/messages')
    await expect(sendTemplate(cfg, '346', 'nope', [])).rejects.toThrow('Template name does not exist')
  })
  it('accepts only correctly signed webhooks', async () => {
    const body = '{"entry":[]}'
    const good = `sha256=${await hmacHex('app-secret', body)}`
    expect(await verifySignature('app-secret', body, good)).toBe(true)
    expect(await verifySignature('app-secret', body + ' ', good)).toBe(false)
    expect(await verifySignature('other', body, good)).toBe(false)
    expect(await verifySignature('app-secret', body, null)).toBe(false)
  })
  it('reads delivery receipts and replies', () => {
    const e = parseWebhook({ entry: [{ changes: [{ value: {
      statuses: [{ id: 'wamid.1', status: 'read' }, { id: 'wamid.2', status: 'failed', errors: [{ title: 'Not on WhatsApp' }] }],
      messages: [{ from: '34600111222', type: 'text', text: { body: 'STOP' } }],
    } }] }] })
    expect(e.statuses).toEqual([{ id: 'wamid.1', status: 'read', error: undefined }, { id: 'wamid.2', status: 'failed', error: 'Not on WhatsApp' }])
    expect(e.messages).toEqual([{ from: '34600111222', text: 'STOP' }])
  })
})

describe('Instagram', () => {
  it('publishes a photo in two steps', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'container' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'media-1' })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await publishPhoto({ token: 't', userId: '17841', graphVersion: 'v23.0' }, 'https://x/a.jpg', 'Feria!')).toBe('media-1')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/17841/media')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/17841/media_publish')
    expect(String(fetchMock.mock.calls[1][1].body)).toContain('creation_id=container')
  })
})

describe('crypto', () => {
  it('encrypts tokens at rest', async () => {
    const sealed = await seal('k'.repeat(32), { refresh_token: 'secret' })
    expect(sealed).not.toContain('secret')
    expect(await unseal('k'.repeat(32), sealed)).toEqual({ refresh_token: 'secret' })
    await expect(unseal('wrong'.repeat(8), sealed)).rejects.toThrow()
  })
  it('signs OAuth state and rejects tampering or expiry', async () => {
    const s = await signState('key', { uid: 'u1' })
    expect(await verifyState<{ uid: string }>('key', s)).toMatchObject({ uid: 'u1' })
    const [body, sig] = s.split('.')
    const flip = (str: string, i: number) => str.slice(0, i) + (str[i] === 'A' ? 'B' : 'A') + str.slice(i + 1)
    // Every character of the signature and the payload matters, including the last one's spare bits.
    for (let i = 0; i < sig.length; i++) await expect(verifyState('key', `${body}.${flip(sig, i)}`)).rejects.toThrow()
    await expect(verifyState('key', `${flip(body, 3)}.${sig}`)).rejects.toThrow()
    // Same bytes, different spelling: flip a spare (ignored) bit of the last character.
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const spare = sig.slice(0, -1) + abc[abc.indexOf(sig.at(-1)!) ^ 1]
    await expect(verifyState('key', `${body}.${spare}`)).rejects.toThrow()
    await expect(verifyState('other-key', s)).rejects.toThrow()
    await expect(verifyState('key', await signState('key', { uid: 'u1' }, -1))).rejects.toThrow('expired')
  })
})

describe('Spotify', () => {
  it('builds a one-click consent link with the playback scopes', async () => {
    const { authUrl } = await import('./providers/spotify')
    const url = new URL(authUrl({ clientId: 'cid', clientSecret: 's', redirectUri: 'https://x/cb' }, 'st'))
    expect(url.origin).toBe('https://accounts.spotify.com')
    expect(url.searchParams.get('scope')).toContain('user-modify-playback-state')
    expect(url.searchParams.get('state')).toBe('st')
  })
  it('plays the approved playlist and explains common playback errors', async () => {
    const { playPlaylist, nowPlaying } = await import('./providers/spotify')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { status: 404, message: 'x', reason: 'NO_ACTIVE_DEVICE' } }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ is_playing: true, item: { name: 'Song', artists: [{ name: 'A' }] },
        device: { name: 'Café speaker' }, context: { uri: 'spotify:playlist:abc' } })))
    vi.stubGlobal('fetch', fetchMock)
    await playPlaylist('t', 'abc')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ context_uri: 'spotify:playlist:abc' })
    await expect(playPlaylist('t', 'abc')).rejects.toThrow('No Spotify speaker is on')
    expect(await nowPlaying('t', 'abc')).toEqual({ playing: true, track: 'Song', artist: 'A', device: 'Café speaker', onApprovedPlaylist: true })
  })
})
