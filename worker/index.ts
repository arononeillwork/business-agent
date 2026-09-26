import { Hono } from 'hono'
import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
import { bearer, serviceClient, userClient, type Env } from './supabase'
import { rest } from './rest'
import { authorizeGet, authorizePost, mcpApiHandler, tokenExchangeCallback, type OAuthEnv } from './mcp'

const app = new Hono<{ Bindings: OAuthEnv }>()

// Public config for the web app (publishable key only).
app.get('/api/config', c => c.json({
  businessId: c.env.BUSINESS_ID,
  supabaseUrl: c.env.SUPABASE_URL,
  supabaseKey: c.env.SUPABASE_PUBLISHABLE_KEY,
}))

app.get('/api/health', c => c.json({ ok: true }))

// Admin invites a team member. Needs the service key, so it runs here, not in the browser.
app.post('/api/admin/invite', async c => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const { data: isAdmin, error } = await userClient(c.env, token, 'app').rpc('is_admin')
  if (error || !isAdmin) return c.json({ error: 'Only an admin can invite people' }, 403)

  const body = await c.req.json<{ email?: string; full_name?: string; role?: string }>()
  const email = body.email?.trim().toLowerCase()
  const role = ['admin', 'employee', 'kiosk'].includes(body.role ?? '') ? body.role : 'employee'
  if (!email || !body.full_name?.trim()) return c.json({ error: 'Name and email are required' }, 400)

  const origin = new URL(c.req.url).origin
  const { error: inviteError } = await serviceClient(c.env).auth.admin.inviteUserByEmail(email, {
    data: { full_name: body.full_name.trim(), role },
    redirectTo: `${origin}/account`,
  })
  if (inviteError) return c.json({ error: inviteError.message }, 400)
  return c.json({ ok: true })
})

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
  // Every 5 minutes: close forgotten timecards and expire old correction requests.
  async scheduled(_event, env, ctx) {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return
    ctx.waitUntil(Promise.resolve(serviceClient(env).rpc('auto_close_entries')).then(({ error }) => {
      if (error) console.error('auto_close_entries failed', error.message)
    }))
  },
} satisfies ExportedHandler<Env>
