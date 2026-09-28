import { Hono } from 'hono'
import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
import { bearer, serviceClient, userClient, type Env } from './supabase'
import { rest } from './rest'
import { drainOutbox, integrations, syncGoogle } from './integrations'
import { checkAll } from './connections'
import { refreshAllSports, refreshStaleSports, syncCrests } from './sports'
import { music } from './music'
import { calendarFeeds } from './calendarFeed'
import { fonts } from './fonts'
import { authorizeGet, authorizePost, mcpApiHandler, tokenExchangeCallback, type GrantProps, type OAuthEnv } from './mcp'
import { apiKeys, isAccessKey, resolveKey } from './apiKeys'

const NIGHTLY = '15 1 * * *' // 03:15 Madrid in summer, 02:15 in winter

const app = new Hono<{ Bindings: OAuthEnv }>()

// Public config for the web app (publishable key only).
app.get('/api/config', c => c.json({
  businessId: c.env.BUSINESS_ID,
  supabaseUrl: c.env.SUPABASE_URL,
  supabaseKey: c.env.SUPABASE_PUBLISHABLE_KEY,
}))

// ?deep=1 also checks that Supabase answers and which sign-in methods it has switched on
// (the uptime monitor calls this, so a broken login is caught, not just a dead page).
app.get('/api/health', async c => {
  if (!c.req.query('deep')) return c.json({ ok: true })
  try {
    const res = await fetch(`${c.env.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: c.env.SUPABASE_PUBLISHABLE_KEY } })
    if (!res.ok) return c.json({ ok: false, supabase: `auth answered ${res.status}` }, 503)
    const s = await res.json() as { external?: Record<string, boolean> }
    const signIn = { email: !!s.external?.email, google: !!s.external?.google, microsoft: !!s.external?.azure }
    return c.json({ ok: true, supabase: 'up', sign_in: signIn })
  } catch (e) {
    return c.json({ ok: false, supabase: String(e) }, 503)
  }
})

// Admin invites a team member. Needs the service key, so it runs here, not in the browser.
app.post('/api/admin/invite', async c => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const { data: isAdmin, error } = await userClient(c.env, token, 'app').rpc('is_admin')
  if (error || !isAdmin) return c.json({ error: 'Only an admin can invite people' }, 403)

  const body = await c.req.json<{ email?: string; full_name?: string; role?: string; partner_company?: string; partner_access?: string[]; password?: string; phone?: string | null; contact_method?: string | null }>()
  const email = body.email?.trim().toLowerCase()
  const role = ['admin', 'employee', 'kiosk', 'partner'].includes(body.role ?? '') ? body.role : 'employee'
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

  // With a temporary password: create the account now, no email needed (Supabase's built-in email
  // only reaches the project's own members). app_metadata is service-only, so the role is trusted.
  if (body.password !== undefined) {
    if (body.password.length < 8) return c.json({ error: 'The temporary password needs at least 8 characters' }, 400)
    const svc = serviceClient(c.env)
    const { data: created, error: createError } = await svc.auth.admin.createUser({
      email, password: body.password, email_confirm: true,
      user_metadata: { full_name: body.full_name.trim() },
      app_metadata: { created_by_admin: true, role, ...partner },
    })
    if (createError || !created.user) {
      return c.json({ error: /already|exists|registered/i.test(createError?.message ?? '')
        ? 'Someone with that email already has an account' : createError?.message ?? 'Could not create the account' }, 400)
    }
    // Set the role and switch the account on explicitly: Supabase may store app_metadata after
    // the new-user trigger has already run, which left these accounts inactive.
    const { error: profileError } = await svc.from('profiles').update({
      full_name: body.full_name.trim(), role, active: true,
      ...(role === 'partner' ? partner : contact),
    }).eq('id', created.user.id)
    if (profileError) {
      await svc.auth.admin.deleteUser(created.user.id)
      return c.json({ error: `Could not set up the account: ${profileError.message}` }, 500)
    }
    return c.json({ ok: true, created: true })
  }

  const origin = new URL(c.req.url).origin
  const svc = serviceClient(c.env)
  const { data: invited, error: inviteError } = await svc.auth.admin.inviteUserByEmail(email, {
    data: { full_name: body.full_name.trim(), role, ...partner },
    redirectTo: `${origin}/account`,
  })
  if (inviteError) return c.json({ error: inviteError.message }, 400)
  if (invited.user && role !== 'partner' && Object.keys(contact).length) await svc.from('profiles').update(contact).eq('id', invited.user.id)
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
  const { data: isAdmin, error } = await userClient(c.env, token, 'app').rpc('is_admin')
  if (error || !isAdmin) return c.json({ error: 'Only an admin can do that' }, 403)
  return c.json({ ok: true, events: await refreshAllSports(serviceClient(c.env)) })
})

// Music page: each person's own Spotify / YouTube Music.
app.route('/', music)

// Google Fonts list for the brand page's font picker.
app.route('/', fonts)

// Calendar feeds: my shifts (everyone) and the team calendar (admins), for Google/Apple/Outlook.
app.route('/', calendarFeeds)

// Google / WhatsApp / Instagram connections, webhooks and post photos.
app.route('/', integrations)

// Personal access keys (My account → AI assistants) for AIs and automations.
app.route('/', apiKeys)

// REST API for scripts, n8n, Zapier (same tools and rules as the AI connector).
app.route('/api/v1', rest)

// OAuth sign-in page for AI connectors.
app.get('/authorize', c => authorizeGet(c.req.raw, c.env))
app.post('/authorize', c => authorizePost(c.req.raw, c.env))

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
  // send planned social posts, deliver the outbox, refresh sports.
  // Nightly: fill yesterday's missing timecards from the rota, check every connection still works.
  async scheduled(event, env, ctx) {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return
    const db = serviceClient(env)
    const log = (job: string) => ({ error }: { error: { message: string } | null }) => {
      if (error) console.error(`${job} failed`, error.message)
    }
    if (event.cron === NIGHTLY) {
      ctx.waitUntil((async () => {
        await Promise.resolve(db.rpc('auto_fill_timecards')).then(log('auto_fill_timecards'))
        // Prove every connection still works; admins get a notification when one stops working.
        await checkAll(env, db).catch(e => console.error('connection checks failed', e))
        // Re-send hours, closures and phone to Google Maps every night, so the listing stays right
        // even if someone edits it on Google or a change was missed (changes also sync within a minute).
        const { data: g } = await db.from('integrations').select('status').eq('provider', 'google_business').maybeSingle()
        if (g?.status === 'connected') await syncGoogle(env, db).catch(e => console.error('nightly google sync failed', e))
        // Crests for new teams (flags straight away; a few club look-ups, the GitHub sync does the rest).
        await syncCrests(db, 8).catch(e => console.error('crests failed', e))
      })())
      return
    }
    ctx.waitUntil((async () => {
      await Promise.resolve(db.rpc('auto_close_entries')).then(log('auto_close_entries'))
      await Promise.resolve(db.rpc('queue_shift_alerts')).then(log('queue_shift_alerts'))
      await Promise.resolve(db.rpc('deliver_event_alerts')).then(log('deliver_event_alerts'))
      // Social planner: posts that are due become one outbox job per network (sent just below).
      await Promise.resolve(db.rpc('queue_due_social_posts')).then(log('queue_due_social_posts'))
      await drainOutbox(env).catch(e => console.error('outbox failed', e))
      await refreshStaleSports(db).catch(e => console.error('sports failed', e))
    })())
  },
} satisfies ExportedHandler<Env>
