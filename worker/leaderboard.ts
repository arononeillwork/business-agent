// Leaderboard (Team section): who sold most, from Square, and each person's own Square login.
// - GET /api/leaderboard/till?from&to: the team (owners, shop managers, employees). Each Square payment
//   says which team member took it; people are linked to their team member (square_team_links). Everyone
//   sees how many sales each person rang up; only owners (admins with pay access) see the amounts, as
//   with takings. Kept like takings (15 minutes, a day once the period is over); a plan without takings,
//   no Square, a connection made before team members were asked for, or nobody linked, each says so.
// - /api/square-team…: admins. The Square team members and who's linked to whom; link someone (or
//   unlink), link everyone the app can match by email then name, or add someone to Square. Square
//   doesn't let apps set a passcode: the owner sets it in the Square Dashboard (shared/squareTeam.ts).
import { Hono, type Context } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, requestDb, userClient, type Env } from './supabase'
import { connectedOf, explain, lasting, markBroken, squareSession } from './connections'
import { cached, forget } from './cache'
import { planFeatures } from './billing'
import * as square from './providers/square'
import { emptyTill, type TillBoard } from '../shared/leaderboard'
import { RECONNECT_TEAM, addProblem, splitName, squarePhone, suggestLinks, type SquareLink, type SquareMember, type SquareTeam } from '../shared/squareTeam'
import { takingsMinutes } from '../shared/refresh'
import { addDays, zonedIso } from '../shared/time'

type Vars = { admin: boolean; pay: boolean; userId: string }
type Ctx = Context<{ Bindings: Env; Variables: Vars }>
export const leaderboard = new Hono<{ Bindings: Env; Variables: Vars }>()

/** Something to tell the admin as it is (who can't be added, a period that isn't one). */
class TeamError extends Error {}

const missingScope = (e: unknown) => e instanceof square.SquareError && e.code === 'INSUFFICIENT_SCOPES'

/** Signed in and on the team; for /api/square-team, an admin. */
async function signedIn(c: Ctx, admins: boolean) {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const sb = userClient(c.env, token, 'app')
  const [{ data: user }, { data: staff }, { data: admin }, { data: pay }] = await Promise.all([
    sb.auth.getUser(token), sb.rpc('is_staff'), sb.rpc('is_admin'), sb.rpc('can_see_pay')])
  if (!user.user || !staff) return c.json({ error: 'Only the team sees the leaderboard' }, 403)
  if (admins && !admin) return c.json({ error: 'Only an admin can link Square logins' }, 403)
  c.set('userId', user.user.id)
  c.set('admin', !!admin)
  c.set('pay', !!pay)
  return null
}
leaderboard.use('/api/leaderboard/*', async (c, next) => (await signedIn(c, false)) ?? next())
leaderboard.use('/api/square-team', async (c, next) => (await signedIn(c, true)) ?? next())
leaderboard.use('/api/square-team/*', async (c, next) => (await signedIn(c, true)) ?? next())

/** Square failed: a lasting failure turns its Connections card red; plain words either way. */
async function failure(db: SupabaseClient, e: unknown) {
  if (e instanceof TeamError) return e.message
  if (missingScope(e)) return RECONNECT_TEAM
  const why = explain('square', e)
  if (lasting('square', e)) await markBroken(db, 'square', why)
  return why
}

const memberOf = (m: square.SquareTeamMember): SquareMember => ({
  id: m.id, name: [m.given_name, m.family_name].filter(Boolean).join(' ').trim() || m.email_address || m.id,
  email: m.email_address ?? null, phone: m.phone_number ?? null, is_owner: !!m.is_owner, active: m.status !== 'INACTIVE',
})

async function links(db: SupabaseClient): Promise<SquareLink[]> {
  const { data, error } = await db.from('square_team_links').select('profile_id, team_member_id, created_in_square')
  if (error) throw new Error(error.message)
  return (data ?? []) as SquareLink[]
}

