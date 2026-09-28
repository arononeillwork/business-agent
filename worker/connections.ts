// Connections that really work. An app shows "Connected" only after the Worker has used it:
//   Gmail, Outlook            a confirmation email went from the mailbox to itself
//   Google Drive, OneDrive    the "Business Agent" folder is there
//   Spotify, YouTube Music    the account signed in and its playlists could be read
//   WhatsApp                  a test message was accepted from the café's number
//   Google/Outlook Calendar   that app fetched the team calendar (calendarFeed.ts reports it)
// Every night, and on "Check now", each connection is checked again. When one stops working its
// card says why and every admin gets a notification; it recovers by itself once a check passes.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from './supabase'
import { seal, unseal } from './crypto'
import * as google from './providers/google'
import * as ms from './providers/microsoft'
import * as spotify from './providers/spotify'
import * as youtube from './providers/youtube'
import * as whatsapp from './providers/whatsapp'
import * as instagram from './providers/instagram'
import * as facebook from './providers/facebook'
import * as tiktok from './providers/tiktok'
import * as square from './providers/square'
import { base64url, mimeMessage } from '../shared/alertText'
import { calendarAppFromAgent, optionName } from '../shared/connections'
import type { CalendarApp, IntegrationProvider } from '../shared/types'

export type Provider = IntegrationProvider
/** Signed in with Google or Microsoft: one refresh token each. */
export type Connector = 'gmail' | 'outlook' | 'google_drive' | 'onedrive' | 'youtube_music'
export const CONNECTORS: Connector[] = ['gmail', 'outlook', 'google_drive', 'onedrive', 'youtube_music']
export const PROVIDERS: Provider[] = ['google_business', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'spotify', 'square', ...CONNECTORS, 'google_calendar', 'outlook_calendar']
export const isConnector = (p: string): p is Connector => (CONNECTORS as string[]).includes(p)
export const isGoogle = (p: Connector) => p === 'gmail' || p === 'google_drive' || p === 'youtube_music'
export const isCalendarApp = (p: string): p is CalendarApp => p === 'google_calendar' || p === 'outlook_calendar'

// ---------------------------------------------------------------------------------------------
// Keys (Worker secrets). One Google app and one Microsoft app serve every business.
// ---------------------------------------------------------------------------------------------
const graphVersion = (env: Env) => env.META_GRAPH_VERSION ?? 'v23.0'

export const waConfig = (env: Env): whatsapp.WhatsAppConfig | null =>
  env.META_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
    ? { token: env.META_ACCESS_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, graphVersion: graphVersion(env), language: env.WHATSAPP_TEMPLATE_LANG ?? 'es' }
    : null

export const instagramOAuth = (env: Env, origin: string): instagram.InstagramOAuthConfig | null =>
  env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET && env.INTEGRATION_KEY
    ? { appId: env.INSTAGRAM_APP_ID, appSecret: env.INSTAGRAM_APP_SECRET, redirectUri: `${origin}/api/integrations/instagram/callback` }
    : null

export const googleConfig = (env: Env, origin: string): google.GoogleOAuthConfig | null =>
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.INTEGRATION_KEY
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: `${origin}/api/integrations/google/callback` }
    : null

export const msConfig = (env: Env, origin: string): ms.MicrosoftOAuthConfig | null =>
  env.MS_CLIENT_ID && env.MS_CLIENT_SECRET && env.INTEGRATION_KEY
    ? { clientId: env.MS_CLIENT_ID, clientSecret: env.MS_CLIENT_SECRET, redirectUri: `${origin}/api/integrations/microsoft/callback` }
    : null

export const facebookOAuth = (env: Env, origin: string): facebook.FacebookOAuthConfig | null =>
  env.META_APP_ID && env.META_APP_SECRET && env.INTEGRATION_KEY
    ? { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET, redirectUri: `${origin}/api/integrations/facebook/callback`, graphVersion: graphVersion(env) }
    : null

