// Support tickets (the support_tickets migration): HQ's admins hear about "Something isn't working" at most
// once every 15 minutes, so the reports held back in between are told about by the Worker's minute job
// (public.alert_support_tickets(), which the database tests prove). The job asks once a minute, and a failure
// is kept as that job's, like any other.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { forgetErrorReports } from './errors'
import worker from './index'

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' } as unknown as Env

let db: FakeSupabase
let background: Promise<unknown>[]
const ctx = () => ({ waitUntil: (p: Promise<unknown>) => { background.push(p) }, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext
const minute = () => worker.scheduled!({ cron: '* * * * *', scheduledTime: Date.parse('2026-11-10T12:00:00Z'), noRetry() {} } as ScheduledController, env, ctx())

beforeEach(() => {
  db = new FakeSupabase()
  background = []
  forgetErrorReports()
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

describe('the minute job and support tickets', () => {
  it('asks the database to tell HQ about problem reports held back, once a minute', async () => {
    let asked = 0
    db.rpcs.alert_support_tickets = () => { asked++; return 2 }
    await minute()
    await Promise.allSettled(background)
    expect(asked).toBe(1)
  })

  it('keeps it as that job’s failure when the database can’t', async () => {
    await minute()
    await Promise.allSettled(background)
    expect(db.table('app_errors').find(r => r.source === 'cron: support alerts')).toMatchObject({ message: 'fake Supabase: no rpc alert_support_tickets' })
  })
})
