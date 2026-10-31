import { Hono } from 'hono'
import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
import { bearer, businessDb, businessIds, joinBusiness, serviceClient, userClient, type Env } from './supabase'
import { rest } from './rest'
import { drainOutbox, integrations, pushGoogleMenu, syncGoogle, syncGoogleBothWays } from './integrations'
import { checkAll } from './connections'
import { checkMentions } from './mentions'
import { syncSquareCustomers } from './squareCustomers'
import { purge as purgeWhatsApp } from './whatsappInbox'
import { refreshAllSports, refreshStaleSports, sportsEnabled, syncCrests } from './sports'
import { music } from './music'
import { calendarFeeds } from './calendarFeed'
import { fonts } from './fonts'
import { ads } from './ads'
import { authorizeGet, authorizePost, mcpApiHandler, tokenExchangeCallback, type GrantProps, type OAuthEnv } from './mcp'
import { apiKeys, isAccessKey, resolveKey } from './apiKeys'
import { authEmail } from './authEmail'
import { billing, chargePendingAiMusic, planBlocksInvite, syncBilling } from './billing'
import { fillStarterPack, socialMusic, syncMusicInsights } from './socialMusic'
import { businessConfig } from '../shared/business.config'
import { referrals } from './referrals'
import { tax } from './tax'
import { files } from './files'
import { legal } from './legal'
import { invoices } from './invoices'
import { email } from './email'
import { serveVideo } from './video'
import { loyaltyRoutes } from './loyalty'
import { assistant } from './assistant'
import { refreshReviews, reviews, reviewsConfigured } from './reviews'
import { clearOldCache } from './cache'
import { website } from './website'
import { checkWaitingImages, menu, syncSquareMenuIfChosen } from './menu'
import { screens } from './screens'
import { cameras, purgeCameraClips } from './cameras'
import { competitors, watchCompetitors } from './competitors'
import { push, pushNotifications } from './push'
import { repPage } from './repPage'
import { accessOf, teamRoleOf } from '../shared/teamRoles'

const NIGHTLY = '15 1 * * *' // 03:15 Madrid in summer, 02:15 in winter

const googleConnected = async (db: ReturnType<typeof businessDb>) => {
  const { data } = await db.from('integrations').select('status').eq('provider', 'google_business').maybeSingle()
  // Only while the plan includes it (a lapsed subscription pauses the sync).
  return data?.status === 'connected' && (await db.rpc('plan_allows', { p_feature: 'google_maps' })).data === true
}
const sportsOn = async (db: ReturnType<typeof businessDb>) =>
  await sportsEnabled(db) && (await db.rpc('plan_allows', { p_feature: 'sports' })).data === true

const app = new Hono<{ Bindings: OAuthEnv }>()

