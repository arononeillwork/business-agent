// Connections, end to end through the Worker's routes, against stand-ins for Supabase and the
// Google, Microsoft, Spotify and Meta APIs. What must never break:
//   - an app shows "Connected" only after it has really worked (email sent, folder made, playlists read)
//   - a business has at most one app per group (Gmail or Outlook, Drive or OneDrive…)
//   - when a working connection stops working, it says why and admins are told (once)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drainOutbox, integrations, setTikTokWait } from './integrations'
import { calendarFeeds } from './calendarFeed'
import { checkAll, explain, hasScope, PROVIDERS } from './connections'
import { serviceClient, type Env } from './supabase'
import { unseal } from './crypto'
import { FakeSupabase, GROUP } from './test/fakeSupabase'
import { FakeProviders, readGmail } from './test/fakeProviders'
import { GROUPS, groupOf } from '../shared/connections'
import { authEmail, hookSecret, verifyHook } from './authEmail'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret',
  MS_CLIENT_ID: 'ms-id', MS_CLIENT_SECRET: 'ms-secret', SPOTIFY_CLIENT_ID: 'spotify-id', SPOTIFY_CLIENT_SECRET: 'spotify-secret',
  META_ACCESS_TOKEN: 'meta-token', WHATSAPP_PHONE_NUMBER_ID: '555', META_APP_SECRET: 'meta-secret', WHATSAPP_VERIFY_TOKEN: 'verify',
  INSTAGRAM_APP_ID: 'ig-app', INSTAGRAM_APP_SECRET: 'ig-secret',
  META_APP_ID: 'meta-app', TIKTOK_CLIENT_KEY: 'tt-key', TIKTOK_CLIENT_SECRET: 'tt-secret', SQUARE_APP_ID: 'sq-app', SQUARE_APP_SECRET: 'sq-secret',
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

/** Press Connect, come back from Google/Microsoft with a code, and return where the app lands. */
async function connect(provider: string, back: 'connections' | 'setup' = 'connections') {
  const start = await post(`/api/integrations/connect/${provider}/start`, { back })
  expect(start.status).toBe(200)
  const auth = new URL((await start.json() as { url: string }).url)
  const callback = auth.host === 'login.microsoftonline.com' ? 'microsoft' : 'google'
  const res = await integrations.request(`${APP}/api/integrations/${callback}/callback?code=the-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`, {}, env, ctx())
  expect(res.status).toBe(302)
  return new URL(res.headers.get('location')!)
}

/** The apps with their own start and callback routes (Spotify, Instagram, Google Maps). */
async function connectOwn(provider: 'spotify' | 'instagram' | 'google' | 'facebook' | 'tiktok' | 'square', query = 'code=c') {
  const start = await post(`/api/integrations/${provider}/start`)
  expect(start.status).toBe(200)
  const state = new URL((await start.json() as { url: string }).url).searchParams.get('state')!
  const res = await integrations.request(`${APP}/api/integrations/${provider}/callback?${query}&state=${encodeURIComponent(state)}`, {}, env, ctx())
  expect(res.status).toBe(302)
  return new URL(res.headers.get('location')!)
}

const connectSpotify = () => connectOwn('spotify')

const status = (p: string) => db.integration(p).status
const nightly = () => checkAll(env, serviceClient(env), { retryAfterMs: 0 })

