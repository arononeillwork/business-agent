// The admin area's calls (/admin, worker/adminArea.ts): live, through the Worker with the session's token;
// and the demo's, in memory, where the PIN is 0000 (the real one is never in the app).
import type { Api } from './api'
import {
  AdminLocked, cleanMemberName, cleanProspect, isAdminPin, type AdminSession, type Prospect, type ProspectInput, type SalesBoard, type SalesMember,
} from '../../shared/salesTeam'
import {
  cleanPerson, cleanTodo, isLoggedKind, reportsInACircle, type AdminPerson, type AdminTodo, type Earnings, type HqRep, type SalesActivity, type SalesTemplate,
  type TodoCategory,
} from '../../shared/adminArea'
import type { RepIntroduction } from '../../shared/hqReps'
import { addDays, today as todayIn } from '../../shared/time'

type AdminArea = Pick<Api, 'adminUnlock' | 'adminLock' | 'adminChangePin' | 'salesBoard' | 'addSalesMember' | 'updateSalesMember' |
  'deleteSalesMember' | 'saveProspect' | 'deleteProspect' | 'prospectActivity' | 'logActivity' | 'salesTemplates' | 'saveSalesTemplate' |
  'deleteSalesTemplate' | 'adminTodos' | 'saveAdminTodo' | 'deleteAdminTodo' | 'adminHq' | 'adminPeople' | 'saveAdminPerson' | 'deleteAdminPerson'>
const id = encodeURIComponent

