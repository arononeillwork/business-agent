// Connections to Google Business Profile, WhatsApp, Instagram, Facebook, TikTok, LinkedIn, the
// payment systems (Square, Stripe, SumUp), email, files, calendars, music and Search Console, and
// the outbox worker that delivers everything queued in the database (with retries; see
// migration 7). Whether a connection really works is decided in connections.ts.
import { Hono, type Context } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { planFeatures } from './billing'
import { SECRETS_BUSINESS_ID, bearer, businessDb, businessOf, serviceClient, userClient, type Env } from './supabase'
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
import { squareCustomerEvent, syncSquareCustomers } from './squareCustomers'
import { cached, oldest } from './cache'
import * as stripe from './providers/stripe'
import * as sumup from './providers/sumup'
import * as linkedin from './providers/linkedin'
import * as searchConsole from './providers/searchConsole'
import * as metaAds from './providers/metaAds'
import { alertEmail, base64url, mimeMessage } from '../shared/alertText'
import { addToCalendarUrl, optionName } from '../shared/connections'
import { replyWindow } from '../shared/messages'
import { MINUTES, takingsMinutes } from '../shared/refresh'
import { finishMusicConnect, type MusicState } from './music'
import { ensureFeed } from './calendarFeed'
import { checkMentions, decide, repostMention } from './mentions'
import * as waInbox from './whatsappInbox'
import { MediaError, checkFile, mediaBytes, mediaStorage, serveMedia, storeMedia } from './media'
import {
  CONNECTORS, PROVIDERS, READ_MAIL, ROW_COLUMNS, SCOPES, canReadMail, squareWebhookUrl, calendarSeen, calendarFetched, checkAll, checkOne, connectedOf, connectorConfigured,
  connectorGrant, explain, facebookOAuth, facebookSession, googleAdsConfig, googleConfig, googleSession, instagramOAuth, instagramSession, isCalendarApp, isGoogle,
  metaAdsOAuth, proveMetaAds,
  lasting, linkedinOAuth, linkedinSession, markBroken, msConfig, proveFacebook, proveInstagram, proveLinkedIn, proveNew, proveSpotify, proveSquare, proveStripe,
  proveSumUp, proveTikTok, setIntegration, showInstagramHandle, showMailboxAddress, spotifyConfig, spotifySession, squareOAuth, squareSession, stripeOAuth,
  stripeSession, sumupOAuth, sumupSession, tellAdmins, tiktokOAuth, tiktokSession, waConfig, type Connector, type LinkedInExternal, type Provider,
} from './connections'
import type { Business, CalendarEvent, OpeningHours, PostKind, PostMedia, SalesProvider, SpotifyPlaylist } from '../shared/types'
import { today, zonedIso } from '../shared/time'
import { mergeSales } from '../shared/sales'
import { LEGAL } from '../shared/legal'
import { businessConfig } from '../shared/business.config'
import { menuSections, type MenuItem } from '../shared/menu'

export { waConfig }

interface ConnectorState { uid: string; kind: 'connector'; provider: Connector; back?: 'setup' | 'connections' | 'invoices' | 'email'; read?: boolean }

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

type GoogleSession = Awaited<ReturnType<typeof googleSession>>
/** Kept in `external` next to the listing: the hours Google was last sent, and last seen on Google. */
interface HoursMemory { synced_hours?: OpeningHours; google_hours?: OpeningHours }

/** Push the app's hours, closures and phone to Google. Returns the hours sent. */
async function pushGoogle(db: SupabaseClient, s: GoogleSession) {
  if (!s.location) throw new Error('Choose which Google listing to update')
  const [{ data: b }, { data: events }] = await Promise.all([
    db.from('business').select('opening_hours, phone').single(),
    db.from('calendar_events').select('*').gte('starts_on', today()),
  ])
  const biz = b as Pick<Business, 'opening_hours' | 'phone'>
  await google.updateLocation(s.token, s.location, {
    regularHours: google.toGoogleHours(biz.opening_hours),
    specialHours: google.toSpecialHours((events ?? []) as CalendarEvent[], today(), s.closedOnHolidays),
    phone: biz.phone,
  })
  return biz.opening_hours
}

const synced = (s: GoogleSession, memory: HoursMemory) =>
  ({ last_sync_at: new Date().toISOString(), last_error: null, status: 'connected', external: { ...s.external, ...memory } })

/** Push the app's hours, closures and phone to Google. */
export async function syncGoogle(env: Env, db: SupabaseClient) {
  const s = await googleSession(env, db)
  await setIntegration(db, 'google_business', synced(s, { synced_hours: await pushGoogle(db, s) }))
}

/**
 * Opening hours both ways (every 15 minutes). Whichever side changed since last time wins:
 * - the app has hours Google hasn't been sent → they go to Google (the app wins if both changed);
 * - otherwise, Google's hours changed since the last look (edited on Google Maps) → the app takes them,
 *   and admins are told.
 * Google's hours are compared with what Google showed last time, not with the app, so a change the
 * app sent that Google hasn't shown yet is never mistaken for an edit on Google.
 */
export async function syncGoogleBothWays(env: Env, db: SupabaseClient): Promise<'pushed' | 'pulled' | 'same'> {
  const s = await googleSession(env, db)
  if (!s.location) throw new Error('Choose which Google listing to update')
  const [{ data: b }, onGoogle] = await Promise.all([
    db.from('business').select('opening_hours').single(),
    google.getLocationHours(s.token, s.location),
  ])
  const app = (b as Pick<Business, 'opening_hours'>).opening_hours
  const memory = s.external as HoursMemory
  if (!memory.synced_hours || !google.sameHours(app, memory.synced_hours)) {
    await setIntegration(db, 'google_business', synced(s, { synced_hours: await pushGoogle(db, s), google_hours: onGoogle }))
    return 'pushed'
  }
  // A listing with no hours at all (removed on Google) never empties the app's week.
  const anyOpen = Object.values(onGoogle).some(Boolean)
  if (anyOpen && memory.google_hours && !google.sameHours(onGoogle, memory.google_hours) && !google.sameHours(onGoogle, app)) {
    // The database then queues a push of these same hours (with closures and phone): harmless.
    const { error } = await db.from('business').update({ opening_hours: onGoogle })
    if (error) throw new Error(error.message)
    await setIntegration(db, 'google_business', synced(s, { synced_hours: onGoogle, google_hours: onGoogle }))
    await tellAdmins(db, 'Opening hours changed on Google Maps', 'The app now uses the hours from your Google listing.')
    return 'pulled'
  }
  if (!memory.google_hours || !google.sameHours(onGoogle, memory.google_hours)) {
    await setIntegration(db, 'google_business', { external: { ...s.external, google_hours: onGoogle } })
  }
  return 'same'
}

/**
 * Kept in `external` next to the listing: the menu Google was last sent (a fingerprint), when, how
 * many items; and a menu Google refused, so the same one isn't tried again every minute.
 */
interface MenuMemory {
  menu_hash?: string; menu_sent_at?: string; menu_items?: number; menu_error?: string | null
  menu_failed?: { hash: string; at: string }
}
export type GoogleMenuResult = { status: 'sent' | 'same' | 'empty' | 'paused' | 'not_connected'; items: number }
/** After a refusal, the same menu is tried again this long after. */
const MENU_RETRY_MS = 60 * 60_000

async function fingerprint(v: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(v)))
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** The app's menu (what's on it, in the Menu page's order) as Google's food menu. */
export async function appMenuForGoogle(db: SupabaseClient) {
  const [{ data: items, error }, { data: settings }] = await Promise.all([
    db.rpc('menu_list'), db.from('settings').select('menu_sections').eq('id', 1).maybeSingle(),
  ])
  if (error) throw new Error(error.message)
  const sections = menuSections((items ?? []) as MenuItem[], { order: (settings?.menu_sections ?? []) as string[] })
  const menu = google.toGoogleMenu({ title: 'Menu', sections }, businessConfig.currency)
  return { menu, items: menu.sections.reduce((n, s) => n + s.items.length, 0) }
}

/**
 * The menu onto the Google Maps listing, when it changed since it was last sent (`force`: send it
 * anyway, the Menu page's "Send to Google Maps now"). Asked every minute, after each Square read
 * that changed something, and on demand; Google is only called when there's something new. Google
 * replaces the listing's menu with the app's (read first, so its cuisines and menu link stay).
 */