export const tiktokOAuth = (env: Env, origin: string): tiktok.TikTokOAuthConfig | null =>
  env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET && env.INTEGRATION_KEY
    ? { clientKey: env.TIKTOK_CLIENT_KEY, clientSecret: env.TIKTOK_CLIENT_SECRET, redirectUri: `${origin}/api/integrations/tiktok/callback` }
    : null

export const squareOAuth = (env: Env, origin: string): square.SquareOAuthConfig | null =>
  env.SQUARE_APP_ID && env.SQUARE_APP_SECRET && env.INTEGRATION_KEY
    ? { appId: env.SQUARE_APP_ID, appSecret: env.SQUARE_APP_SECRET, redirectUri: `${origin}/api/integrations/square/callback`, sandbox: env.SQUARE_ENVIRONMENT === 'sandbox' }
    : null

export const spotifyConfig = (env: Env, origin: string): spotify.SpotifyOAuthConfig | null =>
  env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET && env.INTEGRATION_KEY
    ? { clientId: env.SPOTIFY_CLIENT_ID, clientSecret: env.SPOTIFY_CLIENT_SECRET, redirectUri: `${origin}/api/integrations/spotify/callback` }
    : null

export const connectorConfigured = (env: Env, p: Connector) => isGoogle(p) ? !!googleConfig(env, '') : !!msConfig(env, '')

/** What each connection asks for on the Google / Microsoft consent screen. */
export const SCOPES: Record<Connector, readonly string[]> = {
  gmail: google.GMAIL_SCOPES, google_drive: google.DRIVE_SCOPES, youtube_music: youtube.YOUTUBE_SCOPES,
  outlook: ms.MS_SCOPES.outlook, onedrive: ms.MS_SCOPES.onedrive,
}

/** The one permission each connection can't work without (people can untick it when they sign in). */
const NEEDS: Record<Connector, string> = {
  gmail: 'https://www.googleapis.com/auth/gmail.send',
  google_drive: 'https://www.googleapis.com/auth/drive.file',
  youtube_music: 'https://www.googleapis.com/auth/youtube.readonly',
  outlook: 'Mail.Send',
  onedrive: 'Files.ReadWrite',
}

/** Was that permission granted? Microsoft may answer with full URIs or another case; `.All` covers it too. */
export function hasScope(p: Connector, granted: string | undefined) {
  if (granted === undefined) return true // not reported: the proof that follows still has to pass
  const need = NEEDS[p].toLowerCase()
  return granted.split(/\s+/).some(s => {
    const g = s.toLowerCase().replace(/^https:\/\/graph\.microsoft\.com\//, '')
    return g === need || g === `${need}.all`
  })
}

// ---------------------------------------------------------------------------------------------
// Errors in words an admin can act on
// ---------------------------------------------------------------------------------------------
const API_NAME: Partial<Record<Provider, string>> = {
  gmail: 'Gmail API', google_drive: 'Google Drive API', youtube_music: 'YouTube Data API v3', google_business: 'Business Profile APIs',
}
const message = (e: unknown) => e instanceof Error ? e.message : String(e)

export const missingPermission = (p: Provider) => `${optionName(p)} was connected without the permission it needs. Connect again and leave every box ticked.`

export function explain(p: Provider, e: unknown): string {
  const raw = message(e)
  const name = optionName(p)
  if (/invalid_grant|revoked|expired or revoked/i.test(raw)) return `${name} access was removed or has expired. Connect it again.`
  if ((p === 'instagram' || p === 'facebook') && /Error validating access token|has not authorized application|Session has expired|Invalid OAuth access token/i.test(raw)) {
    return `${name} access was removed or has expired. Connect it again.`
  }
  if (p === 'tiktok' && /access_token_invalid|scope_not_authorized/i.test(raw)) return /scope/i.test(raw) ? missingPermission(p) : `${name} access was removed or has expired. Connect it again.`
  if (p === 'instagram' && /Insufficient Developer Role|not.*tester/i.test(raw)) {
    return 'This Instagram account can’t connect yet: until the app passes Meta’s review, only accounts added as Instagram testers in the Meta app can connect.'
  }
  if (/has not been used in project|it is disabled|accessNotConfigured|SERVICE_DISABLED|not switched on/i.test(raw)) {
    return `The ${API_NAME[p] ?? 'API'} is switched off for this app. Switch it on in Google Cloud (APIs & Services → Library), then connect again.`
  }
  if (/insufficient authentication scopes|insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|ErrorAccessDenied|Access is denied/i.test(raw)) return missingPermission(p)
  if (/MailboxNotEnabledForRESTAPI|MailboxNotHostedInExchangeOnline|mailbox is either inactive/i.test(raw)) {
    return 'This Microsoft account has no Outlook mailbox. Use an account with Outlook email (Microsoft 365 or Outlook.com).'
  }
  if (/SPO license|mysite not found|Drive not found/i.test(raw)) return 'This Microsoft account has no OneDrive yet. Open OneDrive once in the browser, then connect again.'
  if (p === 'google_business' && /Quota exceeded|limit '?[^']*'? of service 'mybusiness/i.test(raw)) {
    return 'Google hasn’t switched on Business Profile access for this app yet. Request it once (Google Business Profile API access form, see docs/INTEGRATIONS.md), then connect again.'
  }
  return raw
}