async function call<T>(path: string, token: string | null, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin-area${path}`, {
    method, cache: 'no-store',
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-admin-session': token } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({})) as T & { error?: string; locked?: boolean }
  if (res.status === 401 && json.locked) throw new AdminLocked(json.error)
  if (!res.ok) throw new Error(json.error ?? `The admin area didn’t answer (${res.status})`)
  return json
}

export const liveAdminArea: AdminArea = {
  adminUnlock: pin => call<AdminSession>('/unlock', null, 'POST', { pin }),
  async adminLock(token) { await call('/lock', token, 'POST', {}) },
  async adminChangePin(token, current, next) { await call('/pin', token, 'POST', { current, next }) },
  salesBoard: token => call<SalesBoard>('/sales', token),
  addSalesMember: (token, name) => call<SalesMember>('/sales/team', token, 'POST', { name }),
  updateSalesMember: (token, id, patch) => call<SalesMember>(`/sales/team/${encodeURIComponent(id)}`, token, 'PATCH', patch),
  async deleteSalesMember(token, id) { await call(`/sales/team/${encodeURIComponent(id)}`, token, 'DELETE', {}) },
  saveProspect(token, p) {
    const { id, ...rest } = p
    return id ? call<Prospect>(`/sales/prospects/${encodeURIComponent(id)}`, token, 'PATCH', rest) : call<Prospect>('/sales/prospects', token, 'POST', rest)
  },
  async deleteProspect(token, id) { await call(`/sales/prospects/${encodeURIComponent(id)}`, token, 'DELETE', {}) },
  prospectActivity: (token, p) => call<SalesActivity[]>(`/sales/prospects/${id(p)}/activity`, token),
  logActivity: (token, p, kind, note) => call<SalesActivity>(`/sales/prospects/${id(p)}/activity`, token, 'POST', { kind, note: note ?? null }),
  salesTemplates: token => call<SalesTemplate[]>('/sales/templates', token),
  saveSalesTemplate(token, t) {
    const { id: tid, ...rest } = t
    return tid ? call<SalesTemplate>(`/sales/templates/${id(tid)}`, token, 'PATCH', rest) : call<SalesTemplate>('/sales/templates', token, 'POST', rest)
  },
  async deleteSalesTemplate(token, tid) { await call(`/sales/templates/${id(tid)}`, token, 'DELETE', {}) },
  adminTodos: token => call('/todos', token),
  saveAdminTodo(token, t) {
    const { id: tid, ...rest } = t
    return tid ? call<AdminTodo>(`/todos/${id(tid)}`, token, 'PATCH', rest) : call<AdminTodo>('/todos', token, 'POST', rest)
  },
  async deleteAdminTodo(token, tid) { await call(`/todos/${id(tid)}`, token, 'DELETE', {}) },
  adminHq: token => call('/hq', token),
  adminPeople: token => call<AdminPerson[]>('/people', token),
  saveAdminPerson(token, p) {
    const { id: pid, ...rest } = p
    return pid ? call<AdminPerson>(`/people/${id(pid)}`, token, 'PATCH', rest) : call<AdminPerson>('/people', token, 'POST', rest)
  },
  async deleteAdminPerson(token, pid) { await call(`/people/${id(pid)}`, token, 'DELETE', {}) },
}

/** The demo's PIN: shown on the demo's own PIN screen. */
export const DEMO_ADMIN_PIN = '0000'

export function demoAdminArea(now: () => string): AdminArea {
  let pin = DEMO_ADMIN_PIN
  const sessions = new Set<string>()
  const day = (n: number) => addDays(todayIn('Europe/Madrid'), n)
  const stamp = (n: number) => `${day(n)}T09:00:00Z`
  const uid = (group: number, n: number) => `d0c5a1e5-${String(group).padStart(4, '0')}-4000-8000-${String(n).padStart(12, '0')}`
  const reps: HqRep[] = [
    { id: uid(9, 1), name: 'Maria Cortes', code: 'MARIA27', active: true }, { id: uid(9, 2), name: 'Julio', code: 'JULIO27', active: true },
    { id: uid(9, 3), name: 'Mark', code: 'MARK27', active: true },
  ]
  const team: SalesMember[] = [
    { id: uid(0, 1), name: 'Maria Cortes', position: 1, rep_id: reps[0].id }, { id: uid(0, 2), name: 'Julio Cesar', position: 2, rep_id: reps[1].id },
    { id: uid(0, 3), name: 'Mark', position: 3, rep_id: reps[2].id },
  ]
  const blank = { phone: null, email: null, website: null, town: null, notes: null, follow_up_on: null, introduction_id: null, kind: 'customer' as const,
    business_type: 'cafe' as const, country: null }
  const card = (n: number, member: SalesMember, name: string, more: Partial<Prospect>): Prospect => ({
    id: uid(1, n), member_id: member.id, name, stage: 'to_contact', instagram: null, ...blank, country: 'ES', created_at: stamp(-6), updated_at: stamp(-6), ...more,
  })
  let prospects: Prospect[] = [
    card(1, team[0], 'The Bootes Cafe', { instagram: 'the_bootes_cafe', town: 'San Pedro', follow_up_on: day(0), stage: 'contacted', updated_at: stamp(-2) }),
    card(2, team[0], 'Santa Roaster', { instagram: 'santaroaster', kind: 'partner', town: 'Marbella' }),
    card(3, team[1], 'Keki Marbella', { instagram: 'kekimarbella', town: 'Marbella' }),
    card(4, team[1], 'Roasted Spain', { instagram: 'roasted.spain', kind: 'partner' }),
    card(5, team[1], 'Café Lola', { stage: 'won', phone: '+34 611 222 333', town: 'San Pedro', introduction_id: 'intro-lola', created_at: stamp(-45), updated_at: stamp(-10) }),
    card(6, team[0], 'Panadería Sol', { stage: 'trial', town: 'Marbella', introduction_id: 'intro-sol', created_at: stamp(-5), updated_at: stamp(-5) }),
    card(7, team[2], 'The DPF Centre', { instagram: 'thedpfcentre', business_type: 'garage', country: 'IE' }),
  ]
  const introductions: RepIntroduction[] = [
    { id: 'intro-bea', rep_id: reps[1].id, name: 'Bar Bea', kind: 'restaurant', code: 'JULIO27', set_up_at: stamp(-1), plan: 'free', status: 'active',
      billing_interval: null, first_paid_at: null, created_at: stamp(-2) },
    { id: 'intro-sol', rep_id: reps[0].id, name: 'Panadería Sol', kind: 'cafe', code: 'MARIA27', set_up_at: null, plan: 'free', status: 'none',
      billing_interval: null, first_paid_at: null, created_at: stamp(-5) },
    { id: 'intro-lola', rep_id: reps[1].id, name: 'Café Lola', kind: 'cafe', code: 'JULIO27', set_up_at: stamp(-44), plan: 'pro', status: 'active',
      billing_interval: 'month', first_paid_at: stamp(-10), created_at: stamp(-45) },
  ]
  const earnings: Record<string, Earnings> = {
    [reps[0].id]: { earned: 0, waiting: 0, paid: 0, owed: 0 },
    [reps[1].id]: { earned: 65.8, waiting: 15.8, paid: 40, owed: 25.8 },
    [reps[2].id]: { earned: 0, waiting: 0, paid: 0, owed: 0 },
  }
  let activity: SalesActivity[] = [
    ...prospects.map((p, i) => ({ id: uid(2, i + 1), prospect_id: p.id, kind: 'added' as const, stage: 'to_contact' as const, note: null, at: p.created_at })),
    { id: uid(2, 20), prospect_id: uid(1, 1), kind: 'instagram', stage: null, note: 'Sent the first message', at: stamp(-3) },
    { id: uid(2, 21), prospect_id: uid(1, 1), kind: 'stage', stage: 'contacted', note: null, at: stamp(-3) },
    { id: uid(2, 22), prospect_id: uid(1, 5), kind: 'signed_up', stage: null, note: 'Signed up with the code JULIO27', at: stamp(-45) },
    { id: uid(2, 23), prospect_id: uid(1, 5), kind: 'paid', stage: null, note: 'First payment', at: stamp(-10) },
    { id: uid(2, 24), prospect_id: uid(1, 6), kind: 'signed_up', stage: null, note: 'Signed up with the code MARIA27', at: stamp(-5) },
  ]
  let templates: SalesTemplate[] = [
    ['First message', 'Hi {business}! I\'m {me} from The Business Agent. We help cafés run the rota, the legal hours record, Square sales and Instagram from one app. Could I show you in 10 minutes, at a quiet time for you? Your first month is free with my code {code}.'],
    ['Primer mensaje', '¡Hola {business}! Soy {me}, de The Business Agent. Ayudamos a cafeterías a llevar los turnos, el registro de jornada, las ventas de Square e Instagram desde una sola app. ¿Te lo enseño en 10 minutos, a una hora tranquila para ti? Con mi código {code} el primer mes es gratis.'],
    ['Follow-up', 'Hi again {business}, just following up on my message about The Business Agent. Happy to pop in for 10 minutes whenever suits you, or try it yourself with your first month free: {link}'],
    ['Partner: roaster or supplier', 'Hi {business}! I\'m {me} from The Business Agent, an app for cafés. You see café owners every week: each café that signs up with your code gets its first month free, and you earn €50 when it first pays plus 20% of what it pays in its first year. Fancy a chat?'],
  ].map(([title, body], i) => ({ id: uid(3, i + 1), title, body, position: i + 1 }))
  const categories: TodoCategory[] = [{ id: uid(4, 1), name: 'Sales', colour: '#B5562E' }, { id: uid(4, 2), name: 'Admin', colour: '#5E6AD2' }]
  let todos: AdminTodo[] = [
    { id: uid(5, 1), title: 'Print rep cards for Maria', done: false, done_at: null, planned_on: day(0), category_id: categories[0].id, sales_prospect_id: null, created_at: stamp(-3) },
    { id: uid(5, 2), title: 'Send Santa Roaster the partner deal', done: false, done_at: null, planned_on: day(-1), category_id: categories[0].id, sales_prospect_id: uid(1, 2), created_at: stamp(-4) },
    { id: uid(5, 6), title: 'Register a tax-free residency', done: false, done_at: null, planned_on: null, category_id: categories[1].id, sales_prospect_id: null, created_at: stamp(-1) },
    { id: uid(5, 3), title: 'Renew the domain', done: false, done_at: null, planned_on: null, category_id: categories[1].id, sales_prospect_id: null, created_at: stamp(-8) },
    { id: uid(5, 4), title: 'Film the 2-minute demo video', done: false, done_at: null, planned_on: day(3), category_id: null, sales_prospect_id: null, created_at: stamp(-2) },
    { id: uid(5, 5), title: 'Post the café video', done: true, done_at: stamp(-1), planned_on: day(-1), category_id: null, sales_prospect_id: null, created_at: stamp(-6) },
  ]

  // People: as the admin_area_people migration starts HQ's.
  const person = (n: number, name: string, role: string, reports_to: number | null, kind: AdminPerson['kind'] = 'team', labels: string[] = []): AdminPerson =>
    ({ id: uid(6, n), name, role, kind, reports_to: reports_to ? uid(6, reports_to) : null, position: n, labels })
  let people: AdminPerson[] = [
    person(1, 'Aron', 'CEO', null), person(2, 'Alejandro', 'Head of Product / Sales Manager', 1, 'team', ['C TWO']), person(3, 'Ryan', 'Salesperson', 2),
    person(4, 'Mark', 'Salesperson', 2), person(5, 'Julio', 'Café Salesperson', 2), person(6, 'Maria', 'Café Salesperson', 2),
    person(7, 'Kim', 'Head of Marketing', 1, 'team', ['C TWO']), person(8, 'Zoe', 'Engineer', 1),
    person(9, 'Giorgos', 'Investor', null, 'investor'), person(10, 'Ollie', 'Investor', null, 'investor'),
    person(11, 'Adrian Goulding', 'Sales Manager', null, 'bench', ['C TWO']), person(12, 'Jesus Maria Herruzo Luque', 'Engineer', null, 'bench', ['C TWO']),
    person(13, 'Antonio Trupac', 'Engineer / AI Guru', null, 'bench', ['C TWO']),
    person(14, 'Cathrine Naess', 'Head of People, organises everything', null, 'bench', ['C TWO']),
  ]

  const clone = <T,>(x: T): T => structuredClone(x)
  const open = (token: string) => { if (!sessions.has(token)) throw new AdminLocked() }
  const newToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('')
  const log = (p: Prospect, kind: SalesActivity['kind'], more: Partial<SalesActivity> = {}) =>
    activity.push({ id: crypto.randomUUID(), prospect_id: p.id, kind, stage: null, note: null, at: now(), ...more })
  const withCode = (m: SalesMember): SalesMember => ({ ...m, code: reps.find(r => r.id === m.rep_id)?.code ?? null })

  return {
    async adminUnlock(typed) {
      if (typed.trim() !== pin) throw new Error('That isn’t the PIN')
      const token = newToken()
      sessions.add(token)
      return { token, expires_at: new Date(Date.parse(now()) + 12 * 3600_000).toISOString() }
    },
    async adminLock(token) { sessions.delete(token) },
    async adminChangePin(token, current, next) {
      open(token)
      if (current.trim() !== pin) throw new Error('That isn’t the PIN in use now')
      if (!isAdminPin(next.trim())) throw new Error('The new PIN is 4 to 12 digits')
      pin = next.trim()
      for (const t of [...sessions]) if (t !== token) sessions.delete(t)
    },
    async salesBoard(token) {
      open(token)
      return clone({ team: [...team].sort((a, b) => a.position - b.position).map(withCode), prospects })
    },
    async addSalesMember(token, name) {
      open(token)
      const clean = cleanMemberName(name)
      if (!clean) throw new Error('Give them a name')
      if (team.some(m => m.name.toLowerCase() === clean.toLowerCase())) throw new Error('Someone on the sales team has that name already')
      // Everyone on the sales team gets a rep code, from their name.
      const rep = { id: crypto.randomUUID(), name: clean, code: `${clean.split(' ')[0].normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6)}42`, active: true }
      reps.push(rep)
      earnings[rep.id] = { earned: 0, waiting: 0, paid: 0, owed: 0 }
      const m = { id: crypto.randomUUID(), name: clean, position: Math.max(0, ...team.map(x => x.position)) + 1, rep_id: rep.id }
      team.push(m)
      return clone(withCode(m))
    },
    async updateSalesMember(token, mid, patch) {
      open(token)
      const m = team.find(x => x.id === mid)
      if (!m) throw new Error('No such salesperson')
      if (patch.name !== undefined) {
        const clean = cleanMemberName(patch.name)
        if (!clean) throw new Error('Give them a name')
        if (team.some(x => x.id !== mid && x.name.toLowerCase() === clean.toLowerCase())) throw new Error('Someone on the sales team has that name already')
        m.name = clean
        const rep = reps.find(r => r.id === m.rep_id)
        if (rep) rep.name = clean
      }
      if (patch.position !== undefined) m.position = patch.position
      return clone(withCode(m))
    },
    async deleteSalesMember(token, mid) {
      open(token)
      const i = team.findIndex(x => x.id === mid)
      if (i >= 0) team.splice(i, 1)
      prospects = prospects.map(p => (p.member_id === mid ? { ...p, member_id: null } : p))
    },
    async saveProspect(token, input: ProspectInput) {
      open(token)
      const { id: pid, ...rest } = input
      const clean = cleanProspect(rest, !pid)
      if ('error' in clean) throw new Error(clean.error)
      const row = clean.row as Partial<Prospect>
      if (row.member_id && !team.some(m => m.id === row.member_id)) throw new Error('Choose someone on the sales team')
      if (row.instagram && prospects.some(p => p.id !== pid && p.instagram === row.instagram)) throw new Error('That Instagram is on the board already')
      const at = now()
      if (pid) {
        const i = prospects.findIndex(p => p.id === pid)
        if (i < 0) throw new Error('That business isn’t on the board')
        const before = prospects[i]
        prospects[i] = { ...before, ...row, updated_at: at }
        if (row.stage && row.stage !== before.stage) log(prospects[i], 'stage', { stage: row.stage })
        return clone(prospects[i])
      }
      const p: Prospect = { id: crypto.randomUUID(), member_id: null, name: '', stage: 'to_contact', instagram: null, ...blank, ...row, created_at: at, updated_at: at }
      prospects.push(p)
      log(p, 'added', { stage: p.stage })
      return clone(p)
    },
    async deleteProspect(token, pid) {
      open(token)
      prospects = prospects.filter(p => p.id !== pid)
      activity = activity.filter(a => a.prospect_id !== pid)
      todos = todos.map(t => (t.sales_prospect_id === pid ? { ...t, sales_prospect_id: null } : t))
    },
    async prospectActivity(token, pid) {
      open(token)
      return clone(activity.filter(a => a.prospect_id === pid).sort((a, b) => b.at.localeCompare(a.at)))
    },
    async logActivity(token, pid, kind, note) {
      open(token)
      const p = prospects.find(x => x.id === pid)
      if (!p) throw new Error('That business isn’t on the board')
      if (!isLoggedKind(kind)) throw new Error('Choose what happened')
      const text = note?.trim() || null
      if (kind === 'note' && !text) throw new Error('Write the note')
      log(p, kind, { note: text })
      return clone(activity[activity.length - 1])
    },
    async salesTemplates(token) {
      open(token)
      return clone([...templates].sort((a, b) => a.position - b.position))
    },
    async saveSalesTemplate(token, t) {
      open(token)
      const title = t.title?.trim(), body = t.body?.trim()
      if (t.title !== undefined && !title) throw new Error('Give the message a name')
      if (t.body !== undefined && !body) throw new Error('Write the message')
      if (t.id) {
        const x = templates.find(y => y.id === t.id)
        if (!x) throw new Error('No such message')
        Object.assign(x, title ? { title } : {}, body ? { body } : {})
        return clone(x)
      }
      if (!title) throw new Error('Give the message a name')
      if (!body) throw new Error('Write the message')
      const x = { id: crypto.randomUUID(), title, body, position: Math.max(0, ...templates.map(y => y.position)) + 1 }
      templates.push(x)
      return clone(x)
    },
    async deleteSalesTemplate(token, tid) {
      open(token)
      templates = templates.filter(t => t.id !== tid)
    },
    async adminTodos(token) {
      open(token)
      return clone({ todos, categories })
    },
    async saveAdminTodo(token, input) {
      open(token)
      const { id: tid, ...rest } = input
      const clean = cleanTodo(rest, !tid)
      if ('error' in clean) throw new Error(clean.error)
      const row = clean.row as Partial<AdminTodo>
      if (row.sales_prospect_id && !prospects.some(p => p.id === row.sales_prospect_id)) throw new Error('Choose a contact')
      if (row.category_id && !categories.some(c => c.id === row.category_id)) throw new Error('Choose a category')
      if (row.done !== undefined) row.done_at = row.done ? now() : null
      if (tid) {
        const i = todos.findIndex(t => t.id === tid)
        if (i < 0) throw new Error('No such job')
        todos[i] = { ...todos[i], ...row }
        return clone(todos[i])
      }
      // A new job goes at the top, as on the To-do page.
      const top = Math.min(0, ...todos.map(x => x.position ?? 0)) - 1
      const t: AdminTodo = { id: crypto.randomUUID(), title: '', done: false, done_at: null, planned_on: null, category_id: null, sales_prospect_id: null,
        position: top, ...row, created_at: now() }
      todos.push(t)
      return clone(t)
    },
    async deleteAdminTodo(token, tid) {
      open(token)
      todos = todos.filter(t => t.id !== tid)
    },
    async adminHq(token) {
      open(token)
      return clone({ introductions, reps, earnings })
    },
    async adminPeople(token) {
      open(token)
      return clone([...people].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)))
    },
    async saveAdminPerson(token, input) {
      open(token)
      const { id: pid, ...rest } = input
      const clean = cleanPerson(rest, !pid)
      if ('error' in clean) throw new Error(clean.error)
      const row = clean.row as Partial<AdminPerson>
      const before = pid ? people.find(p => p.id === pid) : undefined
      if (pid && !before) throw new Error('No such person')
      if ((row.kind ?? before?.kind ?? 'team') !== 'team') row.reports_to = null
      if (row.reports_to) {
        if (!people.some(p => p.id === row.reports_to && p.kind === 'team')) throw new Error('Choose someone on the team to report to')
        if (pid && reportsInACircle(people, pid, row.reports_to)) throw new Error('They can’t report to someone who reports to them')
      }
      if (before) {
        const boss = before.reports_to
        Object.assign(before, row)
        // On the bench or an investor now: whoever reported to them reports to whom they reported to.
        if (row.kind && row.kind !== 'team') people = people.map(p => (p.reports_to === pid ? { ...p, reports_to: boss } : p))
        return clone(people.find(p => p.id === pid)!)
      }
      const p: AdminPerson = { id: crypto.randomUUID(), name: '', role: null, kind: 'team', reports_to: null, labels: [],
        position: Math.max(0, ...people.map(x => x.position)) + 1, ...row }
      people.push(p)
      return clone(p)
    },
    async deleteAdminPerson(token, pid) {
      open(token)
      const gone = people.find(p => p.id === pid)
      people = people.filter(p => p.id !== pid).map(p => (p.reports_to === pid ? { ...p, reports_to: gone?.reports_to ?? null } : p))
    },
  }
}
