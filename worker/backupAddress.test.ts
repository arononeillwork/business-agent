// The AI connector on the backup address (businesssagent.vercel.app), end to end through the Worker.
// Vercel passes requests on to the workers.dev address and names the backup in x-forwarded-host. What
// must never break:
//   - through the backup, the connector's discovery, sign-in challenge and sign-in page all name the
//     backup address (before, they named workers.dev and the sign-in page answered 500)
//   - straight to the Worker, or with any other host in the header, nothing changes
//   - the rest of the app keeps the address it was sent to (other apps' sign-in returns)
import { describe, expect, it } from 'vitest'
import worker from './index'
import { asBackupAddress } from './backupAddress'
import { businessConfig } from '../shared/business.config'
import type { Env } from './supabase'

const WORKER = businessConfig.workersUrl
const BACKUP = businessConfig.backupUrl
const VIA_BACKUP = { 'x-forwarded-host': new URL(BACKUP).host }

function memoryKv() {
  const store = new Map<string, string>()
  return {
    get: async (key: string, opts?: { type?: string }) => {
      const value = store.get(key)
      return value === undefined ? null : opts?.type === 'json' ? JSON.parse(value) : value
    },
    put: async (key: string, value: string) => { store.set(key, value) },
    delete: async (key: string) => { store.delete(key) },
    list: async ({ prefix = '' }: { prefix?: string } = {}) => ({ keys: [...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }),
  }
}

const env = () => ({
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', BUSINESS_ID: 'easy-beans', OAUTH_KV: memoryKv(),
}) as unknown as Env
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext
const send = (e: Env, url: string, init: RequestInit = {}) =>
  worker.fetch!(new Request(url, init) as Request<unknown, IncomingRequestCfProperties>, e, ctx())

describe('The AI connector on the backup address', () => {
  it('names the backup address in its discovery files', async () => {
    const e = env()
    const resource = await (await send(e, `${WORKER}/.well-known/oauth-protected-resource/mcp`, { headers: VIA_BACKUP })).json()
    expect(resource).toMatchObject({ resource: `${BACKUP}/mcp`, authorization_servers: [BACKUP] })
    const server = await (await send(e, `${WORKER}/.well-known/oauth-authorization-server`, { headers: VIA_BACKUP })).json()
    expect(server).toMatchObject({
      issuer: BACKUP, authorization_endpoint: `${BACKUP}/authorize`, token_endpoint: `${BACKUP}/token`,
      registration_endpoint: `${BACKUP}/register`, protected_resources: [`${BACKUP}/mcp`],
    })
  })

  it('sends an AI without a token to sign in at the backup address', async () => {
    const res = await send(env(), `${WORKER}/mcp`, {
      method: 'POST', headers: { ...VIA_BACKUP, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain(`resource_metadata="${BACKUP}/.well-known/oauth-protected-resource/mcp"`)
  })

  it('registers the AI and opens the sign-in page for the backup address, never cached', async () => {
    const e = env()
    const registered = await send(e, `${WORKER}/register`, {
      method: 'POST', headers: { ...VIA_BACKUP, 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }),
    })
    expect(registered.status).toBe(201)
    const { client_id } = await registered.json() as { client_id: string }
    const query = new URLSearchParams({
      response_type: 'code', client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', state: 'x',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuJjtgezVPg', code_challenge_method: 'S256', resource: `${BACKUP}/mcp`,
    })
    const page = await send(e, `${WORKER}/authorize?${query}`, { headers: VIA_BACKUP })
    expect(page.status).toBe(200)
    expect(page.headers.get('cache-control')).toBe('no-store')
    expect(await page.text()).toContain('Connect Claude')
  })

  it('keeps the Worker’s own address when the request didn’t come through the backup', async () => {
    for (const headers of [{}, { 'x-forwarded-host': 'someone-else.example' }] as Record<string, string>[]) {
      const resource = await (await send(env(), `${WORKER}/.well-known/oauth-protected-resource/mcp`, { headers })).json()
      expect(resource).toMatchObject({ resource: `${WORKER}/mcp`, authorization_servers: [WORKER] })
    }
    const own = await (await send(env(), `${businessConfig.appUrl}/.well-known/oauth-protected-resource/mcp`)).json()
    expect(own).toMatchObject({ resource: `${businessConfig.appUrl}/mcp` })
  })

  it('moves only the connector’s paths: the rest of the app keeps its address', () => {
    for (const path of ['/api/integrations/google/callback', '/', '/api/v1/tools', '/mcp-guide', '/.well-known/assetlinks.json']) {
      const req = new Request(`${WORKER}${path}`, { headers: VIA_BACKUP })
      expect(asBackupAddress(req)).toBe(req)
    }
    for (const path of ['/mcp', '/authorize?x=1', '/token', '/register', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource/mcp']) {
      expect(asBackupAddress(new Request(`${WORKER}${path}`, { headers: VIA_BACKUP })).url).toBe(`${BACKUP}${path}`)
    }
  })
})
