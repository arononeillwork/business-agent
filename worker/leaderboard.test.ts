// The Leaderboard's sales and each person's Square login, against stand-ins for Supabase and Square.
// What must never break:
//   - the whole team sees who sold most, but only owners (admins with pay access) see how much
//   - each Square payment counts for the person linked to the team member who took it; the rest is "not linked"
//   - no Square, a plan without takings, nobody linked or a connection without team members each say so
//   - only admins link Square logins; matching never guesses; adding someone twice never makes two
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { leaderboard } from './leaderboard'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import { SQUARE_SCOPES } from './providers/square'
import { TOOLS, runTool, toolsFor } from './tools'
import { serviceClient } from './supabase'
import type { Profile } from '../shared/types'
import { RECONNECT_TEAM, type SquareTeam } from '../shared/squareTeam'
import type { TillBoard } from '../shared/leaderboard'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', SQUARE_APP_ID: 'sq-app', SQUARE_APP_SECRET: 'sq-secret', SQUARE_WEBHOOK_SIGNATURE_KEY: 'sq-hook-key',
} as unknown as Env

let db: FakeSupabase
let apis: FakeProviders
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  // A shop manager (an admin without pay access).
  db.people.set('manager-token', { id: 'admin-2', role: 'admin' })
  // Who took each of the day's payments: Julio €3.50 and €12.00, Aron €9.00, and a failed one Julio's too.
  const who = ['TM_julio', 'TM_julio', 'TM_aron', 'TM_julio']
  apis.square.payments.forEach((p, i) => Object.assign(p, who[i] ? { team_member_id: who[i] } : {}))
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const headers = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' })
const get = (path: string, token = 'admin-token') => leaderboard.request(`${APP}${path}`, { headers: headers(token) }, env, ctx())
const post = (path: string, body: unknown, token = 'admin-token') =>
  leaderboard.request(`${APP}${path}`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) }, env, ctx())
const till = async (token = 'admin-token') => (await (await get('/api/leaderboard/till?from=2026-09-28&to=2026-09-29', token)).json()) as TillBoard

async function connectSquare() {
  const start = await integrations.request(`${APP}/api/integrations/square/start`, { method: 'POST', headers: headers('admin-token'), body: '{}' }, env, ctx())
  const auth = new URL((await start.json() as { url: string }).url)
  expect(auth.searchParams.get('scope')?.split(' ')).toEqual(expect.arrayContaining(['EMPLOYEES_READ', 'EMPLOYEES_WRITE']))
  const res = await integrations.request(`${APP}/api/integrations/square/callback?code=c&state=${encodeURIComponent(auth.searchParams.get('state')!)}`, {}, env, ctx())
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe('square')
}

describe('who sold most, from Square', () => {
  it('asks Square for team members when connecting', () => {
    expect(SQUARE_SCOPES).toEqual(expect.arrayContaining(['EMPLOYEES_READ', 'EMPLOYEES_WRITE']))
  })

  it('the team only, and a period that is one', async () => {
    expect((await leaderboard.request(`${APP}/api/leaderboard/till?from=2026-09-28&to=2026-09-29`, {}, env, ctx())).status).toBe(401)
    db.people.set('stranger-token', { id: 'nobody', role: 'partner' as never })
    expect((await get('/api/leaderboard/till?from=2026-09-28&to=2026-09-29', 'stranger-token')).status).toBe(403)
    expect((await get('/api/leaderboard/till?from=2026-09-29&to=2026-09-28')).status).toBe(400)
    expect((await get('/api/leaderboard/till?from=2026-01-01&to=2026-09-28')).status).toBe(400)
  })

  it('says why there is nothing: no takings on the plan, no Square, nobody linked, or a connection from before team members', async () => {
    db.plan.features = db.plan.features.filter(f => f !== 'takings')
    expect((await till()).status).toBe('plan')
    db.plan.features.push('takings')
    expect((await till()).status).toBe('not_connected')
    await connectSquare()
    expect((await till()).status).toBe('no_links')
    db.table('square_team_links').push({ profile_id: 'staff-1', team_member_id: 'TM_julio', created_in_square: false })
    apis.square.teamScope = false
    expect((await till()).status).toBe('reconnect')
  })

  it('counts each payment for the person linked to who took it; owners see how much, the rest of the team how many', async () => {
    await connectSquare()
    db.table('square_team_links').push({ profile_id: 'staff-1', team_member_id: 'TM_julio', created_in_square: false })
    const owner = await till()
    expect(owner.status).toBe('ok')
    // Julio: €3.50 and €12.00 (the failed one doesn't count); Aron took €9.00 but isn't linked.
    expect(owner.people).toEqual([{ profile_id: 'staff-1', sales: 2, gross: 15.5 }])
    expect(owner.unlinked).toEqual({ sales: 1, gross: 9 })
    const employee = await till('staff-token')
    expect(employee.people).toEqual([{ profile_id: 'staff-1', sales: 2, gross: null }])
    expect(employee.unlinked).toEqual({ sales: 1, gross: null })
    // A shop manager runs the shop without the takings.
    expect((await till('manager-token')).people[0].gross).toBeNull()
  })
})

