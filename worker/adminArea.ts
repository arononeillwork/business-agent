// The admin area (/admin): The Business Agent's own back room on the site, opened with its PIN, no
// sign-in. The PIN is checked by the database (admin_area_unlock(), the admin_area migration), which
// counts wrong ones and gives a session's token; every other route here needs that token in the
// x-admin-session header. Everything is HQ's rows (business.is_hq), read and written as HQ
// (businessDb). First in it: the sales team's board, a lane per salesperson and a card per business.
import { Hono } from 'hono'
import { businessDb, serviceClient, type Env } from './supabase'
import { hmacHex } from './crypto'
import { cleanMemberName, cleanProspect, prospectError, type Prospect, type SalesMember } from '../shared/salesTeam'
import { cleanTodo, earningsOf, isLoggedKind, type AdminTodo, type HqRep, type SalesActivity, type SalesTemplate } from '../shared/adminArea'
import type { RepIntroduction } from '../shared/hqReps'

type Vars = { hq: number }
export const adminArea = new Hono<{ Bindings: Env; Variables: Vars }>()

const LOCKED = 'Locked: type the PIN to open it again'
const NOT_SET_UP = 'The admin area isn’t set up yet'
const UNAVAILABLE = 'The admin area couldn’t be reached just now. Try again in a minute.'
const NO_STORE = { 'cache-control': 'no-store' }
const PROSPECT = 'id, member_id, name, stage, kind, introduction_id, instagram, phone, email, website, town, notes, follow_up_on, created_at, updated_at'
const MEMBER = 'id, name, position, rep_id'
const TODO = 'id, title, done, done_at, planned_on, category_id, sales_prospect_id, created_at'
const TEMPLATE = 'id, title, body, position'
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
  return c.json({ team: await withCodes(db, team.data as SalesMember[]), prospects: prospects.data as Prospect[] })
})

/** Each salesperson with their rep code (HQ's reps), for sign-up links and messages. */
async function withCodes(db: ReturnType<typeof businessDb>, team: SalesMember[]): Promise<SalesMember[]> {
  const ids = team.map(m => m.rep_id).filter((id): id is string => !!id)
  const { data } = ids.length ? await db.from('sales_reps').select('id, code').in('id', ids) : { data: [] }
  const code = new Map(((data ?? []) as { id: string; code: string }[]).map(r => [r.id, r.code]))
  return team.map(m => ({ ...m, code: m.rep_id ? code.get(m.rep_id) ?? null : null }))
}

