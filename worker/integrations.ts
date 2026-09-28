// Connections to Google Business Profile, WhatsApp and Instagram, and the outbox worker that
// delivers everything queued in the database (with retries; see migration 7).
import { Hono, type Context } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, serviceClient, userClient, type Env } from './supabase'
import { seal, signState, unseal, verifyState } from './crypto'
import * as google from './providers/google'
import * as whatsapp from './providers/whatsapp'
import * as instagram from './providers/instagram'
import * as spotify from './providers/spotify'
import * as ms from './providers/microsoft'
import { alertEmail, base64url, mimeMessage } from '../shared/alertText'
import { finishMusicConnect, type MusicState } from './music'
import type { Business, CalendarEvent } from '../shared/types'
import { today } from '../shared/time'

type Provider = 'google_business' | 'whatsapp' | 'instagram' | 'spotify' | Connector
/** Email and file connections: one sign-in with Google or Microsoft each. */
type Connector = 'gmail' | 'outlook' | 'google_drive' | 'onedrive'
const CONNECTORS: Connector[] = ['gmail', 'outlook', 'google_drive', 'onedrive']
const isGoogleConnector = (p: Connector) => p === 'gmail' || p === 'google_drive'
const CONNECTOR_NAME: Record<Connector, string> = { gmail: 'Gmail', outlook: 'Outlook', google_drive: 'Google Drive', onedrive: 'OneDrive' }
interface ConnectorState { uid: string; kind: 'connector'; provider: Connector; back?: 'setup' | 'connections' }

const graphVersion = (env: Env) => env.META_GRAPH_VERSION ?? 'v23.0'

export const waConfig = (env: Env): whatsapp.WhatsAppConfig | null =>
  env.META_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
    ? { token: env.META_ACCESS_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, graphVersion: graphVersion(env), language: env.WHATSAPP_TEMPLATE_LANG ?? 'es' }
    : null

export const igConfig = (env: Env): instagram.InstagramConfig | null =>
  env.META_ACCESS_TOKEN && env.INSTAGRAM_USER_ID
    ? { token: env.META_ACCESS_TOKEN, userId: env.INSTAGRAM_USER_ID, graphVersion: graphVersion(env) }
    : null

const googleConfig = (env: Env, origin: string): google.GoogleOAuthConfig | null =>
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.INTEGRATION_KEY
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: `${origin}/api/integrations/google/callback` }
    : null

const msConfig = (env: Env, origin: string): ms.MicrosoftOAuthConfig | null =>
  env.MS_CLIENT_ID && env.MS_CLIENT_SECRET && env.INTEGRATION_KEY
    ? { clientId: env.MS_CLIENT_ID, clientSecret: env.MS_CLIENT_SECRET, redirectUri: `${origin}/api/integrations/microsoft/callback` }
    : null

const connectorConfigured = (env: Env, p: Connector) => isGoogleConnector(p) ? !!googleConfig(env, '') : !!msConfig(env, '')

/** A fresh access token for an email/file connection. Microsoft rotates refresh tokens, so keep the new one. */
async function connectorToken(env: Env, db: SupabaseClient, p: Connector, origin = ''): Promise<string> {
  const { data: secret } = await db.from('integration_secrets').select('ciphertext').eq('provider', p).maybeSingle()
  if (!secret) throw new Error(`${CONNECTOR_NAME[p]} is not connected`)
  const { refresh_token } = await unseal<{ refresh_token: string }>(env.INTEGRATION_KEY!, secret.ciphertext)
  if (isGoogleConnector(p)) {
    const cfg = googleConfig(env, origin)
    if (!cfg) throw new Error('Google is not set up')
    return (await google.refreshAccess(cfg, refresh_token)).access_token!
  }
  const cfg = msConfig(env, origin)
  if (!cfg) throw new Error('Microsoft is not set up')
  const t = await ms.refreshAccess(cfg, refresh_token)
  if (t.refresh_token && t.refresh_token !== refresh_token) {
    await db.from('integration_secrets').update({ ciphertext: await seal(env.INTEGRATION_KEY!, { refresh_token: t.refresh_token }) }).eq('provider', p)
  }
  return t.access_token!
}

const connectedOf = async (db: SupabaseClient, options: Connector[]) => {
  const { data } = await db.from('integrations').select('provider, status').in('provider', options)
  return options.find(p => data?.some(r => r.provider === p && r.status === 'connected')) ?? null
}

/** Send an email from the café's connected mailbox (Gmail first, else Outlook). */
export async function sendEmail(env: Env, db: SupabaseClient, m: { to: string; subject: string; text: string }) {
  const p = await connectedOf(db, ['gmail', 'outlook'])
  if (!p) throw new Error('No mailbox connected. Connect Gmail or Outlook on the Connections page.')
  const token = await connectorToken(env, db, p)
  if (p === 'gmail') return google.sendGmail(token, base64url(mimeMessage(m)))
  await ms.sendMail(token, m)
  return null
}

