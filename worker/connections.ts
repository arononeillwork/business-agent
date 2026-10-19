// Connections that really work. An app shows "Connected" only after the Worker has used it:
//   Gmail, Outlook            a confirmation email went from the mailbox to itself
//   Google Drive, OneDrive    the "Business Agent" folder is there
//   Spotify, YouTube Music    the account signed in and its playlists could be read
//   Search Console            the account can read the website's search data (the business's website is picked)
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
import * as stripe from './providers/stripe'
import * as sumup from './providers/sumup'
import * as linkedin from './providers/linkedin'
import * as searchConsole from './providers/searchConsole'
import { base64url, mimeMessage } from '../shared/alertText'
import { calendarAppFromAgent, optionName } from '../shared/connections'
import type { CalendarApp, IntegrationProvider } from '../shared/types'
import { businessConfig } from '../shared/business.config'

export type Provider = IntegrationProvider
/** Signed in with Google or Microsoft: one refresh token each. */
export type Connector = 'gmail' | 'outlook' | 'google_drive' | 'onedrive' | 'youtube_music' | 'search_console'
export const CONNECTORS: Connector[] = ['gmail', 'outlook', 'google_drive', 'onedrive', 'youtube_music', 'search_console']
export const PROVIDERS: Provider[] = ['google_business', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'linkedin', 'spotify', 'square', 'stripe', 'sumup', ...CONNECTORS, 'google_calendar', 'outlook_calendar']
export const isConnector = (p: string): p is Connector => (CONNECTORS as string[]).includes(p)
export const isGoogle = (p: Connector) => p === 'gmail' || p === 'google_drive' || p === 'youtube_music' || p === 'search_console'
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

export const stripeOAuth = (env: Env, origin: string): stripe.StripeOAuthConfig | null =>
  env.STRIPE_CLIENT_ID && env.STRIPE_SECRET_KEY && env.INTEGRATION_KEY
    ? { clientId: env.STRIPE_CLIENT_ID, secretKey: env.STRIPE_SECRET_KEY, redirectUri: `${origin}/api/integrations/stripe/callback` }
    : null
/**
 * Square takes one Redirect URL per app, so Square always comes back to the app's own address (the
 * workers.dev one), whichever address the admin connected from (that or businesssagent.com); from
 * there they're sent back to where they started (the signed state carries it).
 */
export const squareRedirect = (env: Env) => env.SQUARE_REDIRECT_URL || `${businessConfig.appUrl}/api/integrations/square/callback`
export const squareOAuth = (env: Env): square.SquareOAuthConfig | null =>
  env.SQUARE_APP_ID && env.SQUARE_APP_SECRET && env.INTEGRATION_KEY
    ? { appId: env.SQUARE_APP_ID, appSecret: env.SQUARE_APP_SECRET, redirectUri: squareRedirect(env), sandbox: env.SQUARE_ENVIRONMENT === 'sandbox' }
    : null
export const sumupOAuth = (env: Env, origin: string): sumup.SumUpOAuthConfig | null =>
  env.SUMUP_CLIENT_ID && env.SUMUP_CLIENT_SECRET && env.INTEGRATION_KEY
    ? { clientId: env.SUMUP_CLIENT_ID, clientSecret: env.SUMUP_CLIENT_SECRET, redirectUri: `${origin}/api/integrations/sumup/callback` }
    : null

/** LinkedIn. LINKEDIN_PAGES=off: people only, until LinkedIn approves the app for company Pages. */
export const linkedinOAuth = (env: Env, origin: string): linkedin.LinkedInOAuthConfig | null =>
  env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET && env.INTEGRATION_KEY
    ? { clientId: env.LINKEDIN_CLIENT_ID, clientSecret: env.LINKEDIN_CLIENT_SECRET, redirectUri: `${origin}/api/integrations/linkedin/callback`,
        pages: !/^(off|false|0|no)$/i.test(env.LINKEDIN_PAGES ?? ''), version: env.LINKEDIN_VERSION ?? '202509' }
    : null

