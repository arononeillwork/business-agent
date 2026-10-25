// REST API for scripts, automation tools (n8n, Zapier, Make) and AIs without MCP (ChatGPT GPT
// actions). Same tools and rules as the MCP connector; calls are logged as via "api".
//   GET  /api/v1/openapi.json     OpenAPI 3.1 description of every tool (no sign-in needed)
//   GET  /api/v1/tools            the tools you may use, with their JSON input schemas
//   POST /api/v1/tools/:name      run a tool with a JSON body
// Auth: `Authorization: Bearer <personal access key>` (My account → AI assistants), or a Supabase
// session token.
import { Hono } from 'hono'
import { z } from 'zod'
import { userClient, type Env } from './supabase'
import { sessionToken } from './apiKeys'
import { TOOLS, loadMe, runTool, toolsFor, type ToolDef } from './tools'

export const rest = new Hono<{ Bindings: Env; Variables: { token: string } }>()

const schemaOf = (t: ToolDef) => {
  const { $schema: _, ...schema } = z.toJSONSchema(t.input) as Record<string, unknown>
  return schema
}

/** Every tool as an operation. Who may run which is decided when it's called (admin-only tools say so). */
export function openApi(origin: string) {
  const error = { description: 'Not done, with the reason', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Business Agent',
      version: '1.0.0',
      description: 'The team app for a café: rota, clock-ins (registro de jornada), time off, calendar and business details. ' +
        'Every call acts as the person whose access key is used, with exactly their permissions; changes are logged. ' +
        'Dates are YYYY-MM-DD and times 24-hour Europe/Madrid. Call whoami first.',
    },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ accessKey: [] }],
    components: {
      securitySchemes: { accessKey: { type: 'http', scheme: 'bearer', description: 'A personal access key from My account → AI assistants (starts with ba_).' } },
      schemas: { Error: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] } },
    },
    paths: Object.fromEntries(TOOLS.map(t => [`/tools/${t.name}`, {
      post: {
        operationId: t.name,
        summary: t.title,
        description: `${t.description}${t.admin ? ' Admins only.' : ''}`,
        'x-openai-isConsequential': !t.readOnly,
        requestBody: { required: true, content: { 'application/json': { schema: schemaOf(t) } } },
        responses: {
          200: { description: 'Done', content: { 'application/json': { schema: { type: 'object', properties: { result: {} }, required: ['result'] } } } },
          400: error, 401: error, 404: error,
        },
      },
    }])),
  }
}

rest.get('/openapi.json', c => c.json(openApi(new URL(c.req.url).origin), 200, { 'access-control-allow-origin': '*' }))

rest.use('*', async (c, next) => {
  const token = await sessionToken(c.env, c.req.header('authorization'))
  if (!token) return c.json({ error: 'Missing or unknown access key' }, 401)
  c.set('token', token)
  await next()
})

rest.get('/tools', async c => {
  const me = await loadMe(userClient(c.env, c.get('token'), 'api'), c.get('token'))
  return c.json(toolsFor(me).map(t => ({
    name: t.name, title: t.title, description: t.description, admin: !!t.admin,
    input_schema: z.toJSONSchema(t.input),
  })))
})

rest.post('/tools/:name', async c => {
  const sb = userClient(c.env, c.get('token'), 'api')
  let me
  try {
    me = await loadMe(sb, c.get('token'))
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 401)
  }
  const t = toolsFor(me).find(x => x.name === c.req.param('name'))
  if (!t) return c.json({ error: 'Unknown tool' }, 404)
  try {
    return c.json({ result: await runTool(t, { sb, me }, await c.req.json().catch(() => ({}))) })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
})