/** Save a file to the café's connected storage (Google Drive first, else OneDrive); returns a link. */
export async function saveFile(env: Env, db: SupabaseClient, f: { folder: string; name: string; content: string; type: string }) {
  const p = await connectedOf(db, ['google_drive', 'onedrive'])
  if (!p) throw new Error('No file storage connected. Connect Google Drive or OneDrive on the Connections page.')
  const token = await connectorToken(env, db, p)
  const link = p === 'google_drive' ? await google.saveToDrive(token, f.folder, f.name, f.content, f.type) : await ms.saveFile(token, f.folder, f.name, f.content, f.type)
  await setIntegration(db, p, { last_sync_at: new Date().toISOString(), last_error: null })
  return { link, provider: p }
}

const spotifyConfig = (env: Env, origin: string): spotify.SpotifyOAuthConfig | null =>
  env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET && env.INTEGRATION_KEY
    ? { clientId: env.SPOTIFY_CLIENT_ID, clientSecret: env.SPOTIFY_CLIENT_SECRET, redirectUri: `${origin}/api/integrations/spotify/callback` }
    : null

/** A fresh Spotify access token for the café's account, plus the approved playlist. */
async function spotifySession(env: Env, db: SupabaseClient, origin: string) {
  const cfg = spotifyConfig(env, origin)
  if (!cfg) throw new Error('Spotify is not set up')
  const [{ data: row }, { data: secret }] = await Promise.all([
    db.from('integrations').select('external').eq('provider', 'spotify').single(),
    db.from('integration_secrets').select('ciphertext').eq('provider', 'spotify').maybeSingle(),
  ])
  if (!secret) throw new Error('Spotify is not connected')
  const { refresh_token } = await unseal<{ refresh_token: string }>(env.INTEGRATION_KEY!, secret.ciphertext)
  const t = await spotify.refreshAccess(cfg, refresh_token)
  if (t.refresh_token && t.refresh_token !== refresh_token) {
    await db.from('integration_secrets').update({ ciphertext: await seal(env.INTEGRATION_KEY!, { refresh_token: t.refresh_token }) }).eq('provider', 'spotify')
  }
  const ext = (row?.external ?? {}) as { playlist?: spotify.Playlist }
  return { token: t.access_token!, playlist: ext.playlist, external: ext }
}

async function setIntegration(db: SupabaseClient, provider: Provider, patch: Record<string, unknown>) {
  const { error } = await db.from('integrations').update({ ...patch, updated_at: new Date().toISOString() }).eq('provider', provider)
  if (error) throw new Error(error.message)
}

interface GoogleSecret { refresh_token: string }

/** A fresh Google access token plus the chosen location. */
async function googleSession(env: Env, db: SupabaseClient, origin = '') {
  const cfg = googleConfig(env, origin)
  if (!cfg) throw new Error('Google is not set up (client id/secret missing)')
  const [{ data: row }, { data: secret }] = await Promise.all([
    db.from('integrations').select('external, status').eq('provider', 'google_business').single(),
    db.from('integration_secrets').select('ciphertext').eq('provider', 'google_business').maybeSingle(),
  ])
  if (!secret) throw new Error('Google is not connected')
  const { refresh_token } = await unseal<GoogleSecret>(env.INTEGRATION_KEY!, secret.ciphertext)
  const { access_token } = await google.refreshAccess(cfg, refresh_token)
  const ext = (row?.external ?? {}) as { location?: string; account?: string; closed_on_holidays?: boolean }
  return { token: access_token!, location: ext.location, account: ext.account, closedOnHolidays: !!ext.closed_on_holidays }
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
        const cfg = igConfig(env)
        if (!cfg) throw new Error('Instagram is not set up')
        const p = job.payload as { image_url: string; caption: string }
        externalId = await instagram.publishPhoto(cfg, p.image_url, p.caption)
      }
      await db.rpc('complete_outbox', { p_id: job.id, p_ok: true, p_external_id: externalId })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await db.rpc('complete_outbox', { p_id: job.id, p_ok: false, p_error: message })
      if (job.kind.startsWith('google')) await setIntegration(db, 'google_business', { last_error: message }).catch(() => {})
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
  const { data } = await db.from('integrations').select('provider, status, account_label, external, connected_at, last_sync_at, last_error')
  const setup = {
    google_business: !!googleConfig(c.env, ''),
    whatsapp: !!waConfig(c.env) && !!c.env.META_APP_SECRET && !!c.env.WHATSAPP_VERIFY_TOKEN,
    instagram: !!igConfig(c.env),
    spotify: !!spotifyConfig(c.env, ''),
    ...Object.fromEntries(CONNECTORS.map(p => [p, connectorConfigured(c.env, p)])),
  }
  const { data: queue } = await db.from('outbox').select('kind, status').in('status', ['pending', 'failed', 'dead'])
  return c.json({ integrations: data, configured: setup, queue })
})