export const spotifyConfig = (env: Env, origin: string): spotify.SpotifyOAuthConfig | null =>
  env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET && env.INTEGRATION_KEY
    ? { clientId: env.SPOTIFY_CLIENT_ID, clientSecret: env.SPOTIFY_CLIENT_SECRET, redirectUri: `${origin}/api/integrations/spotify/callback` }
    : null

export const connectorConfigured = (env: Env, p: Connector) => isGoogle(p) ? !!googleConfig(env, '') : !!msConfig(env, '')

/** What each connection asks for on the Google / Microsoft consent screen. */
export const SCOPES: Record<Connector, readonly string[]> = {
  gmail: google.GMAIL_SCOPES, google_drive: google.DRIVE_SCOPES, youtube_music: youtube.YOUTUBE_SCOPES,
  search_console: searchConsole.SEARCH_CONSOLE_SCOPES, outlook: ms.MS_SCOPES.outlook, onedrive: ms.MS_SCOPES.onedrive,
}

/** The one permission each connection can't work without (people can untick it when they sign in). */
const NEEDS: Record<Connector, string> = {
  gmail: 'https://www.googleapis.com/auth/gmail.send',
  google_drive: 'https://www.googleapis.com/auth/drive.file',
  youtube_music: 'https://www.googleapis.com/auth/youtube.readonly',
  search_console: 'https://www.googleapis.com/auth/webmasters.readonly',
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
  search_console: 'Google Search Console API',
}
/**
 * The Google Cloud APIs that connecting Google Maps and syncing hours call (worker/providers/google.ts).
 * Posts also use the Google My Business API, which only shows in the API Library once Google has
 * approved the project's Business Profile API access.
 */
export const GOOGLE_MAPS_APIS = ['My Business Account Management API', 'My Business Business Information API']
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
  if (p === 'linkedin' && /Not enough permissions|ACCESS_DENIED/i.test(raw)) {
    return 'LinkedIn didn’t allow posting there. Check you’re still an admin of the Page (or choose your own profile), then connect again.'
  }
  if (p === 'instagram' && /Insufficient Developer Role|not.*tester/i.test(raw)) {
    return 'This Instagram account can’t connect yet: until the app passes Meta’s review, only accounts added as Instagram testers in the Meta app can connect.'
  }
  if (/has not been used in project|it is disabled|accessNotConfigured|SERVICE_DISABLED|not switched on/i.test(raw)) {
    if (p === 'google_business') {
      // Google names the API that's off ("My Business Account Management API has not been used in project …").
      const off = raw.match(/([A-Z][\w ]*?API) has not been used in project/)?.[1]
      return `${off ? `The ${off}` : 'A Business Profile API'} is switched off for this app. Google Maps needs both ${GOOGLE_MAPS_APIS.join(' and ')} switched on in Google Cloud (APIs & Services → Library). Then connect again.`
    }
    return `The ${API_NAME[p] ?? 'API'} is switched off for this app. Switch it on in Google Cloud (APIs & Services → Library), then connect again.`
  }
  if (/insufficient authentication scopes|insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|ErrorAccessDenied|Access is denied/i.test(raw)) return missingPermission(p)
  if (/MailboxNotEnabledForRESTAPI|MailboxNotHostedInExchangeOnline|mailbox is either inactive/i.test(raw)) {
    return 'This Microsoft account has no Outlook mailbox. Use an account with Outlook email (Microsoft 365 or Outlook.com).'
  }
  if (/SPO license|mysite not found|Drive not found/i.test(raw)) return 'This Microsoft account has no OneDrive yet. Open OneDrive once in the browser, then connect again.'
  if (p === 'google_business' && /Quota exceeded|limit '?[^']*'? of service 'mybusiness/i.test(raw)) {
    return 'Google hasn’t switched on Business Profile access for this app yet. It’s waiting for Google to approve the app (usually a few days); once approved, connect again.'
  }
  return raw
}

