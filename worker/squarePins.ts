// Square PINs (Leaderboard): each person's Square Point of Sale passcode, typed in by an owner as it is in
// the Square Dashboard (Square's API can neither read nor set passcodes). Kept encrypted with the
// integration key in square_pins (the `square_pins` migration), a table only the Worker reads.
//   GET  /api/square-pins            owners: the whole team, with whether each has a PIN; anyone else: themselves
//   POST /api/square-pins/:id/show   the PIN: owners anyone's, anyone else only their own
//   PUT  /api/square-pins/:id        owners: save it ({ pin }) or take it away ({ pin: null })
// The team only (owners, shop managers, employees): not partners or the café tablet. Each look, change and
// removal goes in the audit log, without the PIN.
import { Hono, type Context, type Next } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, requestDb, userClient, type Env } from './supabase'
import { seal, unseal } from './crypto'
import { cleanPin, pinProblem, type SquarePins } from '../shared/squarePins'

type Vars = { userId: string; owner: boolean }
type Ctx = Context<{ Bindings: Env; Variables: Vars }>
export const squarePins = new Hono<{ Bindings: Env; Variables: Vars }>()

async function signedIn(c: Ctx, next: Next) {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const sb = userClient(c.env, token, 'app')
  const [{ data: user }, { data: staff }, { data: admin }, { data: pay }] = await Promise.all([
    sb.auth.getUser(token), sb.rpc('is_staff'), sb.rpc('is_admin'), sb.rpc('can_see_pay')])
  if (!user.user || !staff) return c.json({ error: 'Only the team has Square PINs' }, 403)
  if (!c.env.INTEGRATION_KEY) return c.json({ error: 'Square PINs are being set up' }, 503)
  c.set('userId', user.user.id)
  // An owner is an admin with pay access (shared/teamRoles.ts).
  c.set('owner', !!admin && !!pay)
  await next()
}
squarePins.use('/api/square-pins', signedIn)
squarePins.use('/api/square-pins/*', signedIn)

/** The team the PINs are for: active owners, shop managers and employees. */
async function team(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from('profiles').select('id').eq('active', true).in('role', ['admin', 'employee'])
  if (error) throw new Error(error.message)
  return (data ?? []).map(p => p.id as string)
}

/** A line in the audit log: who looked at, saved or removed whose PIN (never the PIN). */
async function logged(db: SupabaseClient, actor: string, profileId: string, action: 'show' | 'set' | 'clear') {
  await db.from('audit_log').insert({ actor, via: 'app', table_name: 'square_pins', row_id: profileId, action })
}

const nothingKept = { 'cache-control': 'no-store' }

squarePins.get('/api/square-pins', async c => {
  const db = await requestDb(c)
  const owner = c.get('owner'), me = c.get('userId')
  const [people, { data: rows, error }] = await Promise.all([team(db), db.from('square_pins').select('profile_id, updated_at')])
  if (error) return c.json({ error: error.message }, 500)
  const saved = new Map((rows ?? []).map(r => [r.profile_id as string, r.updated_at as string]))
  const listed = owner ? people : people.filter(id => id === me)
  const out: SquarePins = { owner, people: listed.map(id => ({ profile_id: id, set: saved.has(id), updated_at: saved.get(id) ?? null })) }
  return c.json(out)
})

squarePins.post('/api/square-pins/:id/show', async c => {
  const id = c.req.param('id'), me = c.get('userId')
  if (!c.get('owner') && id !== me) return c.json({ error: 'You can see only your own Square PIN' }, 403)
  const db = await requestDb(c)
  const { data } = await db.from('square_pins').select('ciphertext').eq('profile_id', id).maybeSingle()
  if (!data) return c.json({ error: 'No Square PIN is saved for them yet' }, 404)
  const { pin } = await unseal<{ pin: string }>(c.env.INTEGRATION_KEY!, data.ciphertext as string)
  await logged(db, me, id, 'show')
  return c.json({ pin }, 200, nothingKept)
})

squarePins.put('/api/square-pins/:id', async c => {
  if (!c.get('owner')) return c.json({ error: 'Only an owner changes Square PINs' }, 403)
  const id = c.req.param('id'), me = c.get('userId')
  const db = await requestDb(c)
  if (!(await team(db)).includes(id)) return c.json({ error: 'That person isn’t on the team' }, 404)
  const { pin } = await c.req.json<{ pin?: string | null }>().catch(() => ({ pin: undefined }))
  if (pin === null || (typeof pin === 'string' && !cleanPin(pin))) {
    const { error } = await db.from('square_pins').delete().eq('profile_id', id)
    if (error) return c.json({ error: error.message }, 500)
    await logged(db, me, id, 'clear')
    return c.json({ ok: true })
  }
  const problem = typeof pin === 'string' ? pinProblem(pin) : 'A Square PIN is 4 digits (up to 6)'
  if (problem) return c.json({ error: problem }, 400)
  const { error } = await db.from('square_pins').upsert({
    profile_id: id, ciphertext: await seal(c.env.INTEGRATION_KEY!, { pin: cleanPin(pin!) }), updated_at: new Date().toISOString(), updated_by: me,
  }, { onConflict: 'business_id,profile_id' })
  if (error) return c.json({ error: error.message }, 500)
  await logged(db, me, id, 'set')
  return c.json({ ok: true })
})
