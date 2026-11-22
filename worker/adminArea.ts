// The admin area (/admin): The Business Agent's own back room on the site, opened with its PIN, no
// sign-in. The PIN is checked by the database (admin_area_unlock(), the admin_area migration), which
// counts wrong ones and gives a session's token; every other route here needs that token in the
// x-admin-session header. Everything is HQ's rows (business.is_hq), read and written as HQ
// (businessDb). First in it: the sales team's board, a lane per salesperson and a card per business.
import { Hono } from 'hono'
import { businessDb, serviceClient, type Env } from './supabase'
import { hmacHex } from './crypto'
import { cleanMemberName, cleanProspect, prospectError, type Prospect, type SalesMember } from '../shared/salesTeam'

type Vars = { hq: number }
export const adminArea = new Hono<{ Bindings: Env; Variables: Vars }>()

const LOCKED = 'Locked: type the PIN to open it again'
const NOT_SET_UP = 'The admin area isn’t set up yet'
const UNAVAILABLE = 'The admin area couldn’t be reached just now. Try again in a minute.'
const NO_STORE = { 'cache-control': 'no-store' }
const PROSPECT = 'id, member_id, name, stage, instagram, phone, email, website, town, notes, follow_up_on, created_at, updated_at'
const MEMBER = 'id, name, position'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Which business is HQ: the admin area is its own. */
async function hqOf(env: Env): Promise<number | null> {
  const { data } = await serviceClient(env).from('business').select('id').eq('is_hq', true).limit(1).maybeSingle()
  return data?.id ? (data.id as number) : null
}

/** The connection a PIN comes from, as an id made with a secret (never the address), for counting wrong ones. */
async function connectionOf(env: Env, hq: number, ip: string | undefined) {
  const secret = env.INTEGRATION_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
  return ip && secret ? (await hmacHex(secret, `admin-area|${hq}|${ip}`)).slice(0, 32) : ''
}

const body = async (c: { req: { json: () => Promise<unknown> } }) => {
  const b = await c.req.json().catch(() => null)
  return b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {}
}

adminArea.post('/api/admin-area/unlock', async c => {
  const { pin } = await body(c)
  if (typeof pin !== 'string' || !pin.trim()) return c.json({ error: 'Type the PIN' }, 400)
  const hq = await hqOf(c.env)
  if (!hq) return c.json({ error: NOT_SET_UP }, 503)
  const { data, error } = await businessDb(c.env, hq).rpc('admin_area_unlock', {
    p_pin: pin.trim(), p_from: await connectionOf(c.env, hq, c.req.header('cf-connecting-ip')) })
  if (error) return c.json({ error: UNAVAILABLE }, 503)
  const r = (data ?? {}) as { token?: string; expires_at?: string; error?: string }
  if (r.error === 'wrong') return c.json({ error: 'That isn’t the PIN' }, 401)
  if (r.error === 'too_many') return c.json({ error: 'Too many wrong PINs. Try again in 15 minutes.' }, 429)
  if (!r.token || !r.expires_at) return c.json({ error: NOT_SET_UP }, 503)
  return c.json({ token: r.token, expires_at: r.expires_at }, 200, NO_STORE)
})

// Everything else: only with a session's token.
adminArea.use('/api/admin-area/*', async (c, next) => {
  if (c.req.path === '/api/admin-area/unlock') return next()
  const token = c.req.header('x-admin-session') ?? ''
  if (!/^[0-9a-f]{64}$/.test(token)) return c.json({ error: LOCKED, locked: true }, 401)
  const hq = await hqOf(c.env)
  if (!hq) return c.json({ error: NOT_SET_UP }, 503)
  const { data, error } = await businessDb(c.env, hq).rpc('admin_area_session', { p_token: token })
  if (error) return c.json({ error: UNAVAILABLE }, 503)
  if (data !== true) return c.json({ error: LOCKED, locked: true }, 401)
  c.set('hq', hq)
  c.header('cache-control', 'no-store')
  await next()
})

adminArea.post('/api/admin-area/lock', async c => {
  await businessDb(c.env, c.get('hq')).rpc('admin_area_lock', { p_token: c.req.header('x-admin-session') })
  return c.json({ ok: true })
})

adminArea.post('/api/admin-area/pin', async c => {
  const { current, next } = await body(c)
  const hq = c.get('hq')
  const { data, error } = await businessDb(c.env, hq).rpc('admin_area_change_pin', {
    p_token: c.req.header('x-admin-session'), p_current: typeof current === 'string' ? current.trim() : null,
    p_new: typeof next === 'string' ? next.trim() : null, p_from: await connectionOf(c.env, hq, c.req.header('cf-connecting-ip')) })
  if (error) return c.json({ error: UNAVAILABLE }, 503)
  const r = (data ?? {}) as { ok?: boolean; error?: string }
  if (r.ok) return c.json({ ok: true })
  if (r.error === 'locked') return c.json({ error: LOCKED, locked: true }, 401)
  if (r.error === 'wrong') return c.json({ error: 'That isn’t the PIN in use now' }, 400)
  if (r.error === 'too_many') return c.json({ error: 'Too many wrong PINs. Try again in 15 minutes.' }, 429)
  return c.json({ error: 'The new PIN is 4 to 12 digits' }, 400)
})

