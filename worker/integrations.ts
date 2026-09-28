// Connections to Google Business Profile, WhatsApp, Instagram, email, files, calendars and music,
// and the outbox worker that delivers everything queued in the database (with retries; see
// migration 7). Whether a connection really works is decided in connections.ts.
import { Hono, type Context } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, serviceClient, userClient, type Env } from './supabase'
import { seal, signState, verifyState } from './crypto'
import * as google from './providers/google'
import * as whatsapp from './providers/whatsapp'
import * as instagram from './providers/instagram'
import * as spotify from './providers/spotify'
import * as ms from './providers/microsoft'
import * as youtube from './providers/youtube'
import * as facebook from './providers/facebook'
import * as tiktok from './providers/tiktok'
import * as square from './providers/square'
import { alertEmail, base64url, mimeMessage } from '../shared/alertText'
import { addToCalendarUrl, optionName } from '../shared/connections'
import { finishMusicConnect, type MusicState } from './music'
import { ensureFeed } from './calendarFeed'
import {
  CONNECTORS, PROVIDERS, ROW_COLUMNS, SCOPES, calendarSeen, calendarFetched, checkAll, checkOne, connectedOf, connectorConfigured,
  connectorGrant, explain, facebookOAuth, facebookSession, googleConfig, googleSession, instagramOAuth, instagramSession, isCalendarApp, isGoogle,
  lasting, markBroken, msConfig, proveFacebook, proveInstagram, proveNew, proveSpotify, proveSquare, proveTikTok, setIntegration, spotifyConfig,
  spotifySession, squareOAuth, squareSession, tiktokOAuth, tiktokSession, waConfig, type Connector, type Provider,
} from './connections'
import type { Business, CalendarEvent, SpotifyPlaylist } from '../shared/types'
import { today, zonedIso } from '../shared/time'

export { waConfig }

interface ConnectorState { uid: string; kind: 'connector'; provider: Connector; back?: 'setup' | 'connections' }

/** Send an email from the café's connected mailbox (Gmail or Outlook, whichever the business chose). */
export async function sendEmail(env: Env, db: SupabaseClient, m: { to: string; subject: string; text: string }) {
  const p = await connectedOf(db, ['gmail', 'outlook'] as const)
  if (!p) throw new Error('No mailbox connected. Connect Gmail or Outlook on the Connections page.')
  try {
    const { token } = await connectorGrant(env, db, p)
    if (p === 'gmail') return await google.sendGmail(token, base64url(mimeMessage(m)))
    await ms.sendMail(token, m)
    return null
  } catch (e) {
    // Access removed, permission missing…: the card turns red and admins hear about it.
    if (lasting(p, e)) await markBroken(db, p, explain(p, e))
    throw new Error(explain(p, e))
  }
}

/** Save a file to the café's connected storage (Google Drive or OneDrive); returns a link. */
export async function saveFile(env: Env, db: SupabaseClient, f: { folder: string; name: string; content: string; type: string }) {
  const p = await connectedOf(db, ['google_drive', 'onedrive'] as const)
  if (!p) throw new Error('No file storage connected. Connect Google Drive or OneDrive on the Connections page.')
  try {
    const { token } = await connectorGrant(env, db, p)
    const link = p === 'google_drive' ? await google.saveToDrive(token, f.folder, f.name, f.content, f.type) : await ms.saveFile(token, f.folder, f.name, f.content, f.type)
    await setIntegration(db, p, { last_sync_at: new Date().toISOString(), last_error: null })
    return { link, provider: p }
  } catch (e) {
    if (lasting(p, e)) await markBroken(db, p, explain(p, e))
    throw new Error(explain(p, e))
  }
}

/** Push the app's hours, closures and phone to Google. */
export async function syncGoogle(env: Env, db: SupabaseClient) {
  const s = await googleSession(env, db)
  if (!s.location) throw new Error('Choose which Google listing to update')
  const [{ data: b }, { data: events }] = await Promise.all([
    db.from('business').select('opening_hours, phone').eq('id', 1).single(),
    db.from('calendar_events').select('*').gte('starts_on', today()),
  ])
  const biz = b as Pick<Business, 'opening_hours' | 'phone'>
  await google.updateLocation(s.token, s.location, {
    regularHours: google.toGoogleHours(biz.opening_hours),
    specialHours: google.toSpecialHours((events ?? []) as CalendarEvent[], today(), s.closedOnHolidays),
    phone: biz.phone,
  })
  await setIntegration(db, 'google_business', { last_sync_at: new Date().toISOString(), last_error: null, status: 'connected' })
}

/** How long to wait for TikTok to confirm a post (tests set it to nothing). */
let tiktokWait: { waitMs?: number; tries?: number } = {}
export const setTikTokWait = (w: typeof tiktokWait) => { tiktokWait = w }