// Google: start OAuth (the browser then navigates to the returned URL).
integrations.post('/api/integrations/google/start', async c => {
  const origin = new URL(c.req.url).origin
  const cfg = googleConfig(c.env, origin)
  if (!cfg) return c.json({ error: 'Google is not set up yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and INTEGRATION_KEY.' }, 400)
  const state = await signState(c.env.INTEGRATION_KEY!, { uid: c.get('userId') })
  return c.json({ url: google.authUrl(cfg, state) })
})

// Email and file connections: start (the browser then goes to Google or Microsoft)…
integrations.post('/api/integrations/connect/:provider/start', async c => {
  const p = c.req.param('provider') as Connector
  if (!CONNECTORS.includes(p)) return c.json({ error: 'Unknown connection' }, 404)
  const origin = new URL(c.req.url).origin
  const { back } = await c.req.json<{ back?: 'setup' | 'connections' }>().catch(() => ({ back: undefined }))
  const state = await signState(c.env.INTEGRATION_KEY ?? '', { uid: c.get('userId'), kind: 'connector', provider: p, back } satisfies ConnectorState)
  if (isGoogleConnector(p)) {
    const cfg = googleConfig(c.env, origin)
    if (!cfg) return c.json({ error: `${CONNECTOR_NAME[p]} needs the Google keys first (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; see docs/sign-in-setup.md).` }, 400)
    return c.json({ url: google.authUrl(cfg, state, p === 'gmail' ? google.GMAIL_SCOPES : google.DRIVE_SCOPES) })
  }
  const cfg = msConfig(c.env, origin)
  if (!cfg) return c.json({ error: `${CONNECTOR_NAME[p]} needs the Microsoft app first: run the "Set up Microsoft sign-in" workflow (docs/sign-in-setup.md).` }, 400)
  return c.json({ url: ms.authUrl(cfg, state, p === 'outlook' ? ms.MS_SCOPES.outlook : ms.MS_SCOPES.onedrive) })
})

/** …and finish: keep the refresh token (encrypted) and show which account is connected. */
async function finishConnector(c: Context<{ Bindings: Env; Variables: { userId: string } }>, state: ConnectorState) {
  const origin = new URL(c.req.url).origin
  const back = (q: string) => c.redirect(`${origin}/${state.back === 'setup' ? 'setup' : 'connections'}?${q}`)
  try {
    if (c.req.query('error')) throw new Error(/access_denied|consent_required/.test(c.req.query('error')!) ? `${CONNECTOR_NAME[state.provider]} connection was cancelled` : (c.req.query('error_description') ?? c.req.query('error')))
    const code = c.req.query('code') ?? ''
    let refresh: string | undefined
    let label: string | undefined
    if (isGoogleConnector(state.provider)) {
      const t = await google.exchangeCode(googleConfig(c.env, origin)!, code)
      refresh = t.refresh_token
      label = await google.accountEmail(t.access_token!)
    } else {
      const t = await ms.exchangeCode(msConfig(c.env, origin)!, code)
      refresh = t.refresh_token
      const who = await ms.me(t.access_token!)
      label = who.mail ?? who.userPrincipalName ?? who.displayName
    }
    if (!refresh) throw new Error(`${CONNECTOR_NAME[state.provider]} did not allow offline access. Remove the app from your account's connected apps and connect again.`)
    const db = serviceClient(c.env)
    await db.from('integration_secrets').upsert({ provider: state.provider, ciphertext: await seal(c.env.INTEGRATION_KEY!, { refresh_token: refresh }) })
    await setIntegration(db, state.provider, { status: 'connected', connected_by: state.uid, connected_at: new Date().toISOString(), last_error: null, account_label: label ?? null, external: {} })
    return back(`connected=${state.provider}`)
  } catch (e) {
    return back(`connect_error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`)
  }
}

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
  const back = (q: string) => c.redirect(`${origin}/connections?${q}`)
  try {
    const cfg = googleConfig(c.env, origin)
    if (!cfg) throw new Error('Google is not set up')
    if (c.req.query('error')) throw new Error(c.req.query('error'))
    const { uid } = await verifyState<{ uid: string }>(c.env.INTEGRATION_KEY!, c.req.query('state') ?? '')
    const tokens = await google.exchangeCode(cfg, c.req.query('code') ?? '')
    if (!tokens.refresh_token) throw new Error('Google did not return offline access. Remove the app in your Google account and connect again.')
    const db = serviceClient(c.env)
    await db.from('integration_secrets').upsert({ provider: 'google_business', ciphertext: await seal(c.env.INTEGRATION_KEY!, { refresh_token: tokens.refresh_token }) })
    const locations = await google.listLocations(tokens.access_token!)
    const only = locations.length === 1 ? locations[0] : null
    await setIntegration(db, 'google_business', {
      status: 'connected', connected_by: uid, connected_at: new Date().toISOString(), last_error: null,
      account_label: only?.title ?? `${locations.length} listings found`,
      external: { locations, ...(only ? { location: only.name, account: only.account } : {}) },
    })
    return back('connected=google')
  } catch (e) {
    return back(`connect_error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`)
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
  const db = serviceClient(c.env)
  await db.from('integration_secrets').delete().eq('provider', provider)
  await setIntegration(db, provider, { status: 'disconnected', external: {}, account_label: null, last_error: null })
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
    const who = await spotify.me(t.access_token!)
    const db = serviceClient(c.env)
    await db.from('integration_secrets').upsert({ provider: 'spotify', ciphertext: await seal(c.env.INTEGRATION_KEY!, { refresh_token: t.refresh_token }) })
    await setIntegration(db, 'spotify', { status: 'connected', connected_by: uid, connected_at: new Date().toISOString(), last_error: null,
      account_label: `${who.display_name ?? who.id}${who.product === 'premium' ? '' : ' (not Premium: playback control won’t work)'}`, external: {} })
    return back('connected=spotify')
  } catch (e) {
    return back(`connect_error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`)
  }
})