/** Failures that trying again won't fix (as opposed to a provider having a bad minute). */
const LASTING = /invalid_grant|access was removed|switched off|without the permission|no Outlook mailbox|no OneDrive|no YouTube channel|not connected|not set up|hasn.t fetched|hasn.t switched on|no Google Maps listing|can.t connect yet/i
export const lasting = (p: Provider, e: unknown) => LASTING.test(message(e)) || LASTING.test(explain(p, e))

// ---------------------------------------------------------------------------------------------
// Rows and tokens
// ---------------------------------------------------------------------------------------------
export interface Row {
  provider: Provider
  status: 'connected' | 'pending' | 'needs_setup' | 'error' | 'disconnected'
  account_label: string | null
  external: Record<string, unknown>
  connected_at: string | null
  last_sync_at: string | null
  last_error: string | null
  last_checked_at: string | null
}
export const ROW_COLUMNS = 'provider, status, account_label, external, connected_at, last_sync_at, last_error, last_checked_at'

export async function setIntegration(db: SupabaseClient, provider: Provider, patch: Record<string, unknown>) {
  const { error } = await db.from('integrations').update({ ...patch, updated_at: new Date().toISOString() }).eq('provider', provider)
  if (error) throw new Error(error.message)
}

async function refreshTokenOf(env: Env, db: SupabaseClient, p: Provider) {
  const { data: secret } = await db.from('integration_secrets').select('ciphertext').eq('provider', p).maybeSingle()
  if (!secret) throw new Error(`${optionName(p)} is not connected`)
  return (await unseal<{ refresh_token: string }>(env.INTEGRATION_KEY!, secret.ciphertext)).refresh_token
}

/** Providers that hand out a new refresh token on every refresh (Microsoft, Spotify): keep the newest. */
async function keepRotated(env: Env, db: SupabaseClient, p: Provider, old: string, fresh: string | undefined) {
  if (fresh && fresh !== old) {
    await db.from('integration_secrets').update({ ciphertext: await seal(env.INTEGRATION_KEY!, { refresh_token: fresh }), updated_at: new Date().toISOString() }).eq('provider', p)
  }
}