/** Failures that trying again won't fix (as opposed to a provider having a bad minute). */
const LASTING = /invalid_grant|access was removed|access has expired|switched off|without the permission|no Outlook mailbox|no OneDrive|no YouTube channel|not connected|not set up|hasn.t fetched|hasn.t switched on|no Google Maps listing|can.t connect yet|no website in Search Console|no longer in this Google account|didn.t allow posting/i
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
  // Messages and tagged posts are optional extras: noted here so the Messages page can say what's missing.
  const allowed = (perm: string) => (t.permissions === undefined ? undefined : t.permissions.includes(perm))
  return { label: `@${p.username}`, external: { user_id: p.user_id ? String(p.user_id) : t.userId, username: p.username, followers: p.followers_count,
    can_message: allowed('instagram_business_manage_messages'), can_see_tags: allowed('instagram_business_manage_comments') } }
}

/**
 * Business details show the connected account's handle: set when Instagram is connected, and
 * followed when the account is renamed (`previous`), unless an admin typed another handle by hand.
 */
export async function showInstagramHandle(db: SupabaseClient, username: string, previous?: string) {
  const { data } = await db.from('business').select('instagram').eq('id', 1).maybeSingle()
  const now = String(data?.instagram ?? '').replace(/^@+/, '').toLowerCase()
  if (now === username.toLowerCase()) return
  if (previous !== undefined && now && now !== previous.toLowerCase()) return
  await db.from('business').update({ instagram: `@${username}` }).eq('id', 1)
}

/** Tokens that run out (TikTok: a day, Square: 30 days, SumUp: an hour) are renewed with the refresh token when needed. */
interface RenewableSecret { access_token: string; refresh_token: string; expires_at: string }

async function renewable(env: Env, db: SupabaseClient, p: 'tiktok' | 'square' | 'sumup', renewWithinMs: number,
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
  const cfg = squareOAuth(env)
  if (!cfg) throw new Error('Square is not set up')
  const [token, { data: row }] = await Promise.all([
    renewable(env, db, 'square', 7 * 86_400_000, r => square.refreshAccess(cfg, r)),
    db.from('integrations').select('external').eq('provider', 'square').single(),
  ])
  const ext = (row?.external ?? {}) as { locations?: square.SquareLocation[] }
  return { token, sandbox: cfg.sandbox, locationIds: (ext.locations ?? []).map(l => l.id) }
}

export async function sumupSession(env: Env, db: SupabaseClient) {
  const cfg = sumupOAuth(env, '')
  if (!cfg) throw new Error('SumUp is not set up')
  return renewable(env, db, 'sumup', 5 * 60_000, r => sumup.refreshAccess(cfg, r))
}

/** LinkedIn's access: 60 days, then connect again (apps LinkedIn approved for it get a refresh token instead). */
export interface LinkedInSecret { access_token: string; expires_at: string; refresh_token?: string }
export interface LinkedInExternal { member?: linkedin.LinkedInMember; pages?: linkedin.LinkedInPage[]; page_id?: string; page_name?: string; expires_at?: string; expiry_warned?: boolean }
const LINKEDIN_WARN_MS = 7 * 86_400_000

/** The LinkedIn access and who posts (the chosen Page, or 'me'). With `renew`, a refreshable token close to running out is renewed. */
export async function linkedinSession(env: Env, db: SupabaseClient, renew = false) {
  const cfg = linkedinOAuth(env, '')
  if (!cfg) throw new Error('LinkedIn is not set up')
  const [{ data: secret }, { data: row }] = await Promise.all([
    db.from('integration_secrets').select('ciphertext').eq('provider', 'linkedin').maybeSingle(),
    db.from('integrations').select('external').eq('provider', 'linkedin').single(),
  ])
  if (!secret) throw new Error('LinkedIn is not connected')
  let s = await unseal<LinkedInSecret>(env.INTEGRATION_KEY!, secret.ciphertext)
  const left = Date.parse(s.expires_at) - Date.now()
  if (renew && s.refresh_token && left < LINKEDIN_WARN_MS) {
    const t = await linkedin.refreshAccess(cfg, s.refresh_token)
    s = { access_token: t.access_token!, refresh_token: t.refresh_token ?? s.refresh_token, expires_at: new Date(Date.now() + (t.expires_in ?? 5_184_000) * 1000).toISOString() }
    await db.from('integration_secrets').update({ ciphertext: await seal(env.INTEGRATION_KEY!, s), updated_at: new Date().toISOString() }).eq('provider', 'linkedin')
  } else if (left <= 0) throw new Error('LinkedIn access has expired. Connect it again.')
  const ext = (row?.external ?? {}) as LinkedInExternal
  return { cfg, token: s.access_token, expiresAt: s.expires_at, refreshable: !!s.refresh_token, external: ext,
    author: ext.page_id && ext.member ? linkedin.authorUrn(ext.page_id, ext.member.id) : null }
}