// A self-destructing service worker at the usual service-worker addresses. The app has none, but
// a browser that kept one from an earlier site on this domain serves that old site from its cache
// forever. The browser still re-checks the worker's own address, gets this, and the new worker
// wipes the caches, unregisters and reloads the page — the visitor recovers by themselves.
const KILL_SERVICE_WORKER = `self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil((async () => {
  await Promise.all((await caches.keys()).map(k => caches.delete(k)))
  await self.registration.unregister()
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url)
})()))
`
for (const path of ['/sw.js', '/service-worker.js', '/serviceworker.js', '/registerSW.js', '/worker.js']) {
  app.get(path, c => c.body(KILL_SERVICE_WORKER, 200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' }))
}

// Public config for the web app (publishable key only).
app.get('/api/config', c => c.json({
  businessId: c.env.BUSINESS_ID,
  supabaseUrl: c.env.SUPABASE_URL,
  supabaseKey: c.env.SUPABASE_PUBLISHABLE_KEY,
}))

// ?deep=1 also checks that Supabase answers and which sign-in methods it has switched on
// (the uptime monitor calls this, so a broken login is caught, not just a dead page).
app.get('/api/health', async c => {
  // Which commit is live, readable from anywhere (the deploy tracker polls it).
  c.header('access-control-allow-origin', '*')
  c.header('cache-control', 'no-store')
  const version = { commit: c.env.GIT_SHA ?? 'dev', deployed_at: c.env.DEPLOYED_AT ?? null }
  if (!c.req.query('deep')) return c.json({ ok: true, ...version })
  try {
    const res = await fetch(`${c.env.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: c.env.SUPABASE_PUBLISHABLE_KEY } })
    if (!res.ok) return c.json({ ok: false, supabase: `auth answered ${res.status}` }, 503)
    const s = await res.json() as { external?: Record<string, boolean> }
    const signIn = { email: !!s.external?.email, google: !!s.external?.google, microsoft: !!s.external?.azure,
      facebook: !!s.external?.facebook, apple: !!s.external?.apple }
    return c.json({ ok: true, supabase: 'up', sign_in: signIn })
  } catch (e) {
    return c.json({ ok: false, supabase: String(e) }, 503)
  }
})

// Admin invites a team member. Needs the service key, so it runs here, not in the browser.
app.post('/api/admin/invite', async c => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const sb = userClient(c.env, token, 'app')
  const [{ data: isAdmin, error }, { data: businessId }] = await Promise.all([sb.rpc('is_admin'), sb.rpc('current_business_id')])
  if (error || !isAdmin || !businessId) return c.json({ error: 'Only an admin can invite people' }, 403)

  const body = await c.req.json<{ email?: string; full_name?: string; role?: string; partner_company?: string; partner_access?: string[]; password?: string; phone?: string | null; contact_method?: string | null }>()
  const email = body.email?.trim().toLowerCase()
  // Team members come with their team role (owner, manager or employee; 'admin' is a shop manager,
  // 'boss' the owner's old name), kept as the access the database checks. Only an owner invites an owner.
  const member = teamRoleOf(body.role === 'admin' ? 'manager' : body.role)
  const role = member ? accessOf(member).role : body.role === 'kiosk' || body.role === 'partner' ? body.role : 'employee'
  const owner = member === 'owner'
  if (owner && !(await sb.rpc('can_see_pay')).data) {
    return c.json({ error: 'Only an owner can invite another owner' }, 403)
  }
  if (!email || !body.full_name?.trim()) return c.json({ error: 'Name and email are required' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return c.json({ error: 'Enter a full email address, like name@example.com' }, 400)
  // Partners: company and read-only areas (the database drops anything unknown too).
  const partner = role === 'partner' ? {
    partner_company: body.partner_company?.trim() || null,
    partner_access: (body.partner_access ?? []).filter(a => ['calendar', 'rota', 'payroll', 'finances'].includes(a)),
  } : {}
  if (role === 'partner' && !partner.partner_company) return c.json({ error: 'Add the partner’s company name' }, 400)
  // How they want to hear about shifts (they can change it later on My account).
  const contact = {
    ...(body.phone?.trim() ? { phone: body.phone.trim() } : {}),
    ...(body.contact_method && ['whatsapp', 'sms', 'email'].includes(body.contact_method) ? { contact_method: body.contact_method } : {}),
  }

  const blocked = await planBlocksInvite(c.env, businessId, role)
  if (blocked) return c.json({ error: blocked }, 402)

  // Someone who already has an account and is in no business yet (they signed up on their own): they
  // join this team as they are, with their own sign-in. Anyone in another business stays there.
  const { data: account } = await serviceClient(c.env).from('profiles').select('id, business_id').eq('email', email).maybeSingle()
  if (account) {
    if (account.business_id === businessId) return c.json({ error: 'They’re already on your team' }, 400)
    if (account.business_id) return c.json({ error: 'Someone with that email already has an account' }, 400)
    const joined = await joinBusiness(c.env, account.id as string, businessId, {
      role, active: true, ...(owner ? { can_see_pay: true } : {}), ...(role === 'partner' ? partner : contact),
    })
    if (!joined) return c.json({ error: 'Someone with that email already has an account' }, 400)
    return c.json({ ok: true, joined: true })
  }

  // With a temporary password: create the account now, no email needed (Supabase's built-in email
  // only reaches the project's own members). app_metadata is service-only, so the role is trusted.
  if (body.password !== undefined) {
    if (body.password.length < 8) return c.json({ error: 'The temporary password needs at least 8 characters' }, 400)
    const svc = serviceClient(c.env)
    const { data: created, error: createError } = await svc.auth.admin.createUser({
      email, password: body.password, email_confirm: true,
      user_metadata: { full_name: body.full_name.trim() },
      app_metadata: { created_by_admin: true, role, business_id: businessId, ...partner },
    })
    if (createError || !created.user) {
      return c.json({ error: /already|exists|registered/i.test(createError?.message ?? '')
        ? 'Someone with that email already has an account' : createError?.message ?? 'Could not create the account' }, 400)
    }
    // Set the business and role and switch the account on explicitly: Supabase may store
    // app_metadata after the new-user trigger has already run, which left these accounts inactive.
    const joined = await joinBusiness(c.env, created.user.id, businessId, {
      full_name: body.full_name.trim(), role, active: true, ...(owner ? { can_see_pay: true } : {}),
      ...(role === 'partner' ? partner : contact),
    }).catch((e: Error) => e)
    if (joined === null || joined instanceof Error) {
      await svc.auth.admin.deleteUser(created.user.id)
      return c.json({ error: `Could not set up the account: ${joined instanceof Error ? joined.message : 'it is in another business'}` }, 500)
    }
    return c.json({ ok: true, created: true })
  }

  const origin = new URL(c.req.url).origin
  const svc = serviceClient(c.env)
  const { data: invited, error: inviteError } = await svc.auth.admin.inviteUserByEmail(email, {
    data: { full_name: body.full_name.trim(), role, business_id: businessId, ...partner },
    redirectTo: `${origin}/account`,
  })
  if (inviteError) return c.json({ error: inviteError.message }, 400)
  const after = { ...(role === 'partner' ? {} : contact), ...(owner ? { can_see_pay: true } : {}) }
  if (invited.user) await joinBusiness(c.env, invited.user.id, businessId, after)
  return c.json({ ok: true })
})

// Admin sets a new temporary password for someone who can't get in (not for other admins).
app.post('/api/admin/set-password', async c => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const sb = userClient(c.env, token, 'app')
  const { data: isAdmin, error } = await sb.rpc('is_admin')
  if (error || !isAdmin) return c.json({ error: 'Only an admin can do that' }, 403)
  const body = await c.req.json<{ user_id?: string; password?: string }>()
  if (!body.user_id || !body.password || body.password.length < 8) {
    return c.json({ error: 'The temporary password needs at least 8 characters' }, 400)
  }
  const { data: target } = await sb.from('profiles').select('id, role').eq('id', body.user_id).maybeSingle()
  if (!target) return c.json({ error: 'No such person' }, 404)
  if (target.role === 'admin') return c.json({ error: 'Admins change their own password on My account' }, 403)
  const { error: updError } = await serviceClient(c.env).auth.admin.updateUserById(body.user_id, { password: body.password })
  if (updError) return c.json({ error: updError.message }, 400)
  return c.json({ ok: true })
})

// Admin "Refresh now" on the Sports page (the cron keeps fixtures fresh by itself).
app.post('/api/admin/sports/refresh', async c => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const sb = userClient(c.env, token, 'app')
  const [{ data: isAdmin, error }, { data: businessId }] = await Promise.all([sb.rpc('is_admin'), sb.rpc('current_business_id')])
  if (error || !isAdmin || !businessId) return c.json({ error: 'Only an admin can do that' }, 403)
  const db = businessDb(c.env, businessId)
  if (!await sportsEnabled(db)) return c.json({ error: 'Sports is off. Turn it on on the Sports page first.' }, 409)
  return c.json({ ok: true, events: await refreshAllSports(db) })
})

// Music page: each person's own Spotify / YouTube Music.
app.route('/', music)

// Google Fonts list for the brand page's font picker.
app.route('/', fonts)

// The Ads page: Meta Ads and Google Ads, read and changed live.
app.route('/', ads)

// Calendar feeds: my shifts (everyone) and the team calendar (admins), for Google/Apple/Outlook.
app.route('/', calendarFeeds)

// Google / WhatsApp / Instagram connections, webhooks and post photos.
app.route('/', integrations)

// Personal access keys (My account → AI assistants) for AIs and automations.
app.route('/', apiKeys)

// Sign-in emails from the business's own Gmail/Outlook (Supabase Auth's send-email hook).
app.route('/', authEmail)
// Referral links: count opens (no sign-in).
app.route('/', referrals)

// Tax documents into the café's Drive or OneDrive (Tax page).
app.route('/', tax)
// The Documents hub: what's in the café's Business Agent folder, and uploads into its Documents folder.
app.route('/', files)
// Legal documents picked where they are in the café's Drive or OneDrive, and shown from there (Legal page).
app.route('/', legal)
// Invoices that come by email, into the café's Drive or OneDrive (Invoices page).
app.route('/', invoices)
// The Email page: the connected Gmail or Outlook as a list, with filters (admins).
app.route('/', email)
// Square loyalty (the stamp card) and gift cards, for the Loyalty page.
app.route('/', loyaltyRoutes)
// The in-app assistant: questions answered by Claude with the person's own tools.
app.route('/', assistant)
// Reviews (Google) and Website & SEO (Marketing).
app.route('/', reviews)
app.route('/', website)
// Competitors: cafés nearby and the ones followed, from Google (Marketing).
app.route('/', competitors)

// Menu page: AI images through Higgsfield, kept in the café's storage; Screens: each screen's link.
app.route('/', menu)
app.route('/', screens)

// Cameras: what the camera upload server passes on (video into the business's storage), and the Cameras page.
app.route('/', cameras)

// Sales reps: each rep's own page (its link), and looking someone up on Instagram.
app.route('/', repPage)

// Business Agent's own subscription (Stripe Billing): plans, checkout, portal, webhook.
app.route('/', billing)

// Music on stories and reels: AI tracks (ElevenLabs, paid per use) and putting music into files.
app.route('/', socialMusic)

// Push notifications: the public key phones and computers subscribe with.
app.route('/', push)

// REST API for scripts, n8n, Zapier (same tools and rules as the AI connector).
app.route('/api/v1', rest)

// OAuth sign-in page for AI connectors.
app.get('/authorize', c => authorizeGet(c.req.raw, c.env))
app.post('/authorize', c => authorizePost(c.req.raw, c.env))

// The app's code files. Cloudflare answers a file it doesn't have with the app's page, and
// browsers keep /assets/* for a year without asking again (public/_headers): a code file asked of
// a version that doesn't have it (a tab from before a deploy, a server mid-deploy) was kept as that
// page, and the app never started in that browser again. A missing one is now a 404 nobody keeps.
app.get('/assets/*', async c => {
  const res = await c.env.ASSETS.fetch(c.req.raw)
  if (res.status === 304) return res
  if (!res.ok || res.headers.get('content-type')?.startsWith('text/html')) {
    return c.text('Not found', 404, { 'cache-control': 'no-store' })
  }
  const file = new Response(res.body, res)
  file.headers.set('cache-control', 'public, max-age=31536000, immutable')
  return file
})

// The landing page's videos, a part at a time when the browser asks (worker/video.ts): the static
// assets send the whole file whatever is asked, so the video's slider couldn't go ahead.
app.on(['GET', 'HEAD'], '/video/*', c => serveVideo(c.env.ASSETS, c.req.raw))

app.notFound(c => c.json({ error: 'Not found' }, 404))
app.onError((err, c) => c.json({ error: err.message }, 500))

// The OAuth provider serves /register, /token, discovery metadata and guards /mcp;
// everything else falls through to the Hono app (static assets are served before the Worker).
// Built per request so the token refresh callback can reach env (Supabase URL and key).
const provider = (env: Env, origin: string) => new OAuthProvider<Env>({
  apiHandlers: { '/mcp': mcpApiHandler },
  defaultHandler: app as unknown as ExportedHandler<Env>,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  accessTokenTTL: 3000, // just under Supabase's 1-hour session
  tokenExchangeCallback: options => tokenExchangeCallback(env, options),
  // Besides OAuth sign-in, /mcp takes a personal access key as the bearer token (AIs that send a
  // header instead of signing in: the OpenAI and Anthropic APIs, n8n, agent frameworks).
  resolveExternalToken: async ({ token }) => {
    if (!isAccessKey(token)) return null
    const key = await resolveKey(env, token).catch(e => { console.error('access key failed', e); return null })
    if (!key) return null
    const props: GrantProps = { userId: key.userId, name: '', accessToken: key.accessToken, refreshToken: '' }
    return { props, audience: `${origin}/mcp` }
  },
  resourceMetadata: { resource: `${origin}/mcp`, resource_name: 'Business Agent' },
})

export default {
  fetch: (request, env, ctx) => provider(env, new URL(request.url).origin).fetch(request, env, ctx),
  // Every minute: close forgotten timecards, queue shift alerts, remind admins about events,
  // send planned social posts, deliver the outbox, refresh sports; every 15 minutes, opening hours
  // with Google Maps and Instagram mentions; every hour, new Square customers and new Google reviews
  // (every 3 hours from Places). How often each service is read: shared/refresh.ts.
  // Nightly: fill yesterday's missing timecards from the rota, check every connection still works,
  // and look at the competitors due their weekly check on Google.
  async scheduled(event, env, ctx) {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return
    const db = serviceClient(env)
    // The jobs in SQL go through every business in one call (each_business); one business's failing
    // doesn't stop the others'.
    const each = (job: string) => Promise.resolve(db.rpc('each_business', { p_job: job })).then(({ data, error }) => {
      if (error) console.error(`${job} failed`, error.message)
      else if (data) console.error(`${job} failed for ${data} business(es)`)
    })
    // The rest run here, for each business in turn, with that business's own connections.
    const forEach = async (job: (id: number, b: ReturnType<typeof businessDb>) => Promise<unknown>) => {
      for (const id of await businessIds(env)) await job(id, businessDb(env, id))
    }
    const minute = Math.floor(event.scheduledTime / 60_000)
    if (event.cron === NIGHTLY) {
      ctx.waitUntil((async () => {
        await each('auto_fill_timecards')
        // Licences running out within their reminder days: admins hear about each once (Licences page).
        await each('licence_reminders')
        // Enquiries whose follow-up day has come, and campaigns planned for today (Leads & enquiries, Campaigns).
        await each('enquiry_follow_ups')
        await each('campaign_reminders')
        // AI music tracks made while Stripe didn't answer go on the bill now.
        await chargePendingAiMusic(env).catch(e => console.error('ai music charges failed', e))
        await forEach(async (id, b) => {
          // WhatsApp chats older than Data retention allows, with their photos and voice notes.
          await purgeWhatsApp(b).catch(e => console.error('whatsapp purge failed', id, e))
          // The subscription, straight from Stripe (in case a webhook was missed).
          await syncBilling(env, id).catch(e => console.error('billing sync failed', id, e))
          // Instagram's likes and comments on posts with music, so suggestions learn what does well.
          await syncMusicInsights(env, id).catch(e => console.error('music insights failed', id, e))
          // Prove every connection still works; admins get a notification when one stops working.
          await checkAll(env, b).catch(e => console.error('connection checks failed', id, e))
          // Hours both ways first (an edit made on Google comes in, not overwritten), then re-send
          // closures and phone to Google Maps, in case a change was missed (changes also sync within a minute).
          if (await googleConnected(b)) {
            await syncGoogleBothWays(env, b)
              .then(done => (done === 'pushed' ? undefined : syncGoogle(env, b)))
              .catch(e => console.error('nightly google sync failed', id, e))
          }
          // Crests for new teams (flags straight away; a few club look-ups, the GitHub sync does the rest).
          if (await sportsOn(b)) await syncCrests(b, 8).catch(e => console.error('crests failed', id, e))
          // Competitors: each followed place's weekly check on Google, and the weekly look around for new places.
          await watchCompetitors(env, b).catch(e => console.error('competitors failed', id, e))
          // Outside services' answers kept over two days (provider_cache).
          await clearOldCache(b).catch(e => console.error('cache clear failed', id, e))
        })
      })())
      return
    }
    ctx.waitUntil((async () => {
      await each('auto_close_entries')
      await each('queue_shift_alerts')
      await each('deliver_event_alerts')
      // From 09:00, admins hear about public holidays a week ahead (Notifications page).
      await each('bank_holiday_reminders')
      // Social planner: posts that are due become one outbox job per network (sent just below).
      await each('queue_due_social_posts')
      await forEach(async (id, b) => {
        await drainOutbox(env, id).catch(e => console.error('outbox failed', id, e))
        // Stock on its last day goes on offer by itself, from its rule's time until closing (before the
        // push just below, so admins hear about it the same minute).
        await Promise.resolve(b.rpc('start_last_day_offers')).then(({ error }) => { if (error) console.error('last-day offers failed', id, error.message) })
        // New notifications to people's phones and computers, as each person chose.
        await pushNotifications(env, b).catch(e => console.error('push failed', id, e))
        // Menu images whose webhook from Higgsfield hasn't come (asked about, or given up on after 3 hours).
        await checkWaitingImages(env, b).catch(e => console.error('menu images failed', id, e))
        // Every 15 minutes: opening hours both ways with Google Maps (after the outbox, so a change
        // made in the app has already gone to Google).
        if (minute % 15 === 0 && await googleConnected(b)) {
          await syncGoogleBothWays(env, b).catch(e => console.error('google hours sync failed', id, e))
        }
        // Every minute: the menu onto the Google Maps listing, when it changed since it was last sent
        // (only a fingerprint is compared; Google is called only for a new menu).
        await pushGoogleMenu(env, b).catch(e => console.error('google menu failed', id, e))
        // Every 15 minutes: new Instagram tags and story mentions, for admins to repost or ignore.
        if (minute % 15 === 0) {
          await checkMentions(env, b).catch(e => console.error('instagram mentions failed', id, e))
        }
        // Every hour: Square customers added or changed since the last look, into Customers.
        if (minute % 60 === 0) {
          await syncSquareCustomers(env, b).catch(e => console.error('square customers failed', id, e))
        }
        // Every hour (a quarter past): the menu from the Square item library, when that's where it comes from.
        if (minute % 60 === 15) await syncSquareMenuIfChosen(env, b)
        // Every hour (on the half hour, away from Square's): new Google reviews, for admins to read and reply to;
        // from Places only every third hour (refreshReviews knows which).
        if (minute % 60 === 30 && await reviewsConfigured(env, b)) {
          await refreshReviews(env, b, 5).catch(e => console.error('reviews failed', id, e))
        }
        // Sports only while it's switched on (Sports page).
        if (await sportsOn(b)) await refreshStaleSports(b).catch(e => console.error('sports failed', id, e))
        // Every hour: the cameras' clips whose days are up, out of the business's storage (Cameras page).
        if (minute % 60 === 45) await purgeCameraClips(env, b).catch(e => console.error('camera clips purge failed', id, e))
        // Every 5 minutes: the next track of the music starter pack, until the business has them all.
        if (minute % 5 === 2) {
          await fillStarterPack(env, new URL(businessConfig.appUrl).origin, id).catch(e => console.error('music starter pack failed', id, e))
        }
      })
    })())
  },
} satisfies ExportedHandler<Env>