adminArea.post('/api/admin-area/sales/team', async c => {
  const name = cleanMemberName((await body(c)).name)
  if (!name) return c.json({ error: 'Give them a name' }, 400)
  const db = businessDb(c.env, c.get('hq'))
  const { data: last } = await db.from('sales_team').select('position').order('position', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await db.from('sales_team').insert({ name, position: ((last?.position as number | undefined) ?? 0) + 1 }).select(MEMBER).single()
  if (error) return c.json({ error: prospectError(error.message) }, 400)
  // Everyone on the sales team has a rep code, so a café that signs up with it moves its card.
  const { data: rep } = await db.rpc('admin_area_give_code', { p_member: (data as SalesMember).id })
  const [member] = await withCodes(db, [{ ...(data as SalesMember), rep_id: (rep as string | null) ?? null }])
  return c.json(member)
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
  const db = businessDb(c.env, c.get('hq'))
  const { data, error } = await db.from('sales_team').update(row).eq('id', id).select(MEMBER).maybeSingle()
  if (error) return c.json({ error: prospectError(error.message) }, 400)
  if (!data) return c.json({ error: 'No such salesperson' }, 404)
  const member = data as SalesMember
  // Their rep (HQ's Sales reps & rewards) goes by the same name; the code stays.
  if (row.name && member.rep_id) await db.from('sales_reps').update({ name: row.name }).eq('id', member.rep_id)
  const [withCode] = await withCodes(db, [member])
  return c.json(withCode)
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

// ---------------------------------------------------------------------------------------------
// What happened with a contact
// ---------------------------------------------------------------------------------------------

/** Whether a card is on HQ's board. */
async function onTheBoard(db: ReturnType<typeof businessDb>, id: string) {
  if (!UUID.test(id)) return false
  const { data } = await db.from('sales_prospects').select('id').eq('id', id).maybeSingle()
  return !!data
}

adminArea.get('/api/admin-area/sales/prospects/:id/activity', async c => {
  const id = c.req.param('id')
  const db = businessDb(c.env, c.get('hq'))
  if (!await onTheBoard(db, id)) return c.json({ error: 'That business isn’t on the board' }, 404)
  const { data, error } = await db.from('sales_activity').select('id, prospect_id, kind, stage, note, at').eq('prospect_id', id).order('at', { ascending: false }).limit(200)
  if (error) return c.json({ error: UNAVAILABLE }, 503)
  return c.json(data as SalesActivity[])
})

adminArea.post('/api/admin-area/sales/prospects/:id/activity', async c => {
  const id = c.req.param('id')
  const { kind, note } = await body(c)
  if (!isLoggedKind(kind)) return c.json({ error: 'Choose what happened' }, 400)
  const text = typeof note === 'string' ? note.trim().slice(0, 2000) || null : null
  if (kind === 'note' && !text) return c.json({ error: 'Write the note' }, 400)
  const db = businessDb(c.env, c.get('hq'))
  if (!await onTheBoard(db, id)) return c.json({ error: 'That business isn’t on the board' }, 404)
  const { data, error } = await db.from('sales_activity').insert({ prospect_id: id, kind, note: text }).select('id, prospect_id, kind, stage, note, at').single()
  if (error) return c.json({ error: UNAVAILABLE }, 503)
  return c.json(data as SalesActivity)
})

// ---------------------------------------------------------------------------------------------
// Messages to send
// ---------------------------------------------------------------------------------------------

const cleanTemplate = (b: Record<string, unknown>, isNew: boolean): { row: Record<string, unknown> } | { error: string } => {
  const row: Record<string, unknown> = {}
  if ('title' in b || isNew) {
    const title = typeof b.title === 'string' ? b.title.trim().slice(0, 80) : ''
    if (!title) return { error: 'Give the message a name' }
    row.title = title
  }
  if ('body' in b || isNew) {
    const text = typeof b.body === 'string' ? b.body.trim().slice(0, 2000) : ''
    if (!text) return { error: 'Write the message' }
    row.body = text
  }
  return { row }
}

adminArea.get('/api/admin-area/sales/templates', async c => {
  const { data, error } = await businessDb(c.env, c.get('hq')).from('sales_templates').select(TEMPLATE).order('position').order('title')
  if (error) return c.json({ error: UNAVAILABLE }, 503)
  return c.json(data as SalesTemplate[])
})

adminArea.post('/api/admin-area/sales/templates', async c => {
  const clean = cleanTemplate(await body(c), true)
  if ('error' in clean) return c.json({ error: clean.error }, 400)
  const db = businessDb(c.env, c.get('hq'))
  const { data: last } = await db.from('sales_templates').select('position').order('position', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await db.from('sales_templates').insert({ ...clean.row, position: ((last?.position as number | undefined) ?? 0) + 1 }).select(TEMPLATE).single()
  if (error) return c.json({ error: UNAVAILABLE }, 503)
  return c.json(data as SalesTemplate)
})

adminArea.patch('/api/admin-area/sales/templates/:id', async c => {
  const id = c.req.param('id')
  if (!UUID.test(id)) return c.json({ error: 'No such message' }, 404)
  const clean = cleanTemplate(await body(c), false)
  if ('error' in clean) return c.json({ error: clean.error }, 400)
  if (!Object.keys(clean.row).length) return c.json({ error: 'Nothing to change' }, 400)
  const { data, error } = await businessDb(c.env, c.get('hq')).from('sales_templates').update(clean.row).eq('id', id).select(TEMPLATE).maybeSingle()
  if (error) return c.json({ error: UNAVAILABLE }, 503)
  if (!data) return c.json({ error: 'No such message' }, 404)
  return c.json(data as SalesTemplate)
})

adminArea.delete('/api/admin-area/sales/templates/:id', async c => {
  const id = c.req.param('id')
  if (!UUID.test(id)) return c.json({ error: 'No such message' }, 404)
  const { error } = await businessDb(c.env, c.get('hq')).from('sales_templates').delete().eq('id', id)
  if (error) return c.json({ error: UNAVAILABLE }, 503)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------------------------
// To-do: HQ's own list (the app's To-do page, signed in as HQ, shows the same jobs)
// ---------------------------------------------------------------------------------------------

/** The category and the contact a job names must be HQ's. */
async function todoLinksOk(db: ReturnType<typeof businessDb>, row: Record<string, unknown>) {
  if (typeof row.category_id === 'string' && !(await db.from('todo_categories').select('id').eq('id', row.category_id).maybeSingle()).data) return 'Choose a category'
  if (typeof row.sales_prospect_id === 'string' && !await onTheBoard(db, row.sales_prospect_id)) return 'Choose a contact'
  return null
}

adminArea.get('/api/admin-area/todos', async c => {
  const db = businessDb(c.env, c.get('hq'))
  // Jobs not done, and those done in the last 14 days.
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const [open, done, categories] = await Promise.all([
    db.from('todos').select(TODO).eq('done', false).order('created_at').limit(1000),
    db.from('todos').select(TODO).eq('done', true).gte('done_at', since).order('done_at', { ascending: false }).limit(200),
    db.from('todo_categories').select('id, name, colour').order('sort').order('name'),
  ])
  if (open.error || done.error || categories.error) return c.json({ error: UNAVAILABLE }, 503)
  return c.json({ todos: [...open.data as AdminTodo[], ...done.data as AdminTodo[]], categories: categories.data })
})

adminArea.post('/api/admin-area/todos', async c => {
  const clean = cleanTodo(await body(c), true)
  if ('error' in clean) return c.json({ error: clean.error }, 400)
  const db = businessDb(c.env, c.get('hq'))
  const bad = await todoLinksOk(db, clean.row)
  if (bad) return c.json({ error: bad }, 400)
  const { data, error } = await db.from('todos').insert(clean.row).select(TODO).single()
  if (error) return c.json({ error: UNAVAILABLE }, 503)
  return c.json(data as AdminTodo)
})

adminArea.patch('/api/admin-area/todos/:id', async c => {
  const id = c.req.param('id')
  if (!UUID.test(id)) return c.json({ error: 'No such job' }, 404)
  const clean = cleanTodo(await body(c), false)
  if ('error' in clean) return c.json({ error: clean.error }, 400)
  if (!Object.keys(clean.row).length) return c.json({ error: 'Nothing to change' }, 400)
  const db = businessDb(c.env, c.get('hq'))
  const bad = await todoLinksOk(db, clean.row)
  if (bad) return c.json({ error: bad }, 400)
  // Done or not: the database keeps the To-do board's column in step.
  const { data, error } = await db.from('todos').update(clean.row).eq('id', id).select(TODO).maybeSingle()
  if (error) return c.json({ error: UNAVAILABLE }, 503)
  if (!data) return c.json({ error: 'No such job' }, 404)
  return c.json(data as AdminTodo)
})

adminArea.delete('/api/admin-area/todos/:id', async c => {
  const id = c.req.param('id')
  if (!UUID.test(id)) return c.json({ error: 'No such job' }, 404)
  const { error } = await businessDb(c.env, c.get('hq')).from('todos').delete().eq('id', id)
  if (error) return c.json({ error: UNAVAILABLE }, 503)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------------------------
// Onboarding and the team's earnings: HQ's list of the businesses its reps brought, and its ledger
// ---------------------------------------------------------------------------------------------

adminArea.get('/api/admin-area/hq', async c => {
  const db = businessDb(c.env, c.get('hq'))
  const [intros, reps, rewards] = await Promise.all([
    db.from('rep_introductions').select('id, rep_id, name, kind, code, set_up_at, plan, status, billing_interval, first_paid_at, created_at')
      .order('created_at', { ascending: false }).limit(1000),
    db.from('sales_reps').select('id, name, code, active').order('name'),
    db.from('rep_rewards').select('rep_id, kind, status, amount').limit(20000),
  ])
  if (intros.error || reps.error || rewards.error) return c.json({ error: UNAVAILABLE }, 503)
  const ledger = rewards.data as { rep_id: string; kind: string; status: string; amount: number }[]
  const all = reps.data as HqRep[]
  return c.json({
    introductions: intros.data as RepIntroduction[],
    reps: all,
    earnings: Object.fromEntries(all.map(r => [r.id, earningsOf(ledger, r.id)])),
  })
})