// ---------------------------------------------------------------------------------------------
// Who sold most
// ---------------------------------------------------------------------------------------------
leaderboard.get('/api/leaderboard/till', async c => {
  const from = c.req.query('from') ?? '', to = c.req.query('to') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to || to > addDays(from, 92)) {
    return c.json({ error: 'Give a period of up to three months (from and to, YYYY-MM-DD)' }, 400)
  }
  const db = await requestDb(c)
  if (!(await planFeatures(c.env, db.businessId)).has('takings')) return c.json(emptyTill('plan'))
  if (await connectedOf(db, ['square'] as const) !== 'square') return c.json(emptyTill('not_connected'))
  const linked = await links(db)
  if (!linked.length) return c.json(emptyTill('no_links'))
  const fromIso = zonedIso(from, '00:00'), toIso = zonedIso(addDays(to, 1), '00:00')
  try {
    // Under sales:square:, so it's forgotten with the rest of Square's figures when Square is connected again.
    const { data, fetched_at } = await cached(db, `sales:square:team:${fromIso}:${toIso}`, takingsMinutes(toIso), async () => {
      const s = await squareSession(c.env, db)
      // Team members first: a connection without EMPLOYEES_READ asks to connect again rather than counting sales for nobody.
      await square.teamMembers(s.sandbox, s.token)
      return square.salesByTeamMember(s.sandbox, s.token, s.locationIds, fromIso, toIso)
    })
    const pay = c.get('pay')
    const who = new Map(linked.map(l => [l.team_member_id, l.profile_id]))
    const board: TillBoard = { ...emptyTill('ok'), currency: data.currency, fetched_at }
    let unlinked = 0, unlinkedGross = 0
    for (const [member, v] of Object.entries(data.byMember)) {
      const person = who.get(member)
      if (!person) { unlinked += v.sales; unlinkedGross += v.gross; continue }
      board.people.push({ profile_id: person, sales: v.sales, gross: pay ? v.gross : null })
    }
    board.unlinked = { sales: unlinked, gross: pay ? Math.round(unlinkedGross * 100) / 100 : null }
    return c.json(board)
  } catch (e) {
    if (missingScope(e)) return c.json(emptyTill('reconnect'))
    return c.json({ error: await failure(db, e) }, 400)
  }
})

// ---------------------------------------------------------------------------------------------
// Square logins (admins)
// ---------------------------------------------------------------------------------------------
/** The team members, read from Square each time (they change there). */
async function readTeam(env: Env, db: SupabaseClient) {
  const s = await squareSession(env, db)
  return { s, members: (await square.teamMembers(s.sandbox, s.token)).map(memberOf) }
}

async function team(env: Env, db: SupabaseClient): Promise<SquareTeam> {
  if (await connectedOf(db, ['square'] as const) !== 'square') return { status: 'not_connected', members: [], links: [] }
  try {
    const [{ members }, linked] = await Promise.all([readTeam(env, db), links(db)])
    return { status: 'ok', members, links: linked }
  } catch (e) {
    if (missingScope(e)) return { status: 'reconnect', members: [], links: await links(db) }
    throw e
  }
}

/** The people who can have a Square login: active owners, shop managers and employees. */
async function teamPeople(db: SupabaseClient) {
  const { data, error } = await db.from('profiles').select('id, full_name, email, phone, role, active').in('role', ['admin', 'employee'])
  if (error) throw new Error(error.message)
  return (data ?? []) as { id: string; full_name: string; email: string | null; phone: string | null; role: string; active: boolean }[]
}

/** Link (or move) one person to a team member; the team member can only be one person's. */
async function link(db: SupabaseClient, by: string, profileId: string, memberId: string, created = false) {
  await db.from('square_team_links').delete().eq('team_member_id', memberId).neq('profile_id', profileId)
  const { error } = await db.from('square_team_links').upsert(
    { profile_id: profileId, team_member_id: memberId, created_in_square: created, linked_at: new Date().toISOString(), linked_by: by },
    { onConflict: 'business_id,profile_id' })
  if (error) throw new Error(error.message)
  // The figures are worked out from the links: a new one shows straight away.
  await forget(db, 'sales:square:team:')
}

