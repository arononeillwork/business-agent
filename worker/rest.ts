// REST API for scripts and automation tools (n8n, Zapier). Same tools and rules as the MCP
// connector; calls are logged as via "api".
//   GET  /api/v1/tools            list tools and their JSON input schemas
//   POST /api/v1/tools/:name      run a tool with a JSON body
// Auth: `Authorization: Bearer <Supabase access token>` (personal API keys come in phase 2).
import { Hono } from 'hono'
import { z } from 'zod'
import { bearer, userClient, type Env } from './supabase'
import { loadMe, runTool, toolsFor } from './tools'

export const rest = new Hono<{ Bindings: Env }>()

rest.use('*', async (c, next) => {
  if (!bearer(c.req.header('authorization'))) return c.json({ error: 'Missing bearer token' }, 401)
  await next()
})

rest.get('/tools', async c => {
  const token = bearer(c.req.header('authorization'))!
  const me = await loadMe(userClient(c.env, token, 'api'), token)
  return c.json(toolsFor(me).map(t => ({
    name: t.name, title: t.title, description: t.description, admin: !!t.admin,
    input_schema: z.toJSONSchema(t.input),
  })))
})

rest.post('/tools/:name', async c => {
  const token = bearer(c.req.header('authorization'))!
  const sb = userClient(c.env, token, 'api')
  const me = await loadMe(sb, token)
  const t = toolsFor(me).find(x => x.name === c.req.param('name'))
  if (!t) return c.json({ error: 'Unknown tool' }, 404)
  try {
    return c.json({ result: await runTool(t, { sb, me }, await c.req.json().catch(() => ({}))) })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
})
