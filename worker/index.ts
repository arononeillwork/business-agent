import { Hono } from 'hono'
import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
import { bearer, serviceClient, userClient, type Env } from './supabase'
import { rest } from './rest'
import { drainOutbox, integrations } from './integrations'
import { authorizeGet, authorizePost, mcpApiHandler, tokenExchangeCallback, type OAuthEnv } from './mcp'

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

  const body = await c.req.json<{ email?: string; full_name?: string; role?: string; partner_company?: string; partner_access?: string[] }>()
  const email = body.email?.trim().toLowerCase()
  const role = ['admin', 'employee', 'kiosk', 'partner'].includes(body.role ?? '') ? body.role : 'employee'
  if (!email || !body.full_name?.trim()) return c.json({ error: 'Name and email are required' }, 400)
  // Partners: company and read-only areas (the database drops anything unknown too).
  const partner = role === 'partner' ? {
    partner_company: body.partner_company?.trim() || null,
    partner_access: (body.partner_access ?? []).filter(a => ['calendar', 'rota', 'payroll', 'finances'].includes(a)),
  } : {}
  if (role === 'partner' && !partner.partner_company) return c.json({ error: 'Add the partner’s company name' }, 400)

  const origin = new URL(c.req.url).origin
  const { error: inviteError } = await serviceClient(c.env).auth.admin.inviteUserByEmail(email, {
    data: { full_name: body.full_name.trim(), role, ...partner },
    redirectTo: `${origin}/account`,
  })
  if (inviteError) return c.json({ error: inviteError.message }, 400)
  return c.json({ ok: true })
})

// Google / WhatsApp / Instagram connections, webhooks and post photos.
app.route('/', integrations)

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
  resourceMetadata: { resource: `${origin}/mcp`, resource_name: 'Business Agent' },
})

export default {
  fetch: (request, env, ctx) => provider(env, new URL(request.url).origin).fetch(request, env, ctx),
  // Every minute: close forgotten timecards, queue shift alerts, deliver the outbox.
  // Nightly: fill yesterday's missing timecards from the rota.
  async scheduled(event, env, ctx) {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return
    const db = serviceClient(env)
    const log = (job: string) => ({ error }: { error: { message: string } | null }) => {
      if (error) console.error(`${job} failed`, error.message)
    }
    if (event.cron === NIGHTLY) {
      ctx.waitUntil(Promise.resolve(db.rpc('auto_fill_timecards')).then(log('auto_fill_timecards')))
      return
    }
    ctx.waitUntil((async () => {
      await Promise.resolve(db.rpc('auto_close_entries')).then(log('auto_close_entries'))
      await Promise.resolve(db.rpc('queue_shift_alerts')).then(log('queue_shift_alerts'))
      await drainOutbox(env).catch(e => console.error('outbox failed', e))
    })())
  },
} satisfies ExportedHandler<Env>