/** A fresh access token for a Google or Microsoft connection, and the permissions it carries. */
export async function connectorGrant(env: Env, db: SupabaseClient, p: Connector, origin = '') {
  const refresh = await refreshTokenOf(env, db, p)
  if (isGoogle(p)) {
    const cfg = googleConfig(env, origin)
    if (!cfg) throw new Error('Google is not set up')
    const t = await google.refreshAccess(cfg, refresh)
    return { token: t.access_token!, scope: t.scope }
  }
  const cfg = msConfig(env, origin)
  if (!cfg) throw new Error('Microsoft is not set up')
  const t = await ms.refreshAccess(cfg, refresh)
  await keepRotated(env, db, p, refresh, t.refresh_token)
  return { token: t.access_token!, scope: t.scope }
}

/** A fresh Spotify access token for the café's account, plus the approved playlist. */
export async function spotifySession(env: Env, db: SupabaseClient, origin = '') {
  const cfg = spotifyConfig(env, origin)
  if (!cfg) throw new Error('Spotify is not set up')
  const { data: row } = await db.from('integrations').select('external').eq('provider', 'spotify').single()
  const refresh = await refreshTokenOf(env, db, 'spotify')
  const t = await spotify.refreshAccess(cfg, refresh)
  await keepRotated(env, db, 'spotify', refresh, t.refresh_token)
  const ext = (row?.external ?? {}) as { playlist?: spotify.Playlist }
  return { token: t.access_token!, playlist: ext.playlist, external: ext }
}

interface InstagramSecret { access_token: string; expires_at: string; user_id: string }

/**
 * The connected Instagram account. Instagram has no refresh tokens: the 60-day token itself is
 * renewed (nightly, once it is a day old), so it never runs out while the café uses the app.
 */
export async function instagramSession(env: Env, db: SupabaseClient, renew = false): Promise<instagram.InstagramConfig> {
  const { data: secret } = await db.from('integration_secrets').select('ciphertext').eq('provider', 'instagram').maybeSingle()
  if (!secret) throw new Error('Instagram is not connected')
  let s = await unseal<InstagramSecret>(env.INTEGRATION_KEY!, secret.ciphertext)
  const left = Date.parse(s.expires_at) - Date.now()
  if (left <= 0) throw new Error('Instagram access has expired. Connect it again.')
  if (renew && left < 59 * 86_400_000) {
    s = { ...s, ...(await instagram.refreshToken(s.access_token)) }
    await db.from('integration_secrets').update({ ciphertext: await seal(env.INTEGRATION_KEY!, s), updated_at: new Date().toISOString() }).eq('provider', 'instagram')
  }
  return { token: s.access_token, userId: s.user_id, graphVersion: graphVersion(env) }
}

/** Instagram: a professional account whose profile and posts can be read, and that allowed posting. */
export async function proveInstagram(t: { access_token: string; userId: string; permissions?: string }, env: Env): Promise<Proven> {
  if (t.permissions !== undefined && !/instagram_business_content_publish/.test(t.permissions)) throw new Error(missingPermission('instagram'))
  const p = await instagram.profile({ token: t.access_token, userId: t.userId, graphVersion: graphVersion(env) })
  return { label: `@${p.username}`, external: { user_id: t.userId, username: p.username, followers: p.followers_count } }
}

/** Tokens that run out (TikTok: a day, Square: 30 days) are renewed with the refresh token when needed. */
interface RenewableSecret { access_token: string; refresh_token: string; expires_at: string }

async function renewable(env: Env, db: SupabaseClient, p: 'tiktok' | 'square', renewWithinMs: number,
  refresh: (refreshToken: string) => Promise<{ access_token?: string; refresh_token?: string; expires_at?: string; expires_in?: number }>) {
  const { data: secret } = await db.from('integration_secrets').select('ciphertext').eq('provider', p).maybeSingle()
  if (!secret) throw new Error(`${optionName(p)} is not connected`)
  let s = await unseal<RenewableSecret>(env.INTEGRATION_KEY!, secret.ciphertext)
  if (Date.parse(s.expires_at) - Date.now() < renewWithinMs) {
    const t = await refresh(s.refresh_token)
    s = { access_token: t.access_token!, refresh_token: t.refresh_token ?? s.refresh_token, expires_at: t.expires_at ?? new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString() }
    await db.from('integration_secrets').update({ ciphertext: await seal(env.INTEGRATION_KEY!, s), updated_at: new Date().toISOString() }).eq('provider', p)
  }
  return s.access_token
}

