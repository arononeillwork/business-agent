import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error: a plain .mjs ops script, without types
import { check, deployToRerun, recentRestart, supabaseFrom, watch, whatFailed } from './supabaseHealth.mjs'

const supabase = { url: 'https://example.supabase.co', key: 'sb_publishable_x' }
const answer = (status: number) => async () => new Response(null, { status })
const hang = async (_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
  init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
})

describe('the Supabase watchdog', () => {
  it('reads the address and key the Worker uses', () => {
    const { url, key } = supabaseFrom(readFileSync('wrangler.jsonc', 'utf8'))
    expect(url).toMatch(/^https:\/\/\w+\.supabase\.co$/)
    expect(key).toMatch(/^sb_publishable_/)
  })

  it('counts Supabase as up when sign-in and the data API answer, a refusal included', async () => {
    expect(await check(supabase, answer(200))).toEqual({ ok: true, auth: null, data: null })
    // A 4xx is Supabase answering: never a reason to restart it.
    expect(await check(supabase, answer(401))).toEqual({ ok: true, auth: null, data: null })
  })

  it('counts a server error, an unreachable server or no answer as down', async () => {
    expect(await check(supabase, answer(544))).toEqual({ ok: false, auth: 'answered 544', data: 'answered 544' })
    const unreachable = async () => { throw new TypeError('fetch failed') }
    expect((await check(supabase, unreachable)).data).toBe('unreachable (fetch failed)')
    expect(await check(supabase, hang, 50)).toEqual({ ok: false, auth: 'no answer in 0.05s', data: 'no answer in 0.05s' })
  })

  it('names the part that froze when only sign-in hangs', async () => {
    const authHangs = (url: string, init: RequestInit) => (url.includes('/auth/') ? hang(url, init) : answer(200)())
    expect(await check(supabase, authHangs, 50)).toEqual({ ok: false, auth: 'no answer in 0.05s', data: null })
  })

  it("doesn't start a restart while one is running or started in the last half hour", () => {
    const now = Date.parse('2026-10-31T18:00:00Z')
    const old = { status: 'completed', created_at: '2026-10-31T17:00:00Z' }
    expect(recentRestart([old], now)).toBeNull()
    expect(recentRestart([{ status: 'completed', created_at: '2026-10-31T17:45:00Z' }, old], now)).not.toBeNull()
    expect(recentRestart([{ status: 'in_progress', created_at: '2026-10-31T16:00:00Z' }], now)).not.toBeNull()
  })
})

describe('watching for a while', () => {
  const up = { ok: true, auth: null, data: null }
  const down = { ok: false, auth: 'no answer in 20s', data: null }
  /** Answers in turn (the last one again once they run out), and the minutes waited. */
  const scripted = (answers: typeof up[]) => {
    let n = 0
    const clock = { minutes: 0 }
    return { clock, look: async () => answers[Math.min(n++, answers.length - 1)], wait: async (ms: number) => { clock.minutes += ms / 60_000 } }
  }

  it('looks once a minute for as long as it was asked, then stops', async () => {
    const s = scripted([up])
    expect(await watch({ ...s, minutes: 300 })).toMatchObject({ frozen: false, stalls: [] })
    expect(s.clock.minutes).toBe(300)
  })

  it('one look when not asked to watch: the schedule’s old way', async () => {
    const s = scripted([up])
    expect(await watch({ ...s })).toMatchObject({ frozen: false })
    expect(s.clock.minutes).toBe(0)
  })

  it('notes a stall that passes and goes on watching', async () => {
    // Fine, then no answer for two looks, then fine again.
    const s = scripted([up, down, down, up])
    const notes: string[] = []
    expect(await watch({ ...s, minutes: 10, note: n => notes.push(n) })).toMatchObject({ frozen: false, stalls: [2] })
    expect(s.clock.minutes).toBe(10)
    expect(notes[0]).toBe('Supabase didn\'t answer (sign-in no answer in 20s); looking again every minute for 5 minutes.')
  })

  it('stops as soon as Supabase has gone five minutes without answering', async () => {
    const s = scripted([up, up, down])
    expect(await watch({ ...s, minutes: 300 })).toEqual({ frozen: true, last: down, stalls: [] })
    // Two good looks a minute apart, then the first bad one and five more minutes.
    expect(s.clock.minutes).toBe(7)
  })

  it('says what didn’t answer', () => {
    expect(whatFailed({ auth: 'no answer in 20s', data: 'answered 544' })).toBe('sign-in no answer in 20s; data API answered 544')
  })
})

describe('after a restart', () => {
  const now = Date.parse('2026-10-31T18:05:00Z')
  const failed = { id: 1, head_sha: 'ba15f90', status: 'completed', conclusion: 'failure', updated_at: '2026-10-31T17:27:00Z', run_attempt: 1 }

  it("runs again the failed deploy of main's latest commit", () => {
    expect(deployToRerun(failed, 'ba15f90', now).run).toBe(failed)
  })

  it('leaves alone a deploy that passed, is running, is of an older commit, is old or was tried enough', () => {
    expect(deployToRerun({ ...failed, conclusion: 'success' }, 'ba15f90', now)).toEqual({ run: null, why: 'the newest deploy passed' })
    expect(deployToRerun({ ...failed, status: 'in_progress' }, 'ba15f90', now).run).toBeNull()
    expect(deployToRerun(failed, '20efdae', now).run).toBeNull()
    expect(deployToRerun({ ...failed, updated_at: '2026-10-31T13:00:00Z' }, 'ba15f90', now).run).toBeNull()
    expect(deployToRerun({ ...failed, run_attempt: 4 }, 'ba15f90', now).run).toBeNull()
    expect(deployToRerun(undefined, 'ba15f90', now).run).toBeNull()
  })
})