export async function pushGoogleMenu(env: Env, db: SupabaseClient, { force = false } = {}): Promise<GoogleMenuResult> {
  const { data: row } = await db.from('integrations').select('status, external').eq('provider', 'google_business').maybeSingle()
  if (row?.status !== 'connected') {
    if (force) throw new Error('Connect your Google listing on the Connections page first.')
    return { status: 'not_connected', items: 0 }
  }
  // Like hours: Google Maps sync is part of the plan.
  const { data: allowed } = await db.rpc('plan_allows', { p_feature: 'google_maps' })
  if (allowed !== true) {
    if (force) throw new Error('Paused: your plan does not include Google Maps. Upgrade on the Billing page.')
    return { status: 'paused', items: 0 }
  }
  const memory = (row.external ?? {}) as MenuMemory
  const { menu, items } = await appMenuForGoogle(db)
  const hash = await fingerprint(menu)
  if (!force && memory.menu_hash === hash) return { status: 'same', items }
  if (!force && memory.menu_failed?.hash === hash && Date.now() - Date.parse(memory.menu_failed.at) < MENU_RETRY_MS) return { status: 'same', items }
  // Nothing priced on the menu: the listing's menu is left as it is rather than emptied.
  if (!items) {
    if (force) throw new Error('Nothing on the menu has a price yet, so there’s nothing Google can show.')
    return { status: 'empty', items }
  }
  let s: GoogleSession | null = null
  try {
    s = await googleSession(env, db)
    if (!s.location || !s.account) throw new Error('Choose which Google listing to update on the Connections page.')
    if (!await google.canHaveFoodMenus(s.token, s.location)) {
      throw new Error('Google doesn’t take a menu on this listing: only food and drink places can show one. Check the listing’s category on Google.')
    }
    const current = await google.getFoodMenus(s.token, s.account, s.location)
    await google.updateFoodMenus(s.token, google.withAppMenu(current, menu))
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    const ext = s?.external ?? (row.external as Record<string, unknown>) ?? {}
    await setIntegration(db, 'google_business', { last_error: why, external: { ...ext, menu_error: why, menu_failed: { hash, at: new Date().toISOString() } } }).catch(() => {})
    throw new Error(why)
  }
  const now = new Date().toISOString()
  await setIntegration(db, 'google_business', { last_sync_at: now, last_error: null,
    external: { ...s.external, menu_hash: hash, menu_sent_at: now, menu_items: items, menu_error: null, menu_failed: null } })
  return { status: 'sent', items }
}

/** How long to wait for TikTok to confirm a post (tests set it to nothing). */
let tiktokWait: { waitMs?: number; tries?: number } = {}
export const setTikTokWait = (w: typeof tiktokWait) => { tiktokWait = w }
/** How long to wait for Instagram to process a video (tests set it to nothing). */
let instagramWait: instagram.PublishWait = {}
export const setInstagramWait = (w: instagram.PublishWait) => { instagramWait = w }

/** Deliver a business's due outbox jobs. Called by the cron every minute, for each business. */
export async function drainOutbox(env: Env, businessId: number) {
  const db = businessDb(env, businessId)
  const { data: jobs, error } = await db.rpc('claim_outbox', { p_limit: 25 })
  if (error) throw new Error(error.message)
  const features = jobs?.length ? await planFeatures(env, businessId) : new Set<string>()
  for (const job of (jobs ?? []) as { id: number; kind: string; payload: Record<string, unknown> }[]) {
    try {
      let externalId: string | null = null
      // A lapsed subscription pauses what the plan no longer includes.
      const needs = ({ whatsapp: 'whatsapp', google_sync: 'google_maps', google_post: 'google_maps' } as Record<string, string>)[job.kind]
      if (needs && !features.has(needs)) throw new Error('Paused: your plan does not include this. Upgrade on the Billing page.')
      if (job.kind === 'whatsapp') {
        const cfg = waConfig(env, db)
        if (!cfg) throw new Error('WhatsApp is not set up')
        const p = job.payload as { to: string; template: string; params: string[] }
        externalId = await whatsapp.sendTemplate(cfg, p.to, p.template, p.params ?? [])
        // Into the chat on the Messages page, as the person received it (it's sent either way).
        await waInbox.saveOutgoing(db, { id: externalId, to: p.to, text: waInbox.templateText(p.template, p.params ?? []) })
          .catch(e => console.error('whatsapp chat save failed', e))
      } else if (job.kind === 'google_sync') {
        await syncGoogle(env, db)
      } else if (job.kind === 'google_post') {
        const s = await googleSession(env, db)
        if (!s.location || !s.account) throw new Error('Choose which Google listing to post to')
        externalId = (await google.createPost(s.token, s.account, s.location, job.payload as never)).name
      } else if (job.kind === 'email') {
        const p = job.payload as { to: string; template: string; params: string[] }
        const { data: biz } = await db.from('business').select('name').single()
        externalId = await sendEmail(env, db, { to: p.to, ...alertEmail(p.template, p.params ?? [], biz?.name ?? 'Business Agent') })
      } else if (job.kind === 'instagram_post') {
        // Post, carousel, reel or story, with every photo and video (older jobs: just image_url).
        // A reel with music put in by Business Agent names its sound (migration 86).
        const p = job.payload as { image_url: string; caption: string; kind?: PostKind; media?: PostMedia[]; audio_name?: string }
        const media = p.media?.length ? p.media : [{ url: p.image_url, type: 'image' as const }]
        externalId = await instagram.publish(await instagramSession(env, db), { kind: p.kind ?? 'post', media, caption: p.caption, audioName: p.audio_name }, instagramWait)
      } else if (job.kind === 'facebook_post') {
        const p = job.payload as { image_url?: string | null; caption: string }
        const s = await facebookSession(env, db)
        externalId = await facebook.publish(s.graphVersion, s.pageId, s.token, p.caption, p.image_url)
      } else if (job.kind === 'tiktok_post') {
        const p = job.payload as { image_url: string; caption: string }
        externalId = await tiktok.publishPhoto(await tiktokSession(env, db), p.caption, p.image_url, tiktokWait)
      } else if (job.kind === 'linkedin_post') {
        // Text, and the photo when there is one (LinkedIn takes it as an upload rather than fetching it).
        const p = job.payload as { image_url?: string | null; caption: string; media?: PostMedia[] }
        if (p.media?.some(m => m.type === 'video')) throw new Error('LinkedIn posts from the planner take text and one photo; videos aren’t sent to LinkedIn')
        const s = await linkedinSession(env, db)
        if (!s.author) throw new Error('Choose whether LinkedIn posts go to your Page or your own profile')
        externalId = await linkedin.publish(s.cfg.version, s.token, s.author, p.caption, p.image_url ? await mediaBytes(env, p.image_url) : null)
      }
      await db.rpc('complete_outbox', { p_id: job.id, p_ok: true, p_external_id: externalId })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await db.rpc('complete_outbox', { p_id: job.id, p_ok: false, p_error: message })
      if (job.kind.startsWith('google')) await setIntegration(db, 'google_business', { last_error: message }).catch(() => {})
      // A post failing because the access was removed turns that app red (admins are told once).
      const app = ({ instagram_post: 'instagram', facebook_post: 'facebook', tiktok_post: 'tiktok', linkedin_post: 'linkedin' } as Record<string, Provider>)[job.kind]
      if (app && lasting(app, e)) await markBroken(db, app, explain(app, e)).catch(() => {})
    }
  }
}

/**
 * The Google and Spotify callbacks also finish personal Music connections (state kind 'music'),
 * so those use the redirect URLs already registered with each provider. Returns null otherwise.
 */