export async function tiktokSession(env: Env, db: SupabaseClient) {
  const cfg = tiktokOAuth(env, '')
  if (!cfg) throw new Error('TikTok is not set up')
  return renewable(env, db, 'tiktok', 10 * 60_000, r => tiktok.refreshAccess(cfg, r))
}

export async function squareSession(env: Env, db: SupabaseClient) {
  const cfg = squareOAuth(env, '')
  if (!cfg) throw new Error('Square is not set up')
  const [token, { data: row }] = await Promise.all([
    renewable(env, db, 'square', 7 * 86_400_000, r => square.refreshAccess(cfg, r)),
    db.from('integrations').select('external').eq('provider', 'square').single(),
  ])
  const ext = (row?.external ?? {}) as { locations?: square.SquareLocation[] }
  return { token, sandbox: cfg.sandbox, locationIds: (ext.locations ?? []).map(l => l.id) }
}

/** The chosen Facebook Page and its token. */
export async function facebookSession(env: Env, db: SupabaseClient) {
  const [{ data: secret }, { data: row }] = await Promise.all([
    db.from('integration_secrets').select('ciphertext').eq('provider', 'facebook').maybeSingle(),
    db.from('integrations').select('external').eq('provider', 'facebook').single(),
  ])
  if (!secret) throw new Error('Facebook is not connected')
  const { pages } = await unseal<{ pages: Record<string, string> }>(env.INTEGRATION_KEY!, secret.ciphertext)
  const pageId = (row?.external as { page_id?: string } | undefined)?.page_id
  if (!pageId || !pages[pageId]) throw new Error('Choose which Facebook Page to post to')
  return { pageId, token: pages[pageId], graphVersion: graphVersion(env) }
}

/** Facebook: posting was allowed and the owner manages a Page (one is picked straight away). */
export async function proveFacebook(env: Env, granted: string[], pages: facebook.FacebookPage[]) {
  if (!granted.includes('pages_manage_posts') || !granted.includes('pages_show_list')) throw new Error(missingPermission('facebook'))
  if (!pages.length) throw new Error('This Facebook account doesn’t manage any Page. Sign in with an account that is an admin of the café’s Page.')
  const list = pages.map(p => ({ id: p.id, name: p.name }))
  if (pages.length > 1) return { label: null, external: { pages: list }, chosen: false }
  const page = await facebook.page(graphVersion(env), pages[0].id, pages[0].access_token)
  return { label: page.name, external: { pages: list, page_id: page.id, page_name: page.name, followers: page.followers_count ?? page.fan_count }, chosen: true }
}

/** TikTok: posting was allowed and TikTok says this account can post (and whether only privately for now). */
export async function proveTikTok(token: string, scope: string | undefined): Promise<Proven> {
  if (scope !== undefined && !scope.split(/[,\s]+/).includes('video.publish')) throw new Error(missingPermission('tiktok'))
  const [who, info] = await Promise.all([tiktok.user(token), tiktok.creatorInfo(token)])
  const username = info.creator_username ?? who.display_name ?? null
  return { label: username ? `@${username}` : null, external: { username, private_only: !info.privacy_level_options.includes('PUBLIC_TO_EVERYONE') } }
}

/** Square: the business and at least one open location, whose payments can be read. */
export async function proveSquare(sandbox: boolean, token: string): Promise<Proven> {
  const [m, locs] = await Promise.all([square.merchant(sandbox, token), square.locations(sandbox, token)])
  if (!locs.length) throw new Error('This Square account has no open location yet. Add one in Square, then connect again.')
  return { label: m.business_name ?? locs[0].name, external: { merchant_id: m.id, currency: m.currency ?? locs[0].currency, locations: locs.map(l => ({ id: l.id, name: l.name })) } }
}