/** The connected Stripe account, read with the platform key. */
export async function stripeSession(env: Env, db: SupabaseClient) {
  const cfg = stripeOAuth(env, '')
  if (!cfg) throw new Error('Stripe is not set up')
  const { data: row } = await db.from('integrations').select('external').eq('provider', 'stripe').single()
  const accountId = (row?.external as { account_id?: string } | null)?.account_id
  if (!accountId) throw new Error('Stripe is not connected')
  return { cfg, secretKey: cfg.secretKey, accountId }
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

/** SumUp: the merchant account was found and its transactions can be read. */
export async function proveSumUp(token: string): Promise<Proven> {
  const [m, last] = await Promise.all([sumup.merchant(token), sumup.latest(token)])
  return { label: m.name, external: { merchant_code: m.merchant_code, currency: m.currency ?? last?.currency ?? 'EUR' } }
}

/**
 * LinkedIn: posting was allowed and the person could be read. With company Pages they administer
 * (and Pages allowed), it waits for the admin to pick a Page or their own profile ('me'); without,
 * it posts as the person straight away.
 */
export async function proveLinkedIn(cfg: linkedin.LinkedInOAuthConfig, t: linkedin.LinkedInToken): Promise<Proven> {
  const scopes = linkedin.granted(t.scope)
  if (scopes && !scopes.includes('w_member_social')) throw new Error(missingPermission('linkedin'))
  const token = t.access_token!
  const member = await linkedin.member(cfg.version, token)
  // An app without the Community Management API (or Pages unticked) has the person only.
  const canPages = cfg.pages && (!scopes || (scopes.includes('r_organization_admin') && scopes.includes('w_organization_social')))
  const pages = canPages ? await linkedin.pages(cfg.version, token).catch(() => []) : []
  const external = { member, pages, expires_at: new Date(Date.now() + (t.expires_in ?? 5_184_000) * 1000).toISOString() }
  if (pages.length) return { label: null, external, pending: true }
  return { label: member.name, external: { ...external, page_id: 'me', page_name: member.name } }
}

/** Stripe: the account can be read (and takes payments). */
export async function proveStripe(secretKey: string, accountId: string): Promise<Proven> {
  const a = await stripe.account(secretKey, accountId)
  return { label: a.name, external: { account_id: a.id, currency: a.currency, charges_enabled: a.chargesEnabled } }
}

/** A fresh Google access token for the Google Maps listing, plus the chosen location. */
export async function googleSession(env: Env, db: SupabaseClient, origin = '') {
  const cfg = googleConfig(env, origin)
  if (!cfg) throw new Error('Google is not set up (client id/secret missing)')
  const { data: row } = await db.from('integrations').select('external').eq('provider', 'google_business').single()
  const { access_token } = await google.refreshAccess(cfg, await refreshTokenOf(env, db, 'google_business'))
  const ext = (row?.external ?? {}) as { location?: string; account?: string; closed_on_holidays?: boolean }
  return { token: access_token!, location: ext.location, account: ext.account, closedOnHolidays: !!ext.closed_on_holidays, external: ext as Record<string, unknown> }
}

/** Which of these is connected (at most one per group, see migration 28). */
export async function connectedOf<P extends Provider>(db: SupabaseClient, options: P[]): Promise<P | null> {
  const { data } = await db.from('integrations').select('provider, status').in('provider', options)
  return options.find(p => data?.some(r => r.provider === p && r.status === 'connected')) ?? null
}

// ---------------------------------------------------------------------------------------------
// Proof on connect: nothing is stored until this passes
// ---------------------------------------------------------------------------------------------
export interface Proven {
  label: string | null; external: Record<string, unknown>
  /** Signed in and allowed, but the admin still has to choose (a LinkedIn Page, a Search Console website). */
  pending?: boolean
}

const confirmation = (p: 'gmail' | 'outlook', email: string, business: string) => ({
  to: email,
  subject: `${business}: this mailbox is connected`,
  text: `This is a check from Business Agent: ${optionName(p)} (${email}) is now connected for ${business}.\n\n` +
    'Team alerts for people who prefer email will come from this address. You can disconnect it any time on the Connections page.',
})

/**
 * Use a new Google/Microsoft connection for real. Throws, in plain words, if it can't do its job.
 * `website`: the business's own, so Search Console can pick it.
 */
export async function proveNew(p: Connector, t: { access_token: string; scope?: string }, business: string, website?: string | null): Promise<Proven> {
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
    case 'search_console': {
      const [email, sites] = await Promise.all([google.accountEmail(token), searchConsole.sites(token)])
      if (!sites.length) throw new Error('This Google account has no website in Search Console. Add and verify the website at search.google.com/search-console, then connect again.')
      const site = searchConsole.pickSite(sites, website)
      if (!site) return { label: email ?? null, external: { sites, email }, pending: true }
      await searchConsole.probe(token, site)
      return { label: searchConsole.siteLabel(site), external: { sites, site, email } }
    }
  }
}

