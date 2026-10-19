// Personal access keys, end to end: made on My account, then used by an AI or automation on the
// REST API and the MCP server, against a stand-in for Supabase. What must never break:
//   - a key acts as its owner with exactly their permissions, and only while it isn't revoked
//   - only a hash is stored; a key can't be used to make more keys
//   - the OpenAPI description lists every tool, so GPT actions, n8n and Zapier can import it
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiKeys, newKey } from './apiKeys'
import { rest } from './rest'
import worker from './index'
import { TOOLS } from './tools'
import { seal, unseal } from './crypto'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'

const APP = 'https://app.test'
const kv = { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [], list_complete: true }) }
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', OAUTH_KV: kv,
} as unknown as Env

let db: FakeSupabase
beforeEach(() => {
  db = new FakeSupabase()
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const signedIn = (who: 'admin' | 'staff') => ({ authorization: `Bearer ${who}-token`, 'content-type': 'application/json' })
const withKey = (key: string) => ({ authorization: `Bearer ${key}`, 'content-type': 'application/json' })

async function makeKey(who: 'admin' | 'staff' = 'staff', name = 'n8n') {
  const res = await apiKeys.request(`${APP}/api/me/api-keys`, { method: 'POST', headers: signedIn(who), body: JSON.stringify({ name }) }, env)
  expect(res.status).toBe(200)
  return await res.json() as { id: string; key: string; prefix: string; name: string }
}
const tool = (key: string, name: string, args: unknown = {}) =>
  rest.request(`${APP}/tools/${name}`, { method: 'POST', headers: withKey(key), body: JSON.stringify(args) }, env)

describe('Access keys', () => {
  it('are shown once and stored only as a hash', async () => {
    const made = await makeKey()
    expect(made.key).toMatch(/^ba_[A-Za-z0-9]{40}$/)
    expect(made.prefix).toBe(made.key.slice(0, 7))
    const row = db.table('api_keys')[0]
    expect(row).toMatchObject({ profile_id: 'staff-1', name: 'n8n', prefix: made.prefix })
    expect(JSON.stringify(db.tables)).not.toContain(made.key)
    const list = await (await apiKeys.request(`${APP}/api/me/api-keys`, { headers: signedIn('staff') }, env)).json() as { keys: { name: string; key?: string }[] }
    expect(list.keys).toEqual([expect.objectContaining({ name: 'n8n', prefix: made.prefix })])
    expect(list.keys[0].key).toBeUndefined()
  })

  it('act as their owner, with exactly their permissions', async () => {
    const { key } = await makeKey('staff')
    const me = await tool(key, 'whoami')
    expect(me.status).toBe(200)
    expect((await me.json() as { result: unknown }).result).toMatchObject({ name: 'Julio', role: 'employee', business: 'Easy Beans' })
    // Admin-only tools don't exist for an employee's key.
    expect((await tool(key, 'delete_shift', { shift_id: 'x' })).status).toBe(404)
    const listed = await (await rest.request(`${APP}/tools`, { headers: withKey(key) }, env)).json() as { name: string }[]
    expect(listed.map(t => t.name)).toContain('whoami')
    expect(listed.map(t => t.name)).not.toContain('create_shift')
  })

  it('sign in once, reuse the session, and refresh it when it runs out', async () => {
    const { key } = await makeKey()
    await tool(key, 'whoami')
    await tool(key, 'whoami')
    expect(db.auth).toEqual({ links: 1, refreshes: 0 })
    // An hour later the session has run out: refreshed, not a new sign-in.
    const row = db.table('api_keys')[0]
    const s = await unseal<{ access_token: string; refresh_token: string; expires_at: number }>(env.INTEGRATION_KEY!, String(row.session))
    row.session = await seal(env.INTEGRATION_KEY!, { ...s, expires_at: Math.floor(Date.now() / 1000) + 30 })
    expect((await tool(key, 'whoami')).status).toBe(200)
    expect(db.auth).toEqual({ links: 1, refreshes: 1 })
    expect(db.table('api_keys')[0].last_used_at).toBeTruthy()
  })

  it('stop working the moment they are revoked, or their owner is switched off', async () => {
    const a = await makeKey('staff', 'one')
    const b = await makeKey('staff', 'two')
    expect((await apiKeys.request(`${APP}/api/me/api-keys/${a.id}`, { method: 'DELETE', headers: signedIn('admin') }, env)).status).toBe(404) // not theirs
    expect((await apiKeys.request(`${APP}/api/me/api-keys/${a.id}`, { method: 'DELETE', headers: signedIn('staff') }, env)).status).toBe(200)
    expect((await tool(a.key, 'whoami')).status).toBe(401)
    expect((await tool(b.key, 'whoami')).status).toBe(200)
    db.table('profiles').find(p => p.id === 'staff-1')!.active = false
    expect((await tool(b.key, 'whoami')).status).toBe(401)
    expect((await tool(newKey(), 'whoami')).status).toBe(401)
  })

  it('can’t be used to make more keys, and each person has at most ten', async () => {
    const { key } = await makeKey()
    const res = await apiKeys.request(`${APP}/api/me/api-keys`, { method: 'POST', headers: withKey(key), body: JSON.stringify({ name: 'sneaky' }) }, env)
    expect(res.status).toBe(401)
    for (let i = 2; i <= 10; i++) await makeKey('staff', `key ${i}`)
    const eleventh = await apiKeys.request(`${APP}/api/me/api-keys`, { method: 'POST', headers: signedIn('staff'), body: JSON.stringify({ name: 'one more' }) }, env)
    expect(eleventh.status).toBe(400)
    const blank = await apiKeys.request(`${APP}/api/me/api-keys`, { method: 'POST', headers: signedIn('staff'), body: JSON.stringify({ name: '  ' }) }, env)
    expect(blank.status).toBe(400)
  })
})

describe('Any AI', () => {
  const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext
  async function mcp(key: string, id: number, method: string, params: unknown = {}) {
    const res = await worker.fetch!(new Request(`${APP}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    }) as Request<unknown, IncomingRequestCfProperties>, env, ctx())
    const text = await res.text()
    return { status: res.status, headers: res.headers, body: text.startsWith('{') ? JSON.parse(text) : text.includes('data:') ? JSON.parse(text.split('\n').find(l => l.startsWith('data:'))!.slice(5)) : text }
  }

  it('an MCP client can send an access key instead of signing in', async () => {
    const { key } = await makeKey('admin', 'OpenAI agent')
    const init = await mcp(key, 1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'agent', version: '1' } })
    expect(init.status).toBe(200)
    expect(init.body.result.serverInfo.name).toBe('business-agent')
    const list = await mcp(key, 2, 'tools/list')
    expect(list.body.result.tools.map((t: { name: string }) => t.name)).toContain('create_shift')
    const me = await mcp(key, 3, 'tools/call', { name: 'whoami', arguments: {} })
    expect(JSON.parse(me.body.result.content[0].text)).toMatchObject({ name: 'Aron', role: 'admin' })
  })

  it('an unknown or revoked key gets a sign-in challenge on /mcp', async () => {
    const res = await mcp(newKey(), 1, 'tools/list')
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata')
  })

  it('publishes an OpenAPI description of every tool (for GPT actions, n8n, Zapier, Make)', async () => {
    const res = await rest.request(`${APP}/openapi.json`, {}, env)
    expect(res.status).toBe(200)
    const spec = await res.json() as { openapi: string; servers: { url: string }[]; paths: Record<string, { post: { operationId: string; requestBody: { content: Record<string, { schema: Record<string, unknown> }> } } }>; components: { securitySchemes: Record<string, { scheme: string }> } }
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.servers[0].url).toBe(`${APP}/api/v1`)
    expect(spec.components.securitySchemes.accessKey.scheme).toBe('bearer')
    const ops = Object.values(spec.paths).map(p => p.post)
    expect(ops.map(o => o.operationId).sort()).toEqual(TOOLS.map(t => t.name).sort())
    for (const o of ops) {
      const schema = o.requestBody.content['application/json'].schema
      expect(schema.type, o.operationId).toBe('object')
      expect(schema.$schema, o.operationId).toBeUndefined()
    }
  })
})