/** A fresh Google access token for the Google Maps listing, plus the chosen location. */
export async function googleSession(env: Env, db: SupabaseClient, origin = '') {
  const cfg = googleConfig(env, origin)
  if (!cfg) throw new Error('Google is not set up (client id/secret missing)')
  const { data: row } = await db.from('integrations').select('external').eq('provider', 'google_business').single()
  const { access_token } = await google.refreshAccess(cfg, await refreshTokenOf(env, db, 'google_business'))
  const ext = (row?.external ?? {}) as { location?: string; account?: string; closed_on_holidays?: boolean }
  return { token: access_token!, location: ext.location, account: ext.account, closedOnHolidays: !!ext.closed_on_holidays }
}

/** Which of these is connected (at most one per group, see migration 28). */
export async function connectedOf<P extends Provider>(db: SupabaseClient, options: P[]): Promise<P | null> {
  const { data } = await db.from('integrations').select('provider, status').in('provider', options)
  return options.find(p => data?.some(r => r.provider === p && r.status === 'connected')) ?? null
}

// ---------------------------------------------------------------------------------------------
// Proof on connect: nothing is stored until this passes
// ---------------------------------------------------------------------------------------------
export interface Proven { label: string | null; external: Record<string, unknown> }

const confirmation = (p: 'gmail' | 'outlook', email: string, business: string) => ({
  to: email,
  subject: `${business}: this mailbox is connected`,
  text: `This is a check from Business Agent: ${optionName(p)} (${email}) is now connected for ${business}.\n\n` +
    'Team alerts for people who prefer email will come from this address. You can disconnect it any time on the Connections page.',
})

/** Use a new Google/Microsoft connection for real. Throws, in plain words, if it can't do its job. */
export async function proveNew(p: Connector, t: { access_token: string; scope?: string }, business: string): Promise<Proven> {
  if (!hasScope(p, t.scope)) throw new Error(missingPermission(p))
  const token = t.access_token
  switch (p) {
    case 'gmail': {
      const email = await google.accountEmail(token)
      if (!email) throw new Error('Could not read the Google account’s email address. Connect again.')
      await google.sendGmail(token, base64url(mimeMessage(confirmation(p, email, business))))
      return { label: email, external: { confirmed_to: email } }
    }
    case 'outlook': {
      const who = await ms.me(token)
      const email = who.mail ?? who.userPrincipalName
      if (!email) throw new Error('This Microsoft account has no email address.')
      await ms.sendMail(token, confirmation(p, email, business))
      return { label: email, external: { confirmed_to: email } }
    }
    case 'google_drive': {
      const [email, folder] = await Promise.all([google.accountEmail(token), google.ensureDriveFolder(token)])
      return { label: email ?? null, external: { folder_id: folder } }
    }
    case 'onedrive': {
      const [who, folder] = await Promise.all([ms.me(token), ms.ensureFolder(token)])
      return { label: who.mail ?? who.userPrincipalName ?? who.displayName ?? null, external: { folder_id: folder } }
    }
    case 'youtube_music': {
      const channel = await youtube.channel(token)
      if (!channel) throw new Error('This Google account has no YouTube channel, so it has no playlists. Open YouTube Music with it, make a playlist, then connect again.')
      return { label: channel, external: { playlists: (await youtube.playlists(token)).length } }
    }
  }
}

/** Spotify: the account signed in and its playlists can be read. */
export async function proveSpotify(token: string): Promise<Proven> {
  const [who, lists] = await Promise.all([spotify.me(token), spotify.playlists(token)])
  return {
    label: `${who.display_name ?? who.id}${who.product === 'premium' ? '' : ' (not Premium: playback control won’t work)'}`,
    external: { playlists: lists.length },
  }
}

