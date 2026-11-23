// The admin area (/admin), through the Worker's routes against a stand-in for Supabase. What must never break:
//   - the PIN goes to the database to check, with the connection as an id that isn't the address; wrong ones
//     and too many come back in plain words
//   - nothing but the PIN opens without a session's token, and an ended one says it's locked
//   - everything is HQ's rows; a business is tidied before it's kept, and a lane must be HQ's salesperson's
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminArea } from './adminArea'
import type { Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key',
} as unknown as Env
const HQ = 7
const TOKEN = 'a'.repeat(64)
const MARIA = '0b0e2f6c-1111-4c2d-8e3f-000000000001'
const JULIO = '0b0e2f6c-1111-4c2d-8e3f-000000000002'
const BOOTES = '0b0e2f6c-2222-4c2d-8e3f-000000000001'

let db: FakeSupabase
let calls: { name: string; args: Row; business: string | null }[]
// The business the last request to the database named.
let named: string | null
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext
const call = (path: string, init: RequestInit = {}) => adminArea.request(`${APP}${path}`, init, env, ctx())
const send = (method: string, path: string, body: unknown, token: string | null = TOKEN) => call(path, {
  method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9', ...(token ? { 'x-admin-session': token } : {}) },
  body: JSON.stringify(body),
})
const get = (path: string, token: string | null = TOKEN) => call(path, { headers: token ? { 'x-admin-session': token } : {} })

beforeEach(() => {
  db = new FakeSupabase()
  calls = []
  db.table('business').push({ id: 1, name: 'Easy Beans Coffee' }, { id: HQ, name: 'Business Agent HQ', is_hq: true })
  db.tables.sales_team = [{ id: MARIA, name: 'Maria Cortes', position: 1, business_id: HQ }, { id: JULIO, name: 'Julio Cesar', position: 2, business_id: HQ },
    // Another business's: never HQ's lane.
    { id: '0b0e2f6c-1111-4c2d-8e3f-000000000099', name: 'Lola', position: 1, business_id: 1 }]
  db.tables.sales_prospects = [{ id: BOOTES, member_id: MARIA, name: 'The Bootes Cafe', stage: 'to_contact', instagram: 'the_bootes_cafe', business_id: HQ,
    updated_at: '2026-11-22T10:00:00Z' }]
  const answer = (name: string, out: (args: Row) => unknown) => {
    db.rpcs[name] = args => { calls.push({ name, args, business: named }); return out(args) }
  }
  answer('admin_area_unlock', ({ p_pin }) => (p_pin === '1234568' ? { token: TOKEN, expires_at: '2026-11-22T22:00:00Z' } : p_pin === '9999' ? { error: 'too_many' } : { error: 'wrong' }))
  answer('admin_area_session', ({ p_token }) => p_token === TOKEN)
  answer('admin_area_lock', () => null)
  answer('admin_area_change_pin', ({ p_current, p_new }) => (p_current !== '1234568' ? { error: 'wrong' } : /^\d{4,12}$/.test(String(p_new)) ? { ok: true } : { error: 'bad_pin' }))
  // A rep (with a code) for a salesperson who has none, as admin_area_give_code() does.
  answer('admin_area_give_code', ({ p_member }) => {
    const m = db.tables.sales_team.find(x => x.id === p_member)!
    if (!m.rep_id) {
      const id = `rep-${String(m.name).split(' ')[0].toLowerCase()}`
      db.tables.sales_reps.push({ id, name: m.name, code: `${String(m.name).split(' ')[0].toUpperCase()}42`, active: true, business_id: HQ })
      m.rep_id = id
    }
    return m.rep_id
  })
  db.tables.sales_reps = [{ id: 'rep-julio', name: 'Julio', code: 'JULIO27', active: true, business_id: HQ },
    { id: 'rep-dani', name: 'Dani', code: 'DANI20', active: true, business_id: 1 }]
  db.tables.sales_team.find(m => m.id === JULIO)!.rep_id = 'rep-julio'
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    named = new Headers(init?.headers).get('x-business-id')
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('opening the admin area', () => {
  it('the right PIN gives a session, checked by the database as HQ, never cached', async () => {
    const res = await send('POST', '/api/admin-area/unlock', { pin: ' 1234568 ' }, null)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ token: TOKEN, expires_at: '2026-11-22T22:00:00Z' })
    expect(calls[0].name).toBe('admin_area_unlock')
    expect(calls[0].business).toBe(String(HQ))
    expect(calls[0].args.p_pin).toBe('1234568')
    // The connection, as an id that isn't the address.
    expect(calls[0].args.p_from).toMatch(/^[0-9a-f]{32}$/)
    expect(JSON.stringify(calls[0].args)).not.toContain('203.0.113.9')
  })

  it('a wrong PIN, or too many, in plain words', async () => {
    let res = await send('POST', '/api/admin-area/unlock', { pin: '1111' }, null)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'That isn’t the PIN' })
    res = await send('POST', '/api/admin-area/unlock', { pin: '9999' }, null)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Too many wrong PINs. Try again in 15 minutes.' })
    res = await send('POST', '/api/admin-area/unlock', {}, null)
    expect(res.status).toBe(400)
  })

  it('with no HQ, there is nothing to open', async () => {
    for (const b of db.table('business')) b.is_hq = false
    const res = await send('POST', '/api/admin-area/unlock', { pin: '1234568' }, null)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'The admin area isn’t set up yet' })
  })

  it('nothing else opens without a good session', async () => {
    for (const token of [null, 'nonsense', 'b'.repeat(64)]) {
      const res = await get('/api/admin-area/sales', token)
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Locked: type the PIN to open it again', locked: true })
    }
    expect((await send('POST', '/api/admin-area/sales/prospects', { name: 'X', phone: '600111222' }, null)).status).toBe(401)
    expect(db.tables.sales_prospects).toHaveLength(1)
  })

  it('locking ends the session; a new PIN needs the one in use', async () => {
    expect((await send('POST', '/api/admin-area/lock', {})).status).toBe(200)
    expect(calls.at(-1)).toMatchObject({ name: 'admin_area_lock', args: { p_token: TOKEN } })
    let res = await send('POST', '/api/admin-area/pin', { current: '0000', next: '4321' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'That isn’t the PIN in use now' })
    res = await send('POST', '/api/admin-area/pin', { current: '1234568', next: '12' })
    expect(await res.json()).toEqual({ error: 'The new PIN is 4 to 12 digits' })
    res = await send('POST', '/api/admin-area/pin', { current: '1234568', next: '4321' })
    expect(res.status).toBe(200)
  })
})

