// Connections, end to end through the Worker's routes, against stand-ins for Supabase and the
// Google, Microsoft, Spotify and Meta APIs. What must never break:
//   - an app shows "Connected" only after it has really worked (email sent, folder made, playlists read)
//   - a business has at most one app per group (Gmail or Outlook, Drive or OneDrive…)
//   - when a working connection stops working, it says why and admins are told (once)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drainOutbox, integrations, setTikTokWait, syncGoogleBothWays } from './integrations'
import { fromGoogleHours, sameHours, toGoogleHours } from './providers/google'
import type { OpeningHours } from '../shared/types'
import { calendarFeeds } from './calendarFeed'
import { checkAll, explain, hasScope, lasting, PROVIDERS } from './connections'
import { serviceClient, type Env } from './supabase'
import { seal, unseal } from './crypto'
import { FakeSupabase, GROUP } from './test/fakeSupabase'
import { FakeProviders, readGmail } from './test/fakeProviders'
import { GROUPS, groupOf } from '../shared/connections'
import { authEmail, hookSecret, verifyHook } from './authEmail'
import { syncSquareCustomers } from './squareCustomers'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret',
  MS_CLIENT_ID: 'ms-id', MS_CLIENT_SECRET: 'ms-secret', SPOTIFY_CLIENT_ID: 'spotify-id', SPOTIFY_CLIENT_SECRET: 'spotify-secret',
  META_ACCESS_TOKEN: 'meta-token', WHATSAPP_PHONE_NUMBER_ID: '555', META_APP_SECRET: 'meta-secret', WHATSAPP_VERIFY_TOKEN: 'verify',
  INSTAGRAM_APP_ID: 'ig-app', INSTAGRAM_APP_SECRET: 'ig-secret',
  META_APP_ID: 'meta-app', TIKTOK_CLIENT_KEY: 'tt-key', TIKTOK_CLIENT_SECRET: 'tt-secret', SQUARE_APP_ID: 'sq-app', SQUARE_APP_SECRET: 'sq-secret',
  STRIPE_CLIENT_ID: 'ca_test', STRIPE_SECRET_KEY: 'sk_test_platform',
  SUMUP_CLIENT_ID: 'su-id', SUMUP_CLIENT_SECRET: 'su-secret', LINKEDIN_CLIENT_ID: 'li-id', LINKEDIN_CLIENT_SECRET: 'li-secret',
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
async function connectOwn(provider: 'spotify' | 'instagram' | 'google' | 'facebook' | 'tiktok' | 'square' | 'stripe' | 'sumup' | 'linkedin', query = 'code=c', withEnv = env) {
  const start = await integrations.request(`${APP}/api/integrations/${provider}/start`, { method: 'POST', headers: as('admin'), body: '{}' }, withEnv, ctx())
  expect(start.status).toBe(200)
  const state = new URL((await start.json() as { url: string }).url).searchParams.get('state')!
  const res = await integrations.request(`${APP}/api/integrations/${provider}/callback?${query}&state=${encodeURIComponent(state)}`, {}, withEnv, ctx())
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

  it('Gmail or Outlook becomes the business’s email when none was typed, and never replaces one that was', async () => {
    const email = () => db.table('business')[0].email
    await connect('gmail')
    expect(email()).toBe('cafe@gmail.com')
    await connect('outlook') // an address is set now (by the first mailbox): kept
    expect(email()).toBe('cafe@gmail.com')
    db.table('business')[0].email = '  '
    await connect('outlook')
    expect(email()).toBe('cafe@outlook.com')
    db.table('business')[0].email = 'hola@easybeans.es'
    await connect('gmail')
    expect(email()).toBe('hola@easybeans.es')
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
    expect(auth.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_content_publish,instagram_business_manage_messages,instagram_business_manage_comments')
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

  it('Instagram: business details show the connected handle, follow a rename, and keep one typed by hand', async () => {
    const handle = () => db.table('business')[0].instagram
    await connectOwn('instagram')
    expect(handle()).toBe('@easy.beans.coffee')
    // Renamed on Instagram: the nightly check follows it.
    apis.instagram.username = 'easybeans.marbella'
    await nightly()
    expect(handle()).toBe('@easybeans.marbella')
    // An admin typed another handle: renames no longer change it.
    db.table('business')[0].instagram = '@easybeans.events'
    apis.instagram.username = 'easybeans.cafe'
    await nightly()
    expect(handle()).toBe('@easybeans.events')
    // Connecting (again) is the admin choosing that account: its handle is shown.
    await connectOwn('instagram')
    expect(handle()).toBe('@easybeans.cafe')
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

describe('Google Maps opening hours: kept the same both ways', () => {
  const week = (mon: string): OpeningHours => ({
    mon: { open: '08:00', close: mon }, tue: { open: '08:00', close: '18:00' }, wed: { open: '08:00', close: '18:00' },
    thu: { open: '08:00', close: '18:00' }, fri: { open: '08:00', close: '18:00' }, sat: { open: '09:00', close: '18:00' }, sun: null,
  })
  const inApp = () => db.table('business')[0].opening_hours as OpeningHours
  const setInApp = (h: OpeningHours) => { db.table('business')[0].opening_hours = h }
  const onGoogle = () => fromGoogleHours(apis.google.hours as never)
  const setOnGoogle = (h: OpeningHours) => { apis.google.hours = toGoogleHours(h) as never }
  const sync = () => syncGoogleBothWays(env, serviceClient(env))

  beforeEach(async () => {
    await connectOwn('google')
    setInApp(week('18:00'))
  })

  it('the first time, the app’s hours go to Google; after that nothing is sent until something changes', async () => {
    expect(await sync()).toBe('pushed')
    expect(sameHours(onGoogle(), week('18:00'))).toBe(true)
    expect(await sync()).toBe('same')
    expect(await sync()).toBe('same')
    expect(apis.google.edits).toHaveLength(1)
  })

  it('hours changed on Google Maps come into the app, and admins are told', async () => {
    await sync(); await sync()
    setOnGoogle(week('15:00'))
    expect(await sync()).toBe('pulled')
    expect(inApp().mon).toEqual({ open: '08:00', close: '15:00' })
    expect(db.table('notifications').filter(n => n.title === 'Opening hours changed on Google Maps').map(n => n.profile_id)).toEqual(['admin-1', 'admin-2'])
    expect(await sync()).toBe('same')
    expect(apis.google.edits).toHaveLength(1)
  })

  it('hours changed in the app go to Google, and the app wins if both changed', async () => {
    await sync(); await sync()
    setInApp(week('16:00'))
    setOnGoogle(week('15:00'))
    expect(await sync()).toBe('pushed')
    expect(onGoogle().mon).toEqual({ open: '08:00', close: '16:00' })
    expect(inApp().mon).toEqual({ open: '08:00', close: '16:00' })
    expect(await sync()).toBe('same')
  })

  it('a change Google is slow to show is not mistaken for an edit on Google', async () => {
    await sync(); await sync()
    apis.google.slowToShow = true
    setInApp(week('16:00'))
    expect(await sync()).toBe('pushed')
    expect(await sync()).toBe('same')
    expect(inApp().mon).toEqual({ open: '08:00', close: '16:00' })
    setOnGoogle(week('16:00')) // Google shows it at last
    expect(await sync()).toBe('same')
    expect(apis.google.edits).toHaveLength(2)
  })

  it('hours removed from the Google listing don’t empty the app’s week', async () => {
    await sync(); await sync()
    apis.google.hours = { periods: [] } as never
    expect(await sync()).toBe('same')
    expect(sameHours(inApp(), week('18:00'))).toBe(true)
  })

  it('“Push hours to Google” counts as sent, so it isn’t sent again', async () => {
    expect((await post('/api/integrations/google/sync')).status).toBe(200)
    expect(await sync()).toBe('same')
    expect(apis.google.edits).toHaveLength(1)
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
    expect(apis.whatsapp.sent).toEqual([{ to: '34600111222', template: 'hello_world', language: 'en_US' }]) // Meta's own template, English only
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
    // Google Maps: names the API that's off, and lists both it needs to connect and sync hours.
    const maps = explain('google_business', new Error('My Business Account Management API has not been used in project 914610483740 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/overview?project=914610483740 then retry.'))
    expect(maps).toMatch(/^The My Business Account Management API is switched off/)
    expect(maps).toContain('both My Business Account Management API and My Business Business Information API')
    expect(lasting('google_business', new Error('Google My Business API has not been used in project 1 before or it is disabled.'))).toBe(true)
    // Before Google approves the project's Business Profile access, every call is over a quota of 0.
    const pending = explain('google_business', new Error("Quota exceeded for quota metric 'Requests' and limit 'Requests per minute' of service 'mybusinessaccountmanagement.googleapis.com' for consumer 'project_number:914610483740'."))
    expect(pending).toMatch(/waiting for Google to approve/)
    expect(pending).not.toMatch(/docs\//)
    expect(lasting('google_business', new Error(pending))).toBe(true)
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
    expect(auth.searchParams.get('scope')).toBe('pages_show_list,pages_manage_posts,pages_read_engagement,pages_messaging')
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

  it('Messenger: the Page’s chats on the Messages page as soon as Facebook is connected, even with none yet; replies go to that person', async () => {
    expect((await get('/api/integrations/facebook/inbox')).status).toBe(400) // not connected
    await connectOwn('facebook')
    expect(db.integration('facebook').external).toMatchObject({ messenger: true })
    expect(await (await get('/api/integrations/facebook/inbox')).json()).toEqual({ conversations: [] })

    const now = Date.now(), at = (min: number) => new Date(now - min * 60_000).toISOString()
    apis.facebook.chats.push(
      { id: 't_1', updated_time: at(10), with: { id: 'psid-1', name: 'Lucía García' }, messages: [
        { id: 'm2', created_time: at(10), fromPage: false, message: 'Do you have oat milk?' },
        { id: 'm1', created_time: at(60), fromPage: true, message: 'Hi Lucía!' }] },
      { id: 't_2', updated_time: at(3 * 24 * 60), with: { id: 'psid-2', name: 'Tom' }, messages: [
        { id: 'm3', created_time: at(3 * 24 * 60), fromPage: false, message: 'Open on Sunday?' }] },
    )
    const inbox = await (await get('/api/integrations/facebook/inbox')).json() as { conversations: { id: string; platform: string; with: { name: string }; recent: { text: string; fromMe: boolean }[] }[] }
    expect(inbox.conversations.map(c => [c.id, c.platform, c.with.name])).toEqual([['t_1', 'messenger', 'Lucía García'], ['t_2', 'messenger', 'Tom']])
    expect(inbox.conversations[0].recent.map(m => [m.text, m.fromMe])).toEqual([['Do you have oat milk?', false], ['Hi Lucía!', true]])
    const thread = await (await get('/api/integrations/facebook/inbox/t_1')).json() as { messages: { text: string }[] }
    expect(thread.messages.map(m => m.text)).toEqual(['Hi Lucía!', 'Do you have oat milk?']) // oldest first

    expect((await post('/api/integrations/facebook/inbox/t_1/reply', { text: 'Yes! Oat and almond.' })).status).toBe(200)
    expect((await post('/api/integrations/facebook/inbox/t_2/reply', { text: 'Sundays 9 to 2' })).status).toBe(200)
    expect(apis.facebook.replies).toEqual([
      { to: 'psid-1', text: 'Yes! Oat and almond.', messaging_type: 'RESPONSE' },
      { to: 'psid-2', text: 'Sundays 9 to 2', messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }, // after 24 hours: a personal reply
    ])
    expect((await post('/api/integrations/facebook/inbox/t_1/reply', { text: '  ' })).status).toBe(400)
  })

  it('Messenger: a Facebook connection made before Messenger asks to connect again, and keeps posting', async () => {
    apis.facebook.granted = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement']
    await connectOwn('facebook')
    expect(db.integration('facebook').external).toMatchObject({ messenger: false })
    const res = await get('/api/integrations/facebook/inbox')
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toMatch(/Connect Facebook again/)
    // Older still: no note of what was allowed, so Facebook's own answer says it.
    delete (db.integration('facebook').external as Record<string, unknown>).messenger
    expect((await (await get('/api/integrations/facebook/inbox')).json() as { error: string }).error).toMatch(/Connect Facebook again/)
    expect(status('facebook')).toBe('connected')
    expect(db.integration('facebook').last_error).toBeNull()
    await nightly()
    expect(status('facebook')).toBe('connected')
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
    const res = await get('/api/integrations/payments/sales?from=2026-09-28&to=2026-09-29')
    expect(res.status).toBe(200)
    const sales = await res.json() as { currency: string; days: { date: string; gross: number; tips: number; payments: number }[] }
    expect(sales.currency).toBe('EUR')
    expect(sales.days).toEqual([
      expect.objectContaining({ date: '2026-09-28', gross: 15.5, tips: 0.5, payments: 2 }),
      expect.objectContaining({ date: '2026-09-29', gross: 9, payments: 1 }),
    ])
    // Each day by Madrid hour and by how people paid, for the Sales page.
    const [first, second] = sales.days as unknown as { hours: number[]; methods: Record<string, number> }[]
    expect(first.hours[10]).toBe(3.5)  // 08:15 UTC is 10:15 in Madrid
    expect(first.hours[23]).toBe(12)
    expect(first.methods).toEqual({ card: 3.5, cash: 12 })
    expect(second.methods).toEqual({ wallet: 9 })
  })

  it('Square: best sellers from completed orders, added up by item; an older connection is asked to connect again', async () => {
    await connectOwn('square')
    const auth = new URL((await (await post('/api/integrations/square/start')).json() as { url: string }).url)
    expect(auth.searchParams.get('scope')).toBe('MERCHANT_PROFILE_READ PAYMENTS_READ ORDERS_READ CUSTOMERS_READ')
    const res = await get('/api/integrations/payments/items?from=2026-09-28&to=2026-09-29')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [
      { name: 'Flat White', quantity: 3, gross: 9.6 },
      { name: 'Croissant · Pistachio', quantity: 1, gross: 4.2 },
    ] })
    apis.square.ordersScope = false
    expect(await (await get('/api/integrations/payments/items?from=2026-09-28&to=2026-09-29')).json()).toEqual({ items: null, reason: 'reconnect' })
    expect(status('square')).toBe('connected') // takings keep working meanwhile
    db.table('profiles').find(p => p.id === 'admin-1')!.can_see_pay = false
    expect((await get('/api/integrations/payments/items?from=2026-09-28&to=2026-09-28')).status).toBe(403)
  })

  it('Square: its customers come into Customers when connecting, tagged Square, then only what changed', async () => {
    // Already on the list from the café (same phone): linked, gaps filled, keeps where they came from and the notes typed here.
    db.table('customers').push({ id: 'c-1', kind: 'customer', first_name: 'Lucía', last_name: null, email: null, phone: '+34 600 111 222',
      company: null, birthday: null, notes: 'Regular, sits outside', source: 'walk_in', square_id: null })
    await connectOwn('square')
    await Promise.all(background)
    const people = () => db.table('customers')
    expect(people()).toHaveLength(2) // the one Square has no name, email or phone for is left out
    expect(people()[0]).toMatchObject({ id: 'c-1', square_id: 'SQC1', source: 'walk_in', last_name: 'García', email: 'lucia@example.com',
      notes: 'Regular, sits outside', birthday: null }) // Square had no year
    expect(people()[1]).toMatchObject({ square_id: 'SQC2', kind: 'customer', source: 'square', first_name: 'Tom', email: 'tom@example.co.uk',
      notes: 'Oat flat white', phone: null })
    expect(people()[1].marketing_consent).toBeUndefined() // nobody is opted in to marketing for them (the database default is no)
    expect(db.integration('square').last_sync_at).toBeTruthy()

    // Later: only people added or changed since; nobody twice, and what's typed here wins.
    people()[1].notes = 'Oat flat white, extra hot'
    apis.square.customers[1] = { ...apis.square.customers[1], note: 'Changed in Square', updated_at: new Date().toISOString() }
    apis.square.customers.push({ id: 'SQC4', given_name: 'Ana', phone_number: '+44 7700 900123', updated_at: new Date().toISOString() })
    expect(await syncSquareCustomers(env, serviceClient(env))).toBe(1)
    expect(people()).toHaveLength(3)
    expect(people()[1].notes).toBe('Oat flat white, extra hot')
    expect(people()[2]).toMatchObject({ square_id: 'SQC4', source: 'square', first_name: 'Ana', phone: '+44 7700 900123' })
    expect(await syncSquareCustomers(env, serviceClient(env))).toBe(0)

    // A connection made before customers were asked for: says reconnect, and takings keep working.
    apis.square.customersScope = false
    expect(await syncSquareCustomers(env, serviceClient(env), true)).toBe('reconnect')
    expect(status('square')).toBe('connected')
  })

  it('Square: comes back to the workers.dev address, then back to where they started (the domain too)', async () => {
    const WORKERS = 'https://business-agent.arononeillwork.workers.dev'
    const start = await integrations.request('https://businesssagent.com/api/integrations/square/start', { method: 'POST', headers: as('admin'), body: '{}' }, env, ctx())
    const auth = new URL((await start.json() as { url: string }).url)
    expect(auth.searchParams.get('redirect_uri')).toBe(`${WORKERS}/api/integrations/square/callback`)
    const res = await integrations.request(`${WORKERS}/api/integrations/square/callback?code=c&state=${encodeURIComponent(auth.searchParams.get('state')!)}`, {}, env, ctx())
    expect(res.headers.get('location')).toBe('https://businesssagent.com/connections?connected=square')
    expect(status('square')).toBe('connected')
    // Started on workers.dev: stays there.
    const again = await integrations.request(`${WORKERS}/api/integrations/square/start`, { method: 'POST', headers: as('admin'), body: '{}' }, env, ctx())
    const state = new URL((await again.json() as { url: string }).url).searchParams.get('state')!
    const back = await integrations.request(`${WORKERS}/api/integrations/square/callback?error=access_denied&state=${encodeURIComponent(state)}`, {}, env, ctx())
    expect(back.headers.get('location')).toMatch(/^https:\/\/business-agent\.arononeillwork\.workers\.dev\/connections\?connect_error=/)
  })

  it('Square: takings only for admins with pay access; no location means not connected', async () => {
    await connectOwn('square')
    db.table('profiles').find(p => p.id === 'admin-1')!.can_see_pay = false
    expect((await get('/api/integrations/payments/sales?from=2026-09-28&to=2026-09-28')).status).toBe(403)
    apis.square.locations = []
    expect((await connectOwn('square')).searchParams.get('connect_error')).toMatch(/no open location/)
  })

  it('Stripe: one click, read-only; takings per day in Madrid time; replaces Square; disconnect removes access on Stripe too', async () => {
    const start = await post('/api/integrations/stripe/start')
    const auth = new URL((await start.json() as { url: string }).url)
    expect(auth.host).toBe('connect.stripe.com')
    expect(auth.searchParams.get('scope')).toBe('read_only')
    expect(auth.searchParams.get('client_id')).toBe('ca_test')
    await connectOwn('square')
    expect((await connectOwn('stripe')).searchParams.get('connected')).toBe('stripe')
    expect(db.integration('stripe')).toMatchObject({ status: 'connected', account_label: 'Easy Beans Coffee SL', external: { account_id: 'acct_1', currency: 'EUR' } })
    expect(status('square')).toBe('disconnected') // one payment system at a time
    const sales = await (await get('/api/integrations/payments/sales?from=2026-09-28&to=2026-09-29')).json() as { provider: string; currency: string; days: { date: string; gross: number; refunds: number; payments: number }[] }
    expect(sales.provider).toBe('stripe')
    expect(sales.currency).toBe('EUR')
    expect(sales.days).toEqual([
      expect.objectContaining({ date: '2026-09-28', gross: 15.5, refunds: 2, payments: 2 }),
      expect.objectContaining({ date: '2026-09-29', gross: 9, refunds: 0, payments: 1 }),
    ])
    // Stripe sends payments only, so there are no best sellers.
    expect(await (await get('/api/integrations/payments/items?from=2026-09-28&to=2026-09-29')).json()).toEqual({ items: null, reason: 'stripe' })
    expect((await post('/api/integrations/stripe/disconnect')).status).toBe(200)
    expect(apis.stripe.deauthorized).toEqual(['acct_1'])
    expect(status('stripe')).toBe('disconnected')
  })

  it('Stripe: removed on Stripe\'s side shows as not working after the nightly check', async () => {
    await connectOwn('stripe')
    apis.stripe.revoked = true
    await nightly()
    expect(db.integration('stripe')).toMatchObject({ status: 'error' })
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

describe('SumUp, LinkedIn and Search Console: connected once they really work', () => {
  const job = (kind: string, payload: Record<string, unknown>) => db.table('outbox').push({ id: db.table('outbox').length + 1, kind, payload, status: 'pending', attempts: 0 })
  /** Change what is kept (encrypted) for a connection, e.g. to make its access run out. */
  async function editSecret(provider: string, patch: Record<string, unknown>) {
    const row = db.secret(provider)!
    row.ciphertext = await seal(env.INTEGRATION_KEY!, { ...await unseal<Record<string, unknown>>(env.INTEGRATION_KEY!, String(row.ciphertext)), ...patch })
  }

  it('SumUp: one click, read-only; replaces Stripe; takings per Madrid day by hour and how people paid, across pages', async () => {
    const auth = new URL((await (await post('/api/integrations/sumup/start')).json() as { url: string }).url)
    expect(`${auth.origin}${auth.pathname}`).toBe('https://api.sumup.com/authorize')
    expect(auth.searchParams.get('scope')).toBe('transactions.history user.profile_readonly')
    expect(auth.searchParams.get('redirect_uri')).toBe(`${APP}/api/integrations/sumup/callback`)
    await connectOwn('stripe')
    expect((await connectOwn('sumup')).searchParams.get('connected')).toBe('sumup')
    expect(db.integration('sumup')).toMatchObject({ status: 'connected', account_label: 'Easy Beans Coffee', external: { merchant_code: 'MCODE1', currency: 'EUR' } })
    expect(status('stripe')).toBe('disconnected') // one payment system at a time
    expect(await unseal(env.INTEGRATION_KEY!, String(db.secret('sumup')!.ciphertext))).toMatchObject({ refresh_token: 'su-refresh-0' })

    apis.sumup.pages = 0
    const sales = await (await get('/api/integrations/payments/sales?from=2026-09-28&to=2026-09-29')).json() as { provider: string; currency: string; days: { date: string; gross: number; tips: number; refunds: number; payments: number; hours: number[]; methods: Record<string, number> }[] }
    expect(apis.sumup.pages).toBe(2) // two payments a page: every page is read
    expect(sales.provider).toBe('sumup')
    expect(sales.currency).toBe('EUR')
    // The tip is kept apart from the sale; the refunded payment counts, with its refund; the failed one doesn't.
    expect(sales.days).toEqual([
      expect.objectContaining({ date: '2026-09-28', gross: 20.5, tips: 0.5, refunds: 5, payments: 3 }),
      expect.objectContaining({ date: '2026-09-29', gross: 9, tips: 0, refunds: 0, payments: 1 }),
    ])
    expect(sales.days[0].hours[10]).toBe(3.5) // 08:15 UTC is 10:15 in Madrid
    expect(sales.days[0].hours[14]).toBe(5)
    expect(sales.days[0].hours[23]).toBe(12)
    expect(sales.days[0].methods).toEqual({ card: 8.5, cash: 12 })
    expect(sales.days[1].methods).toEqual({ wallet: 9 }) // Apple Pay
    // SumUp's history has no line items: no best sellers, and the page says why.
    expect(await (await get('/api/integrations/payments/items?from=2026-09-28&to=2026-09-29')).json()).toEqual({ items: null, reason: 'sumup' })
  })

  it('SumUp: the hour-long access is renewed with the refresh token; removed access turns it red at night', async () => {
    await connectOwn('sumup')
    await editSecret('sumup', { expires_at: new Date(Date.now() - 60_000).toISOString() })
    expect((await get('/api/integrations/payments/sales?from=2026-09-28&to=2026-09-28')).status).toBe(200)
    expect(apis.sumup.refreshes).toBe(1)
    expect(await unseal(env.INTEGRATION_KEY!, String(db.secret('sumup')!.ciphertext))).toMatchObject({ refresh_token: 'su-refresh-1' })
    apis.sumup.revoked = true
    await nightly()
    expect(db.integration('sumup')).toMatchObject({ status: 'error', last_error: 'SumUp access was removed or has expired. Connect it again.' })
    expect(db.table('notifications')[0]).toMatchObject({ title: 'SumUp stopped working' })
  })

  it('SumUp: needs the takings plan, like the other payment systems', async () => {
    db.plan = { plan: 'starter', people: 10, features: ['google_maps', 'apps'] }
    const res = await post('/api/integrations/sumup/start')
    expect(res.status).toBe(402)
  })

  it('LinkedIn: asks to post as the person and to their Pages; with a Page it waits for the choice, then checks it', async () => {
    const auth = new URL((await (await post('/api/integrations/linkedin/start')).json() as { url: string }).url)
    expect(`${auth.origin}${auth.pathname}`).toBe('https://www.linkedin.com/oauth/v2/authorization')
    expect(auth.searchParams.get('scope')).toBe('openid profile w_member_social r_organization_admin w_organization_social')
    await connectOwn('linkedin')
    const row = db.integration('linkedin')
    expect(row).toMatchObject({ status: 'pending', account_label: null, external: { member: { id: 'mem-1', name: 'Aron O’Neill' }, pages: [{ id: '101', name: 'Easy Beans Coffee' }] } })
    // 60 days, kept with the access (encrypted) and shown on the card.
    const secret = await unseal<{ access_token: string; expires_at: string }>(env.INTEGRATION_KEY!, String(db.secret('linkedin')!.ciphertext))
    expect(Date.parse(secret.expires_at) - Date.now()).toBeGreaterThan(59 * 86_400_000)
    expect((row.external as { expires_at: string }).expires_at).toBe(secret.expires_at)

    expect((await post('/api/integrations/linkedin/page', { page_id: '999' })).status).toBe(400)
    expect((await post('/api/integrations/linkedin/page', { page_id: '101' })).status).toBe(200)
    expect(db.integration('linkedin')).toMatchObject({ status: 'connected', account_label: 'Easy Beans Coffee', external: { page_id: '101', page_name: 'Easy Beans Coffee' } })
    // Or their own profile instead.
    expect((await post('/api/integrations/linkedin/page', { page_id: 'me' })).status).toBe(200)
    expect(db.integration('linkedin')).toMatchObject({ status: 'connected', account_label: 'Aron O’Neill', external: { page_id: 'me' } })
  })

  it('LinkedIn: with no Page, or Pages switched off (LINKEDIN_PAGES=off), it posts as the person straight away', async () => {
    apis.linkedin.orgs = []
    await connectOwn('linkedin')
    expect(db.integration('linkedin')).toMatchObject({ status: 'connected', account_label: 'Aron O’Neill', external: { page_id: 'me', page_name: 'Aron O’Neill', pages: [] } })

    const off = { ...env, LINKEDIN_PAGES: 'off' } as Env
    const start = await integrations.request(`${APP}/api/integrations/linkedin/start`, { method: 'POST', headers: as('admin'), body: '{}' }, off, ctx())
    expect(new URL((await start.json() as { url: string }).url).searchParams.get('scope')).toBe('openid profile w_member_social')
    apis.linkedin.orgs = [{ id: 101, localizedName: 'Easy Beans Coffee' }]
    apis.linkedin.scope = 'openid,profile,w_member_social'
    await connectOwn('linkedin', 'code=c', off)
    expect(db.integration('linkedin')).toMatchObject({ status: 'connected', external: { page_id: 'me', pages: [] } })
  })

  it('LinkedIn: an app not approved for Pages, or posting unticked, is told why and not connected', async () => {
    const refused = await connectOwn('linkedin', 'error=unauthorized_scope_error&error_description=Scope%20%22r_organization_admin%22%20is%20not%20authorized%20for%20your%20application')
    expect(refused.searchParams.get('connect_error')).toMatch(/hasn’t approved this app for company Pages.*LINKEDIN_PAGES=off/)
    expect((await connectOwn('linkedin', 'error=user_cancelled_authorize&error_description=The%20user%20cancelled')).searchParams.get('connect_error')).toBe('LinkedIn connection was cancelled')
    apis.linkedin.scope = 'openid,profile'
    expect((await connectOwn('linkedin')).searchParams.get('connect_error')).toMatch(/without the permission/)
    expect(status('linkedin')).toBe('disconnected')
    expect(db.secret('linkedin')).toBeUndefined()
  })

  it('LinkedIn: posts go to the chosen Page (text in LinkedIn’s format, the photo uploaded) and link back', async () => {
    await connectOwn('linkedin')
    await post('/api/integrations/linkedin/page', { page_id: '101' })
    job('linkedin_post', { post_id: 'p1', target: 'linkedin', caption: 'We’re hiring (barista) #SanPedro #coffee', image_url: 'https://cdn.test/team.jpg', kind: 'post', media: [{ url: 'https://cdn.test/team.jpg', type: 'image' }] })
    job('linkedin_post', { post_id: 'p2', target: 'linkedin', caption: 'Open late tonight', image_url: null, kind: 'post', media: [] })
    await drainOutbox(env)
    expect(apis.linkedin.uploads).toEqual([{ owner: 'urn:li:organization:101', type: 'image/jpeg', size: 8, image: expect.stringMatching(/^urn:li:image:/) }])
    expect(apis.linkedin.posts).toEqual([
      expect.objectContaining({ author: 'urn:li:organization:101', visibility: 'PUBLIC', lifecycleState: 'PUBLISHED',
        commentary: 'We’re hiring \\(barista\\) {hashtag|\\#|SanPedro} {hashtag|\\#|coffee}',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { media: { id: apis.linkedin.uploads[0].image } } }),
      expect.not.objectContaining({ content: expect.anything() }),
    ])
    const jobs = db.table('outbox')
    expect(jobs.map(j => j.status)).toEqual(['sent', 'sent'])
    expect(jobs[0].external_id).toBe('https://www.linkedin.com/feed/update/urn:li:share:700000000000000001')
    // As the person: their own profile is the author.
    await post('/api/integrations/linkedin/page', { page_id: 'me' })
    job('linkedin_post', { post_id: 'p3', target: 'linkedin', caption: 'Hello', image_url: null })
    await drainOutbox(env)
    expect(apis.linkedin.posts.at(-1)).toMatchObject({ author: 'urn:li:person:mem-1', commentary: 'Hello' })
  })

  it('LinkedIn: after 60 days it says to connect again; admins are warned a week before; removed access turns it red', async () => {
    await connectOwn('linkedin')
    await post('/api/integrations/linkedin/page', { page_id: '101' })
    await editSecret('linkedin', { expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString() })
    await nightly()
    await nightly()
    expect(status('linkedin')).toBe('connected')
    expect(db.table('notifications').filter(n => n.title === 'LinkedIn needs connecting again soon')).toHaveLength(2) // once, to each active admin
    await editSecret('linkedin', { expires_at: new Date(Date.now() - 60_000).toISOString() })
    await nightly()
    expect(db.integration('linkedin')).toMatchObject({ status: 'error', last_error: 'LinkedIn access has expired. Connect it again.' })
    job('linkedin_post', { post_id: 'p1', target: 'linkedin', caption: 'x', image_url: null })
    await drainOutbox(env)
    expect(db.table('outbox')[0]).toMatchObject({ status: 'failed', last_error: 'LinkedIn access has expired. Connect it again.' })

    await connectOwn('linkedin')
    await post('/api/integrations/linkedin/page', { page_id: 'me' })
    apis.linkedin.revoked = true
    await nightly()
    expect(db.integration('linkedin')).toMatchObject({ status: 'error', last_error: 'LinkedIn access was removed or has expired. Connect it again.' })
  })

  it('LinkedIn: an app LinkedIn approved for refresh tokens renews the access instead of asking', async () => {
    apis.linkedin.refreshable = true
    await connectOwn('linkedin')
    await post('/api/integrations/linkedin/page', { page_id: '101' })
    await editSecret('linkedin', { expires_at: new Date(Date.now() + 2 * 86_400_000).toISOString() })
    await nightly()
    expect(apis.linkedin.refreshes).toBe(1)
    expect(status('linkedin')).toBe('connected')
    expect(db.table('notifications')).toHaveLength(0)
  })

  it('Search Console: picks the business’s website, proves its search data can be read, and needs only read access', async () => {
    db.table('business')[0].website = 'https://www.easybeanscoffee.com'
    const start = await post('/api/integrations/connect/search_console/start')
    expect(new URL((await start.json() as { url: string }).url).searchParams.get('scope')).toBe('https://www.googleapis.com/auth/webmasters.readonly openid email')
    expect((await connect('search_console')).searchParams.get('connected')).toBe('search_console')
    expect(db.integration('search_console')).toMatchObject({ status: 'connected', account_label: 'www.easybeanscoffee.com',
      external: { site: 'https://www.easybeanscoffee.com/', sites: ['https://www.easybeanscoffee.com/', 'sc-domain:easybeans.events'] } })
    expect(apis.searchConsole.queries[0]).toMatchObject({ site: 'https://www.easybeanscoffee.com/', dimensions: [] })
    expect(apis.google.sent).toHaveLength(0) // no confirmation email for this one
  })

  it('Search Console: with several websites and none the business’s, it waits for the admin to choose one', async () => {
    db.table('business')[0].website = null
    await connect('search_console')
    expect(db.integration('search_console')).toMatchObject({ status: 'pending', external: { sites: ['https://www.easybeanscoffee.com/', 'sc-domain:easybeans.events'] } })
    expect((await get('/api/integrations/search_console/report?from=2026-10-01&to=2026-10-02')).status).toBe(400)
    expect((await post('/api/integrations/search_console/site', { site: 'https://old.example.com/' })).status).toBe(400) // unverified: not offered
    expect((await post('/api/integrations/search_console/site', { site: 'sc-domain:easybeans.events' })).status).toBe(200)
    expect(db.integration('search_console')).toMatchObject({ status: 'connected', account_label: 'easybeans.events', external: { site: 'sc-domain:easybeans.events' } })
  })

  it('Search Console: an account with no website in it is not connected, and says what to do', async () => {
    apis.searchConsole.sites = []
    expect((await connect('search_console')).searchParams.get('connect_error'))
      .toBe('This Google account has no website in Search Console. Add and verify the website at search.google.com/search-console, then connect again.')
    expect(status('search_console')).toBe('disconnected')
    apis.searchConsole.sites = [{ siteUrl: 'https://x.test/', permissionLevel: 'siteOwner' }]
    apis.google.disabled.add('search_console')
    expect((await connect('search_console')).searchParams.get('connect_error')).toMatch(/^The Google Search Console API is switched off/)
  })

  it('Search Console: the report has totals, days in order, top searches and pages, devices and countries', async () => {
    db.table('business')[0].website = 'easybeanscoffee.com'
    await connect('search_console')
    const res = await get('/api/integrations/search_console/report?from=2026-10-01&to=2026-10-02')
    expect(res.status).toBe(200)
    const r = await res.json() as import('../shared/types').SearchReport
    expect(r).toMatchObject({ site: 'https://www.easybeanscoffee.com/', from: '2026-10-01', to: '2026-10-02' })
    expect(r.totals).toEqual({ clicks: 61, impressions: 2400, ctr: 0.0254, position: 9.5 })
    expect(r.days.map(d => d.date)).toEqual(['2026-10-01', '2026-10-02'])
    expect(r.queries.map(q => q.query)).toEqual(['easy beans coffee', 'brunch marbella'])
    expect(r.queries[0]).toEqual({ query: 'easy beans coffee', clicks: 40, impressions: 101, ctr: 0.396, position: 1.1 })
    expect(r.pages).toEqual([{ page: 'https://www.easybeanscoffee.com/', clicks: 50, impressions: 1800, ctr: 0.0278, position: 8.2 }])
    expect(r.devices.map(d => d.device)).toEqual(['MOBILE', 'DESKTOP', 'TABLET'])
    expect(r.countries.map(c => c.country)).toEqual(['esp', 'gbr'])
    expect(apis.searchConsole.queries.filter(q => q.startDate === '2026-10-01').map(q => q.dimensions.join(',')).sort()).toEqual(['', 'country', 'date', 'device', 'page', 'query'])
    expect((await get('/api/integrations/search_console/report?from=2026-10-02&to=2026-10-01')).status).toBe(400)
    expect((await get('/api/integrations/search_console/report?from=2026-10-01&to=2026-10-02', 'staff')).status).toBe(403)
  })

  it('Search Console: the website taken out of the account turns it red at night', async () => {
    db.table('business')[0].website = 'https://www.easybeanscoffee.com/'
    await connect('search_console')
    await nightly()
    expect(status('search_console')).toBe('connected')
    apis.searchConsole.sites = apis.searchConsole.sites.filter(s => s.siteUrl !== 'https://www.easybeanscoffee.com/')
    await nightly()
    expect(db.integration('search_console')).toMatchObject({ status: 'error',
      last_error: 'www.easybeanscoffee.com is no longer in this Google account’s Search Console. Choose another website or connect again.' })
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

describe('Messages: the Instagram inbox (read and answer DMs)', () => {
  const ALL = 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_messages,instagram_business_manage_comments'
  beforeEach(async () => {
    apis.instagram.permissions = ALL
    await connectOwn('instagram')
  })
  const inbox = async () => (await get('/api/integrations/instagram/inbox')).json() as Promise<{
    conversations: { id: string; with: { id: string; username: string; name?: string; picture?: string }; recent: { kind: string; fromMe: boolean; text: string }[] }[]
    tagged: { username: string }[] | null; taggedNote?: string; error?: string }>
  /** Lucía's last message was this many hours ago (the café answered before that). */
  const luciaWrote = (hoursAgo: number) => {
    const msgs = ((apis.instagram.chats[0] as { messages: { data: { created_time: string }[] } }).messages.data)
    msgs.forEach((m, i) => { m.created_time = new Date(Date.now() - (hoursAgo + i) * 3_600_000).toISOString() })
  }

  it('connecting notes that messages and tagged posts were allowed', () => {
    expect(db.integration('instagram').external).toMatchObject({ can_message: true, can_see_tags: true })
  })

  it('lists chats with who they are with, newest message first, its kind, and the posts the café is tagged in', async () => {
    const res = await inbox()
    expect(res.conversations).toHaveLength(1)
    const [c] = res.conversations
    expect(c.with).toEqual({ id: 'igsid-lucia', username: 'lucia.marbella', name: 'Lucía García', picture: 'https://cdn.instagram.test/lucia.jpg' })
    expect(c.recent.map(m => [m.kind, m.fromMe, m.text])).toEqual([
      ['text', false, 'Do you have oat milk?'], ['story_mention', false, ''], ['text', true, 'See you tomorrow!']])
    expect(res.tagged).toEqual([expect.objectContaining({ username: 'sanpedro.eats', permalink: 'https://instagram.com/p/t1' })])
  })

  it('a person Instagram won’t describe (blocked, or Instagram busy) still shows, with no photo', async () => {
    apis.instagram.profileFails = ['igsid-lucia']
    const res = await inbox()
    expect(res.conversations[0].with).toEqual({ id: 'igsid-lucia', username: 'lucia.marbella' })
    const thread = await (await get('/api/integrations/instagram/inbox/conv-1')).json() as { conversation: { with: { picture?: string } } }
    expect(thread.conversation.with.picture).toBeUndefined()
  })

  it('opens a chat oldest first (with their photo), and a reply goes to the person in that chat', async () => {
    luciaWrote(1)
    const thread = await (await get('/api/integrations/instagram/inbox/conv-1')).json() as { conversation: { with: { picture?: string } }; messages: { id: string }[] }
    expect(thread.messages.map(m => m.id)).toEqual(['mid-1', 'mid-2', 'mid-3'])
    expect(thread.conversation.with.picture).toBe('https://cdn.instagram.test/lucia.jpg')
    const res = await post('/api/integrations/instagram/inbox/conv-1/reply', { text: '  Yes, oat and almond!  ', to: 'someone-else' })
    expect(res.status).toBe(200)
    expect(apis.instagram.sent).toEqual([{ recipient: { id: 'igsid-lucia' }, message: { text: 'Yes, oat and almond!' } }])
  })

  it('after 24 hours a reply goes as a personal (human agent) reply, up to 7 days', async () => {
    luciaWrote(30)
    const res = await post('/api/integrations/instagram/inbox/conv-1/reply', { text: 'Sorry for the wait: yes, oat milk!' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, human_agent: true })
    expect(apis.instagram.sent).toEqual([{ recipient: { id: 'igsid-lucia' }, message: { text: 'Sorry for the wait: yes, oat milk!' },
      messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }])
  })

  it('a Meta app without the Human Agent feature: told what to add, or to reply in Instagram', async () => {
    luciaWrote(30)
    apis.instagram.noHumanAgent = true
    const res = await post('/api/integrations/instagram/inbox/conv-1/reply', { text: 'Sorry for the wait' })
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toMatch(/Human Agent feature.*Instagram app/)
    expect(apis.instagram.sent).toEqual([])
  })

  it('after 7 days nothing is sent: Instagram doesn’t allow it', async () => {
    luciaWrote(8 * 24)
    const res = await post('/api/integrations/instagram/inbox/conv-1/reply', { text: 'Hello?' })
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toMatch(/up to 7 days.*Instagram app/)
    expect(apis.instagram.sent).toEqual([])
  })

  it('an empty or too long reply is refused before anything is sent', async () => {
    expect((await post('/api/integrations/instagram/inbox/conv-1/reply', { text: '   ' })).status).toBe(400)
    expect((await post('/api/integrations/instagram/inbox/conv-1/reply', { text: 'é'.repeat(501) })).status).toBe(400)
    expect(apis.instagram.sent).toEqual([])
  })

  it('works when Instagram refuses the detailed message fields', async () => {
    apis.instagram.plainOnly = true
    expect((await inbox()).conversations[0].recent[0].text).toBe('Do you have oat milk?')
  })

  it('an account that didn’t allow messages is told to connect again; one that didn’t allow comments just loses tagged posts', async () => {
    apis.instagram.noTags = true
    const partly = await inbox()
    expect(partly.conversations).toHaveLength(1)
    expect(partly.tagged).toBeNull()
    expect(partly.taggedNote).toMatch(/Manage comments/)
    apis.instagram.noMessages = true
    const res = await get('/api/integrations/instagram/inbox')
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toMatch(/Connect Instagram again.*Allow access to messages/)
  })

  it('staff can’t read the business’s messages', async () => {
    expect((await get('/api/integrations/instagram/inbox', 'staff')).status).toBe(403)
    expect((await post('/api/integrations/instagram/inbox/conv-1/reply', { text: 'hi' }, 'staff')).status).toBe(403)
  })

  it('Connect pressed on Messages comes back to Messages', async () => {
    const start = await post('/api/integrations/instagram/start', { back: 'messages' })
    const state = new URL((await start.json() as { url: string }).url).searchParams.get('state')!
    const res = await integrations.request(`${APP}/api/integrations/instagram/callback?code=c&state=${encodeURIComponent(state)}`, {}, env, ctx())
    const back = new URL(res.headers.get('location')!)
    expect(back.pathname).toBe('/messages')
    expect(back.searchParams.get('connected')).toBe('instagram')
  })
})