/** Business details show the connected mailbox as the business's email when none was typed (one typed by hand is never replaced). */
export async function showMailboxAddress(db: SupabaseClient, email: string) {
  const { data } = await db.from('business').select('email').eq('id', 1).maybeSingle()
  if (!data || String(data.email ?? '').trim()) return
  await db.from('business').update({ email }).eq('id', 1)
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
    if (p === 'search_console') {
      const sites = await searchConsole.sites(token)
      const site = row.external.site as string | undefined
      if (site && !sites.includes(site)) throw new Error(`${searchConsole.siteLabel(site)} is no longer in this Google account’s Search Console. Choose another website or connect again.`)
      return { external: { ...row.external, sites } }
    }
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
      await showInstagramHandle(db, p.username, String(row.external?.username ?? ''))
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
    case 'stripe': {
      const s = await stripeSession(env, db)
      const proven = await proveStripe(s.secretKey, s.accountId)
      return { account_label: proven.label, external: { ...row.external, ...proven.external } }
    }
    case 'sumup': {
      const proven = await proveSumUp(await sumupSession(env, db))
      return { account_label: proven.label, external: { ...row.external, ...proven.external } }
    }
    case 'linkedin': {
      const s = await linkedinSession(env, db, true)
      const member = await linkedin.member(s.cfg.version, s.token)
      const pageId = s.external.page_id ?? 'me'
      const name = pageId === 'me' ? member.name : (await linkedin.page(s.cfg.version, s.token, pageId)).name
      const external: LinkedInExternal = { ...s.external, member, page_name: name, expires_at: s.expiresAt }
      // No silent renewal for most apps: admins hear a week before the 60 days are up (once).
      if (!s.refreshable && Date.parse(s.expiresAt) - Date.now() < LINKEDIN_WARN_MS && !s.external.expiry_warned) {
        await tellAdmins(db, 'LinkedIn needs connecting again soon', `LinkedIn only allows access for 60 days. Connect it again before ${day(s.expiresAt)} to keep posting.`)
        external.expiry_warned = true
      }
      return { account_label: name, external: external as Record<string, unknown> }
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

/**
 * Check every connection that is (or was) working. The nightly job; admins get notified. The apps
 * are checked at the same time (each has its own access), so "Check all" takes as long as the
 * slowest one rather than all of them added up.
 */
export async function checkAll(env: Env, db: SupabaseClient, options: CheckOptions = {}) {
  const { data } = await db.from('integrations').select('provider').in('status', ['connected', 'error', 'pending'])
  const rows = await Promise.all(((data ?? []) as { provider: Provider }[]).map(({ provider }) =>
    checkOne(env, db, provider, options).catch(e => { console.error(`check ${provider} failed`, e); return null })))
  return rows.filter((r): r is Row => !!r)
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