// ---------------------------------------------------------------------------------------------
// The sales team's board
// ---------------------------------------------------------------------------------------------

adminArea.get('/api/admin-area/sales', async c => {
  const db = businessDb(c.env, c.get('hq'))
  const [team, prospects] = await Promise.all([
    db.from('sales_team').select(MEMBER).order('position').order('name'),
    db.from('sales_prospects').select(PROSPECT).order('updated_at', { ascending: false }),
  ])
  if (team.error || prospects.error) return c.json({ error: UNAVAILABLE }, 503)
  return c.json({ team: team.data as SalesMember[], prospects: prospects.data as Prospect[] })
})

adminArea.post('/api/admin-area/sales/team', async c => {
  const name = cleanMemberName((await body(c)).name)
  if (!name) return c.json({ error: 'Give them a name' }, 400)
  const db = businessDb(c.env, c.get('hq'))
  const { data: last } = await db.from('sales_team').select('position').order('position', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await db.from('sales_team').insert({ name, position: ((last?.position as number | undefined) ?? 0) + 1 }).select(MEMBER).single()
  if (error) return c.json({ error: prospectError(error.message) }, 400)
  return c.json(data as SalesMember)
})

adminArea.patch('/api/admin-area/sales/team/:id', async c => {
  const id = c.req.param('id')
  if (!UUID.test(id)) return c.json({ error: 'No such salesperson' }, 404)
  const b = await body(c)
  const row: Record<string, unknown> = {}
  if ('name' in b) {
    const name = cleanMemberName(b.name)
    if (!name) return c.json({ error: 'Give them a name' }, 400)
    row.name = name
  }
  if ('position' in b) {
    if (!Number.isInteger(b.position)) return c.json({ error: 'That isn’t a place in the order' }, 400)
    row.position = b.position
  }
  if (!Object.keys(row).length) return c.json({ error: 'Nothing to change' }, 400)
  const { data, error } = await businessDb(c.env, c.get('hq')).from('sales_team').update(row).eq('id', id).select(MEMBER).maybeSingle()
  if (error) return c.json({ error: prospectError(error.message) }, 400)
  if (!data) return c.json({ error: 'No such salesperson' }, 404)
  return c.json(data as SalesMember)
})

adminArea.delete('/api/admin-area/sales/team/:id', async c => {
  const id = c.req.param('id')
  if (!UUID.test(id)) return c.json({ error: 'No such salesperson' }, 404)
  // Their businesses stay on the board, in nobody's lane (the database sets that).
  const { error } = await businessDb(c.env, c.get('hq')).from('sales_team').delete().eq('id', id)
  if (error) return c.json({ error: UNAVAILABLE }, 503)
  return c.json({ ok: true })
})

/** Whether a lane is HQ's own salesperson's. */
async function onTheTeam(db: ReturnType<typeof businessDb>, id: unknown) {
  if (id === null || id === undefined) return true
  const { data } = await db.from('sales_team').select('id').eq('id', id as string).maybeSingle()
  return !!data
}

adminArea.post('/api/admin-area/sales/prospects', async c => {
  const clean = cleanProspect(await body(c), true)
  if ('error' in clean) return c.json({ error: clean.error }, 400)
  const db = businessDb(c.env, c.get('hq'))
  if (!await onTheTeam(db, clean.row.member_id)) return c.json({ error: 'Choose someone on the sales team' }, 400)
  const { data, error } = await db.from('sales_prospects').insert(clean.row).select(PROSPECT).single()
  if (error) return c.json({ error: prospectError(error.message) }, 400)
  return c.json(data as Prospect)
})

adminArea.patch('/api/admin-area/sales/prospects/:id', async c => {
  const id = c.req.param('id')
  if (!UUID.test(id)) return c.json({ error: 'That business isn’t on the board' }, 404)
  const clean = cleanProspect(await body(c), false)
  if ('error' in clean) return c.json({ error: clean.error }, 400)
  if (!Object.keys(clean.row).length) return c.json({ error: 'Nothing to change' }, 400)
  const db = businessDb(c.env, c.get('hq'))
  if (!await onTheTeam(db, clean.row.member_id)) return c.json({ error: 'Choose someone on the sales team' }, 400)
  const { data, error } = await db.from('sales_prospects').update(clean.row).eq('id', id).select(PROSPECT).maybeSingle()
  if (error) return c.json({ error: prospectError(error.message) }, 400)
  if (!data) return c.json({ error: 'That business isn’t on the board' }, 404)
  return c.json(data as Prospect)
})

adminArea.delete('/api/admin-area/sales/prospects/:id', async c => {
  const id = c.req.param('id')
  if (!UUID.test(id)) return c.json({ error: 'That business isn’t on the board' }, 404)
  const { error } = await businessDb(c.env, c.get('hq')).from('sales_prospects').delete().eq('id', id)
  if (error) return c.json({ error: UNAVAILABLE }, 503)
  return c.json({ ok: true })
})
