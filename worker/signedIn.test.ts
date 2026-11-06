// Who signed in, asked of Supabase once and kept for 30 seconds (worker/signedIn.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KEEP_MS, expiresAt, forgetSignIns, signInCheck, signedInUser } from './signedIn'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' } as unknown as Env

/** A JWT-shaped sign-in that runs out at `exp` (seconds); only its claims are read, never trusted. */
const jwt = (exp: number) => `x.${btoa(JSON.stringify({ sub: 'admin-1', exp })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.sig`

let db: FakeSupabase
let asked: string[]
let clock: number
beforeEach(() => {
  db = new FakeSupabase()
  clock = Date.parse('2026-11-06T20:00:00Z')
  forgetSignIns(() => clock)
  asked = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    asked.push(new URL(url).pathname)
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${url}`)
    return res
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  forgetSignIns()
})

describe('signInCheck and signedInUser', () => {
  it('ask Supabase once, then answer from what they kept for 30 seconds', async () => {
    expect((await signInCheck(env, 'admin-token', 'is_admin')).data).toBe(true)
    expect((await signInCheck(env, 'admin-token', 'is_admin')).data).toBe(true)
    expect((await signedInUser(env, 'admin-token')).data.user?.id).toBe('admin-1')
    expect((await signedInUser(env, 'admin-token')).data.user?.id).toBe('admin-1')
    expect(asked).toEqual(['/rest/v1/rpc/is_admin', '/auth/v1/user'])

    clock += KEEP_MS - 1
    await signInCheck(env, 'admin-token', 'is_admin')
    expect(asked).toHaveLength(2)
    // After 30 seconds, Supabase is asked again (a role taken away shows by then).
    clock += 1
    db.people.set('admin-token', { id: 'admin-1', role: 'employee' })
    expect((await signInCheck(env, 'admin-token', 'is_admin')).data).toBe(false)
    expect(asked).toHaveLength(3)
  })

  it('keep each check and each sign-in apart', async () => {
    const [admin, staff, business, role] = await Promise.all([
      signInCheck(env, 'admin-token', 'is_admin'), signInCheck(env, 'staff-token', 'is_admin'),
      signInCheck(env, 'admin-token', 'current_business_id'), signInCheck(env, 'staff-token', 'my_role'),
    ])
    expect([admin.data, staff.data, business.data, role.data]).toEqual([true, false, 1, 'employee'])
    expect(asked).toHaveLength(4)
  })

  it('ask once for several asking at the same time', async () => {
    const answers = await Promise.all([1, 2, 3].map(() => signInCheck(env, 'admin-token', 'can_see_pay')))
    expect(new Set(answers.map(a => a.data)).size).toBe(1)
    expect(asked).toEqual(['/rest/v1/rpc/can_see_pay'])
  })

  it('never keep an error: the next request asks again', async () => {
    expect((await signedInUser(env, 'nobody-token')).data.user).toBeNull()
    expect((await signedInUser(env, 'nobody-token')).data.user).toBeNull()
    expect(asked).toEqual(['/auth/v1/user', '/auth/v1/user'])
  })

  it('keep nothing past the sign-in’s own expiry', async () => {
    const soon = jwt(Math.floor(clock / 1000) + 5)
    db.people.set(soon, { id: 'admin-1', role: 'admin' })
    await signInCheck(env, soon, 'is_admin')
    clock += 5_000
    await signInCheck(env, soon, 'is_admin')
    expect(asked).toHaveLength(2)
    // One already run out isn't kept at all.
    const gone = jwt(Math.floor(clock / 1000) - 60)
    db.people.set(gone, { id: 'admin-1', role: 'admin' })
    await signInCheck(env, gone, 'is_admin')
    await signInCheck(env, gone, 'is_admin')
    expect(asked).toHaveLength(4)
  })
})

describe('expiresAt', () => {
  it('reads when a JWT runs out, and nothing from anything else', () => {
    expect(expiresAt(jwt(1_800_000_000))).toBe(1_800_000_000_000)
    expect(expiresAt('admin-token')).toBeNull()
    expect(expiresAt('a.not-base64!.c')).toBeNull()
  })
})