async function musicCallback(c: Ctx, provider: 'spotify' | 'youtube') {
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
/** Who's asking, and for which business (set by the sign-in checks below; callbacks find them from the state). */
type Vars = { userId: string; businessId: number }
type Ctx = Context<{ Bindings: Env; Variables: Vars }>
export const integrations = new Hono<{ Bindings: Env; Variables: Vars }>()

/** The business a connection's callback is for: the business of whoever started it. */
async function callbackDb(env: Env, uid: string | undefined) {
  const id = uid ? await businessOf(env, uid) : null
  if (!id) throw new Error('That connection link expired. Try again.')
  return businessDb(env, id)
}

/** Admin-only routes: check the caller's Supabase token and role. */
integrations.use('/api/integrations/*', async (c, next) => {
  if (c.req.path.endsWith('/callback')) return next()
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const sb = userClient(c.env, token, 'app')
  const [{ data: user }, { data: isAdmin }, { data: businessId }] = await Promise.all([sb.auth.getUser(token), sb.rpc('is_admin'), sb.rpc('current_business_id')])
  if (!user.user || !isAdmin || !businessId) return c.json({ error: 'Only an admin can manage connections' }, 403)
  c.set('userId', user.user.id)
  c.set('businessId', businessId as number)
  // Starting a connection the plan doesn't include: say so before sending anyone off to sign in.
  const starting = /^\/api\/integrations\/(?:connect\/)?([a-z_]+)\/start$/.exec(c.req.path)?.[1]
  if (starting) {
    const { error: planError } = await sb.rpc('plan_check_connect', { p_provider: starting === 'google' ? 'google_business' : starting })
    if (planError) return c.json({ error: planError.message }, 402)
  }
  await next()
})

integrations.get('/api/integrations', async c => {
  const db = businessDb(c.env, c.get('businessId'))
  const { data } = await db.from('integrations').select(ROW_COLUMNS)
  const setup = {
    google_business: !!googleConfig(c.env, ''),
    whatsapp: !!waConfig(c.env, db) && !!c.env.META_APP_SECRET && !!c.env.WHATSAPP_VERIFY_TOKEN,
    instagram: !!instagramOAuth(c.env, ''),
    facebook: !!facebookOAuth(c.env, ''),
    meta_ads: !!metaAdsOAuth(c.env, ''),
    tiktok: !!tiktokOAuth(c.env, ''),
    linkedin: !!linkedinOAuth(c.env, ''),
    square: !!squareOAuth(c.env),
    stripe: !!stripeOAuth(c.env, ''),
    sumup: !!sumupOAuth(c.env, ''),
    spotify: !!spotifyConfig(c.env, ''),
    ...Object.fromEntries(CONNECTORS.map(p => [p, connectorConfigured(c.env, p)])),
    // Calendars need no keys of their own: the calendar app subscribes to the team calendar link.
    google_calendar: !!c.env.INTEGRATION_KEY,
    outlook_calendar: !!c.env.INTEGRATION_KEY,
    // AI images: the business pastes its own Higgsfield key; it only has to be kept encrypted.
    higgsfield: !!c.env.INTEGRATION_KEY,
  }
  const { data: queue } = await db.from('outbox').select('kind, status').in('status', ['pending', 'failed', 'dead'])
  return c.json({ integrations: data, configured: setup, queue, media_storage: await mediaStorage(c.env, db) })
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

// Email, files, YouTube Music and Search Console: start (the browser then goes to Google or Microsoft)…
integrations.post('/api/integrations/connect/:provider/start', async c => {
  const p = c.req.param('provider') as Connector
  if (!CONNECTORS.includes(p)) return c.json({ error: 'Unknown connection' }, 404)
  const origin = new URL(c.req.url).origin
  // `read`: also allow reading the mailbox (Invoices brings in invoices that come by email).
  const { back, read } = await c.req.json<{ back?: ConnectorState['back']; read?: boolean }>().catch(() => ({ back: undefined, read: undefined }))
  const reading = !!read && !!READ_MAIL[p]
  const state = await signState(c.env.INTEGRATION_KEY ?? '', { uid: c.get('userId'), kind: 'connector', provider: p, back, ...(reading ? { read: true } : {}) } satisfies ConnectorState)
  const scopes = [...SCOPES[p], ...(reading ? [READ_MAIL[p]!] : [])]
  if (isGoogle(p)) {
    const cfg = googleConfig(c.env, origin)
    if (!cfg) return c.json({ error: `${optionName(p)} needs the Google keys first (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; see docs/sign-in-setup.md).` }, 400)
    if (p === 'google_ads' && !googleAdsConfig(c.env)) return c.json({ error: 'Google Ads needs Business Agent’s Google Ads developer token first (GOOGLE_ADS_DEVELOPER_TOKEN; see docs/INTEGRATIONS.md).' }, 400)
    return c.json({ url: google.authUrl(cfg, state, scopes) })
  }
  const cfg = msConfig(c.env, origin)
  if (!cfg) return c.json({ error: `${optionName(p)} needs the Microsoft app first: run the "Set up Microsoft sign-in" workflow (docs/sign-in-setup.md).` }, 400)
  return c.json({ url: ms.authUrl(cfg, state, scopes) })
})

/**
 * …and finish: use the new connection for real first (send the confirmation email, make the
 * folder, read the playlists, find the website). Only if that works is the access kept (encrypted)
 * and the app shown as connected (Search Console: pending until a website is chosen, when none is
 * the business's); the other app in its group is then disconnected by the database (migration 28).
 */
async function finishConnector(c: Ctx, state: ConnectorState) {
  const origin = new URL(c.req.url).origin
  const back = (q: string) => c.redirect(`${origin}/${state.back === 'setup' ? 'setup' : state.back === 'invoices' ? 'invoices' : state.back === 'email' ? 'email' : 'connections'}?${q}`)
  const p = state.provider
  const db = await callbackDb(c.env, state.uid).catch(() => null)
  if (!db) return back(`connect_error=${encodeURIComponent('That connection link expired. Try again.')}`)
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
    const { data: biz } = await db.from('business').select('name, website').maybeSingle()
    const proven = await proveNew(p, { access_token: t.access_token!, scope: t.scope }, biz?.name ?? 'Business Agent', biz?.website, googleAdsConfig(c.env))
    const { error } = await db.from('integration_secrets').upsert({ provider: p, ciphertext: await seal(c.env.INTEGRATION_KEY!, { refresh_token: t.refresh_token }), updated_at: new Date().toISOString() })
    if (error) throw new Error(error.message)
    const now = new Date().toISOString()
    await setIntegration(db, p, { status: proven.pending ? 'pending' : 'connected', connected_by: state.uid, connected_at: now, last_checked_at: proven.pending ? null : now,
      last_error: null, account_label: proven.label,
      // A mailbox: whether it may be read too (Invoices), as allowed on Google's or Microsoft's screen.
      external: READ_MAIL[p] ? { ...proven.external, reads_mail: !!state.read && canReadMail(p, t.scope) } : proven.external })
    // The mailbox becomes the business's email address, unless one was typed in.
    if ((p === 'gmail' || p === 'outlook') && proven.label) await showMailboxAddress(db, proven.label).catch(() => {})
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
  c.json({ integrations: await checkAll(c.env, businessDb(c.env, c.get('businessId')), { notify: false }) }))

integrations.post('/api/integrations/:provider/check', async c => {
  const p = c.req.param('provider') as Provider
  if (!PROVIDERS.includes(p)) return c.json({ error: 'Unknown connection' }, 404)
  return c.json(await checkOne(c.env, businessDb(c.env, c.get('businessId')), p, { notify: false }))
})

// Calendar: choose Google Calendar or Outlook Calendar. It shows as connected once that app has
// fetched the team calendar (it does within minutes of being added; calendarFeed.ts notices).
integrations.post('/api/integrations/calendar/:app/choose', async c => {
  const app = c.req.param('app')
  if (!isCalendarApp(app)) return c.json({ error: 'Unknown calendar app' }, 404)
  if (!c.env.INTEGRATION_KEY) return c.json({ error: 'Calendar links are being set up' }, 503)
  const db = businessDb(c.env, c.get('businessId'))
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
  const db = businessDb(c.env, c.get('businessId'))
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
    return c.json(await saveFile(c.env, businessDb(c.env, c.get('businessId')), { folder: f.folder ?? '', name: f.name.replace(/[\\/:*?"<>|]/g, '-'), content: f.content, type: f.type ?? 'text/csv' }))
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
  const db = await callbackDb(c.env, state.uid).catch(() => null)
  if (!db) return back(`connect_error=${encodeURIComponent('That connection link expired. Try again.')}`)
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
  const db = businessDb(c.env, c.get('businessId'))
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
  await syncGoogle(c.env, businessDb(c.env, c.get('businessId')))
  return c.json({ ok: true })
})

// The menu onto the Google listing now (the Menu page's "Send to Google Maps now").
integrations.post('/api/integrations/google/menu', async c => {
  try {
    return c.json(await pushGoogleMenu(c.env, businessDb(c.env, c.get('businessId')), { force: true }))
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
})

integrations.get('/api/integrations/google/hours', async c => {
  const db = businessDb(c.env, c.get('businessId'))
  const s = await googleSession(c.env, db)
  if (!s.location) return c.json({ error: 'Choose which Google listing to read' }, 400)
  return c.json({ opening_hours: await google.getLocationHours(s.token, s.location) })
})

integrations.post('/api/integrations/:provider/disconnect', async c => {
  const provider = c.req.param('provider') as Provider
  if (!PROVIDERS.includes(provider)) return c.json({ error: 'Unknown connection' }, 404)
  const db = businessDb(c.env, c.get('businessId'))
  // Stripe: also tell Stripe the app no longer has access to the account.
  if (provider === 'stripe') await stripeSession(c.env, db).then(s => stripe.deauthorize(s.cfg, s.accountId)).catch(() => {})
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
    const db = await callbackDb(c.env, uid)
    const { error } = await db.from('integration_secrets').upsert({ provider: 'spotify', ciphertext: await seal(c.env.INTEGRATION_KEY!, { refresh_token: t.refresh_token }), updated_at: new Date().toISOString() })
    if (error) throw new Error(error.message)
    const now = new Date().toISOString()
    await setIntegration(db, 'spotify', { status: 'connected', connected_by: uid, connected_at: now, last_checked_at: now, last_error: null,
      account_label: proven.label, external: proven.external })
    return back('connected=spotify')
  } catch (e) {
    const why = explain('spotify', e)
    const uid = await verifyState<{ uid: string }>(c.env.INTEGRATION_KEY!, c.req.query('state') ?? '').then(st => st.uid, () => undefined)
    await callbackDb(c.env, uid).then(db => setIntegration(db, 'spotify', { last_error: why })).catch(() => {})
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
  const m = await cafeMusic(c.env, businessDb(c.env, c.get('businessId')), new URL(c.req.url).origin)
  if (!m) return c.json({ error: 'Connect Spotify or YouTube Music first' }, 400)
  return c.json({ provider: m.provider, playlists: await m.playlists(), approved: m.approved })
})

integrations.post('/api/integrations/music/playlist', async c => {
  const { playlist } = await c.req.json<{ playlist: { id: string } }>()
  const db = businessDb(c.env, c.get('businessId'))
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
  const sb = userClient(c.env, token, 'app')
  const [{ data: role }, { data: businessId }] = await Promise.all([sb.rpc('my_role'), sb.rpc('current_business_id')])
  if (!role || !businessId) return c.json({ error: 'Not allowed' }, 403)
  c.set('businessId', businessId as number)
  await next()
})

/** Café music player: the team (not partners or the tablet account) browses the café account's playlists. */
const isTeam = async (c: { env: Env; req: { header: (n: string) => string | undefined } }) => {
  const { data: role } = await userClient(c.env, bearer(c.req.header('authorization'))!, 'app').rpc('my_role')
  return role === 'admin' || role === 'employee'
}

integrations.get('/api/music/library', async c => {
  if (!await isTeam(c)) return c.json({ error: 'Music is for the team' }, 403)
  const db = businessDb(c.env, c.get('businessId'))
  const m = await cafeMusic(c.env, db, new URL(c.req.url).origin)
  if (!m) return c.json({ provider: null, account: null, playlists: [], approved: null })
  const { data } = await db.from('integrations').select('account_label').eq('provider', m.provider).single()
  const playlists = await m.playlists()
  if (m.provider !== 'youtube_music') return c.json({ provider: 'spotify', account: data?.account_label ?? null, playlists, approved: m.approved })
  // YouTube Music: only the playlists of music. Each playlist is checked once (again if its size changes).
  type Kinds = Record<string, { n: number; music: boolean }>
  const known = ((m.external as { music_kinds?: Kinds }).music_kinds ?? {}) as Kinds
  const unknown = playlists.filter(p => known[p.id]?.n !== p.tracks).map(p => p.id)
  let kinds = known
  if (unknown.length) {
    const { token } = await connectorGrant(c.env, db, 'youtube_music', new URL(c.req.url).origin)
    const found = await youtube.musicPlaylists(token, unknown)
    kinds = Object.fromEntries(playlists.map(p => [p.id, p.id in found ? { n: p.tracks, music: found[p.id] } : known[p.id]]).filter(([, v]) => v))
    await setIntegration(db, 'youtube_music', { external: { ...m.external, music_kinds: kinds } })
  }
  // Only music, as YouTube Music lists it: the approved playlist always counts, whatever is in it; any
  // other only once it's been checked and its name doesn't say otherwise (stretches, recipes, vlogs…).
  // Plain YouTube playlists aren't offered at all.
  const isMusic = (p: SpotifyPlaylist) => p.id === m.approved?.id || (kinds[p.id]?.music === true && youtube.musicByName(p.name))
  return c.json({ provider: 'youtube', account: data?.account_label ?? null, approved: m.approved, playlists: playlists.filter(isMusic) })
})

// Search all of YouTube for songs or playlists (not only the café account's). A search costs 100
// of YouTube's 10,000 daily units, so the same search is answered from Cloudflare's cache for a day.
integrations.get('/api/music/search', async c => {
  if (!await isTeam(c)) return c.json({ error: 'Music is for the team' }, 403)
  const q = (c.req.query('q') ?? '').trim().slice(0, 100)
  const kind = c.req.query('kind') === 'playlists' ? 'playlists' : 'songs'
  if (q.length < 2) return c.json({ tracks: [], playlists: [] })
  const db = businessDb(c.env, c.get('businessId'))
  if (await connectedOf(db, ['youtube_music']) !== 'youtube_music') return c.json({ error: 'Connect YouTube Music first' }, 400)
  const cache = (caches as unknown as { default: Cache }).default
  const key = new Request(`https://music-search.internal/${kind}?q=${encodeURIComponent(q.toLowerCase())}`)
  const hit = await cache.match(key)
  if (hit) return c.json(await hit.json())
  const { token } = await connectorGrant(c.env, db, 'youtube_music', new URL(c.req.url).origin)
  const found = await youtube.search(token, q, kind)
  // Playlists found are music ones only (YouTube Music's), not workouts or vlogs.
  const result = kind === 'playlists' ? { ...found, playlists: await youtube.onlyMusic(token, found.playlists) } : found
  c.executionCtx.waitUntil(cache.put(key, new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=86400' } })))
  return c.json(result)
})

// The songs in one of the café account's playlists (YouTube Music), for the queue.
integrations.get('/api/music/tracks/:playlist', async c => {
  if (!await isTeam(c)) return c.json({ error: 'Music is for the team' }, 403)
  const db = businessDb(c.env, c.get('businessId'))
  if (await connectedOf(db, ['youtube_music']) !== 'youtube_music') return c.json({ error: 'Connect YouTube Music first' }, 400)
  const { token } = await connectorGrant(c.env, db, 'youtube_music', new URL(c.req.url).origin)
  // The café account's playlists, or any public one found by searching.
  const id = c.req.param('playlist')
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(id)) return c.json({ error: 'Not a YouTube playlist' }, 400)
  return c.json({ tracks: await youtube.playlistTracks(token, id) })
})

const YOUTUBE_PLAYS_ON_DEVICE = 'YouTube Music plays on the café device: open the playlist there.'

// Spotify can be played and paused from the app; YouTube Music has no remote control, so staff
// open the approved playlist on the café device.
integrations.get('/api/music/now', async c => {
  const db = businessDb(c.env, c.get('businessId'))
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
  if (await connectedOf(businessDb(c.env, c.get('businessId')), ['youtube_music'])) return c.json({ error: YOUTUBE_PLAYS_ON_DEVICE }, 400)
  const s = await spotifySession(c.env, businessDb(c.env, c.get('businessId')), new URL(c.req.url).origin)
  if (!s.playlist) return c.json({ error: 'No playlist approved yet. An admin picks one on the Connections page.' }, 400)
  await spotify.playPlaylist(s.token, s.playlist.id)
  return c.json({ ok: true })
})

integrations.post('/api/music/pause', async c => {
  if (await connectedOf(businessDb(c.env, c.get('businessId')), ['youtube_music'])) return c.json({ error: YOUTUBE_PLAYS_ON_DEVICE }, 400)
  const s = await spotifySession(c.env, businessDb(c.env, c.get('businessId')), new URL(c.req.url).origin)
  await spotify.pause(s.token)
  return c.json({ ok: true })
})

// WhatsApp: send a test message to a number (checks token, number id and template).
integrations.post('/api/integrations/whatsapp/test', async c => {
  const db = businessDb(c.env, c.get('businessId'))
  const cfg = waConfig(c.env, db)
  if (!cfg) return c.json({ error: 'WhatsApp is not set up yet. Add META_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.' }, 400)
  const { to } = await c.req.json<{ to: string }>()
  try {
    // Connected = WhatsApp accepted a message from the café's number (and the number answers).
    // Meta's ready-made "hello_world" template exists only in English, whatever language the alerts use.
    const id = await whatsapp.sendTemplate({ ...cfg, language: 'en_US' }, (to ?? '').replace(/\D/g, ''), 'hello_world', [])
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
  const { back } = await c.req.json<{ back?: 'setup' | 'connections' | 'messages' }>().catch(() => ({ back: undefined }))
  return c.json({ url: instagram.authUrl(cfg, await signState(c.env.INTEGRATION_KEY!, { uid: c.get('userId'), kind: 'instagram', back })) })
})

integrations.get('/api/integrations/instagram/callback', async c => {
  const origin = new URL(c.req.url).origin
  let state: { uid: string; kind?: string; back?: string }
  try { state = await verifyState(c.env.INTEGRATION_KEY ?? '', c.req.query('state') ?? '') } catch { state = { uid: '' } }
  // Back to where Connect was pressed: Connections, set-up or Messages.
  const page = state.back === 'setup' || state.back === 'messages' ? state.back : 'connections'
  const back = (q: string) => c.redirect(`${origin}/${page}?${q}`)
  if (state.kind !== 'instagram') return back(`connect_error=${encodeURIComponent('That connection link expired. Try again.')}`)
  if (c.req.query('error')) {
    return back(`connect_error=${encodeURIComponent(c.req.query('error') === 'access_denied' ? 'Instagram connection was cancelled' : (c.req.query('error_description') ?? c.req.query('error')!))}`)
  }
  const db = await callbackDb(c.env, state.uid).catch(() => null)
  if (!db) return back(`connect_error=${encodeURIComponent('That connection link expired. Try again.')}`)
  try {
    const cfg = instagramOAuth(c.env, origin)
    if (!cfg) throw new Error('Instagram is not set up')
    const t = await instagram.exchangeCode(cfg, c.req.query('code') ?? '')
    // Proof first: the profile and posts can be read and posting was allowed. Only then is it kept.
    const proven = await proveInstagram(t, c.env)
    const { error } = await db.from('integration_secrets').upsert({ provider: 'instagram', updated_at: new Date().toISOString(),
      ciphertext: await seal(c.env.INTEGRATION_KEY!, { access_token: t.access_token, expires_at: t.expires_at, user_id: String(proven.external.user_id) }) })
    if (error) throw new Error(error.message)
    const now = new Date().toISOString()
    await setIntegration(db, 'instagram', { status: 'connected', connected_by: state.uid, connected_at: now, last_checked_at: now, last_sync_at: now,
      last_error: null, account_label: proven.label, external: proven.external })
    await showInstagramHandle(db, String(proven.external.username)).catch(() => {})
    return back('connected=instagram')
  } catch (e) {
    const why = explain('instagram', e)
    await setIntegration(db, 'instagram', { last_error: why }).catch(() => {})
    return back(`connect_error=${encodeURIComponent(why)}`)
  }
})

const LINKEDIN_PAGES_REFUSED = 'LinkedIn hasn’t approved this app for company Pages yet. Until it does, the app can post to personal profiles only (LINKEDIN_PAGES=off; see docs/INTEGRATIONS.md).'

/**
 * The finish of a one-click connection (Facebook, TikTok, LinkedIn, Square, Stripe, SumUp): check the signed state, handle
 * "cancelled", run the proof and keep the access only if it passes; then back to where they started.
 */
async function appCallback(c: Ctx, provider: Provider,
  finish: (state: { uid: string }, origin: string, db: SupabaseClient) => Promise<void>) {
  const origin = new URL(c.req.url).origin
  let state: { uid: string; kind?: string; back?: string; from?: string } | null = null
  try { state = await verifyState(c.env.INTEGRATION_KEY ?? '', c.req.query('state') ?? '') } catch { /* expired or forged */ }
  // Back to the address they connected from (Square always comes back to the main domain).
  const home = state?.from && appOrigins(origin).includes(state.from) ? state.from : origin
  const back = (q: string) => c.redirect(`${home}/${state?.back === 'setup' || state?.back === 'messages' ? state.back : 'connections'}?${q}`)
  if (!state || state.kind !== provider) return back(`connect_error=${encodeURIComponent('That connection link expired. Try again.')}`)
  if (c.req.query('error')) {
    const cancelled = /access_denied|user_denied|user_cancelled|cancel/i.test(`${c.req.query('error')} ${c.req.query('error_reason') ?? ''}`)
    // LinkedIn refuses Page permissions an app hasn't been approved for (the Community Management API).
    const said = provider === 'linkedin' && /unauthorized_scope/i.test(c.req.query('error')!) ? LINKEDIN_PAGES_REFUSED : (c.req.query('error_description') ?? c.req.query('error')!)
    return back(`connect_error=${encodeURIComponent(cancelled ? `${optionName(provider)} connection was cancelled` : said)}`)
  }
  const db = await callbackDb(c.env, state.uid).catch(() => null)
  if (!db) return back(`connect_error=${encodeURIComponent('That connection link expired. Try again.')}`)
  try {
    await finish(state, origin, db)
    return back(`connected=${provider}`)
  } catch (e) {
    const why = explain(provider, e)
    await setIntegration(db, provider, { last_error: why }).catch(() => {})
    return back(`connect_error=${encodeURIComponent(why)}`)
  }
}

const startState = async (c: Ctx, kind: Provider) => {
  const { back } = await c.req.json<{ back?: 'setup' | 'connections' | 'messages' }>().catch(() => ({ back: undefined }))
  return signState(c.env.INTEGRATION_KEY!, { uid: c.get('userId'), kind, back, from: new URL(c.req.url).origin })
}

/** The app's own addresses, the only ones a connection sends people back to. */
const appOrigins = (here: string) => [here, `https://${LEGAL.domain}`, `https://www.${LEGAL.domain}`, new URL(businessConfig.appUrl).origin]

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
  // Messenger (pages_messaging) is optional: posting works without it, the Messages page says to connect again.
  await setIntegration(db, 'facebook', { status: proven.chosen ? 'connected' : 'pending', connected_by: state.uid, connected_at: now,
    last_checked_at: proven.chosen ? now : null, last_error: null, account_label: proven.label,
    external: { ...proven.external, messenger: granted.includes('pages_messaging') } })
}))

// Which Page to post to (when the owner manages more than one): connected once that Page answers.
integrations.post('/api/integrations/facebook/page', async c => {
  const { page_id } = await c.req.json<{ page_id?: string }>()
  const db = businessDb(c.env, c.get('businessId'))
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

// Meta Ads: sign in with Facebook, allow reading (and changing) ads, pick the ad account (automatic
// when there's only one; the Ads page's /api/ads/meta_ads/account otherwise).
integrations.post('/api/integrations/meta_ads/start', async c => {
  const cfg = metaAdsOAuth(c.env, new URL(c.req.url).origin)
  if (!cfg) return c.json({ error: 'Meta Ads needs the Meta app keys first (META_APP_ID and META_APP_SECRET; see docs/INTEGRATIONS.md).' }, 400)
  return c.json({ url: metaAds.authUrl(cfg, await startState(c, 'meta_ads')) })
})

integrations.get('/api/integrations/meta_ads/callback', c => appCallback(c, 'meta_ads', async (state, origin, db) => {
  const cfg = metaAdsOAuth(c.env, origin)
  if (!cfg) throw new Error('Meta Ads is not set up')
  const t = await metaAds.exchangeCode(cfg, c.req.query('code') ?? '')
  const proven = await proveMetaAds(c.env, t)
  await keep(c.env, db, 'meta_ads', { access_token: t.access_token, expires_at: t.expires_at })
  const now = new Date().toISOString()
  await setIntegration(db, 'meta_ads', { status: proven.pending ? 'pending' : 'connected', connected_by: state.uid, connected_at: now,
    last_checked_at: proven.pending ? null : now, last_error: null, account_label: proven.label, external: proven.external })
}))

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

// LinkedIn: sign in, allow posting, pick the Page (or their own profile); with no Page, their profile straight away.
integrations.post('/api/integrations/linkedin/start', async c => {
  const cfg = linkedinOAuth(c.env, new URL(c.req.url).origin)
  if (!cfg) return c.json({ error: 'LinkedIn needs the LinkedIn app keys first (LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET; see docs/INTEGRATIONS.md).' }, 400)
  return c.json({ url: linkedin.authUrl(cfg, await startState(c, 'linkedin')) })
})

integrations.get('/api/integrations/linkedin/callback', c => appCallback(c, 'linkedin', async (state, origin, db) => {
  const cfg = linkedinOAuth(c.env, origin)
  if (!cfg) throw new Error('LinkedIn is not set up')
  const t = await linkedin.exchangeCode(cfg, c.req.query('code') ?? '')
  const proven = await proveLinkedIn(cfg, t)
  await keep(c.env, db, 'linkedin', { access_token: t.access_token, expires_at: proven.external.expires_at, ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}) })
  const now = new Date().toISOString()
  await setIntegration(db, 'linkedin', { status: proven.pending ? 'pending' : 'connected', connected_by: state.uid, connected_at: now,
    last_checked_at: proven.pending ? null : now, last_error: null, account_label: proven.label, external: proven.external })
}))

// Where LinkedIn posts go: one of their Pages, or 'me' (their own profile). Connected once that answers.
integrations.post('/api/integrations/linkedin/page', async c => {
  const { page_id } = await c.req.json<{ page_id?: string }>().catch(() => ({ page_id: undefined }))
  const db = businessDb(c.env, c.get('businessId'))
  const { data } = await db.from('integrations').select('status, external').eq('provider', 'linkedin').single()
  const ext = (data?.external ?? {}) as LinkedInExternal
  if (!ext.member || data?.status === 'disconnected') return c.json({ error: 'Connect LinkedIn first' }, 400)
  if (page_id !== 'me' && !ext.pages?.some(p => p.id === page_id)) return c.json({ error: 'That Page isn’t one this account manages' }, 400)
  try {
    const s = await linkedinSession(c.env, db)
    const name = page_id === 'me' ? (await linkedin.member(s.cfg.version, s.token)).name : (await linkedin.page(s.cfg.version, s.token, page_id!)).name
    const now = new Date().toISOString()
    await setIntegration(db, 'linkedin', { status: 'connected', last_checked_at: now, last_error: null, account_label: name,
      external: { ...ext, page_id, page_name: name } })
    return c.json({ ok: true })
  } catch (e) {
    const why = explain('linkedin', e)
    await setIntegration(db, 'linkedin', { last_error: why })
    return c.json({ error: why }, 400)
  }
})

// Search Console: which website to read, when the account has several and none is the business's.
integrations.post('/api/integrations/search_console/site', async c => {
  const { site } = await c.req.json<{ site?: string }>().catch(() => ({ site: undefined }))
  const db = businessDb(c.env, c.get('businessId'))
  const { data } = await db.from('integrations').select('status, external').eq('provider', 'search_console').single()
  const ext = (data?.external ?? {}) as { sites?: string[] }
  if (data?.status === 'disconnected') return c.json({ error: 'Connect Search Console first' }, 400)
  if (!site || !ext.sites?.includes(site)) return c.json({ error: 'That website isn’t in this Google account’s Search Console' }, 400)
  try {
    const { token } = await connectorGrant(c.env, db, 'search_console', new URL(c.req.url).origin)
    await searchConsole.probe(token, site)
    const now = new Date().toISOString()
    await setIntegration(db, 'search_console', { status: 'connected', last_checked_at: now, last_error: null, account_label: searchConsole.siteLabel(site),
      external: { ...ext, site } })
    return c.json({ ok: true })
  } catch (e) {
    const why = explain('search_console', e)
    await setIntegration(db, 'search_console', { last_error: why })
    return c.json({ error: why }, 400)
  }
})

// How the website did in Google Search (admins): ?from=YYYY-MM-DD&to=YYYY-MM-DD, inclusive. Google is 2–3 days behind,
// so each answer is kept 6 hours.
integrations.get('/api/integrations/search_console/report', async c => {
  const from = c.req.query('from') ?? '', to = c.req.query('to') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return c.json({ error: 'Give from and to dates (YYYY-MM-DD)' }, 400)
  const db = businessDb(c.env, c.get('businessId'))
  const { data } = await db.from('integrations').select('status, external').eq('provider', 'search_console').single()
  const site = (data?.external as { site?: string } | null)?.site
  if (data?.status !== 'connected' && data?.status !== 'error') return c.json({ error: 'Connect Search Console on the Connections page to see how the website does on Google' }, 400)
  if (!site) return c.json({ error: 'Choose which website to read on the Connections page' }, 400)
  try {
    const { data: report, fetched_at } = await cached(db, `search:${site}:${from}:${to}`, MINUTES.search, async () => {
      const { token } = await connectorGrant(c.env, db, 'search_console', new URL(c.req.url).origin)
      const read = await searchConsole.report(token, site, from, to)
      await setIntegration(db, 'search_console', { last_sync_at: new Date().toISOString() })
      return read
    })
    return c.json({ ...report, fetched_at })
  } catch (e) {
    const why = explain('search_console', e)
    if (lasting('search_console', e)) await markBroken(db, 'search_console', why)
    return c.json({ error: why }, 400)
  }
})

// Square: sign in to the business's Square account (read-only).
integrations.post('/api/integrations/square/start', async c => {
  const cfg = squareOAuth(c.env)
  if (!cfg) return c.json({ error: 'Square needs the Square app keys first (SQUARE_APP_ID and SQUARE_APP_SECRET; see docs/INTEGRATIONS.md).' }, 400)
  return c.json({ url: square.authUrl(cfg, await startState(c, 'square')) })
})

integrations.get('/api/integrations/square/callback', c => appCallback(c, 'square', async (state, _origin, db) => {
  const cfg = squareOAuth(c.env)
  if (!cfg) throw new Error('Square is not set up')
  const t = await square.exchangeCode(cfg, c.req.query('code') ?? '')
  if (!t.refresh_token) throw new Error('Square did not allow lasting access. Connect again.')
  const proven = await proveSquare(cfg.sandbox, t.access_token!)
  await keep(c.env, db, 'square', { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at ?? new Date(Date.now() + 30 * 86_400_000).toISOString() })
  const now = new Date().toISOString()
  await setIntegration(db, 'square', { status: 'connected', connected_by: state.uid, connected_at: now, last_checked_at: now, last_error: null,
    account_label: proven.label, external: proven.external })
  // The till's customers come into Customers straight away (then every hour, by the cron).
  c.executionCtx.waitUntil(syncSquareCustomers(c.env, db, true).catch(e => console.error('square customers failed', e)))
}))

// Stripe: sign in to the business's Stripe account (read-only).
integrations.post('/api/integrations/stripe/start', async c => {
  const cfg = stripeOAuth(c.env, new URL(c.req.url).origin)
  if (!cfg) return c.json({ error: 'Stripe needs the Stripe platform keys first (STRIPE_CLIENT_ID and STRIPE_SECRET_KEY; see docs/INTEGRATIONS.md).' }, 400)
  return c.json({ url: stripe.authUrl(cfg, await startState(c, 'stripe')) })
})

integrations.get('/api/integrations/stripe/callback', c => appCallback(c, 'stripe', async (state, origin, db) => {
  const cfg = stripeOAuth(c.env, origin)
  if (!cfg) throw new Error('Stripe is not set up')
  const { accountId } = await stripe.exchangeCode(cfg, c.req.query('code') ?? '')
  const proven = await proveStripe(cfg.secretKey, accountId)
  const now = new Date().toISOString()
  await setIntegration(db, 'stripe', { status: 'connected', connected_by: state.uid, connected_at: now, last_checked_at: now, last_error: null,
    account_label: proven.label, external: proven.external })
}))

// SumUp: sign in to the business's SumUp account (read-only).
integrations.post('/api/integrations/sumup/start', async c => {
  const cfg = sumupOAuth(c.env, new URL(c.req.url).origin)
  if (!cfg) return c.json({ error: 'SumUp needs the SumUp app keys first (SUMUP_CLIENT_ID and SUMUP_CLIENT_SECRET; see docs/INTEGRATIONS.md).' }, 400)
  return c.json({ url: sumup.authUrl(cfg, await startState(c, 'sumup')) })
})

integrations.get('/api/integrations/sumup/callback', c => appCallback(c, 'sumup', async (state, origin, db) => {
  const cfg = sumupOAuth(c.env, origin)
  if (!cfg) throw new Error('SumUp is not set up')
  const t = await sumup.exchangeCode(cfg, c.req.query('code') ?? '')
  if (!t.refresh_token) throw new Error('SumUp did not allow lasting access. Connect again.')
  const proven = await proveSumUp(t.access_token!)
  await keep(c.env, db, 'sumup', { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString() })
  const now = new Date().toISOString()
  await setIntegration(db, 'sumup', { status: 'connected', connected_by: state.uid, connected_at: now, last_checked_at: now, last_error: null,
    account_label: proven.label, external: proven.external })
}))

/**
 * Who may read takings, and for which days: the plan has takings, the person can see pay, from and
 * to are dates (inclusive) and a payment system is connected. Either an error response, or the range
 * as instants (local midnight to the midnight after `to`) and the connected payment systems: the
 * till (Square or SumUp, one at a time) first, then Stripe (online payments, on top of either).
 */
async function takingsRequest(c: Ctx) {
  if (!(await planFeatures(c.env, c.get('businessId'))).has('takings')) return { error: c.json({ error: 'Takings need the Pro plan or higher. Upgrade on the Billing page.' }, 402) }
  const db = businessDb(c.env, c.get('businessId'))
  const { data: me } = await db.from('profiles').select('can_see_pay').eq('id', c.get('userId')).single()
  if (!me?.can_see_pay) return { error: c.json({ error: 'Takings are for admins with pay access' }, 403) }
  const from = c.req.query('from') ?? '', to = c.req.query('to') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return { error: c.json({ error: 'Give from and to dates (YYYY-MM-DD)' }, 400) }
  const { data: rows } = await db.from('integrations').select('provider, status').in('provider', PAYMENT_SYSTEMS)
  const ps = PAYMENT_SYSTEMS.filter(p => rows?.some(r => r.provider === p && r.status === 'connected'))
  if (!ps.length) return { error: c.json({ error: 'Connect Square, SumUp or Stripe on the Connections page to see takings' }, 400) }
  const end = new Date(Date.parse(`${to}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  return { db, ps, fromIso: zonedIso(from, '00:00'), toIso: zonedIso(end, '00:00') }
}
const PAYMENT_SYSTEMS: SalesProvider[] = ['square', 'sumup', 'stripe']

/** One payment system's takings per day. */
async function salesOf(env: Env, db: SupabaseClient, p: SalesProvider, fromIso: string, toIso: string) {
  if (p === 'stripe') {
    const s = await stripeSession(env, db)
    return stripe.salesByDay(s.secretKey, s.accountId, fromIso, toIso)
  }
  if (p === 'sumup') return sumup.salesByDay(await sumupSession(env, db), fromIso, toIso)
  const s = await squareSession(env, db)
  return square.salesByDay(s.sandbox, s.token, s.locationIds, fromIso, toIso)
}

// Takings per day from the payment systems (the till, Square or SumUp, plus Stripe when that's
// connected too; admins with pay access): ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive). Added up day
// by day; one that can't be read just now leaves the others' takings showing. Each system's answer
// is kept 15 minutes, or a day once the period is over (shared/refresh.ts).
integrations.get('/api/integrations/payments/sales', async c => {
  const r = await takingsRequest(c)
  if ('error' in r) return r.error
  const { db, ps, fromIso, toIso } = r
  const read = await Promise.all(ps.map(p => cached(db, `sales:${p}:${fromIso}:${toIso}`, takingsMinutes(toIso), () => salesOf(c.env, db, p, fromIso, toIso))
    .then(({ data: sales, fetched_at }) => ({ provider: p, sales, fetched_at }), async (e: unknown) => {
      const why = explain(p, e)
      if (lasting(p, e)) await markBroken(db, p, why)
      return { provider: p, error: why }
    })))
  const ok = read.filter((x): x is { provider: SalesProvider; sales: Awaited<ReturnType<typeof salesOf>>; fetched_at: string } => 'sales' in x)
  const failed = read.filter((x): x is { provider: SalesProvider; error: string } => 'error' in x)
  if (!ok.length) return c.json({ error: failed[0].error }, 400)
  return c.json({ provider: ok[0].provider, providers: ok.map(x => x.provider), ...mergeSales(ok), ...(failed.length ? { failed } : {}),
    fetched_at: oldest(ok.map(x => x.fetched_at)) })
})

// Best sellers from Square's orders, same rules and dates as the takings. Stripe and SumUp have no
// items (SumUp's history only has a one-line summary per sale), so with Square and Stripe both
// connected the items are Square's (`partial`); a Square connection made before items were asked
// for (ORDERS_READ) says so, and keeps working.
integrations.get('/api/integrations/payments/items', async c => {
  const r = await takingsRequest(c)
  if ('error' in r) return r.error
  const { db, ps, fromIso, toIso } = r
  if (!ps.includes('square')) return c.json({ items: null, reason: ps[0] })
  const partial = ps.includes('stripe') ? { partial: 'stripe' } : {}
  try {
    const { data: items, fetched_at } = await cached(db, `items:${fromIso}:${toIso}`, takingsMinutes(toIso), async () => {
      const s = await squareSession(c.env, db)
      return square.topItems(s.sandbox, s.token, s.locationIds, fromIso, toIso)
    })
    return c.json({ items, ...partial, fetched_at })
  } catch (e) {
    if (e instanceof square.SquareError && e.code === 'INSUFFICIENT_SCOPES') return c.json({ items: null, reason: 'reconnect' })
    const why = explain('square', e)
    if (lasting('square', e)) await markBroken(db, 'square', why)
    return c.json({ error: why }, 400)
  }
})

// Instagram: profile and recent posts for the Connections page.
integrations.get('/api/integrations/instagram/profile', async c => {
  const db = businessDb(c.env, c.get('businessId'))
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

// Messages page: the Instagram inbox (admins). Read live from Instagram each time; nothing is stored.
async function instagramInbox(c: Ctx) {
  const db = businessDb(c.env, c.get('businessId'))
  const { data: row } = await db.from('integrations').select('status, external').eq('provider', 'instagram').single()
  if (row?.status !== 'connected') throw new Error('Instagram is not connected')
  const ext = (row.external ?? {}) as { user_id?: string; username?: string }
  return { db, cfg: await instagramSession(c.env, db), me: { id: ext.user_id ?? '', username: ext.username } }
}

/** Instagram's errors, in words for the Messages page (a missing permission means connecting again). */
function inboxError(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e)
  if (/permission|capability|\(#3\)|\(#10\)|\(#200\)/i.test(raw)) {
    return 'Instagram hasn’t allowed this app to read messages. Connect Instagram again and leave “Manage messages” ticked; in the Instagram app, also turn on Settings → Messages and story replies → Message controls → Allow access to messages.'
  }
  if (/24 hour|outside of allowed window|window/i.test(raw)) return 'Instagram only allows replies within 24 hours of their last message (7 days as a personal reply). Reply in the Instagram app instead.'
  return explain('instagram', e)
}

/** Instagram refused a reply sent after 24 hours (the human agent tag): what to do about it. */
const HUMAN_AGENT_REFUSED = 'Instagram didn’t accept a reply after 24 hours. Add the Human Agent feature to the Meta app (App Dashboard → Use cases → Instagram → Permissions and features → Human Agent), or reply in the Instagram app.'

integrations.get('/api/integrations/instagram/inbox', async c => {
  try {
    const { cfg, me } = await instagramInbox(c)
    const [chats, tags] = await Promise.all([instagram.conversations(cfg, me), instagram.tagged(cfg).then(t => ({ t }), (e: unknown) => ({ e }))])
    return c.json({ conversations: chats, tagged: 't' in tags ? tags.t : null,
      ...('e' in tags ? { taggedNote: 'Instagram didn’t share the posts you’re tagged in. Connect Instagram again and leave “Manage comments” ticked.' } : {}) })
  } catch (e) {
    return c.json({ error: inboxError(e) }, 400)
  }
})

// Mentions (tagged posts, story mentions): look now, repost one to the business's story, or ignore it.
integrations.post('/api/integrations/instagram/mentions/check', async c => {
  try {
    return c.json({ added: await checkMentions(c.env, businessDb(c.env, c.get('businessId'))) })
  } catch (e) {
    return c.json({ error: inboxError(e) }, 400)
  }
})

integrations.post('/api/integrations/instagram/mentions/:id/repost', async c => {
  try {
    const url = await repostMention(c.env, businessDb(c.env, c.get('businessId')), new URL(c.req.url).origin, c.req.param('id'), c.get('userId'))
    return c.json({ ok: true, url })
  } catch (e) {
    return c.json({ error: e instanceof MediaError ? e.message : explain('instagram', e) }, 400)
  }
})

integrations.post('/api/integrations/instagram/mentions/:id/ignore', async c => {
  await decide(businessDb(c.env, c.get('businessId')), c.req.param('id'), 'ignored', c.get('userId'))
  return c.json({ ok: true })
})

integrations.get('/api/integrations/instagram/inbox/:id', async c => {
  try {
    const { cfg, me } = await instagramInbox(c)
    return c.json(await instagram.conversation(cfg, me, c.req.param('id')))
  } catch (e) {
    return c.json({ error: inboxError(e) }, 400)
  }
})

integrations.post('/api/integrations/instagram/inbox/:id/reply', async c => {
  const { text } = await c.req.json<{ text?: string }>().catch(() => ({ text: undefined }))
  const said = (text ?? '').trim()
  if (!said) return c.json({ error: 'Write a message first' }, 400)
  if (new TextEncoder().encode(said).length > 1000) return c.json({ error: 'Instagram messages can be up to 1000 characters' }, 400)
  try {
    const { cfg, me } = await instagramInbox(c)
    // Reply to the person in this chat (never to an id the browser chose).
    const { conversation, messages } = await instagram.conversation(cfg, me, c.req.param('id'))
    if (!conversation.with.id) throw new Error('Couldn’t find who this chat is with')
    // Within 24 hours of their last message: a normal reply. Up to 7 days: a personal reply with the
    // human agent tag. After that Instagram allows nothing from other apps.
    const can = replyWindow(messages)
    if (can.mode === 'closed') {
      return c.json({ error: 'Instagram allows replies up to 7 days after their last message. Reply in the Instagram app instead.' }, 400)
    }
    if (can.mode === 'human_agent') {
      try {
        return c.json({ ok: true, id: await instagram.sendText(cfg, conversation.with.id, said, 'HUMAN_AGENT'), human_agent: true })
      } catch (e) {
        if (/permission|capabilit|human.?agent|tag|window|\(#3\)|\(#10\)|\(#200\)|\(#100\)/i.test(String(e))) return c.json({ error: HUMAN_AGENT_REFUSED }, 400)
        throw e
      }
    }
    return c.json({ ok: true, id: await instagram.sendText(cfg, conversation.with.id, said) })
  } catch (e) {
    return c.json({ error: inboxError(e) }, 400)
  }
})

// Messages page: the Facebook Page's Messenger chats (admins), with the Page token of the Facebook
// connection. Read live each time; nothing is stored. Connected Facebook with no chats yet is an empty inbox.
const MESSENGER_RECONNECT = 'Facebook hasn’t allowed this app to read Messenger yet. Connect Facebook again and leave “Manage and access Page conversations in Messenger” ticked.'

async function messengerInbox(c: Ctx) {
  const db = businessDb(c.env, c.get('businessId'))
  const { data: row } = await db.from('integrations').select('status, external').eq('provider', 'facebook').single()
  if (row?.status !== 'connected') throw new Error('Facebook is not connected')
  // Connected without Messenger allowed: no need to ask Facebook to know the answer.
  if ((row.external as { messenger?: boolean } | null)?.messenger === false) throw new facebook.FacebookError(MESSENGER_RECONNECT, 200)
  return facebookSession(c.env, db)
}

/** Facebook's errors, in words for the Messages page. A missing permission means connecting again, never a broken connection. */
function messengerError(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e)
  if ((e instanceof facebook.FacebookError && [3, 10, 200, 230].includes(e.code ?? 0)) || /pages_messaging|permission|\(#10\)|\(#200\)|\(#230\)/i.test(raw)) return MESSENGER_RECONNECT
  if (/24 hour|outside of allowed window|window/i.test(raw)) return 'Messenger only allows replies within 24 hours of their last message (7 days as a personal reply). Reply in Meta Business Suite instead.'
  return explain('facebook', e)
}

integrations.get('/api/integrations/facebook/inbox', async c => {
  try {
    return c.json({ conversations: await facebook.conversations(await messengerInbox(c)) })
  } catch (e) {
    return c.json({ error: messengerError(e) }, 400)
  }
})

integrations.get('/api/integrations/facebook/inbox/:id', async c => {
  try {
    return c.json(await facebook.conversation(await messengerInbox(c), c.req.param('id')))
  } catch (e) {
    return c.json({ error: messengerError(e) }, 400)
  }
})

integrations.post('/api/integrations/facebook/inbox/:id/reply', async c => {
  const { text } = await c.req.json<{ text?: string }>().catch(() => ({ text: undefined }))
  const said = (text ?? '').trim()
  if (!said) return c.json({ error: 'Write a message first' }, 400)
  if (new TextEncoder().encode(said).length > 2000) return c.json({ error: 'Messenger messages can be up to 2000 characters' }, 400)
  try {
    const s = await messengerInbox(c)
    // Reply to the person in this chat (never to an id the browser chose), within Messenger's window.
    const { conversation, messages } = await facebook.conversation(s, c.req.param('id'))
    if (!conversation.with.id) throw new Error('Couldn’t find who this chat is with')
    const can = replyWindow(messages)
    if (can.mode === 'closed') return c.json({ error: 'Messenger allows replies up to 7 days after their last message. Reply in Meta Business Suite instead.' }, 400)
    if (can.mode === 'human_agent') {
      try {
        return c.json({ ok: true, id: await facebook.sendText(s, conversation.with.id, said, 'HUMAN_AGENT'), human_agent: true })
      } catch (e) {
        if (/permission|capabilit|human.?agent|tag|window|\(#3\)|\(#10\)|\(#200\)|\(#100\)/i.test(String(e))) {
          return c.json({ error: 'Messenger didn’t accept a reply after 24 hours. Add the Human Agent feature to the Meta app (App Dashboard → Messenger → Permissions and features → Human Agent), or reply in Meta Business Suite.' }, 400)
        }
        throw e
      }
    }
    return c.json({ ok: true, id: await facebook.sendText(s, conversation.with.id, said) })
  } catch (e) {
    return c.json({ error: messengerError(e) }, 400)
  }
})

// Messages page: the café's WhatsApp chats (admins). WhatsApp can't be read back from Meta, so these
// are the messages the webhook and the app saved (worker/whatsappInbox.ts), for as long as Data retention says.
/** WhatsApp's errors, in words for the Messages page. */
function whatsappError(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e)
  if (/131047|re-?engagement|24 hours|outside.*window/i.test(raw)) return 'WhatsApp only allows replies within 24 hours of their last message. After that, the café can only send approved templates.'
  return explain('whatsapp', e)
}

integrations.get('/api/integrations/whatsapp/inbox', async c => {
  try {
    return c.json({ conversations: await waInbox.conversations(businessDb(c.env, c.get('businessId'))) })
  } catch (e) {
    return c.json({ error: whatsappError(e) }, 400)
  }
})

integrations.get('/api/integrations/whatsapp/inbox/:id', async c => {
  const waId = c.req.param('id')
  if (!/^[0-9]{6,20}$/.test(waId)) return c.json({ error: 'No such chat' }, 404)
  try {
    return c.json(await waInbox.thread(businessDb(c.env, c.get('businessId')), waId))
  } catch (e) {
    return c.json({ error: whatsappError(e) }, 400)
  }
})

integrations.post('/api/integrations/whatsapp/inbox/:id/reply', async c => {
  const waId = c.req.param('id')
  if (!/^[0-9]{6,20}$/.test(waId)) return c.json({ error: 'No such chat' }, 404)
  const { text } = await c.req.json<{ text?: string }>().catch(() => ({ text: undefined }))
  const said = (text ?? '').trim()
  if (!said) return c.json({ error: 'Write a message first' }, 400)
  if (said.length > 4096) return c.json({ error: 'WhatsApp messages can be up to 4096 characters' }, 400)
  const db = businessDb(c.env, c.get('businessId'))
  const cfg = waConfig(c.env, db)
  if (!cfg) return c.json({ error: 'WhatsApp is not set up yet. Add META_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.' }, 400)
  try {
    // Only to someone who wrote in the last 24 hours (WhatsApp refuses anything else but templates).
    const { messages } = await waInbox.thread(db, waId)
    if (replyWindow(messages, Date.now(), 'whatsapp').mode === 'closed') {
      return c.json({ error: 'WhatsApp only allows replies within 24 hours of their last message. After that, the café can only send approved templates.' }, 400)
    }
    const id = await whatsapp.sendText(cfg, waId, said)
    // It's sent: a failed save mustn't look like a failed send (and get sent twice).
    await waInbox.saveOutgoing(db, { id, to: waId, text: said }).catch(e => console.error('whatsapp chat save failed', e))
    return c.json({ ok: true, id })
  } catch (e) {
    return c.json({ error: whatsappError(e) }, 400)
  }
})

// Data retention (My account): how long WhatsApp chats are kept. Shortening it deletes what's now
// too old straight away, photos and voice notes included.
integrations.post('/api/integrations/whatsapp/retention', async c => {
  const { days } = await c.req.json<{ days?: number }>().catch(() => ({ days: undefined }))
  try {
    const asAdmin = userClient(c.env, bearer(c.req.header('authorization'))!, 'app')
    return c.json(await waInbox.setRetention(asAdmin, businessDb(c.env, c.get('businessId')), Number(days)))
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
})

// Photos and videos for posts: kept in the café's Drive or OneDrive (or R2), in the folder for the
// kind of post (?folder=Posts|Carousels|Reels|Stories), and handed out publicly at /media/… so the
// networks can fetch them (worker/media.ts).
integrations.post('/api/integrations/media', async c => {
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const declared = Number(c.req.header('content-length') ?? '') || null
  try {
    checkFile(type, declared, c.req.query('folder'))
    // A known size streams straight through to storage; otherwise it's read first (up to 100 MB).
    const Fixed = (globalThis as { FixedLengthStream?: new (n: number) => TransformStream }).FixedLengthStream
    const body = declared && c.req.raw.body && Fixed ? c.req.raw.body.pipeThrough(new Fixed(declared)) : await c.req.arrayBuffer()
    const size = body instanceof ArrayBuffer ? body.byteLength : declared!
    return c.json(await storeMedia(c.env, businessDb(c.env, c.get('businessId')), new URL(c.req.url).origin, { type, size, body, folder: c.req.query('folder') ?? 'Posts' }))
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, e instanceof MediaError ? 400 : 502)
  }
})

integrations.get('/media/:p{[go]}/:business{[0-9]+}/:id/:file', c => serveMedia(c.env, c.req.raw, c.req.param('p'),
  decodeURIComponent(c.req.param('id')), c.req.param('file'), Number(c.req.param('business'))))
integrations.get('/media/:p{[go]}/:id/:file', c => serveMedia(c.env, c.req.raw, c.req.param('p'), decodeURIComponent(c.req.param('id')), c.req.param('file')))

integrations.get('/media/*', async c => {
  const obj = await c.env.MEDIA?.get(c.req.path.slice('/media/'.length))
  if (!obj) return c.notFound()
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } })
})

// Square webhook: a customer added or changed in Square comes into Customers straight away.
// Signed with the subscription's signature key over the notification URL as registered in Square.
integrations.post('/api/webhooks/square', async c => {
  const raw = await c.req.text()
  const key = c.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  if (!key || !(await square.verifyWebhook(key, squareWebhookUrl(c.env), raw, c.req.header('x-square-hmacsha256-signature')))) {
    return c.text('Invalid signature', 401)
  }
  const event = JSON.parse(raw) as square.SquareCustomerEvent
  // Answer Square at once (it retries anything slow); the customer is saved just after.
  // Into the Customers of the business whose Square account it is.
  c.executionCtx.waitUntil((async () => {
    const { data: rows } = await serviceClient(c.env).from('integrations').select('business_id')
      .eq('provider', 'square').eq('status', 'connected').eq('external->>merchant_id', event.merchant_id ?? '')
    for (const r of rows ?? []) await squareCustomerEvent(businessDb(c.env, r.business_id as number), event)
  })().catch(e => console.error('square customer webhook failed', e)))
  return c.text('ok')
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
  // The WhatsApp number is the one in the Worker's secrets, so the business it was set up for.
  const db = businessDb(c.env, SECRETS_BUSINESS_ID)
  for (const s of events.statuses) {
    await db.from('outbox').update({ delivery: s.status, ...(s.error ? { last_error: s.error } : {}) }).eq('external_id', s.id)
  }
  // Messages page: keep every message (WhatsApp can't be read back later), then copy photos, voice
  // notes and files from Meta after answering, so Meta isn't kept waiting.
  const withMedia = await waInbox.saveInbound(db, events).catch(e => { console.error('whatsapp chat save failed', e); return [] })
  if (withMedia.length) c.executionCtx.waitUntil(Promise.all(withMedia.map(r => waInbox.saveMedia(c.env, db, r))))
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