/** Deliver due outbox jobs. Called by the cron every minute. */
export async function drainOutbox(env: Env) {
  const db = serviceClient(env)
  const { data: jobs, error } = await db.rpc('claim_outbox', { p_limit: 25 })
  if (error) throw new Error(error.message)
  for (const job of (jobs ?? []) as { id: number; kind: string; payload: Record<string, unknown> }[]) {
    try {
      let externalId: string | null = null
      if (job.kind === 'whatsapp') {
        const cfg = waConfig(env)
        if (!cfg) throw new Error('WhatsApp is not set up')
        const p = job.payload as { to: string; template: string; params: string[] }
        externalId = await whatsapp.sendTemplate(cfg, p.to, p.template, p.params ?? [])
      } else if (job.kind === 'google_sync') {
        await syncGoogle(env, db)
      } else if (job.kind === 'google_post') {
        const s = await googleSession(env, db)
        if (!s.location || !s.account) throw new Error('Choose which Google listing to post to')
        externalId = (await google.createPost(s.token, s.account, s.location, job.payload as never)).name
      } else if (job.kind === 'email') {
        const p = job.payload as { to: string; template: string; params: string[] }
        const { data: biz } = await db.from('business').select('name').eq('id', 1).single()
        externalId = await sendEmail(env, db, { to: p.to, ...alertEmail(p.template, p.params ?? [], biz?.name ?? 'Business Agent') })
      } else if (job.kind === 'instagram_post') {
        const p = job.payload as { image_url: string; caption: string }
        externalId = await instagram.publishPhoto(await instagramSession(env, db), p.image_url, p.caption)
      } else if (job.kind === 'facebook_post') {
        const p = job.payload as { image_url?: string | null; caption: string }
        const s = await facebookSession(env, db)
        externalId = await facebook.publish(s.graphVersion, s.pageId, s.token, p.caption, p.image_url)
      } else if (job.kind === 'tiktok_post') {
        const p = job.payload as { image_url: string; caption: string }
        externalId = await tiktok.publishPhoto(await tiktokSession(env, db), p.caption, p.image_url, tiktokWait)
      }
      await db.rpc('complete_outbox', { p_id: job.id, p_ok: true, p_external_id: externalId })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await db.rpc('complete_outbox', { p_id: job.id, p_ok: false, p_error: message })
      if (job.kind.startsWith('google')) await setIntegration(db, 'google_business', { last_error: message }).catch(() => {})
      // A post failing because the access was removed turns that app red (admins are told once).
      const app = ({ instagram_post: 'instagram', facebook_post: 'facebook', tiktok_post: 'tiktok' } as Record<string, Provider>)[job.kind]
      if (app && lasting(app, e)) await markBroken(db, app, explain(app, e)).catch(() => {})
    }
  }
}

/**
 * The Google and Spotify callbacks also finish personal Music connections (state kind 'music'),
 * so those use the redirect URLs already registered with each provider. Returns null otherwise.
 */
async function musicCallback(c: Context<{ Bindings: Env; Variables: { userId: string } }>, provider: 'spotify' | 'youtube') {
  const origin = new URL(c.req.url).origin
  let state: MusicState | { kind?: undefined }
  try { state = await verifyState<MusicState>(c.env.INTEGRATION_KEY!, c.req.query('state') ?? '') } catch { return null }
  if (state.kind !== 'music' || state.provider !== provider) return null
  try {
    if (c.req.query('error')) throw new Error(c.req.query('error') === 'access_denied' ? 'Connection was cancelled' : c.req.query('error'))
    await finishMusicConnect(c.env, state, c.req.query('code') ?? '', origin)
    return c.redirect(`${origin}/music?connected=${provider}`)
  } catch (e) {
    return c.redirect(`${origin}/music?connect_error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`)
  }
}

// ---------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------
export const integrations = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

/** Admin-only routes: check the caller's Supabase token and role. */
integrations.use('/api/integrations/*', async (c, next) => {
  if (c.req.path.endsWith('/callback')) return next()
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const sb = userClient(c.env, token, 'app')
  const [{ data: user }, { data: isAdmin }] = await Promise.all([sb.auth.getUser(token), sb.rpc('is_admin')])
  if (!user.user || !isAdmin) return c.json({ error: 'Only an admin can manage connections' }, 403)
  c.set('userId', user.user.id)
  await next()
})

integrations.get('/api/integrations', async c => {
  const db = serviceClient(c.env)
  const { data } = await db.from('integrations').select(ROW_COLUMNS)
  const setup = {
    google_business: !!googleConfig(c.env, ''),
    whatsapp: !!waConfig(c.env) && !!c.env.META_APP_SECRET && !!c.env.WHATSAPP_VERIFY_TOKEN,
    instagram: !!instagramOAuth(c.env, ''),
    facebook: !!facebookOAuth(c.env, ''),
    tiktok: !!tiktokOAuth(c.env, ''),
    square: !!squareOAuth(c.env, ''),
    spotify: !!spotifyConfig(c.env, ''),
    ...Object.fromEntries(CONNECTORS.map(p => [p, connectorConfigured(c.env, p)])),
    // Calendars need no keys of their own: the calendar app subscribes to the team calendar link.
    google_calendar: !!c.env.INTEGRATION_KEY,
    outlook_calendar: !!c.env.INTEGRATION_KEY,
  }
  const { data: queue } = await db.from('outbox').select('kind, status').in('status', ['pending', 'failed', 'dead'])
  return c.json({ integrations: data, configured: setup, queue })
})

// Google: start OAuth (the browser then navigates to the returned URL).
integrations.post('/api/integrations/google/start', async c => {
  const origin = new URL(c.req.url).origin
  const cfg = googleConfig(c.env, origin)
  if (!cfg) return c.json({ error: 'Google is not set up yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and INTEGRATION_KEY.' }, 400)
  const { back } = await c.req.json<{ back?: 'setup' | 'connections' }>().catch(() => ({ back: undefined }))
  const state = await signState(c.env.INTEGRATION_KEY!, { uid: c.get('userId'), back })
  return c.json({ url: google.authUrl(cfg, state) })
})