describe('Connecting an app: "Connected" only once it has really worked', () => {
  it('Gmail sends a confirmation from the mailbox to itself, keeps the access encrypted, then shows Connected', async () => {
    const back = await connect('gmail')
    expect(back.pathname).toBe('/connections')
    expect(back.searchParams.get('connected')).toBe('gmail')

    expect(apis.google.sent).toHaveLength(1)
    const mail = readGmail(apis.google.sent[0])
    expect(mail.to).toBe('cafe@gmail.com')
    expect(mail.subject).toBe('Easy Beans: this mailbox is connected')

    const row = db.integration('gmail')
    expect(row).toMatchObject({ status: 'connected', account_label: 'cafe@gmail.com', last_error: null, connected_by: 'admin-1' })
    expect(row.last_checked_at).toBeTruthy()
    const secret = db.secret('gmail')!
    expect(String(secret.ciphertext)).not.toContain('g-refresh')
    expect(await unseal(env.INTEGRATION_KEY!, String(secret.ciphertext))).toEqual({ refresh_token: 'g-refresh' })
  })

  it('asks Google only for what that app needs, with lasting access', async () => {
    const start = await post('/api/integrations/connect/google_drive/start')
    const auth = new URL((await start.json() as { url: string }).url)
    expect(auth.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file openid email')
    expect(auth.searchParams.get('access_type')).toBe('offline')
    expect(auth.searchParams.get('redirect_uri')).toBe(`${APP}/api/integrations/google/callback`)
  })

  it('choosing Outlook replaces Gmail: one mailbox at a time, and alerts go from the new one', async () => {
    await connect('gmail')
    const back = await connect('outlook')
    expect(back.searchParams.get('connected')).toBe('outlook')
    expect(apis.microsoft.sent).toEqual([{ to: 'cafe@outlook.com', subject: 'Easy Beans: this mailbox is connected' }])
    expect(status('outlook')).toBe('connected')
    expect(status('gmail')).toBe('disconnected')
    expect(db.secret('gmail')).toBeUndefined()

    const test = await post('/api/integrations/email/test', { to: 'aron@example.com' })
    expect(test.status).toBe(200)
    expect(apis.microsoft.sent.at(-1)).toEqual({ to: 'aron@example.com', subject: 'Test email from Business Agent' })
    expect(apis.google.sent).toHaveLength(1) // only Gmail's own confirmation
  })

  it('keeps Microsoft’s new refresh token each time (the old one stops working)', async () => {
    await connect('outlook')
    for (const n of [1, 2, 3]) {
      const res = await post('/api/integrations/email/test', { to: `n${n}@example.com` })
      expect(res.status).toBe(200)
    }
    expect(status('outlook')).toBe('connected')
  })

  it('an unticked permission means not connected, says why, and leaves the current app in place', async () => {
    await connect('outlook')
    apis.google.granted = 'openid https://www.googleapis.com/auth/userinfo.email' // Gmail box unticked
    const back = await connect('gmail')
    expect(back.searchParams.get('connect_error')).toBe('Gmail was connected without the permission it needs. Connect again and leave every box ticked.')
    expect(status('gmail')).toBe('disconnected')
    expect(db.secret('gmail')).toBeUndefined()
    expect(db.integration('gmail').last_error).toMatch(/without the permission/)
    expect(apis.google.sent).toHaveLength(0)
    expect(status('outlook')).toBe('connected')
  })

  it('Drive with its permission unticked is not connected (no folder is made)', async () => {
    apis.google.granted = 'openid https://www.googleapis.com/auth/userinfo.email'
    expect((await connect('google_drive')).searchParams.get('connect_error')).toMatch(/Google Drive was connected without the permission/)
    expect(status('google_drive')).toBe('disconnected')
    expect(apis.google.folders.size).toBe(0)
  })

  it('the Gmail API switched off in Google Cloud: not connected, and says how to fix it', async () => {
    apis.google.disabled.add('gmail')
    const back = await connect('gmail')
    expect(back.searchParams.get('connect_error')).toBe('The Gmail API is switched off for this app. Switch it on in Google Cloud (APIs & Services → Library), then connect again.')
    expect(status('gmail')).toBe('disconnected')
  })

  it('a Microsoft account without a mailbox is not connected', async () => {
    apis.microsoft.noMailbox = true
    const back = await connect('outlook')
    expect(back.searchParams.get('connect_error')).toMatch(/no Outlook mailbox/)
    expect(status('outlook')).toBe('disconnected')
  })

  it('Google Drive: makes the “Business Agent” folder, then exports save into it', async () => {
    const back = await connect('google_drive', 'setup')
    expect(back.pathname).toBe('/setup')
    const row = db.integration('google_drive')
    expect(row.status).toBe('connected')
    const folderId = (row.external as { folder_id: string }).folder_id
    expect(apis.google.folders.get(folderId)).toEqual({ name: 'Business Agent', parent: 'root', trashed: false })

    const saved = await post('/api/integrations/files/save', { folder: 'Timecards', name: 'week 40.csv', content: 'a;b', type: 'text/csv' })
    expect(await saved.json()).toMatchObject({ provider: 'google_drive', link: expect.stringContaining('drive.google.com') })
    const sub = [...apis.google.folders].find(([, f]) => f.name === 'Timecards')!
    expect(sub[1].parent).toBe(folderId)
    expect(apis.google.uploads).toEqual([{ parent: sub[0], name: 'week 40.csv' }])
  })

  it('OneDrive replaces Google Drive, and exports then go to OneDrive', async () => {
    await connect('google_drive')
    await connect('onedrive')
    expect(status('google_drive')).toBe('disconnected')
    expect(db.integration('onedrive')).toMatchObject({ status: 'connected', external: { folder_id: apis.microsoft.folderId } })
    await post('/api/integrations/files/save', { folder: 'Timecards', name: 'week.csv', content: 'x' })
    expect(apis.microsoft.files).toEqual(['Business Agent/Timecards/week.csv'])
    expect(apis.google.uploads).toEqual([])
  })

  it('a cancelled sign-in changes nothing and isn’t shown as a problem', async () => {
    const start = await post('/api/integrations/connect/gmail/start')
    const state = new URL((await start.json() as { url: string }).url).searchParams.get('state')!
    const res = await integrations.request(`${APP}/api/integrations/google/callback?error=access_denied&state=${encodeURIComponent(state)}`, {}, env, ctx())
    expect(new URL(res.headers.get('location')!).searchParams.get('connect_error')).toBe('Gmail connection was cancelled')
    expect(db.integration('gmail')).toMatchObject({ status: 'disconnected', last_error: null })
  })

  it('refuses a forged or expired connection link', async () => {
    const res = await integrations.request(`${APP}/api/integrations/microsoft/callback?code=x&state=forged.state`, {}, env, ctx())
    expect(new URL(res.headers.get('location')!).searchParams.get('connect_error')).toMatch(/expired/)
    expect(db.table('integration_secrets')).toEqual([])
  })

  it('only admins manage connections', async () => {
    expect((await post('/api/integrations/connect/gmail/start', {}, 'staff')).status).toBe(403)
    expect((await post('/api/integrations/check', {}, 'staff')).status).toBe(403)
    expect((await integrations.request(`${APP}/api/integrations`, {}, env, ctx())).status).toBe(401)
  })
})

describe('Café music: Spotify or YouTube Music', () => {
  it('Spotify is connected once its playlists could be read', async () => {
    expect((await connectSpotify()).searchParams.get('connected')).toBe('spotify')
    expect(db.integration('spotify')).toMatchObject({ status: 'connected', account_label: 'Easy Beans', external: { playlists: 1 } })
  })

  it('YouTube Music replaces Spotify; staff open the approved playlist on the café device', async () => {
    await connectSpotify()
    expect((await connect('youtube_music')).searchParams.get('connected')).toBe('youtube_music')
    expect(status('spotify')).toBe('disconnected')
    expect(db.integration('youtube_music')).toMatchObject({ status: 'connected', account_label: 'Easy Beans', external: { playlists: 1 } })

    const lists = await (await get('/api/integrations/music/playlists')).json() as { provider: string; playlists: { id: string; name: string; url: string }[] }
    expect(lists.provider).toBe('youtube_music')
    expect(lists.playlists).toEqual([expect.objectContaining({ id: 'PL1', name: 'Morning café', url: 'https://music.youtube.com/playlist?list=PL1' })])
    expect((await post('/api/integrations/music/playlist', { playlist: { id: 'nope' } })).status).toBe(400)
    expect((await post('/api/integrations/music/playlist', { playlist: { id: 'PL1' } })).status).toBe(200)

    const staffNow = await integrations.request(`${APP}/api/music/now`, { headers: as('staff') }, env, ctx())
    expect(await staffNow.json()).toMatchObject({ provider: 'youtube', controls: false, playlist: { id: 'PL1', name: 'Morning café' } })
    const play = await integrations.request(`${APP}/api/music/play`, { method: 'POST', headers: as('staff') }, env, ctx())
    expect(play.status).toBe(400)
    expect((await play.json() as { error: string }).error).toMatch(/café device/)
  })

  it('a Google account without a YouTube channel is not connected', async () => {
    apis.google.channel = null
    expect((await connect('youtube_music')).searchParams.get('connect_error')).toMatch(/no YouTube channel/)
    expect(status('youtube_music')).toBe('disconnected')
  })
})

describe('Instagram and Google Maps: one click, connected once they really work', () => {
  it('Instagram: signs in on instagram.com, reads the profile, keeps a 60-day token (encrypted)', async () => {
    const start = await post('/api/integrations/instagram/start')
    const auth = new URL((await start.json() as { url: string }).url)
    expect(auth.origin + auth.pathname).toBe('https://www.instagram.com/oauth/authorize')
    expect(auth.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_content_publish')
    expect(auth.searchParams.get('redirect_uri')).toBe(`${APP}/api/integrations/instagram/callback`)

    expect((await connectOwn('instagram')).searchParams.get('connected')).toBe('instagram')
    expect(db.integration('instagram')).toMatchObject({ status: 'connected', account_label: '@easy.beans.coffee', external: { username: 'easy.beans.coffee', followers: 1284 } })
    const secret = await unseal<{ access_token: string; expires_at: string }>(env.INTEGRATION_KEY!, String(db.secret('instagram')!.ciphertext))
    expect(secret.access_token).toBe('ig-long-0')
    expect(Date.parse(secret.expires_at) - Date.now()).toBeGreaterThan(59 * 86_400_000)

    const profile = await get('/api/integrations/instagram/profile')
    expect(await profile.json()).toMatchObject({ username: 'easy.beans.coffee', recent: [{ caption: 'Iced oat latte season' }] })
  })

  it('Instagram: renews the token at night so it never runs out, and turns red if access is removed', async () => {
    await connectOwn('instagram')
    // A few days later the token is no longer brand new: the nightly check renews it.
    const s = db.secret('instagram')!
    const old = await unseal<{ access_token: string; expires_at: string; user_id: string }>(env.INTEGRATION_KEY!, String(s.ciphertext))
    const { seal } = await import('./crypto')
    s.ciphertext = await seal(env.INTEGRATION_KEY!, { ...old, expires_at: new Date(Date.now() + 50 * 86_400_000).toISOString() })
    await nightly()
    expect(apis.instagram.refreshes).toBe(1)
    expect((await unseal<{ access_token: string }>(env.INTEGRATION_KEY!, String(db.secret('instagram')!.ciphertext))).access_token).toBe('ig-long-1')
    expect(status('instagram')).toBe('connected')

    apis.instagram.revoked = true
    await nightly()
    expect(db.integration('instagram')).toMatchObject({ status: 'error', last_error: 'Instagram access was removed or has expired. Connect it again.' })
    expect(db.table('notifications')[0]).toMatchObject({ title: 'Instagram stopped working' })
  })

  it('Instagram: an account that isn’t a tester yet is told why, and nothing is stored', async () => {
    apis.instagram.tester = false
    expect((await connectOwn('instagram')).searchParams.get('connect_error')).toMatch(/Instagram testers/)
    expect(status('instagram')).toBe('disconnected')
    expect(db.secret('instagram')).toBeUndefined()
  })

  it('Instagram: posting not allowed means not connected', async () => {
    apis.instagram.permissions = 'instagram_business_basic'
    expect((await connectOwn('instagram')).searchParams.get('connect_error')).toMatch(/without the permission/)
    expect(status('instagram')).toBe('disconnected')
  })

  it('Google Maps: connected once the café’s listing is found', async () => {
    const back = await connectOwn('google')
    expect(back.searchParams.get('connected')).toBe('google_business')
    expect(db.integration('google_business')).toMatchObject({ status: 'connected', account_label: 'Easy Beans Coffee', external: { location: 'locations/1' } })
    expect(db.secret('google_business')).toBeTruthy()
  })

  it('Google Maps: an account without a listing is not connected, and its access isn’t kept', async () => {
    apis.google.listings = []
    expect((await connectOwn('google')).searchParams.get('connect_error')).toMatch(/no Google Maps listing/)
    expect(status('google_business')).toBe('disconnected')
    expect(db.secret('google_business')).toBeUndefined()
  })
})

describe('Calendar: connected once the calendar app has fetched the team calendar', () => {
  const fetchFeed = async (feed: string, agent: string) => {
    const res = await calendarFeeds.request(feed.replace(APP, APP), { headers: { 'user-agent': agent } }, env, ctx())
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('BEGIN:VCALENDAR')
    await Promise.all(background)
  }

  it('Google Calendar: pending until Google fetches it; a browser opening the link proves nothing', async () => {
    const res = await post('/api/integrations/calendar/google_calendar/choose')
    const { url, feed } = await res.json() as { url: string; feed: string }
    expect(url).toBe(`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feed.replace('https:', 'webcal:'))}`)
    expect(status('google_calendar')).toBe('pending')

    await fetchFeed(feed, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36')
    expect(status('google_calendar')).toBe('pending')

    await fetchFeed(feed, 'Google-Calendar-Importer')
    expect(db.integration('google_calendar')).toMatchObject({ status: 'connected', last_error: null })
    expect(db.integration('google_calendar').last_sync_at).toBeTruthy()
  })

  it('switching to Outlook Calendar: Google fetching the old subscription no longer counts', async () => {
    const { feed } = await (await post('/api/integrations/calendar/google_calendar/choose')).json() as { feed: string }
    await fetchFeed(feed, 'Google-Calendar-Importer')
    const chosen = await (await post('/api/integrations/calendar/outlook_calendar/choose')).json() as { url: string; feed: string }
    expect(chosen.feed).toBe(feed) // same team calendar link
    expect(chosen.url).toContain('outlook.live.com/calendar/0/addfromweb')
    expect(status('google_calendar')).toBe('disconnected')
    expect(status('outlook_calendar')).toBe('pending')

    await fetchFeed(feed, 'Google-Calendar-Importer')
    expect(status('google_calendar')).toBe('disconnected')
    await fetchFeed(feed, 'Microsoft.Exchange/15.20 (Windows NT 10.0; Win64; x64)')
    expect(status('outlook_calendar')).toBe('connected')
  })
})

describe('Checks: a connection that stops working turns red and admins hear about it once', () => {
  it('Gmail access removed: error with the reason, both active admins notified once, recovers by itself', async () => {
    await connect('gmail')
    apis.google.revoked = true
    await nightly()
    expect(db.integration('gmail')).toMatchObject({ status: 'error', last_error: 'Gmail access was removed or has expired. Connect it again.' })
    const notes = db.table('notifications')
    expect(notes.map(n => n.profile_id).sort()).toEqual(['admin-1', 'admin-2'])
    expect(notes[0]).toMatchObject({ title: 'Gmail stopped working', link: '/connections' })

    await nightly()
    expect(db.table('notifications')).toHaveLength(2)

    apis.google.revoked = false
    await nightly()
    expect(db.integration('gmail')).toMatchObject({ status: 'connected', last_error: null })
  })

  it('a provider having a bad minute is retried and doesn’t alarm anyone', async () => {
    await connect('google_drive')
    apis.google.driveHiccups = 1
    await nightly()
    expect(status('google_drive')).toBe('connected')
    expect(db.table('notifications')).toEqual([])
  })

  it('the Drive folder was deleted: it is made again and the connection stays working', async () => {
    await connect('google_drive')
    const before = (db.integration('google_drive').external as { folder_id: string }).folder_id
    apis.google.folders.get(before)!.trashed = true
    await nightly()
    const after = (db.integration('google_drive').external as { folder_id: string }).folder_id
    expect(after).not.toBe(before)
    expect(apis.google.folders.get(after)).toMatchObject({ name: 'Business Agent', trashed: false })
    expect(status('google_drive')).toBe('connected')
  })

  it('"Check now" gives the result straight away, without notifying', async () => {
    await connect('outlook')
    apis.microsoft.revoked = true
    const res = await post('/api/integrations/outlook/check')
    expect(await res.json()).toMatchObject({ provider: 'outlook', status: 'error', last_error: 'Outlook access was removed or has expired. Connect it again.' })
    expect(db.table('notifications')).toEqual([])
  })

  it('a calendar app that stops fetching the team calendar turns red', async () => {
    Object.assign(db.integration('google_calendar'), { status: 'connected', last_sync_at: new Date(Date.now() - 4 * 86_400_000).toISOString() })
    await nightly()
    expect(db.integration('google_calendar').status).toBe('error')
    expect(db.integration('google_calendar').last_error).toMatch(/^Google Calendar hasn’t fetched the team calendar since /)
    expect(db.table('notifications')[0]).toMatchObject({ title: 'Google Calendar stopped working' })
  })

  it('real use counts too: an alert email failing because access was removed turns Gmail red', async () => {
    await connect('gmail')
    apis.google.revoked = true
    const res = await post('/api/integrations/email/test', { to: 'aron@example.com' })
    expect(res.status).toBe(400)
    expect(status('gmail')).toBe('error')
    expect(db.table('notifications')).toHaveLength(2)
  })

  it('WhatsApp: connected when a test message goes out; a dead token turns it red at night', async () => {
    const res = await post('/api/integrations/whatsapp/test', { to: '+34 600 111 222' })
    expect(res.status).toBe(200)
    expect(apis.whatsapp.sent).toEqual([{ to: '34600111222', template: 'hello_world' }])
    expect(db.integration('whatsapp')).toMatchObject({ status: 'connected', account_label: '+34 600 000 000' })
    apis.whatsapp.broken = true
    await nightly()
    expect(db.integration('whatsapp')).toMatchObject({ status: 'error', last_error: expect.stringContaining('Session has expired') })
  })
})

describe('Groups and permissions', () => {
  it('the app’s groups match the database’s (one app per group)', () => {
    for (const [provider, group] of Object.entries(GROUP)) expect(groupOf(provider)).toBe(group)
    // Every group with more than one real choice is enforced by the database too.
    for (const g of GROUPS) {
      const real = g.options.filter(o => !o.soon)
      if (g.pickOne && real.length > 1) for (const o of real) expect(GROUP[o.id]).toBe(g.key)
      if (!g.pickOne) for (const o of real) expect(GROUP[o.id]).toBeUndefined()
      for (const o of real) expect(PROVIDERS).toContain(o.id)
    }
  })

  it('reads Microsoft’s granted permissions however they are written', () => {
    expect(hasScope('outlook', 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read')).toBe(true)
    expect(hasScope('outlook', 'mail.send user.read')).toBe(true)
    expect(hasScope('onedrive', 'Files.ReadWrite.All User.Read')).toBe(true)
    expect(hasScope('onedrive', 'Files.Read User.Read')).toBe(false)
    expect(hasScope('gmail', 'openid email')).toBe(false)
  })

  it('explains provider errors in words an admin can act on', () => {
    expect(explain('google_drive', new Error('Google Drive: Google Drive API has not been used in project 1 before or it is disabled.'))).toMatch(/Google Drive API is switched off/)
    expect(explain('spotify', new Error('Refresh token revoked'))).toBe('Spotify access was removed or has expired. Connect it again.')
    expect(explain('onedrive', new Error('Microsoft: Tenant does not have a SPO license.'))).toMatch(/no OneDrive yet/)
    expect(explain('gmail', new Error('Gmail: Request had insufficient authentication scopes.'))).toMatch(/leave every box ticked/)
  })
})

describe('Facebook, TikTok and Square: one click, connected once they really work', () => {
  beforeEach(() => setTikTokWait({ waitMs: 0, tries: 2 }))
  const job = (kind: string, payload: Record<string, unknown>) => db.table('outbox').push({ id: db.table('outbox').length + 1, kind, payload, status: 'pending', attempts: 0 })

  it('Facebook: signs in, finds the one Page it manages, keeps only Page tokens (encrypted)', async () => {
    const start = await post('/api/integrations/facebook/start')
    const auth = new URL((await start.json() as { url: string }).url)
    expect(auth.searchParams.get('scope')).toBe('pages_show_list,pages_manage_posts,pages_read_engagement')
    expect((await connectOwn('facebook')).searchParams.get('connected')).toBe('facebook')
    expect(db.integration('facebook')).toMatchObject({ status: 'connected', account_label: 'Easy Beans Coffee', external: { page_id: 'page-1', followers: 812 } })
    expect(await unseal(env.INTEGRATION_KEY!, String(db.secret('facebook')!.ciphertext))).toEqual({ pages: { 'page-1': 'page-token-1' } })
  })

  it('Facebook: with several Pages it waits for the admin to pick one, then checks that Page', async () => {
    apis.facebook.pages.push({ id: 'page-2', name: 'Easy Beans Events', access_token: 'page-token-2' })
    await connectOwn('facebook')
    expect(db.integration('facebook')).toMatchObject({ status: 'pending', external: { pages: [{ id: 'page-1' }, { id: 'page-2' }] } })
    expect((await post('/api/integrations/facebook/page', { page_id: 'page-9' })).status).toBe(400)
    expect((await post('/api/integrations/facebook/page', { page_id: 'page-2' })).status).toBe(200)
    expect(db.integration('facebook')).toMatchObject({ status: 'connected', account_label: 'Easy Beans Events' })
  })

  it('Facebook: no Page, or posting not allowed, means not connected', async () => {
    apis.facebook.granted = ['pages_show_list']
    expect((await connectOwn('facebook')).searchParams.get('connect_error')).toMatch(/without the permission/)
    apis.facebook.granted = ['pages_show_list', 'pages_manage_posts']
    apis.facebook.pages = []
    expect((await connectOwn('facebook')).searchParams.get('connect_error')).toMatch(/doesn’t manage any Page/)
    expect(status('facebook')).toBe('disconnected')
    expect(db.secret('facebook')).toBeUndefined()
  })

  it('TikTok: connected once TikTok confirms the account can post; notes when posts can only be private', async () => {
    expect((await connectOwn('tiktok')).searchParams.get('connected')).toBe('tiktok')
    expect(db.integration('tiktok')).toMatchObject({ status: 'connected', account_label: '@easybeanscoffee', external: { private_only: true } })
  })

  it('TikTok: posting not allowed means not connected; a revoked account turns red at night', async () => {
    apis.tiktok.scope = 'user.info.basic'
    expect((await connectOwn('tiktok')).searchParams.get('connect_error')).toMatch(/without the permission/)
    apis.tiktok.scope = 'user.info.basic,video.publish'
    await connectOwn('tiktok')
    apis.tiktok.revoked = true
    await nightly()
    expect(db.integration('tiktok')).toMatchObject({ status: 'error' })
    expect(db.table('notifications')[0]).toMatchObject({ title: 'TikTok stopped working' })
  })

  it('Square: finds the business and its location; takings are added up per day in Madrid time', async () => {
    expect((await connectOwn('square')).searchParams.get('connected')).toBe('square')
    expect(db.integration('square')).toMatchObject({ status: 'connected', account_label: 'Easy Beans Coffee', external: { locations: [{ id: 'L1' }] } })
    const res = await get('/api/integrations/square/sales?from=2026-09-28&to=2026-09-29')
    expect(res.status).toBe(200)
    const sales = await res.json() as { currency: string; days: { date: string; gross: number; tips: number; payments: number }[] }
    expect(sales.currency).toBe('EUR')
    expect(sales.days).toEqual([
      expect.objectContaining({ date: '2026-09-28', gross: 15.5, tips: 0.5, payments: 2 }),
      expect.objectContaining({ date: '2026-09-29', gross: 9, payments: 1 }),
    ])
  })

  it('Square: takings only for admins with pay access; no location means not connected', async () => {
    await connectOwn('square')
    db.table('profiles').find(p => p.id === 'admin-1')!.can_see_pay = false
    expect((await get('/api/integrations/square/sales?from=2026-09-28&to=2026-09-28')).status).toBe(403)
    apis.square.locations = []
    expect((await connectOwn('square')).searchParams.get('connect_error')).toMatch(/no open location/)
  })

  it('publishes planned posts to the Facebook Page and TikTok, and reports links back', async () => {
    await connectOwn('facebook')
    await connectOwn('tiktok')
    job('facebook_post', { post_id: 'p1', target: 'facebook', caption: 'Feria week!', image_url: 'https://app.test/media/posts/a.jpg' })
    job('facebook_post', { post_id: 'p2', target: 'facebook', caption: 'Open late tonight' })
    job('tiktok_post', { post_id: 'p1', target: 'tiktok', caption: 'Feria week!', image_url: 'https://app.test/media/posts/a.jpg' })
    await drainOutbox(env)
    expect(apis.facebook.posts).toEqual([
      { page: 'page-1', kind: 'photos', caption: 'Feria week!', url: 'https://app.test/media/posts/a.jpg' },
      { page: 'page-1', kind: 'feed', caption: 'Open late tonight', url: undefined },
    ])
    expect(apis.tiktok.posts).toEqual([{ caption: 'Feria week!', image: 'https://app.test/media/posts/a.jpg', privacy: 'SELF_ONLY' }])
    const jobs = db.table('outbox')
    expect(jobs.map(j => j.status)).toEqual(['sent', 'sent', 'sent'])
    expect(String(jobs[0].external_id)).toMatch(/^https:\/\/www\.facebook\.com\/page-1_/)
    expect(jobs[2].external_id).toBe('https://www.tiktok.com/@easybeanscoffee/photo/7400000000000000001')
  })

  it('a post TikTok rejects fails with TikTok’s reason (and is retried by the outbox)', async () => {
    await connectOwn('tiktok')
    apis.tiktok.failPost = 'picture_size_check_failed'
    job('tiktok_post', { post_id: 'p1', target: 'tiktok', caption: 'x', image_url: 'https://app.test/media/posts/a.jpg' })
    await drainOutbox(env)
    expect(db.table('outbox')[0]).toMatchObject({ status: 'failed', last_error: 'TikTok: picture_size_check_failed' })
    expect(status('tiktok')).toBe('connected') // the account still works; only this post failed
  })
})

describe('Sign-in emails come from the business’s own Gmail or Outlook (Supabase send-email hook)', () => {
  const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))
  /** A call signed the way Supabase signs it (Standard Webhooks). */
  async function hook(payload: unknown, { key = env.SUPABASE_SERVICE_ROLE_KEY!, at = Date.now() } = {}) {
    const body = JSON.stringify(payload), id = 'msg_1', ts = String(Math.floor(at / 1000))
    const k = await crypto.subtle.importKey('raw', await hookSecret(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = b64(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${id}.${ts}.${body}`)))
    return authEmail.request(`${APP}/api/auth/send-email`, {
      method: 'POST', body, headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}`, 'content-type': 'application/json' },
    }, env, ctx())
  }
  const email = (type: string, extra = {}) => ({
    user: { email: 'eva@example.com', user_metadata: { full_name: 'Eva Ruiz' } },
    email_data: { token: '123456', token_hash: 'hash-abc', redirect_to: 'https://app.test/account', email_action_type: type, site_url: 'https://app.test', ...extra },
  })

  it('sends a password reset from the connected Gmail, with a Supabase link back to the app', async () => {
    await connect('gmail')
    const res = await hook(email('recovery'))
    expect(res.status).toBe(200)
    const sent = readGmail(apis.google.sent.at(-1)!)
    expect(sent.to).toBe('eva@example.com')
    expect(sent.subject).toBe('Reset your Easy Beans password')
    expect(sent.text).toContain('Hola Eva,')
    expect(sent.text).toContain('https://db.test/auth/v1/verify?token=hash-abc&type=recovery&redirect_to=https%3A%2F%2Fapp.test%2Faccount')
  })

  it('sends invites and sign-in codes from Outlook when that is the mailbox', async () => {
    await connect('outlook')
    expect((await hook(email('invite'))).status).toBe(200)
    expect((await hook(email('magiclink'))).status).toBe(200)
    expect(apis.microsoft.sent.slice(-2)).toEqual([
      { to: 'eva@example.com', subject: "You're invited to the Easy Beans team app" },
      { to: 'eva@example.com', subject: 'Your Easy Beans sign-in code' },
    ])
  })

  it('without a connected mailbox it refuses with a reason Supabase shows to the person', async () => {
    const res = await hook(email('recovery'))
    expect(res.status).toBe(503)
    expect((await res.json() as { error: { message: string } }).error.message).toMatch(/Connect Gmail or Outlook/)
  })

  it('rejects calls not signed with the service key, and stale ones', async () => {
    await connect('gmail')
    const before = apis.google.sent.length
    expect((await hook(email('recovery'), { key: 'someone-else' })).status).toBe(401)
    expect((await hook(email('recovery'), { at: Date.now() - 10 * 60_000 })).status).toBe(401)
    expect(apis.google.sent).toHaveLength(before)
    expect(await verifyHook('k', new Headers(), '{}')).toBe(false)
  })

  it('uses the same secret the deploy gives Supabase (scripts/ops/supabase-auth.mjs)', async () => {
    // node -e "console.log(require('crypto').createHmac('sha256','sb_secret_test').update('business-agent:send-email-hook').digest('base64'))"
    expect(b64(await hookSecret('sb_secret_test'))).toBe('l1jtZCyHDwea5xlEe3ldo9dRtQi1diUSS7OMxEi6w+E=')
  })

  it('refuses kinds of email the app does not use', async () => {
    await connect('gmail')
    expect((await hook(email('email_change'))).status).toBe(400)
  })
})