integrations.get('/api/integrations/spotify/playlists', async c => {
  const s = await spotifySession(c.env, serviceClient(c.env), new URL(c.req.url).origin)
  return c.json({ playlists: await spotify.playlists(s.token), approved: s.playlist ?? null })
})

integrations.post('/api/integrations/spotify/playlist', async c => {
  const { playlist } = await c.req.json<{ playlist: spotify.Playlist }>()
  const db = serviceClient(c.env)
  const s = await spotifySession(c.env, db, new URL(c.req.url).origin)
  const mine = (await spotify.playlists(s.token)).find(p => p.id === playlist?.id)
  if (!mine) return c.json({ error: 'That playlist is not in the connected Spotify account' }, 400)
  await setIntegration(db, 'spotify', { external: { ...s.external, playlist: mine } })
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

integrations.get('/api/music/now', async c => {
  const s = await spotifySession(c.env, serviceClient(c.env), new URL(c.req.url).origin)
  return c.json({ playlist: s.playlist ?? null, ...(await spotify.nowPlaying(s.token, s.playlist?.id)) })
})

integrations.post('/api/music/play', async c => {
  const s = await spotifySession(c.env, serviceClient(c.env), new URL(c.req.url).origin)
  if (!s.playlist) return c.json({ error: 'No playlist approved yet. An admin picks one on the Connections page.' }, 400)
  await spotify.playPlaylist(s.token, s.playlist.id)
  return c.json({ ok: true })
})

integrations.post('/api/music/pause', async c => {
  const s = await spotifySession(c.env, serviceClient(c.env), new URL(c.req.url).origin)
  await spotify.pause(s.token)
  return c.json({ ok: true })
})

// WhatsApp: send a test message to a number (checks token, number id and template).
integrations.post('/api/integrations/whatsapp/test', async c => {
  const cfg = waConfig(c.env)
  if (!cfg) return c.json({ error: 'WhatsApp is not set up yet. Add META_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.' }, 400)
  const { to } = await c.req.json<{ to: string }>()
  try {
    const id = await whatsapp.sendTemplate(cfg, to.replace(/\D/g, ''), 'hello_world', [])
    await setIntegration(serviceClient(c.env), 'whatsapp', { status: 'connected', last_error: null, connected_at: new Date().toISOString() })
    return c.json({ ok: true, id })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await setIntegration(serviceClient(c.env), 'whatsapp', { status: 'error', last_error: message })
    return c.json({ error: message }, 400)
  }
})

// Instagram: profile and recent posts for the Connections page.
integrations.get('/api/integrations/instagram/profile', async c => {
  const cfg = igConfig(c.env)
  if (!cfg) return c.json({ error: 'Instagram is not set up yet. Add META_ACCESS_TOKEN and INSTAGRAM_USER_ID.' }, 400)
  const db = serviceClient(c.env)
  try {
    const p = await instagram.profile(cfg)
    await setIntegration(db, 'instagram', { status: 'connected', account_label: `@${p.username}`, last_error: null, last_sync_at: new Date().toISOString() })
    return c.json(p)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await setIntegration(db, 'instagram', { status: 'error', last_error: message })
    return c.json({ error: message }, 400)
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