// Email, files and YouTube Music: start (the browser then goes to Google or Microsoft)…
integrations.post('/api/integrations/connect/:provider/start', async c => {
  const p = c.req.param('provider') as Connector
  if (!CONNECTORS.includes(p)) return c.json({ error: 'Unknown connection' }, 404)
  const origin = new URL(c.req.url).origin
  const { back } = await c.req.json<{ back?: 'setup' | 'connections' }>().catch(() => ({ back: undefined }))
  const state = await signState(c.env.INTEGRATION_KEY ?? '', { uid: c.get('userId'), kind: 'connector', provider: p, back } satisfies ConnectorState)
  if (isGoogle(p)) {
    const cfg = googleConfig(c.env, origin)
    if (!cfg) return c.json({ error: `${optionName(p)} needs the Google keys first (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; see docs/sign-in-setup.md).` }, 400)
    return c.json({ url: google.authUrl(cfg, state, [...SCOPES[p]]) })
  }
  const cfg = msConfig(c.env, origin)
  if (!cfg) return c.json({ error: `${optionName(p)} needs the Microsoft app first: run the "Set up Microsoft sign-in" workflow (docs/sign-in-setup.md).` }, 400)
  return c.json({ url: ms.authUrl(cfg, state, SCOPES[p]) })
})

/**
 * …and finish: use the new connection for real first (send the confirmation email, make the
 * folder, read the playlists). Only if that works is the access kept (encrypted) and the app shown
 * as connected; the other app in its group is then disconnected by the database (migration 28).
 */
async function finishConnector(c: Context<{ Bindings: Env; Variables: { userId: string } }>, state: ConnectorState) {
  const origin = new URL(c.req.url).origin
  const back = (q: string) => c.redirect(`${origin}/${state.back === 'setup' ? 'setup' : 'connections'}?${q}`)
  const p = state.provider
  const db = serviceClient(c.env)
  if (c.req.query('error')) {
    const cancelled = /access_denied|consent_required/.test(c.req.query('error')!)
    return back(`connect_error=${encodeURIComponent(cancelled ? `${optionName(p)} connection was cancelled` : (c.req.query('error_description') ?? c.req.query('error')!))}`)
  }
  try {
    const code = c.req.query('code') ?? ''
    const gcfg = googleConfig(c.env, origin), mcfg = msConfig(c.env, origin)
    if (isGoogle(p) ? !gcfg : !mcfg) throw new Error(`${optionName(p)} is not set up`)
    const t = isGoogle(p) ? await google.exchangeCode(gcfg!, code) : await ms.exchangeCode(mcfg!, code)
    if (!t.refresh_token) throw new Error(`${optionName(p)} did not allow offline access. Remove the app from your account's connected apps and connect again.`)
    const { data: biz } = await db.from('business').select('name').eq('id', 1).maybeSingle()
    const proven = await proveNew(p, { access_token: t.access_token!, scope: t.scope }, biz?.name ?? 'Business Agent')
    const { error } = await db.from('integration_secrets').upsert({ provider: p, ciphertext: await seal(c.env.INTEGRATION_KEY!, { refresh_token: t.refresh_token }), updated_at: new Date().toISOString() })
    if (error) throw new Error(error.message)
    const now = new Date().toISOString()
    await setIntegration(db, p, { status: 'connected', connected_by: state.uid, connected_at: now, last_checked_at: now, last_error: null, account_label: proven.label, external: proven.external })
    return back(`connected=${p}`)
  } catch (e) {
    // Not connected. The reason shows on this app's card; whatever was connected before stays.
    const why = explain(p, e)
    await setIntegration(db, p, { last_error: why }).catch(() => {})
    return back(`connect_error=${encodeURIComponent(why)}`)
  }
}

// "Check now": prove one connection (or every one) still works, right away.
integrations.post('/api/integrations/check', async c =>
  c.json({ integrations: await checkAll(c.env, serviceClient(c.env), { notify: false }) }))

integrations.post('/api/integrations/:provider/check', async c => {
  const p = c.req.param('provider') as Provider
  if (!PROVIDERS.includes(p)) return c.json({ error: 'Unknown connection' }, 404)
  return c.json(await checkOne(c.env, serviceClient(c.env), p, { notify: false }))
})

// Calendar: choose Google Calendar or Outlook Calendar. It shows as connected once that app has
// fetched the team calendar (it does within minutes of being added; calendarFeed.ts notices).
integrations.post('/api/integrations/calendar/:app/choose', async c => {
  const app = c.req.param('app')
  if (!isCalendarApp(app)) return c.json({ error: 'Unknown calendar app' }, 404)
  if (!c.env.INTEGRATION_KEY) return c.json({ error: 'Calendar links are being set up' }, 503)
  const db = serviceClient(c.env)
  const feed = await ensureFeed(c.env, db, c.get('userId'), 'business', new URL(c.req.url).origin)
  const { data: row } = await db.from('integrations').select('status').eq('provider', app).maybeSingle()
  if (row?.status !== 'connected') {
    await setIntegration(db, app, { status: 'pending', connected_by: c.get('userId'), connected_at: null, last_error: null, account_label: null, external: {} })
    // Already subscribed in that app before choosing it here: connected straight away.
    const seen = await calendarSeen(db, app)
    if (seen && Date.now() - Date.parse(seen) < 3 * 86_400_000) await calendarFetched(db, app, seen)
  }
  return c.json({ url: addToCalendarUrl(app, feed), feed })
})

const connectorState = async (env: Env, raw: string) => {
  try {
    const s = await verifyState<ConnectorState | { kind?: undefined }>(env.INTEGRATION_KEY!, raw)
    return s.kind === 'connector' ? s : null
  } catch { return null }
}

