// Dashboards → Reports, sent: one email to each person from the connected mailbox; admins only; checked first.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { reports } from './reports'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret', MS_CLIENT_ID: 'ms-id', MS_CLIENT_SECRET: 'ms-secret',
} as unknown as Env
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

let db: FakeSupabase
let apis: FakeProviders
beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const headers = (who: 'admin' | 'staff') => ({ authorization: `Bearer ${who}-token`, 'content-type': 'application/json' })
const send = (body: unknown, who: 'admin' | 'staff' = 'admin') =>
  reports.request(`${APP}/api/reports/send`, { method: 'POST', headers: headers(who), body: JSON.stringify(body) }, env, ctx())

/** Connect Outlook as the business's mailbox (as on the Connections page). */
async function connectOutlook() {
  const start = await integrations.request(`${APP}/api/integrations/connect/outlook/start`, { method: 'POST', headers: headers('admin'), body: '{}' }, env, ctx())
  const auth = new URL((await start.json() as { url: string }).url)
  await integrations.request(`${APP}/api/integrations/microsoft/callback?code=the-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`, {}, env, ctx())
}

const report = { to: ['Torquino71@gmail.com', 'lola@gestoria.es', 'torquino71@gmail.com'], subject: 'Easy Beans Coffee: report for this week', text: 'TAKINGS\n• €1,200.00' }

describe('sending a report', () => {
  it('emails each person once, from the connected mailbox', async () => {
    await connectOutlook()
    const before = apis.microsoft.sent.length
    const res = await send(report)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sent: ['torquino71@gmail.com', 'lola@gestoria.es'], failed: [] })
    expect(apis.microsoft.sent.slice(before)).toEqual([
      { to: 'torquino71@gmail.com', subject: 'Easy Beans Coffee: report for this week' },
      { to: 'lola@gestoria.es', subject: 'Easy Beans Coffee: report for this week' },
    ])
  })

  it('says to connect a mailbox when there is none', async () => {
    const res = await send(report)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toMatch(/No mailbox connected/)
  })

  it('is for admins, and checks what it sends', async () => {
    expect((await send(report, 'staff')).status).toBe(403)
    const bad = await send({ ...report, to: ['not an email'] })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'One of the addresses isn’t an email address' })
    expect((await send({ ...report, to: [] })).status).toBe(400)
  })
})