describe('Square logins', () => {
  it('admins only; the team members from Square and who is linked to whom', async () => {
    expect((await get('/api/square-team', 'staff-token')).status).toBe(403)
    expect((await (await get('/api/square-team')).json() as SquareTeam).status).toBe('not_connected')
    await connectSquare()
    const team = await (await get('/api/square-team')).json() as SquareTeam
    expect(team.status).toBe('ok')
    expect(team.members.map(m => m.name)).toEqual(["Aron O'Neill", 'Julio', 'Sofía'])
    expect(team.members[0]).toMatchObject({ email: 'aron@example.com', is_owner: true, active: true })
    apis.square.teamScope = false
    expect((await (await get('/api/square-team')).json() as SquareTeam).status).toBe('reconnect')
    expect(((await (await post('/api/square-team/match', {})).json()) as { error: string }).error).toBe(RECONNECT_TEAM)
  })

  it('matches by email, then name, never guessing; links and unlinks by hand; one person per team member', async () => {
    await connectSquare()
    expect(await (await post('/api/square-team/match', {})).json()).toEqual({ linked: 2 })
    // Aron by his email; Julio by his name (his Square email is another); Sofía is nobody here.
    expect(db.table('square_team_links').map(l => [l.profile_id, l.team_member_id]).sort()).toEqual([['admin-1', 'TM_aron'], ['staff-1', 'TM_julio']])
    expect(await (await post('/api/square-team/match', {})).json()).toEqual({ linked: 0 })
    // Sofía's login is Maria's after all: moving Julio's to Maria takes it off Julio.
    expect((await post('/api/square-team/link', { profile_id: 'admin-2', team_member_id: 'TM_sofia' })).status).toBe(200)
    expect((await post('/api/square-team/link', { profile_id: 'admin-2', team_member_id: 'TM_julio' })).status).toBe(200)
    expect(db.table('square_team_links').map(l => [l.profile_id, l.team_member_id]).sort()).toEqual([['admin-1', 'TM_aron'], ['admin-2', 'TM_julio']])
    const gone = await post('/api/square-team/link', { profile_id: 'admin-2', team_member_id: 'TM_nobody' })
    expect((await gone.json() as { error: string }).error).toMatch(/doesn’t have that team member/)
    expect((await post('/api/square-team/link', { profile_id: 'someone-else', team_member_id: 'TM_aron' })).status).toBe(400)
    await post('/api/square-team/link', { profile_id: 'admin-2', team_member_id: null })
    expect(db.table('square_team_links').map(l => l.profile_id)).toEqual(['admin-1'])
    expect((await post('/api/square-team/link', { profile_id: 'admin-2', team_member_id: 'TM_sofia' }, 'staff-token')).status).toBe(403)
  })

  it('adds someone to Square at every location (once), linking them; someone there with their email is linked instead', async () => {
    await connectSquare()
    const added = await (await post('/api/square-team/add', { profile_id: 'admin-2' })).json() as { team_member_id: string; existing: boolean }
    expect(added.existing).toBe(false)
    const made = apis.square.teamMembers.find(m => m.id === added.team_member_id)!
    expect(made).toMatchObject({ given_name: 'Maria', email_address: 'maria@example.com', assigned_locations: { assignment_type: 'EXPLICIT_LOCATIONS', location_ids: ['L1'] } })
    expect(db.table('square_team_links').find(l => l.profile_id === 'admin-2')).toMatchObject({ team_member_id: added.team_member_id, created_in_square: true })
    // Already linked: not again.
    expect((await (await post('/api/square-team/add', { profile_id: 'admin-2' })).json() as { error: string }).error).toMatch(/linked to a Square login already/)
    // Aron is in Square with his email: linked, not added twice.
    expect(await (await post('/api/square-team/add', { profile_id: 'admin-1' })).json()).toEqual({ team_member_id: 'TM_aron', existing: true })
    expect(apis.square.teamMembers).toHaveLength(4)
    // Someone switched off can't be.
    expect((await (await post('/api/square-team/add', { profile_id: 'admin-gone' })).json() as { error: string }).error).toMatch(/Switch them on/)
  })
})

describe('the team_leaderboard tool for AI assistants', () => {
  it('the whole team’s places on time, streaks, hours and checklists, from the database’s figures', async () => {
    const asked: unknown[] = []
    db.rpcs.team_leaderboard = args => {
      asked.push(args)
      return [
        { profile_id: 'staff-1', clock_ins: 5, on_shift: 5, on_time: 4, late: 1, minutes: 1200, days: 5, starts: 'ooloo', ticks: 6 },
        { profile_id: 'admin-1', clock_ins: 3, on_shift: 3, on_time: 3, late: 0, minutes: 600, days: 3, starts: 'ooo', ticks: 0 },
      ]
    }
    const employee = { id: 'staff-1', full_name: 'Julio', role: 'employee', active: true, can_see_pay: false } as Profile
    expect(toolsFor(employee).map(t => t.name)).toContain('team_leaderboard')
    const out = await runTool(TOOLS.find(t => t.name === 'team_leaderboard')!, { sb: serviceClient(env), me: employee }, { from: '2026-11-02', to: '2026-11-08' }) as Record<string, Record<string, unknown>[]>
    expect(asked).toEqual([{ p_from: '2026-11-02', p_to: '2026-11-08' }])
    expect(out.on_time).toEqual([
      { place: 1, person: 'Aron', on_time: 3, on_shift: 3, late: 0, on_time_percent: 100 },
      { place: 2, person: 'Julio', on_time: 4, on_shift: 5, late: 1, on_time_percent: 80 },
    ])
    expect(out.longest_on_time_streak.map(r => [r.person, r.shifts_in_a_row])).toEqual([['Aron', 3], ['Julio', 2]])
    expect(out.hours_worked.map(r => [r.person, r.hours, r.days])).toEqual([['Julio', 20, 5], ['Aron', 10, 3]])
    expect(out.checklist_items_ticked).toEqual([{ place: 1, person: 'Julio', items: 6 }])
  })
})