describe('the sales team’s board', () => {
  it('HQ’s team and businesses, nobody else’s', async () => {
    const res = await get('/api/admin-area/sales')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const board = await res.json() as { team: { name: string }[]; prospects: { name: string }[] }
    expect(board.team.map(m => m.name)).toEqual(['Maria Cortes', 'Julio Cesar'])
    expect(board.prospects.map(p => p.name)).toEqual(['The Bootes Cafe'])
  })

  it('a business added from its Instagram link: tidied, named from it, in the lane picked', async () => {
    const res = await send('POST', '/api/admin-area/sales/prospects', { instagram: 'https://www.instagram.com/roasted.spain/', member_id: JULIO })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: 'Roasted Spain', instagram: 'roasted.spain', stage: 'to_contact', member_id: JULIO })
    expect(db.tables.sales_prospects.at(-1)).toMatchObject({ business_id: HQ, instagram: 'roasted.spain' })
  })

  it('a kind of business: a garage, a barber; a café when none is said', async () => {
    let res = await send('POST', '/api/admin-area/sales/prospects', { instagram: 'thedpfcentre', business_type: 'garage', member_id: JULIO })
    expect(await res.json()).toMatchObject({ name: 'Thedpfcentre', business_type: 'garage' })
    res = await send('PATCH', `/api/admin-area/sales/prospects/${BOOTES}`, { business_type: 'barber' })
    expect(await res.json()).toMatchObject({ name: 'The Bootes Cafe', business_type: 'barber' })
    res = await send('PATCH', `/api/admin-area/sales/prospects/${BOOTES}`, { business_type: 'bakery' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Choose what kind of business it is' })
  })

  it('or from a phone number; what isn’t right is said, and nothing is kept', async () => {
    let res = await send('POST', '/api/admin-area/sales/prospects', { name: 'Café Lola', phone: '600 111 222', member_id: MARIA })
    expect(await res.json()).toMatchObject({ name: 'Café Lola', phone: '+34 600 111 222' })
    res = await send('POST', '/api/admin-area/sales/prospects', { name: 'Café Lola' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Add a way to reach them: Instagram, a phone number, an email or a website' })
    // Another business's salesperson isn't a lane here.
    res = await send('POST', '/api/admin-area/sales/prospects', { name: 'Bar Bea', phone: '600 333 444', member_id: '0b0e2f6c-1111-4c2d-8e3f-000000000099' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Choose someone on the sales team' })
    expect(db.tables.sales_prospects).toHaveLength(2)
  })

  it('moved to another stage and lane; taken off the board', async () => {
    let res = await send('PATCH', `/api/admin-area/sales/prospects/${BOOTES}`, { stage: 'demo', member_id: JULIO })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ stage: 'demo', member_id: JULIO, name: 'The Bootes Cafe' })
    res = await send('PATCH', `/api/admin-area/sales/prospects/${BOOTES}`, { stage: 'maybe' })
    expect(res.status).toBe(400)
    res = await send('PATCH', '/api/admin-area/sales/prospects/0b0e2f6c-2222-4c2d-8e3f-000000000404', { stage: 'won' })
    expect(res.status).toBe(404)
    expect((await send('DELETE', `/api/admin-area/sales/prospects/${BOOTES}`, {})).status).toBe(200)
    expect(db.tables.sales_prospects).toHaveLength(0)
  })

  it('someone joins the team at the end, is renamed, and leaves', async () => {
    let res = await send('POST', '/api/admin-area/sales/team', { name: '  Lola   Pérez ' })
    expect(await res.json()).toMatchObject({ name: 'Lola Pérez', position: 3 })
    expect((await send('POST', '/api/admin-area/sales/team', { name: ' ' })).status).toBe(400)
    res = await send('PATCH', `/api/admin-area/sales/team/${JULIO}`, { name: 'Julio César' })
    expect(await res.json()).toMatchObject({ id: JULIO, name: 'Julio César' })
    expect((await send('DELETE', `/api/admin-area/sales/team/${JULIO}`, {})).status).toBe(200)
    expect(db.tables.sales_team.map(m => m.name)).not.toContain('Julio César')
  })
})

describe('the sales team’s codes', () => {
  it('each salesperson has their rep code; someone new gets one', async () => {
    const board = await (await get('/api/admin-area/sales')).json() as { team: { name: string; code: string | null }[] }
    expect(board.team.map(m => [m.name, m.code])).toEqual([['Maria Cortes', null], ['Julio Cesar', 'JULIO27']])
    const res = await send('POST', '/api/admin-area/sales/team', { name: 'Lola Pérez' })
    expect(await res.json()).toMatchObject({ name: 'Lola Pérez', rep_id: 'rep-lola', code: 'LOLA42' })
    expect(calls.at(-1)).toMatchObject({ name: 'admin_area_give_code', business: String(HQ) })
  })

  it('renamed, their rep goes by the new name and keeps the code', async () => {
    const res = await send('PATCH', `/api/admin-area/sales/team/${JULIO}`, { name: 'Julio César' })
    expect(await res.json()).toMatchObject({ name: 'Julio César', code: 'JULIO27' })
    expect(db.tables.sales_reps.find(r => r.id === 'rep-julio')).toMatchObject({ name: 'Julio César', code: 'JULIO27' })
  })
})

describe('what happened with a contact', () => {
  it('a call logged, and the history newest first', async () => {
    db.tables.sales_activity = [{ id: 'a1', prospect_id: BOOTES, kind: 'added', stage: 'to_contact', note: null, at: '2026-11-20T10:00:00Z', business_id: HQ }]
    let res = await send('POST', `/api/admin-area/sales/prospects/${BOOTES}/activity`, { kind: 'call', note: ' Spoke to Ana, call back Friday ' })
    expect(await res.json()).toMatchObject({ prospect_id: BOOTES, kind: 'call', note: 'Spoke to Ana, call back Friday' })
    expect(db.tables.sales_activity.at(-1)).toMatchObject({ business_id: HQ })
    db.tables.sales_activity.at(-1)!.at = '2026-11-22T10:00:00Z'
    res = await get(`/api/admin-area/sales/prospects/${BOOTES}/activity`)
    expect((await res.json() as { kind: string }[]).map(a => a.kind)).toEqual(['call', 'added'])
  })

  it('only what can be logged by hand, a note with words, on a card that’s on the board', async () => {
    expect((await send('POST', `/api/admin-area/sales/prospects/${BOOTES}/activity`, { kind: 'paid' })).status).toBe(400)
    expect(await (await send('POST', `/api/admin-area/sales/prospects/${BOOTES}/activity`, { kind: 'note', note: ' ' })).json()).toEqual({ error: 'Write the note' })
    expect((await send('POST', '/api/admin-area/sales/prospects/0b0e2f6c-2222-4c2d-8e3f-000000000404/activity', { kind: 'call' })).status).toBe(404)
  })
})

describe('messages to send', () => {
  it('added, changed and taken away; a message needs a name and words', async () => {
    db.tables.sales_templates = [{ id: '0b0e2f6c-3333-4c2d-8e3f-000000000001', title: 'First message', body: 'Hi {business}!', position: 1, business_id: HQ }]
    let res = await send('POST', '/api/admin-area/sales/templates', { title: ' Thanks ', body: 'Thanks {business}, here’s {link}' })
    expect(await res.json()).toMatchObject({ title: 'Thanks', position: 2 })
    expect((await send('POST', '/api/admin-area/sales/templates', { title: 'Empty', body: ' ' })).status).toBe(400)
    res = await send('PATCH', '/api/admin-area/sales/templates/0b0e2f6c-3333-4c2d-8e3f-000000000001', { body: 'Hola {business}!' })
    expect(await res.json()).toMatchObject({ title: 'First message', body: 'Hola {business}!' })
    expect((await get('/api/admin-area/sales/templates')).status).toBe(200)
    await send('DELETE', '/api/admin-area/sales/templates/0b0e2f6c-3333-4c2d-8e3f-000000000001', {})
    expect(db.tables.sales_templates.map(t => t.title)).toEqual(['Thanks'])
  })
})

describe('the to-do list', () => {
  const JOB = '0b0e2f6c-4444-4c2d-8e3f-000000000001'
  beforeEach(() => {
    db.tables.todos = [{ id: JOB, title: 'Print rep cards', done: false, done_at: null, planned_on: '2026-11-22', category_id: null, sales_prospect_id: null,
      created_at: '2026-11-20T10:00:00Z', business_id: HQ },
    // Easy Beans' own: never on HQ's list.
    { id: '0b0e2f6c-4444-4c2d-8e3f-000000000099', title: 'Order milk', done: false, created_at: '2026-11-20T10:00:00Z', business_id: 1 }]
    db.tables.todo_categories = [{ id: '0b0e2f6c-5555-4c2d-8e3f-000000000001', name: 'Sales', colour: '#8A7E76', sort: 1, business_id: HQ }]
  })

  it('HQ’s own jobs, with its categories', async () => {
    const list = await (await get('/api/admin-area/todos')).json() as { todos: { title: string }[]; categories: { name: string }[] }
    expect(list.todos.map(t => t.title)).toEqual(['Print rep cards'])
    expect(list.categories.map(c => c.name)).toEqual(['Sales'])
  })

  it('a new job goes at the top; a job dragged keeps its place', async () => {
    db.tables.todos[0].position = -2
    let res = await send('POST', '/api/admin-area/todos', { title: 'Register a tax-free residency' })
    expect(await res.json()).toMatchObject({ title: 'Register a tax-free residency', position: -3 })
    res = await send('PATCH', `/api/admin-area/todos/${JOB}`, { position: 4.5 })
    expect(await res.json()).toMatchObject({ id: JOB, position: 4.5 })
    expect((await send('PATCH', `/api/admin-area/todos/${JOB}`, { position: 'first' })).status).toBe(400)
  })

  it('a job about a contact, then done', async () => {
    let res = await send('POST', '/api/admin-area/todos', { title: 'Call back The Bootes Cafe', planned_on: '2026-11-24', sales_prospect_id: BOOTES })
    expect(await res.json()).toMatchObject({ title: 'Call back The Bootes Cafe', sales_prospect_id: BOOTES })
    expect(db.tables.todos.at(-1)).toMatchObject({ business_id: HQ })
    res = await send('PATCH', `/api/admin-area/todos/${JOB}`, { done: true })
    expect(await res.json()).toMatchObject({ id: JOB, done: true })
    await send('DELETE', `/api/admin-area/todos/${JOB}`, {})
    expect(db.tables.todos.map(t => t.title)).toEqual(['Order milk', 'Call back The Bootes Cafe'])
  })

  it('what isn’t right is said: no title, a contact or category that isn’t HQ’s', async () => {
    expect(await (await send('POST', '/api/admin-area/todos', { title: ' ' })).json()).toEqual({ error: 'Say what the job is' })
    expect(await (await send('POST', '/api/admin-area/todos', { title: 'X', sales_prospect_id: '0b0e2f6c-2222-4c2d-8e3f-000000000404' })).json())
      .toEqual({ error: 'Choose a contact' })
    expect(await (await send('POST', '/api/admin-area/todos', { title: 'X', category_id: '0b0e2f6c-5555-4c2d-8e3f-000000000404' })).json())
      .toEqual({ error: 'Choose a category' })
    expect((await send('PATCH', '/api/admin-area/todos/0b0e2f6c-4444-4c2d-8e3f-000000000099', { done: true })).status).toBe(404)
    expect(db.tables.todos.find(t => t.title === 'Order milk')).toMatchObject({ done: false })
  })
})

describe('onboarding and earnings', () => {
  it('HQ’s sign-ups and reps, with each rep’s money', async () => {
    db.tables.rep_introductions = [{ id: 'i1', rep_id: 'rep-julio', name: 'Café Lola', kind: 'cafe', code: 'JULIO27', plan: 'pro', status: 'active',
      created_at: '2026-11-01T10:00:00Z', business_id: HQ }]
    db.tables.rep_rewards = [{ rep_id: 'rep-julio', kind: 'earn', status: 'approved', amount: 50, business_id: HQ },
      { rep_id: 'rep-julio', kind: 'earn', status: 'pending', amount: 15.8, business_id: HQ },
      { rep_id: 'rep-dani', kind: 'earn', status: 'approved', amount: 3, business_id: 1 }]
    const res = await get('/api/admin-area/hq')
    const hq = await res.json() as { introductions: { name: string }[]; reps: { code: string }[]; earnings: Record<string, unknown> }
    expect(hq.introductions.map(i => i.name)).toEqual(['Café Lola'])
    expect(hq.reps.map(r => r.code)).toEqual(['JULIO27'])
    expect(hq.earnings).toEqual({ 'rep-julio': { earned: 50, waiting: 15.8, paid: 0, owed: 50 } })
  })

  it('locked: nothing', async () => {
    expect((await get('/api/admin-area/hq', null)).status).toBe(401)
    expect((await get('/api/admin-area/todos', null)).status).toBe(401)
  })
})

describe('people', () => {
  const ARON = '0b0e2f6c-6666-4c2d-8e3f-000000000001'
  const ALEJANDRO = '0b0e2f6c-6666-4c2d-8e3f-000000000002'
  const RYAN = '0b0e2f6c-6666-4c2d-8e3f-000000000003'
  const GIORGOS = '0b0e2f6c-6666-4c2d-8e3f-000000000009'
  beforeEach(() => {
    db.tables.admin_people = [
      { id: ARON, name: 'Aron', role: 'CEO', kind: 'team', reports_to: null, position: 1, business_id: HQ },
      { id: ALEJANDRO, name: 'Alejandro', role: 'Head of Product / Sales Manager', kind: 'team', reports_to: ARON, position: 2, business_id: HQ },
      { id: RYAN, name: 'Ryan', role: 'Salesperson', kind: 'team', reports_to: ALEJANDRO, position: 3, business_id: HQ },
      { id: GIORGOS, name: 'Giorgos', role: 'Investor', kind: 'investor', reports_to: null, position: 9, business_id: HQ },
      // Easy Beans' own: never HQ's.
      { id: '0b0e2f6c-6666-4c2d-8e3f-000000000099', name: 'Laura', role: 'Manager', kind: 'team', reports_to: null, position: 1, business_id: 1 },
    ]
  })

  it('HQ’s people only, in order', async () => {
    const res = await get('/api/admin-area/people')
    expect((await res.json() as { name: string }[]).map(p => p.name)).toEqual(['Aron', 'Alejandro', 'Ryan', 'Giorgos'])
    expect((await get('/api/admin-area/people', null)).status).toBe(401)
  })

  it('someone added at the end, reporting to someone on HQ’s team; an investor reports to nobody', async () => {
    let res = await send('POST', '/api/admin-area/people', { name: ' Mark ', role: 'Salesperson', reports_to: ALEJANDRO, labels: [' C TWO ', 'c two'] })
    expect(await res.json()).toMatchObject({ name: 'Mark', role: 'Salesperson', kind: 'team', reports_to: ALEJANDRO, position: 10, labels: ['C TWO'] })
    expect(db.tables.admin_people.at(-1)).toMatchObject({ business_id: HQ })
    res = await send('POST', '/api/admin-area/people', { name: 'Ollie', role: 'Investor', kind: 'investor', reports_to: ARON })
    expect(await res.json()).toMatchObject({ name: 'Ollie', kind: 'investor', reports_to: null })
    res = await send('POST', '/api/admin-area/people', { name: 'Adrian Goulding', role: 'Sales Manager', kind: 'bench', reports_to: ARON, labels: ['C TWO'] })
    expect(await res.json()).toMatchObject({ name: 'Adrian Goulding', kind: 'bench', reports_to: null, labels: ['C TWO'] })
    // Not to an investor, nor to another business's person.
    for (const boss of [GIORGOS, '0b0e2f6c-6666-4c2d-8e3f-000000000099']) {
      res = await send('POST', '/api/admin-area/people', { name: 'Kim', reports_to: boss })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Choose someone on the team to report to' })
    }
  })

  it('changed; never to report to someone who reports to them; taken off', async () => {
    let res = await send('PATCH', `/api/admin-area/people/${RYAN}`, { reports_to: ARON, role: 'Sales lead' })
    expect(await res.json()).toMatchObject({ id: RYAN, reports_to: ARON, role: 'Sales lead' })
    res = await send('PATCH', `/api/admin-area/people/${ALEJANDRO}`, { reports_to: ALEJANDRO })
    expect(await res.json()).toEqual({ error: 'They can’t report to someone who reports to them' })
    db.tables.admin_people.find(p => p.id === RYAN)!.reports_to = ALEJANDRO
    res = await send('PATCH', `/api/admin-area/people/${ARON}`, { reports_to: RYAN })
    expect(res.status).toBe(400)
    expect((await send('PATCH', '/api/admin-area/people/0b0e2f6c-6666-4c2d-8e3f-000000000099', { role: 'Boss' })).status).toBe(404)
    expect((await send('DELETE', `/api/admin-area/people/${RYAN}`, {})).status).toBe(200)
    expect(db.tables.admin_people.map(p => p.name)).toEqual(['Aron', 'Alejandro', 'Giorgos', 'Laura'])
  })
})
