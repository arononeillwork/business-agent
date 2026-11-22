// The admin area's calls (/admin, worker/adminArea.ts): live, through the Worker with the session's token;
// and the demo's, in memory, where the PIN is 0000 (the real one is never in the app).
import type { Api } from './api'
import {
  AdminLocked, cleanMemberName, cleanProspect, isAdminPin, type AdminSession, type Prospect, type ProspectInput, type SalesBoard, type SalesMember,
} from '../../shared/salesTeam'

type AdminArea = Pick<Api, 'adminUnlock' | 'adminLock' | 'adminChangePin' | 'salesBoard' | 'addSalesMember' | 'updateSalesMember' |
  'deleteSalesMember' | 'saveProspect' | 'deleteProspect'>

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
}

/** The demo's PIN: shown on the demo's own PIN screen. */
export const DEMO_ADMIN_PIN = '0000'

export function demoAdminArea(now: () => string): AdminArea {
  let pin = DEMO_ADMIN_PIN
  const sessions = new Set<string>()
  const team: SalesMember[] = [
    { id: 'd0c5a1e5-0000-4000-8000-000000000001', name: 'Maria Cortes', position: 1 },
    { id: 'd0c5a1e5-0000-4000-8000-000000000002', name: 'Julio Cesar', position: 2 },
  ]
  const at = '2026-09-28T09:00:00Z'
  const seed = (n: number, member: SalesMember, name: string, instagram: string): Prospect => ({
    id: `d0c5a1e5-1111-4000-8000-00000000000${n}`, member_id: member.id, name, stage: 'to_contact', instagram,
    phone: null, email: null, website: null, town: null, notes: null, follow_up_on: null, created_at: at, updated_at: at,
  })
  let prospects: Prospect[] = [
    seed(1, team[0], 'The Bootes Cafe', 'the_bootes_cafe'), seed(2, team[0], 'Santa Roaster', 'santaroaster'),
    seed(3, team[1], 'Keki Marbella', 'kekimarbella'), seed(4, team[1], 'Roasted Spain', 'roasted.spain'),
  ]
  const clone = <T,>(x: T): T => structuredClone(x)
  const open = (token: string) => { if (!sessions.has(token)) throw new AdminLocked() }
  const newToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('')

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
      return clone({ team: [...team].sort((a, b) => a.position - b.position), prospects })
    },
    async addSalesMember(token, name) {
      open(token)
      const clean = cleanMemberName(name)
      if (!clean) throw new Error('Give them a name')
      if (team.some(m => m.name.toLowerCase() === clean.toLowerCase())) throw new Error('Someone on the sales team has that name already')
      const m = { id: crypto.randomUUID(), name: clean, position: Math.max(0, ...team.map(x => x.position)) + 1 }
      team.push(m)
      return clone(m)
    },
    async updateSalesMember(token, id, patch) {
      open(token)
      const m = team.find(x => x.id === id)
      if (!m) throw new Error('No such salesperson')
      if (patch.name !== undefined) {
        const clean = cleanMemberName(patch.name)
        if (!clean) throw new Error('Give them a name')
        if (team.some(x => x.id !== id && x.name.toLowerCase() === clean.toLowerCase())) throw new Error('Someone on the sales team has that name already')
        m.name = clean
      }
      if (patch.position !== undefined) m.position = patch.position
      return clone(m)
    },
    async deleteSalesMember(token, id) {
      open(token)
      const i = team.findIndex(x => x.id === id)
      if (i >= 0) team.splice(i, 1)
      prospects = prospects.map(p => (p.member_id === id ? { ...p, member_id: null } : p))
    },
    async saveProspect(token, input: ProspectInput) {
      open(token)
      const { id, ...rest } = input
      const clean = cleanProspect(rest, !id)
      if ('error' in clean) throw new Error(clean.error)
      const row = clean.row as Partial<Prospect>
      if (row.member_id && !team.some(m => m.id === row.member_id)) throw new Error('Choose someone on the sales team')
      if (row.instagram && prospects.some(p => p.id !== id && p.instagram === row.instagram)) throw new Error('That Instagram is on the board already')
      const stamp = now()
      if (id) {
        const i = prospects.findIndex(p => p.id === id)
        if (i < 0) throw new Error('That business isn’t on the board')
        prospects[i] = { ...prospects[i], ...row, updated_at: stamp }
        return clone(prospects[i])
      }
      const p: Prospect = {
        id: crypto.randomUUID(), member_id: null, name: '', stage: 'to_contact', instagram: null, phone: null, email: null, website: null,
        town: null, notes: null, follow_up_on: null, ...row, created_at: stamp, updated_at: stamp,
      }
      prospects.push(p)
      return clone(p)
    },
    async deleteProspect(token, id) {
      open(token)
      prospects = prospects.filter(p => p.id !== id)
    },
  }
}