// ---------------------------------------------------------------------------------------------
// Checks: nightly, on "Check now", and whenever real use fails
// ---------------------------------------------------------------------------------------------
const CALENDAR_STALE_DAYS = 3

/** When a business calendar feed was last fetched by this calendar app (null: not seen). */
export async function calendarSeen(db: SupabaseClient, app: CalendarApp) {
  const { data } = await db.from('calendar_feeds').select('last_read_at, last_read_by').eq('scope', 'business')
  const seen = (data ?? []).filter(f => f.last_read_at && calendarAppFromAgent(f.last_read_by) === app).map(f => f.last_read_at as string)
  return seen.sort().at(-1) ?? null
}

const newest = (...ts: (string | null | undefined)[]) => ts.filter((t): t is string => !!t).sort().at(-1) ?? null
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' })

/** Does a connection that was working still work? Returns fields to update (e.g. a re-made folder). */
async function stillWorks(env: Env, db: SupabaseClient, row: Row): Promise<Partial<Row>> {
  const p = row.provider
  if (isConnector(p)) {
    const { token, scope } = await connectorGrant(env, db, p)
    if (!hasScope(p, scope)) throw new Error(missingPermission(p))
    if (p === 'outlook') await ms.me(token)
    if (p === 'youtube_music') await youtube.channel(token)
    if (p === 'google_drive') {
      const id = row.external.folder_id as string | undefined
      // Someone deleted the folder: make it again (exports keep working), still a pass.
      if (!id || !(await google.driveFolderAlive(token, id))) return { external: { ...row.external, folder_id: await google.ensureDriveFolder(token) } }
    }
    if (p === 'onedrive') {
      const id = await ms.ensureFolder(token)
      if (id !== row.external.folder_id) return { external: { ...row.external, folder_id: id } }
    }
    return {}
  }
  if (isCalendarApp(p)) {
    const last = newest(row.last_sync_at, await calendarSeen(db, p))
    if (!last) throw new Error(`${optionName(p)} hasn’t fetched the team calendar yet. Add it again from the Connections page.`)
    if (Date.now() - Date.parse(last) > CALENDAR_STALE_DAYS * 86_400_000) {
      throw new Error(`${optionName(p)} hasn’t fetched the team calendar since ${day(last)}. Check the calendar is still added in ${optionName(p)}.`)
    }
    return last === row.last_sync_at ? {} : { last_sync_at: last }
  }
  switch (p) {
    case 'spotify': await spotify.me((await spotifySession(env, db)).token); return {}
    case 'whatsapp': {
      const cfg = waConfig(env)
      if (!cfg) throw new Error('WhatsApp is not set up')
      return { account_label: await whatsapp.phoneNumber(cfg) }
    }
    case 'instagram': {
      if (!instagramOAuth(env, '')) throw new Error('Instagram is not set up')
      const p = await instagram.profile(await instagramSession(env, db, true))
      return { account_label: `@${p.username}`, external: { ...row.external, username: p.username, followers: p.followers_count } }
    }
    case 'facebook': {
      const s = await facebookSession(env, db)
      const page = await facebook.page(s.graphVersion, s.pageId, s.token)
      return { account_label: page.name, external: { ...row.external, page_name: page.name, followers: page.followers_count ?? page.fan_count } }
    }
    case 'tiktok': {
      const info = await tiktok.creatorInfo(await tiktokSession(env, db))
      return { external: { ...row.external, private_only: !info.privacy_level_options.includes('PUBLIC_TO_EVERYONE') } }
    }
    case 'square': {
      const s = await squareSession(env, db)
      await square.merchant(s.sandbox, s.token)
      return {}
    }
    case 'google_business': {
      const s = await googleSession(env, db)
      if (s.location) await google.getLocationHours(s.token, s.location)
      else await google.listLocations(s.token)
      return {}
    }
  }
  return {}
}