integrations.get('/api/integrations/microsoft/callback', async c => {
  const state = await connectorState(c.env, c.req.query('state') ?? '')
  if (!state) return c.redirect(`${new URL(c.req.url).origin}/connections?connect_error=${encodeURIComponent('That connection link expired. Try again.')}`)
  return finishConnector(c, state)
})

// Try it: an email from the café's mailbox to the admin.
integrations.post('/api/integrations/email/test', async c => {
  const { to } = await c.req.json<{ to: string }>()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to ?? '')) return c.json({ error: 'Enter a full email address' }, 400)
  const db = serviceClient(c.env)
  try {
    await sendEmail(c.env, db, { to, subject: 'Test email from Business Agent', text: 'It works: team alerts for people who prefer email will come from this mailbox.' })
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
})

// Save an export (timecards, registro) into the café's Drive / OneDrive.
integrations.post('/api/integrations/files/save', async c => {
  const f = await c.req.json<{ folder?: string; name: string; content: string; type?: string }>()
  if (!f.name || typeof f.content !== 'string') return c.json({ error: 'Nothing to save' }, 400)
  if (f.content.length > 3_500_000) return c.json({ error: 'File is too large to save this way' }, 400)
  try {
    return c.json(await saveFile(c.env, serviceClient(c.env), { folder: f.folder ?? '', name: f.name.replace(/[\\/:*?"<>|]/g, '-'), content: f.content, type: f.type ?? 'text/csv' }))
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
})

integrations.get('/api/integrations/google/callback', async c => {
  const personal = await musicCallback(c, 'youtube')
  if (personal) return personal
  const connector = await connectorState(c.env, c.req.query('state') ?? '')
  if (connector) return finishConnector(c, connector)
  const origin = new URL(c.req.url).origin
  let state: { uid: string; back?: string } | null = null
  try { state = await verifyState<{ uid: string; back?: string }>(c.env.INTEGRATION_KEY ?? '', c.req.query('state') ?? '') } catch { /* expired or forged */ }
  const back = (q: string) => c.redirect(`${origin}/${state?.back === 'setup' ? 'setup' : 'connections'}?${q}`)
  if (!state) return back(`connect_error=${encodeURIComponent('That connection link expired. Try again.')}`)
  if (c.req.query('error')) return back(`connect_error=${encodeURIComponent(c.req.query('error') === 'access_denied' ? 'Google Maps connection was cancelled' : c.req.query('error')!)}`)
  const db = serviceClient(c.env)
  try {
    const cfg = googleConfig(c.env, origin)
    if (!cfg) throw new Error('Google is not set up')
    const { uid } = state
    const tokens = await google.exchangeCode(cfg, c.req.query('code') ?? '')
    if (!tokens.refresh_token) throw new Error('Google did not return offline access. Remove the app in your Google account and connect again.')
    if (!/business\.manage/.test(tokens.scope ?? 'business.manage')) throw new Error(explain('google_business', 'insufficient authentication scopes'))
    // Proof first: the account manages at least one listing. Only then is the access kept.
    const locations = await google.listLocations(tokens.access_token!)
    if (!locations.length) throw new Error('This Google account has no Google Maps listing. Sign in with the account that owns (or manages) the café’s listing.')
    const { error } = await db.from('integration_secrets').upsert({ provider: 'google_business', updated_at: new Date().toISOString(), ciphertext: await seal(c.env.INTEGRATION_KEY!, { refresh_token: tokens.refresh_token }) })
    if (error) throw new Error(error.message)
    const only = locations.length === 1 ? locations[0] : null
    const now = new Date().toISOString()
    await setIntegration(db, 'google_business', {
      status: 'connected', connected_by: uid, connected_at: now, last_checked_at: now, last_error: null,
      account_label: only?.title ?? `${locations.length} listings found`,
      external: { locations, ...(only ? { location: only.name, account: only.account } : {}) },
    })
    return back('connected=google_business')
  } catch (e) {
    const why = explain('google_business', e)
    await setIntegration(db, 'google_business', { last_error: why }).catch(() => {})
    return back(`connect_error=${encodeURIComponent(why)}`)
  }
})

integrations.post('/api/integrations/google/location', async c => {
  const { location, closed_on_holidays } = await c.req.json<{ location?: string; closed_on_holidays?: boolean }>()
  const db = serviceClient(c.env)
  const { data } = await db.from('integrations').select('external').eq('provider', 'google_business').single()
  const ext = (data?.external ?? {}) as { locations?: google.GoogleLocation[] }
  const chosen = location ? ext.locations?.find(l => l.name === location) : undefined
  if (location && !chosen) return c.json({ error: 'Unknown listing' }, 400)
  await setIntegration(db, 'google_business', {
    external: { ...ext, ...(chosen ? { location: chosen.name, account: chosen.account } : {}),
      ...(closed_on_holidays === undefined ? {} : { closed_on_holidays }) },
    ...(chosen ? { account_label: chosen.title } : {}),
  })
  return c.json({ ok: true })
})

integrations.post('/api/integrations/google/sync', async c => {
  await syncGoogle(c.env, serviceClient(c.env))
  return c.json({ ok: true })
})

integrations.get('/api/integrations/google/hours', async c => {
  const db = serviceClient(c.env)
  const s = await googleSession(c.env, db)
  if (!s.location) return c.json({ error: 'Choose which Google listing to read' }, 400)
  return c.json({ opening_hours: await google.getLocationHours(s.token, s.location) })
})

integrations.post('/api/integrations/:provider/disconnect', async c => {
  const provider = c.req.param('provider') as Provider
  if (!PROVIDERS.includes(provider)) return c.json({ error: 'Unknown connection' }, 404)
  const db = serviceClient(c.env)
  await db.from('integration_secrets').delete().eq('provider', provider)
  await setIntegration(db, provider, { status: 'disconnected', external: {}, account_label: null, last_error: null, last_checked_at: null })
  return c.json({ ok: true })
})

// Spotify: one-click connect, then pick the approved playlist.
integrations.post('/api/integrations/spotify/start', async c => {
  const cfg = spotifyConfig(c.env, new URL(c.req.url).origin)
  if (!cfg) return c.json({ error: 'Spotify is not set up yet. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.' }, 400)
  return c.json({ url: spotify.authUrl(cfg, await signState(c.env.INTEGRATION_KEY!, { uid: c.get('userId') })) })
})

integrations.get('/api/integrations/spotify/callback', async c => {
  const personal = await musicCallback(c, 'spotify')
  if (personal) return personal
  const origin = new URL(c.req.url).origin
  const back = (q: string) => c.redirect(`${origin}/connections?${q}`)
  try {
    const cfg = spotifyConfig(c.env, origin)
    if (!cfg) throw new Error('Spotify is not set up')
    if (c.req.query('error')) throw new Error(c.req.query('error') === 'access_denied' ? 'Spotify connection was cancelled' : c.req.query('error'))
    const { uid } = await verifyState<{ uid: string }>(c.env.INTEGRATION_KEY!, c.req.query('state') ?? '')
    const t = await spotify.exchangeCode(cfg, c.req.query('code') ?? '')
    if (!t.refresh_token) throw new Error('Spotify did not allow lasting access. Connect again.')
    // Proof first: the account signs in and its playlists can be read. Only then is it kept.
    const proven = await proveSpotify(t.access_token!)
    const db = serviceClient(c.env)
    const { error } = await db.from('integration_secrets').upsert({ provider: 'spotify', ciphertext: await seal(c.env.INTEGRATION_KEY!, { refresh_token: t.refresh_token }), updated_at: new Date().toISOString() })
    if (error) throw new Error(error.message)
    const now = new Date().toISOString()
    await setIntegration(db, 'spotify', { status: 'connected', connected_by: uid, connected_at: now, last_checked_at: now, last_error: null,
      account_label: proven.label, external: proven.external })
    return back('connected=spotify')
  } catch (e) {
    const why = explain('spotify', e)
    await setIntegration(serviceClient(c.env), 'spotify', { last_error: why }).catch(() => {})
    return back(`connect_error=${encodeURIComponent(why)}`)
  }
})

/** The café's music account (Spotify or YouTube Music, whichever is connected) and its playlists. */
async function cafeMusic(env: Env, db: SupabaseClient, origin: string) {
  const p = await connectedOf(db, ['spotify', 'youtube_music'] as const)
  if (p === 'spotify') {
    const s = await spotifySession(env, db, origin)
    return { provider: p, external: s.external, approved: s.playlist ?? null, playlists: () => spotify.playlists(s.token) }
  }
  if (p === 'youtube_music') {
    const [{ token }, { data }] = await Promise.all([connectorGrant(env, db, p, origin), db.from('integrations').select('external').eq('provider', p).single()])
    const ext = (data?.external ?? {}) as { playlist?: SpotifyPlaylist }
    return { provider: p, external: ext as Record<string, unknown>, approved: ext.playlist ?? null,
      playlists: async (): Promise<SpotifyPlaylist[]> => (await youtube.playlists(token)).map(({ provider: _, ...pl }) => pl) }
  }
  return null
}

// The approved café playlist: pick one of the connected account's own playlists.
integrations.get('/api/integrations/music/playlists', async c => {
  const m = await cafeMusic(c.env, serviceClient(c.env), new URL(c.req.url).origin)
  if (!m) return c.json({ error: 'Connect Spotify or YouTube Music first' }, 400)
  return c.json({ provider: m.provider, playlists: await m.playlists(), approved: m.approved })
})

integrations.post('/api/integrations/music/playlist', async c => {
  const { playlist } = await c.req.json<{ playlist: { id: string } }>()
  const db = serviceClient(c.env)
  const m = await cafeMusic(c.env, db, new URL(c.req.url).origin)
  if (!m) return c.json({ error: 'Connect Spotify or YouTube Music first' }, 400)
  const mine = (await m.playlists()).find(p => p.id === playlist?.id)
  if (!mine) return c.json({ error: `That playlist is not in the connected ${optionName(m.provider)} account` }, 400)
  await setIntegration(db, m.provider, { external: { ...m.external, playlist: mine } })
  return c.json({ ok: true })
})

// Café music for staff (and the café tablet): only ever plays the approved playlist.
integrations.use('/api/music/*', async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const { data: role } = await userClient(c.env, token, 'app').rpc('my_role')
  if (!role) return c.json({ error: 'Not allowed' }, 403)
  await next()
})

const YOUTUBE_PLAYS_ON_DEVICE = 'YouTube Music plays on the café device: open the playlist there.'

// Spotify can be played and paused from the app; YouTube Music has no remote control, so staff
// open the approved playlist on the café device.
integrations.get('/api/music/now', async c => {
  const db = serviceClient(c.env)
  const p = await connectedOf(db, ['spotify', 'youtube_music'] as const)
  if (!p) return c.json({ error: 'No café music connected yet. An admin connects Spotify or YouTube Music on the Connections page.' }, 400)
  if (p === 'youtube_music') {
    const { data } = await db.from('integrations').select('external').eq('provider', p).single()
    return c.json({ provider: 'youtube', controls: false, playlist: (data?.external as { playlist?: SpotifyPlaylist })?.playlist ?? null, playing: false, onApprovedPlaylist: false })
  }
  const s = await spotifySession(c.env, db, new URL(c.req.url).origin)
  return c.json({ provider: 'spotify', controls: true, playlist: s.playlist ?? null, ...(await spotify.nowPlaying(s.token, s.playlist?.id)) })
})

integrations.post('/api/music/play', async c => {
  if (await connectedOf(serviceClient(c.env), ['youtube_music'])) return c.json({ error: YOUTUBE_PLAYS_ON_DEVICE }, 400)
  const s = await spotifySession(c.env, serviceClient(c.env), new URL(c.req.url).origin)
  if (!s.playlist) return c.json({ error: 'No playlist approved yet. An admin picks one on the Connections page.' }, 400)
  await spotify.playPlaylist(s.token, s.playlist.id)
  return c.json({ ok: true })
})

integrations.post('/api/music/pause', async c => {
  if (await connectedOf(serviceClient(c.env), ['youtube_music'])) return c.json({ error: YOUTUBE_PLAYS_ON_DEVICE }, 400)
  const s = await spotifySession(c.env, serviceClient(c.env), new URL(c.req.url).origin)
  await spotify.pause(s.token)
  return c.json({ ok: true })
})

// WhatsApp: send a test message to a number (checks token, number id and template).
integrations.post('/api/integrations/whatsapp/test', async c => {
  const cfg = waConfig(c.env)
  if (!cfg) return c.json({ error: 'WhatsApp is not set up yet. Add META_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.' }, 400)
  const { to } = await c.req.json<{ to: string }>()
  const db = serviceClient(c.env)
  try {
    // Connected = WhatsApp accepted a message from the café's number (and the number answers).
    const id = await whatsapp.sendTemplate(cfg, (to ?? '').replace(/\D/g, ''), 'hello_world', [])
    const label = await whatsapp.phoneNumber(cfg).catch(() => null)
    const now = new Date().toISOString()
    await setIntegration(db, 'whatsapp', { status: 'connected', last_error: null, connected_at: now, last_checked_at: now, ...(label ? { account_label: label } : {}) })
    return c.json({ ok: true, id })
  } catch (e) {
    const why = explain('whatsapp', e)
    await markBroken(db, 'whatsapp', why, false)
    return c.json({ error: why }, 400)
  }
})

// Instagram: one click. The owner signs in on instagram.com; we keep a 60-day token (renewed nightly).
integrations.post('/api/integrations/instagram/start', async c => {
  const cfg = instagramOAuth(c.env, new URL(c.req.url).origin)
  if (!cfg) return c.json({ error: 'Instagram needs the Instagram app keys first (INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET; see docs/INTEGRATIONS.md).' }, 400)
  const { back } = await c.req.json<{ back?: 'setup' | 'connections' }>().catch(() => ({ back: undefined }))
  return c.json({ url: instagram.authUrl(cfg, await signState(c.env.INTEGRATION_KEY!, { uid: c.get('userId'), kind: 'instagram', back })) })
})

integrations.get('/api/integrations/instagram/callback', async c => {
  const origin = new URL(c.req.url).origin
  let state: { uid: string; kind?: string; back?: string }
  try { state = await verifyState(c.env.INTEGRATION_KEY ?? '', c.req.query('state') ?? '') } catch { state = { uid: '' } }
  const back = (q: string) => c.redirect(`${origin}/${state.back === 'setup' ? 'setup' : 'connections'}?${q}`)
  if (state.kind !== 'instagram') return back(`connect_error=${encodeURIComponent('That connection link expired. Try again.')}`)
  if (c.req.query('error')) {
    return back(`connect_error=${encodeURIComponent(c.req.query('error') === 'access_denied' ? 'Instagram connection was cancelled' : (c.req.query('error_description') ?? c.req.query('error')!))}`)
  }
  const db = serviceClient(c.env)
  try {
    const cfg = instagramOAuth(c.env, origin)
    if (!cfg) throw new Error('Instagram is not set up')
    const t = await instagram.exchangeCode(cfg, c.req.query('code') ?? '')
    // Proof first: the profile and posts can be read and posting was allowed. Only then is it kept.
    const proven = await proveInstagram(t, c.env)
    const { error } = await db.from('integration_secrets').upsert({ provider: 'instagram', updated_at: new Date().toISOString(),
      ciphertext: await seal(c.env.INTEGRATION_KEY!, { access_token: t.access_token, expires_at: t.expires_at, user_id: t.userId }) })
    if (error) throw new Error(error.message)
    const now = new Date().toISOString()
    await setIntegration(db, 'instagram', { status: 'connected', connected_by: state.uid, connected_at: now, last_checked_at: now, last_sync_at: now,
      last_error: null, account_label: proven.label, external: proven.external })
    return back('connected=instagram')
  } catch (e) {
    const why = explain('instagram', e)
    await setIntegration(db, 'instagram', { last_error: why }).catch(() => {})
    return back(`connect_error=${encodeURIComponent(why)}`)
  }
})

/**
 * The finish of a one-click connection (Facebook, TikTok, Square): check the signed state, handle
 * "cancelled", run the proof and keep the access only if it passes; then back to where they started.
 */
async function appCallback(c: Context<{ Bindings: Env; Variables: { userId: string } }>, provider: Provider,
  finish: (state: { uid: string }, origin: string, db: SupabaseClient) => Promise<void>) {
  const origin = new URL(c.req.url).origin
  let state: { uid: string; kind?: string; back?: string } | null = null
  try { state = await verifyState(c.env.INTEGRATION_KEY ?? '', c.req.query('state') ?? '') } catch { /* expired or forged */ }
  const back = (q: string) => c.redirect(`${origin}/${state?.back === 'setup' ? 'setup' : 'connections'}?${q}`)
  if (!state || state.kind !== provider) return back(`connect_error=${encodeURIComponent('That connection link expired. Try again.')}`)
  if (c.req.query('error')) {
    const cancelled = /access_denied|user_denied|cancel/i.test(`${c.req.query('error')} ${c.req.query('error_reason') ?? ''}`)
    return back(`connect_error=${encodeURIComponent(cancelled ? `${optionName(provider)} connection was cancelled` : (c.req.query('error_description') ?? c.req.query('error')!))}`)
  }
  const db = serviceClient(c.env)
  try {
    await finish(state, origin, db)
    return back(`connected=${provider}`)
  } catch (e) {
    const why = explain(provider, e)
    await setIntegration(db, provider, { last_error: why }).catch(() => {})
    return back(`connect_error=${encodeURIComponent(why)}`)
  }
}

const startState = async (c: Context<{ Bindings: Env; Variables: { userId: string } }>, kind: Provider) => {
  const { back } = await c.req.json<{ back?: 'setup' | 'connections' }>().catch(() => ({ back: undefined }))
  return signState(c.env.INTEGRATION_KEY!, { uid: c.get('userId'), kind, back })
}

const keep = async (env: Env, db: SupabaseClient, provider: Provider, secret: unknown) => {
  const { error } = await db.from('integration_secrets').upsert({ provider, ciphertext: await seal(env.INTEGRATION_KEY!, secret), updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

// Facebook: sign in, allow posting, pick the Page (automatic when there's only one).
integrations.post('/api/integrations/facebook/start', async c => {
  const cfg = facebookOAuth(c.env, new URL(c.req.url).origin)
  if (!cfg) return c.json({ error: 'Facebook needs the Meta app keys first (META_APP_ID and META_APP_SECRET; see docs/INTEGRATIONS.md).' }, 400)
  return c.json({ url: facebook.authUrl(cfg, await startState(c, 'facebook')) })
})

integrations.get('/api/integrations/facebook/callback', c => appCallback(c, 'facebook', async (state, origin, db) => {
  const cfg = facebookOAuth(c.env, origin)
  if (!cfg) throw new Error('Facebook is not set up')
  const { granted, pages } = await facebook.exchangeCode(cfg, c.req.query('code') ?? '')
  const proven = await proveFacebook(c.env, granted, pages)
  await keep(c.env, db, 'facebook', { pages: Object.fromEntries(pages.map(p => [p.id, p.access_token])) })
  const now = new Date().toISOString()
  await setIntegration(db, 'facebook', { status: proven.chosen ? 'connected' : 'pending', connected_by: state.uid, connected_at: now,
    last_checked_at: proven.chosen ? now : null, last_error: null, account_label: proven.label, external: proven.external })
}))

// Which Page to post to (when the owner manages more than one): connected once that Page answers.
integrations.post('/api/integrations/facebook/page', async c => {
  const { page_id } = await c.req.json<{ page_id?: string }>()
  const db = serviceClient(c.env)
  const { data } = await db.from('integrations').select('external').eq('provider', 'facebook').single()
  const ext = (data?.external ?? {}) as { pages?: { id: string; name: string }[] }
  if (!ext.pages?.some(p => p.id === page_id)) return c.json({ error: 'That Page isn’t one this account manages' }, 400)
  await setIntegration(db, 'facebook', { external: { ...ext, page_id } })
  try {
    const s = await facebookSession(c.env, db)
    const page = await facebook.page(s.graphVersion, s.pageId, s.token)
    const now = new Date().toISOString()
    await setIntegration(db, 'facebook', { status: 'connected', last_checked_at: now, last_error: null, account_label: page.name,
      external: { ...ext, page_id, page_name: page.name, followers: page.followers_count ?? page.fan_count } })
    return c.json({ ok: true })
  } catch (e) {
    const why = explain('facebook', e)
    await setIntegration(db, 'facebook', { last_error: why })
    return c.json({ error: why }, 400)
  }
})

// TikTok: sign in, allow posting; connected once TikTok confirms the account can post.
integrations.post('/api/integrations/tiktok/start', async c => {
  const cfg = tiktokOAuth(c.env, new URL(c.req.url).origin)
  if (!cfg) return c.json({ error: 'TikTok needs the TikTok app keys first (TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET; see docs/INTEGRATIONS.md).' }, 400)
  return c.json({ url: tiktok.authUrl(cfg, await startState(c, 'tiktok')) })
})

integrations.get('/api/integrations/tiktok/callback', c => appCallback(c, 'tiktok', async (state, origin, db) => {
  const cfg = tiktokOAuth(c.env, origin)
  if (!cfg) throw new Error('TikTok is not set up')
  const t = await tiktok.exchangeCode(cfg, c.req.query('code') ?? '')
  const proven = await proveTikTok(t.access_token!, t.scope)
  await keep(c.env, db, 'tiktok', { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + (t.expires_in ?? 86_400) * 1000).toISOString() })
  const now = new Date().toISOString()
  await setIntegration(db, 'tiktok', { status: 'connected', connected_by: state.uid, connected_at: now, last_checked_at: now, last_error: null,
    account_label: proven.label, external: proven.external })
}))

// Square: sign in to the business's Square account (read-only).
integrations.post('/api/integrations/square/start', async c => {
  const cfg = squareOAuth(c.env, new URL(c.req.url).origin)
  if (!cfg) return c.json({ error: 'Square needs the Square app keys first (SQUARE_APP_ID and SQUARE_APP_SECRET; see docs/INTEGRATIONS.md).' }, 400)
  return c.json({ url: square.authUrl(cfg, await startState(c, 'square')) })
})

integrations.get('/api/integrations/square/callback', c => appCallback(c, 'square', async (state, origin, db) => {
  const cfg = squareOAuth(c.env, origin)
  if (!cfg) throw new Error('Square is not set up')
  const t = await square.exchangeCode(cfg, c.req.query('code') ?? '')
  if (!t.refresh_token) throw new Error('Square did not allow lasting access. Connect again.')
  const proven = await proveSquare(cfg.sandbox, t.access_token!)
  await keep(c.env, db, 'square', { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at ?? new Date(Date.now() + 30 * 86_400_000).toISOString() })
  const now = new Date().toISOString()
  await setIntegration(db, 'square', { status: 'connected', connected_by: state.uid, connected_at: now, last_checked_at: now, last_error: null,
    account_label: proven.label, external: proven.external })
}))

// Takings per day from Square (admins with pay access): ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive).
integrations.get('/api/integrations/square/sales', async c => {
  const db = serviceClient(c.env)
  const { data: me } = await db.from('profiles').select('can_see_pay').eq('id', c.get('userId')).single()
  if (!me?.can_see_pay) return c.json({ error: 'Takings are for admins with pay access' }, 403)
  const from = c.req.query('from') ?? '', to = c.req.query('to') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return c.json({ error: 'Give from and to dates (YYYY-MM-DD)' }, 400)
  try {
    const s = await squareSession(c.env, db)
    const end = new Date(Date.parse(`${to}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    return c.json(await square.salesByDay(s.sandbox, s.token, s.locationIds, zonedIso(from, '00:00'), zonedIso(end, '00:00')))
  } catch (e) {
    const why = explain('square', e)
    if (lasting('square', e)) await markBroken(db, 'square', why)
    return c.json({ error: why }, 400)
  }
})

// Instagram: profile and recent posts for the Connections page.
integrations.get('/api/integrations/instagram/profile', async c => {
  const db = serviceClient(c.env)
  try {
    const p = await instagram.profile(await instagramSession(c.env, db))
    await setIntegration(db, 'instagram', { last_sync_at: new Date().toISOString() })
    return c.json(p)
  } catch (e) {
    const why = explain('instagram', e)
    if (lasting('instagram', e)) await markBroken(db, 'instagram', why, false)
    return c.json({ error: why }, 400)
  }
})

// Photos for posts: stored in R2, served publicly so Instagram and Google can fetch them.
integrations.post('/api/integrations/media', async c => {
  if (!c.env.MEDIA) return c.json({ error: 'Photo storage is not set up' }, 400)
  const type = c.req.header('content-type') ?? ''
  if (!/^image\/(jpeg|png)$/.test(type)) return c.json({ error: 'Use a JPEG or PNG photo' }, 400)
  const body = await c.req.arrayBuffer()
  if (body.byteLength > 8 * 1024 * 1024) return c.json({ error: 'Photo is larger than 8 MB' }, 400)
  const key = `posts/${crypto.randomUUID()}.${type.endsWith('png') ? 'png' : 'jpg'}`
  await c.env.MEDIA.put(key, body, { httpMetadata: { contentType: type } })
  return c.json({ url: `${new URL(c.req.url).origin}/media/${key}` })
})

integrations.get('/media/*', async c => {
  const obj = await c.env.MEDIA?.get(c.req.path.slice('/media/'.length))
  if (!obj) return c.notFound()
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } })
})

// WhatsApp webhook: verification handshake, delivery receipts and replies (STOP opts out).
integrations.get('/api/webhooks/whatsapp', c => {
  if (c.req.query('hub.mode') === 'subscribe' && c.env.WHATSAPP_VERIFY_TOKEN && c.req.query('hub.verify_token') === c.env.WHATSAPP_VERIFY_TOKEN) {
    return c.text(c.req.query('hub.challenge') ?? '')
  }
  return c.text('Forbidden', 403)
})

integrations.post('/api/webhooks/whatsapp', async c => {
  const raw = await c.req.text()
  if (!c.env.META_APP_SECRET || !(await whatsapp.verifySignature(c.env.META_APP_SECRET, raw, c.req.header('x-hub-signature-256')))) {
    return c.text('Invalid signature', 401)
  }
  const events = whatsapp.parseWebhook(JSON.parse(raw))
  const db = serviceClient(c.env)
  for (const s of events.statuses) {
    await db.from('outbox').update({ delivery: s.status, ...(s.error ? { last_error: s.error } : {}) }).eq('external_id', s.id)
  }
  for (const m of events.messages) {
    if (/^\s*(stop|baja|parar)\s*$/i.test(m.text)) {
      // Opt the sender out: match on digits of their stored number.
      const { data: people } = await db.from('profiles').select('id, phone').eq('whatsapp_opt_in', true)
      for (const p of people ?? []) {
        if ((p.phone ?? '').replace(/\D/g, '') === m.from) await db.from('profiles').update({ whatsapp_opt_in: false }).eq('id', p.id)
      }
    }
  }
  return c.text('ok')
})