leaderboard.get('/api/square-team', async c => {
  const db = await requestDb(c)
  try {
    return c.json(await team(c.env, db))
  } catch (e) {
    return c.json({ error: await failure(db, e) }, 400)
  }
})

// Link someone to a Square team member, or unlink them (team_member_id null).
leaderboard.post('/api/square-team/link', async c => {
  const db = await requestDb(c)
  const { profile_id, team_member_id } = await c.req.json<{ profile_id?: string; team_member_id?: string | null }>().catch(() => ({} as Record<string, undefined>))
  try {
    const people = await teamPeople(db)
    if (!profile_id || !people.some(p => p.id === profile_id)) throw new TeamError('That person isn’t on the team')
    if (!team_member_id) {
      await db.from('square_team_links').delete().eq('profile_id', profile_id)
      await forget(db, 'sales:square:team:')
      return c.json({ ok: true })
    }
    if (await connectedOf(db, ['square'] as const) !== 'square') throw new TeamError('Connect Square on the Connections page first')
    const s = await squareSession(c.env, db)
    if (!await square.teamMember(s.sandbox, s.token, team_member_id)) throw new TeamError('Square doesn’t have that team member any more. Choose another.')
    await link(db, c.get('userId'), profile_id, team_member_id)
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: await failure(db, e) }, 400)
  }
})

// Link everyone the app can match: the same email first, then the same name.
leaderboard.post('/api/square-team/match', async c => {
  const db = await requestDb(c)
  try {
    const t = await team(c.env, db)
    if (t.status === 'not_connected') throw new TeamError('Connect Square on the Connections page first')
    if (t.status === 'reconnect') throw new TeamError(RECONNECT_TEAM)
    const people = (await teamPeople(db)).filter(p => p.active)
    const found = suggestLinks(people, t.members, t.links)
    for (const f of found) await link(db, c.get('userId'), f.profile_id, f.team_member_id)
    return c.json({ linked: found.length })
  } catch (e) {
    return c.json({ error: await failure(db, e) }, 400)
  }
})

// Add someone to Square as a team member at every location, and link them. Someone already in Square
// with their email is linked instead of added twice.
leaderboard.post('/api/square-team/add', async c => {
  const db = await requestDb(c)
  const { profile_id } = await c.req.json<{ profile_id?: string }>().catch(() => ({ profile_id: undefined }))
  try {
    const person = (await teamPeople(db)).find(p => p.id === profile_id)
    if (!person) throw new TeamError('That person isn’t on the team')
    const t = await team(c.env, db)
    if (t.status === 'not_connected') throw new TeamError('Connect Square on the Connections page first')
    if (t.status === 'reconnect') throw new TeamError(RECONNECT_TEAM)
    const problem = addProblem(person, t.links.some(l => l.profile_id === person.id))
    if (problem) throw new TeamError(problem)
    const same = suggestLinks([person], t.members.filter(m => !!m.email), t.links).find(f => f.by === 'email')
    if (same) {
      await link(db, c.get('userId'), person.id, same.team_member_id)
      return c.json({ team_member_id: same.team_member_id, existing: true })
    }
    const s = await squareSession(c.env, db)
    const m = await square.createTeamMember(s.sandbox, s.token, `ba${db.businessId}-${person.id.replace(/-/g, '')}`, {
      ...splitName(person.full_name), email_address: person.email, phone_number: squarePhone(person.phone), location_ids: s.locationIds,
    })
    await link(db, c.get('userId'), person.id, m.id, true)
    return c.json({ team_member_id: m.id, existing: false })
  } catch (e) {
    return c.json({ error: await failure(db, e) }, 400)
  }
})