/** Every active admin gets a notification (the bell), linking to the Connections page. */
export async function tellAdmins(db: SupabaseClient, title: string, body: string) {
  const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin').eq('active', true)
  if (admins?.length) await db.from('notifications').insert(admins.map(a => ({ profile_id: a.id, title, body, link: '/connections' })))
}

/**
 * A connection stopped working: the card shows why. Admins are told once, when it goes from
 * working to broken (not every night it stays broken). Returns true if it was working until now.
 */
export async function markBroken(db: SupabaseClient, p: Provider, why: string, notify = true) {
  const now = new Date().toISOString()
  const { data: flipped } = await db.from('integrations').update({ status: 'error', last_error: why, last_checked_at: now, updated_at: now })
    .eq('provider', p).eq('status', 'connected').select('provider')
  if (!flipped?.length) {
    await db.from('integrations').update({ last_error: why, last_checked_at: now, updated_at: now }).eq('provider', p)
    return false
  }
  if (notify) await tellAdmins(db, `${optionName(p)} stopped working`, why)
  return true
}

export interface CheckOptions {
  /** Tell admins when a working connection breaks (the nightly check); not when an admin pressed "Check now". */
  notify?: boolean
  /** Pause before the one retry of a failure that might be a provider hiccup. */
  retryAfterMs?: number
}

/** Check one connection now and record the result. Returns the row as it is afterwards. */
export async function checkOne(env: Env, db: SupabaseClient, p: Provider, { notify = true, retryAfterMs = 3000 }: CheckOptions = {}): Promise<Row | null> {
  const { data } = await db.from('integrations').select(ROW_COLUMNS).eq('provider', p).maybeSingle()
  const row = data as Row | null
  if (!row) return null
  const now = new Date().toISOString()
  if (row.status === 'pending' && isCalendarApp(p)) {
    // Chosen but not proven yet: connected as soon as the calendar app has fetched the calendar.
    const seen = await calendarSeen(db, p)
    if (!seen) return row
    await calendarFetched(db, p, seen)
    return { ...row, status: 'connected', last_sync_at: seen, last_checked_at: now, last_error: null }
  }
  if (row.status !== 'connected' && row.status !== 'error') return row
  try {
    let patch: Partial<Row>
    try {
      patch = await stillWorks(env, db, row)
    } catch (e) {
      if (lasting(p, e)) throw e
      await new Promise(r => setTimeout(r, retryAfterMs))
      patch = await stillWorks(env, db, row)
    }
    const after = { ...patch, status: 'connected' as const, last_error: null, last_checked_at: now }
    await setIntegration(db, p, after)
    return { ...row, ...after }
  } catch (e) {
    const why = explain(p, e)
    await markBroken(db, p, why, notify)
    return { ...row, status: 'error', last_error: why, last_checked_at: now }
  }
}

/** Check every connection that is (or was) working. The nightly job; admins get notified. */
export async function checkAll(env: Env, db: SupabaseClient, options: CheckOptions = {}) {
  const { data } = await db.from('integrations').select('provider').in('status', ['connected', 'error', 'pending'])
  const out: Row[] = []
  for (const { provider } of (data ?? []) as { provider: Provider }[]) {
    const row = await checkOne(env, db, provider, options).catch(e => { console.error(`check ${provider} failed`, e); return null })
    if (row) out.push(row)
  }
  return out
}

/**
 * A calendar app fetched a business calendar feed: that proves the calendar connection (the first
 * time) and keeps proving it. Only for the app the business chose; others are left alone.
 */
export async function calendarFetched(db: SupabaseClient, app: CalendarApp, at = new Date().toISOString()) {
  const { data: row } = await db.from('integrations').select('status').eq('provider', app).maybeSingle()
  if (!row || !['pending', 'connected', 'error'].includes(row.status)) return false
  await setIntegration(db, app, {
    status: 'connected', last_sync_at: at, last_checked_at: new Date().toISOString(), last_error: null,
    ...(row.status === 'pending' ? { connected_at: at } : {}),
  })
  return true
}
