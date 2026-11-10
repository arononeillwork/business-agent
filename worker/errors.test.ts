// Error alerts without a third-party service (worker/errors.ts): the app's reports (POST /api/errors),
// the Worker's own unexpected errors and the scheduled jobs' failures, kept one row per kind of error, with
// HQ's admins told about a new kind, or one back after a quiet day. What must never break:
//   - a report is small (8 KB), from the app itself, and a few at a time from one address
//   - the same fault counts on one row however its numbers, ids and addresses change
//   - no tokens, email addresses, query strings or secret links are kept
//   - HQ hears about each kind once, again only after a quiet day, and a few an hour in all
//   - reporting an error never throws, and never holds up what comes after it
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errors, forgetErrorReports, reportError, REPORTS_PER_ADDRESS, SERVER_REPORTS_A_MINUTE, WINDOW_MS } from './errors'
import type { Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { ALERTS, MAX_REPORT_BYTES } from '../shared/appErrors'
import worker from './index'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', GIT_SHA: 'abc1234',
} as unknown as Env

let db: FakeSupabase
let background: Promise<unknown>[]
const ctx = () => ({ waitUntil: (p: Promise<unknown>) => { background.push(p) }, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext
let clock = 0

beforeEach(() => {
  db = new FakeSupabase()
  background = []
  clock = Date.now()
  forgetErrorReports(() => clock)
  // The Business Agent HQ, run by its admin, beside the café.
  db.table('business').push({ id: 7, name: 'The Business Agent HQ', timezone: 'Europe/Madrid', is_hq: true })
  db.table('profiles').push(
    { id: 'hq-admin', full_name: 'Aron at HQ', email: 'aron@hq.test', role: 'admin', active: true, business_id: 7 },
    { id: 'hq-gone', full_name: 'Gone from HQ', email: 'gone@hq.test', role: 'admin', active: false, business_id: 7 },
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const report = (body: unknown, headers: Record<string, string> = {}, withEnv = env) => errors.request(`${APP}/api/errors`, {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', origin: APP, ...headers },
}, withEnv, ctx())
const rows = () => db.table('app_errors')
const row = (source: string) => rows().find(r => r.source === source)
const told = () => db.table('notifications').filter(n => String(n.title).match(/^(New error|An error is back): /))
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

const crash = {
  kind: 'render', message: 'Cannot read properties of undefined (reading \'starts_at\')',
  stack: 'TypeError: Cannot read properties of undefined (reading \'starts_at\')\n    at WeekRow (https://app.test/assets/RotaPage-C81kq2Lm-r2.js:1:20412)',
  path: '/rota', build: 'index-Bf3x9QaL-r2', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)',
}

describe('the app’s error reports', () => {
  it('keeps one, signed out, with its stack, path, build and browser, and tells HQ’s active admins about a new kind once', async () => {
    const res = await report(crash)
    expect(res.status).toBe(204)
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({
      source: 'app', message: crash.message, times: 1, last_stack: crash.stack, last_path: '/rota', business_id: null, user_id: null,
      last_detail: { kind: 'render', build: 'index-Bf3x9QaL-r2', user_agent: crash.user_agent, version: 'abc1234' },
    })
    expect(rows()[0].fingerprint).toMatch(/^[0-9a-f]{32}$/)
    expect(told()).toHaveLength(1)
    expect(told()[0]).toMatchObject({ profile_id: 'hq-admin', business_id: 7, link: '/hq/businesses',
      title: 'New error: Cannot read properties of undefined (reading \'starts_at\')', body: 'In app. The details are on Businesses, under Errors.' })

    expect((await report({ ...crash, stack: crash.stack.replace('1:20412', '1:20999') })).status).toBe(204)
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({ times: 2, last_stack: expect.stringContaining('1:20999') })
    expect(told()).toHaveLength(1)
  })

  it('signed in: whose it was, the business and the person', async () => {
    expect((await report(crash, { authorization: 'Bearer staff-token' })).status).toBe(204)
    expect(rows()[0]).toMatchObject({ business_id: 1, user_id: 'staff-1' })
    // A sign-in that doesn't work is kept as nobody's, not refused.
    expect((await report({ ...crash, message: 'Another' }, { authorization: 'Bearer not-a-sign-in' })).status).toBe(204)
    expect(rows().find(r => r.message === 'Another')).toMatchObject({ user_id: null })
  })

  it('counts the same fault on one row however its numbers, ids and addresses change, and a different one apart', async () => {
    await report({ ...crash, message: 'Shift 123 not found (8f14e45f-ceea-467f-a0e6-3f9f4f2b1c11) at https://app.test/rota/12' })
    await report({ ...crash, message: 'Shift 98 not found (c9f0f895-fb98-4b91-9c2e-1b5ad4f7a0d2) at https://app.test/rota/40' })
    await report({ ...crash, message: 'Shift 7 not found (d3d94468-02a4-4c42-8b3e-5e9a7c2f1b00) at https://app.test/rota/3' })
    await report({ ...crash, message: 'Shift has no position' })
    expect(rows().map(r => r.times)).toEqual([3, 1])
    expect(rows()[0].message).toBe('Shift 7 not found (d3d94468-02a4-4c42-8b3e-5e9a7c2f1b00) at https://app.test/rota/3')
  })

  it('never keeps tokens, keys, email addresses, query strings or secret links', async () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJtYXJpYSJ9.c2lnbmF0dXJlLXNpZ25hdHVyZQ'
    await report({
      ...crash,
      message: `Failed for maria@example.com with ${jwt} at https://app.test/api/x?token=tok3n99#access_token=zzz (key ba_Q2x8Lm4Np6Rt)`,
      stack: `Error: Bearer ${jwt}\n    at https://app.test/display/9f8e7d6c5b4a39281706f5e4d3c2b1a0?x=1:1:2`,
      path: '/display/9f8e7d6c5b4a39281706f5e4d3c2b1a0?code=secret#refresh_token=r',
    })
    const kept = JSON.stringify(rows()[0])
    for (const secret of ['maria@example.com', jwt, 'tok3n99', 'zzz', 'ba_Q2x8Lm4Np6Rt', '9f8e7d6c5b4a39281706f5e4d3c2b1a0', 'secret', 'refresh_token']) {
      expect(kept).not.toContain(secret)
    }
    expect(rows()[0]).toMatchObject({ last_path: '/display/:token', message: expect.stringContaining('[email]') })
    expect(rows()[0].message).toContain('[token] at https://app.test/api/x (key [key])')
  })

  it('refuses one bigger than 8 KB, keeping nothing', async () => {
    const big = await report({ ...crash, stack: 'x'.repeat(MAX_REPORT_BYTES) })
    expect(big.status).toBe(413)
    // Said too big up front, it isn't read at all.
    const said = await report(crash, { 'content-length': String(MAX_REPORT_BYTES + 1) })
    expect(said.status).toBe(413)
    expect(rows()).toHaveLength(0)
    expect((await report({ ...crash, stack: 'x'.repeat(MAX_REPORT_BYTES - 1000) })).status).toBe(204)
    expect(String(rows()[0].last_stack).length).toBeLessThanOrEqual(4000)
  })

  it('refuses what isn’t a report, and reports from another site', async () => {
    expect((await report('not json')).status).toBe(400)
    expect((await report({ kind: 'render' })).status).toBe(400)
    expect((await report([crash])).status).toBe(400)
    expect((await report(crash, { origin: 'https://elsewhere.test' })).status).toBe(403)
    expect((await report(crash, { origin: '', 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect(rows()).toHaveLength(0)
  })

  it('takes a few from one address at a time: then 429 for ten minutes, while other addresses still get through', async () => {
    for (let i = 0; i < REPORTS_PER_ADDRESS; i++) expect((await report({ ...crash, message: `Crash ${i}` })).status).toBe(204)
    const over = await report(crash)
    expect(over.status).toBe(429)
    expect(over.headers.get('retry-after')).toBe('600')
    expect((await report(crash, { 'cf-connecting-ip': '198.51.100.4' })).status).toBe(204)
    clock += WINDOW_MS
    expect((await report(crash)).status).toBe(204)
  })

  it('without the service key (a computer running it locally) says thanks and keeps nothing', async () => {
    const res = await report(crash, {}, { ...env, SUPABASE_SERVICE_ROLE_KEY: undefined } as Env)
    expect(res.status).toBe(204)
    expect(rows()).toHaveLength(0)
  })
})

describe('telling HQ', () => {
  it('again when a kind is back after a quiet day, but never twice in a day', async () => {
    await report(crash)
    expect(told()).toHaveLength(1)
    Object.assign(rows()[0], { last_seen: hoursAgo(ALERTS.QUIET_HOURS + 1), alerted_at: hoursAgo(ALERTS.QUIET_HOURS + 1) })
    await report(crash)
    expect(told()).toHaveLength(2)
    expect(told()[1].title).toBe('An error is back: Cannot read properties of undefined (reading \'starts_at\')')
    await report(crash)
    expect(told()).toHaveLength(2)
    // Quiet a day, but told within the day: once the day is up.
    Object.assign(rows()[0], { last_seen: hoursAgo(25), alerted_at: hoursAgo(2) })
    await report(crash)
    expect(told()).toHaveLength(2)
    rows()[0].alerted_at = hoursAgo(25)
    await report(crash)
    expect(told()).toHaveLength(3)
  })

  it('five an hour in all; one held back is told about with its next report the hour after', async () => {
    for (let i = 1; i <= ALERTS.ALERTS_AN_HOUR + 2; i++) await report({ ...crash, message: `Something else broke: ${'x'.repeat(i)}` })
    expect(rows()).toHaveLength(7)
    expect(told()).toHaveLength(ALERTS.ALERTS_AN_HOUR)
    for (const r of rows()) if (r.alerted_at) r.alerted_at = hoursAgo(1.1)
    await report({ ...crash, message: `Something else broke: ${'x'.repeat(7)}` })
    expect(told()).toHaveLength(ALERTS.ALERTS_AN_HOUR + 1)
  })
})

describe('the Worker’s own errors', () => {
  it('an unexpected error is kept with its method and route, and answered as before', async () => {
    const res = await worker.fetch!(new Request(`${APP}/api/admin/invite`, {
      method: 'POST', headers: { authorization: 'Bearer admin-token', 'content-type': 'application/json' }, body: 'not json',
    }) as Request<unknown, IncomingRequestCfProperties>, env, ctx())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: expect.any(String) })
    await Promise.all(background)
    expect(row('worker POST /api/admin/invite')).toMatchObject({
      times: 1, last_path: '/api/admin/invite', business_id: 1, user_id: 'admin-1',
      last_detail: { method: 'POST', route: '/api/admin/invite', version: 'abc1234' },
    })
    expect(row('worker POST /api/admin/invite')!.last_stack).toBeTruthy()
  })

  it('a scheduled job that fails is kept as that job’s, and the night clears errors unseen for 90 days', async () => {
    db.rpcs.each_business = (a: Row) => (a.p_job === 'licence_reminders' ? 2 : 0)
    let cleared = 0
    db.rpcs.clear_old_app_errors = () => { cleared++; return 0 }
    await worker.scheduled!({ cron: '15 1 * * *', scheduledTime: Date.now(), noRetry() {} } as ScheduledController, env, ctx())
    await Promise.all(background)
    expect(row('cron: licence_reminders')).toMatchObject({ message: 'licence_reminders failed for 2 business(es)', times: 1, business_id: null })
    expect(cleared).toBe(1)
  })

  it('reportError never throws: Supabase down, no service key, or too many in a minute', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Supabase is down') }))
    await expect(reportError(env, 'cron: outbox', new Error('Instagram answered 500'), { business: 1 })).resolves.toBeUndefined()
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => db.handle(String(input instanceof Request ? input.url : input), init)!))
    await expect(reportError({ ...env, SUPABASE_SERVICE_ROLE_KEY: undefined } as Env, 'cron: outbox', 'no key')).resolves.toBeUndefined()
    expect(rows()).toHaveLength(0)
    forgetErrorReports(() => clock)
    for (let i = 0; i < SERVER_REPORTS_A_MINUTE + 3; i++) await reportError(env, `cron: job ${'x'.repeat(i)}`, new Error('Failed'), { business: 1 })
    expect(rows()).toHaveLength(SERVER_REPORTS_A_MINUTE)
    expect(rows()[0]).toMatchObject({ business_id: 1, message: 'Failed', last_detail: { version: 'abc1234' } })
    clock += 60_000
    await reportError(env, 'cron: a minute on', { message: 'a thrown object’s message only', password: 'never read' })
    expect(row('cron: a minute on')).toMatchObject({ message: 'a thrown object’s message only' })
    expect(JSON.stringify(row('cron: a minute on'))).not.toContain('never read')
  })
})
