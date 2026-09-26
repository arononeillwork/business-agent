// AI connector: an MCP server at /mcp protected by OAuth. Claude (or any MCP client) is added
// as a custom connector; the person signs in with their team account on /authorize and the AI
// then acts as them. Supabase session tokens are kept in the OAuth grant (encrypted by the
// provider) and refreshed when the MCP client refreshes its token.
import { createClient } from '@supabase/supabase-js'
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server'
import type { AuthRequest, OAuthHelpers, TokenExchangeCallbackOptions } from '@cloudflare/workers-oauth-provider'
import { userClient, type Env } from './supabase'
import { loadMe, runTool, toolsFor, type ToolContext, type ToolDef } from './tools'

export interface GrantProps {
  userId: string
  name: string
  accessToken: string
  refreshToken: string
}

export type OAuthEnv = Env & { OAUTH_PROVIDER: OAuthHelpers; OAUTH_KV: KVNamespace }

const INSTRUCTIONS = `Team app for a café in Spain: rota, clock-ins (registro de jornada), calendar and business details.
Call whoami first. Dates are YYYY-MM-DD and times 24-hour Europe/Madrid.
Before deleting anything or changing many shifts, summarise and ask the user to confirm.
Timecard edits need a reason. Everything you change is logged as made "via AI" on behalf of the user.`

/** Handles /mcp once the OAuth provider has validated the bearer token. */
export const mcpApiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const props = (ctx as ExecutionContext & { props: GrantProps }).props
    const sb = userClient(env, props.accessToken, 'ai')
    const me = await loadMe(sb, props.accessToken)

    return createMcpHandler(() => buildMcpServer(toolsFor(me), { sb, me })).fetch(request)
  },
}

/** One MCP server per request, exposing the tools this person may use. */
export function buildMcpServer(tools: ToolDef[], ctx: ToolContext) {
  const server = new McpServer({ name: 'business-agent', version: '0.1.0' }, { instructions: INSTRUCTIONS })
  for (const t of tools) {
    // Tool input types vary per tool; runTool validates with the same zod schema.
    const register = server.registerTool.bind(server) as (...args: unknown[]) => unknown
    register(t.name, {
      title: t.title,
      description: t.description,
      inputSchema: t.input,
      annotations: { readOnlyHint: !!t.readOnly, destructiveHint: !!t.destructive, openWorldHint: false },
    }, async (args: unknown) => {
      try {
        const result = await runTool(t, ctx, args)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (e) {
        return { isError: true, content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }] }
      }
    })
  }
  return server
}

/** When the MCP client refreshes its token, refresh the Supabase session too. */
export async function tokenExchangeCallback(env: Env, options: TokenExchangeCallbackOptions) {
  if (options.grantType !== 'refresh_token') return
  const props = options.props as GrantProps
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.refreshSession({ refresh_token: props.refreshToken })
  if (error || !data.session) throw new Error('Supabase session expired. Reconnect the connector.')
  const newProps: GrantProps = { ...props, accessToken: data.session.access_token, refreshToken: data.session.refresh_token }
  return { newProps, accessTokenTTL: Math.max(60, (data.session.expires_in ?? 3600) - 120) }
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function page(body: string) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect AI assistant</title>
<style>
:root{--brand:#3e2723;--bg:#faf7f2;--muted:#6d6d6d}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:#222;display:grid;place-items:center;min-height:100vh;padding:16px}
.card{background:#fff;border:1px solid #e5e0d8;border-radius:14px;padding:24px;width:100%;max-width:380px}
h1{font-size:20px;margin:0 0 4px}p{color:var(--muted);font-size:14px;line-height:1.45}
label{display:block;font-size:13px;margin:12px 0 4px}input{width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:15px}
button{margin-top:16px;width:100%;padding:12px;border:0;border-radius:8px;background:var(--brand);color:#fff;font-weight:600;font-size:15px;cursor:pointer}
.err{background:#fdecea;color:#b71c1c;padding:8px 10px;border-radius:8px;font-size:14px}
ul{padding-left:18px;color:var(--muted);font-size:14px}
</style></head><body><div class="card">${body}</div></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function loginForm(oauthReq: AuthRequest, clientName: string, error?: string) {
  const state = btoa(JSON.stringify(oauthReq))
  return page(`<h1>Connect ${esc(clientName)}</h1>
<p><b>${esc(clientName)}</b> wants to use the team app on your behalf. It will be able to do what you can do in the app, and every change is logged as made via AI.</p>
<ul><li>Admins: rota, calendar, timecards, business details</li><li>Employees: your own shifts and timecards</li></ul>
${error ? `<div class="err">${esc(error)}</div>` : ''}
<form method="post" action="/authorize">
<input type="hidden" name="state" value="${esc(state)}">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in and allow</button></form>`)
}

export async function authorizeGet(request: Request, env: OAuthEnv) {
  const oauthReq = await env.OAUTH_PROVIDER.parseAuthRequest(request)
  const client = await env.OAUTH_PROVIDER.lookupClient(oauthReq.clientId)
  if (!client) return page('<h1>Unknown app</h1><p>This connector request is not valid. Try adding it again.</p>')
  return loginForm(oauthReq, client.clientName ?? 'AI assistant')
}

export async function authorizePost(request: Request, env: OAuthEnv) {
  const form = await request.formData()
  let oauthReq: AuthRequest
  try {
    oauthReq = JSON.parse(atob(String(form.get('state'))))
  } catch {
    return page('<h1>Something went wrong</h1><p>Start the connection again from your AI app.</p>')
  }
  const client = await env.OAUTH_PROVIDER.lookupClient(oauthReq.clientId)
  if (!client) return page('<h1>Unknown app</h1><p>Try adding the connector again.</p>')
  const clientName = client.clientName ?? 'AI assistant'

  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({
    email: String(form.get('email') ?? ''), password: String(form.get('password') ?? ''),
  })
  if (error || !data.session) return loginForm(oauthReq, clientName, 'Wrong email or password')

  let name: string
  try {
    const me = await loadMe(userClient(env, data.session.access_token, 'ai'), data.session.access_token)
    name = me.full_name
  } catch (e) {
    return loginForm(oauthReq, clientName, e instanceof Error ? e.message : 'This account cannot connect')
  }

  const props: GrantProps = {
    userId: data.user.id, name,
    accessToken: data.session.access_token, refreshToken: data.session.refresh_token,
  }
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReq,
    userId: data.user.id,
    metadata: { label: `${name} via ${clientName}` },
    scope: oauthReq.scope,
    props,
  })
  return Response.redirect(redirectTo, 302)
}
