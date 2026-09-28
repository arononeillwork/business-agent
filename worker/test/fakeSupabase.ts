// A stand-in for Supabase (PostgREST and auth) with the tables in memory, so the Worker's routes can
// be run end to end in unit tests. It understands the queries the Worker makes (select with eq/neq/
// in/is/gte/gt/lte/lt, single/maybeSingle, insert/upsert/update/delete, rpc is_admin/my_role) and
// mirrors the one-app-per-group trigger from migration 28 (supabase/tests prove the real one).
import { PROVIDERS } from '../connections'

export type Row = Record<string, unknown>

/** integration_group() in migration 28. */
export const GROUP: Record<string, string> = {
  gmail: 'email', outlook: 'email', google_drive: 'files', onedrive: 'files',
  google_calendar: 'calendar', outlook_calendar: 'calendar', spotify: 'music', youtube_music: 'music', whatsapp: 'communication',
}

/** Primary keys, for upserts. Tables not listed get a numeric id. */
const KEYS: Record<string, string[]> = {
  integrations: ['provider'], integration_secrets: ['provider'], calendar_feeds: ['profile_id', 'scope'], profiles: ['id'], business: ['id'],
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const bearerOf = (h: Headers) => h.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''

function matcher(params: URLSearchParams) {
  const tests: ((r: Row) => boolean)[] = []
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue
    const dot = raw.indexOf('.')
    const op = raw.slice(0, dot), arg = raw.slice(dot + 1)
    const v = (r: Row) => r[key] == null ? null : String(r[key])
    if (op === 'eq') tests.push(r => v(r) === arg)
    else if (op === 'neq') tests.push(r => v(r) !== arg)
    else if (op === 'is') tests.push(r => arg === 'null' ? r[key] == null : v(r) === arg)
    else if (op === 'in') {
      const set = arg.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, ''))
      tests.push(r => set.includes(v(r) ?? ''))
    } else if (op === 'gte') tests.push(r => v(r) !== null && v(r)! >= arg)
    else if (op === 'gt') tests.push(r => v(r) !== null && v(r)! > arg)
    else if (op === 'lte') tests.push(r => v(r) !== null && v(r)! <= arg)
    else if (op === 'lt') tests.push(r => v(r) !== null && v(r)! < arg)
    else throw new Error(`fake Supabase: unsupported filter ${key}=${raw}`)
  }
  return (r: Row) => tests.every(t => t(r))
}

function project(r: Row, select: string | null) {
  if (!select || select === '*') return { ...r }
  return Object.fromEntries(select.split(',').map(s => s.trim()).map(k => [k, r[k] ?? null]))
}

export class FakeSupabase {
  readonly url = 'https://db.test'
  tables: Record<string, Row[]> = {}
  /** Bearer token → signed-in person. */
  people = new Map<string, { id: string; role: 'admin' | 'employee' }>()
  private nextId = 1

  constructor() {
    this.tables.integrations = PROVIDERS.map(provider => ({
      provider, status: 'disconnected', account_label: null, external: {}, connected_by: null, connected_at: null,
      last_sync_at: null, last_error: null, last_checked_at: null, updated_at: null,
    }))
    this.tables.integration_secrets = []
    this.tables.business = [{ id: 1, name: 'Easy Beans', address: 'Calle Mayor 1' }]
    this.tables.profiles = [
      { id: 'admin-1', full_name: 'Aron', role: 'admin', active: true },
      { id: 'admin-2', full_name: 'Maria', role: 'admin', active: true },
      { id: 'staff-1', full_name: 'Julio', role: 'employee', active: true },
      { id: 'admin-gone', full_name: 'Former admin', role: 'admin', active: false },
    ]
    this.tables.notifications = []
    this.tables.calendar_feeds = []
    this.people.set('admin-token', { id: 'admin-1', role: 'admin' })
    this.people.set('staff-token', { id: 'staff-1', role: 'employee' })
  }

  table(name: string) { return (this.tables[name] ??= []) }
  integration(provider: string) { return this.table('integrations').find(r => r.provider === provider)! }
  secret(provider: string) { return this.table('integration_secrets').find(r => r.provider === provider) }

  /** Handle a request meant for Supabase; null for anything else. */
  handle(input: string, init: RequestInit = {}): Response | null {
    const url = new URL(input)
    if (url.origin !== this.url) return null
    const method = (init.method ?? 'GET').toUpperCase()
    const headers = new Headers(init.headers)
    if (url.pathname === '/auth/v1/user') {
      const who = this.people.get(bearerOf(headers))
      return who
        ? json({ id: who.id, aud: 'authenticated', role: 'authenticated', email: `${who.id}@test`, app_metadata: {}, user_metadata: {}, created_at: '' })
        : json({ code: 401, msg: 'invalid JWT' }, 401)
    }
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)
    if (rpc) {
      const who = this.people.get(bearerOf(headers))
      if (rpc[1] === 'is_admin') return json(who?.role === 'admin')
      if (rpc[1] === 'my_role') return json(who?.role ?? null)
      return json({ message: `fake Supabase: no rpc ${rpc[1]}` }, 404)
    }
    const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/)
    if (!m) return json({ message: 'not found' }, 404)
    const name = m[1]
    const rows = this.table(name)
    const match = matcher(url.searchParams)
    const select = url.searchParams.get('select')
    const prefer = headers.get('prefer') ?? ''
    const body = init.body ? JSON.parse(String(init.body)) as Row | Row[] : undefined
    const respond = (data: Row[], status = 200) => {
      if ((headers.get('accept') ?? '').includes('vnd.pgrst.object+json')) {
        return data.length === 1 ? json(project(data[0], select), status) : json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 406)
      }
      return json(data.map(r => project(r, select)), status)
    }
    if (method === 'GET') return respond(rows.filter(match))
    if (method === 'PATCH') {
      const hit = rows.filter(match)
      for (const r of hit) {
        const before = r.status
        Object.assign(r, body)
        if (name === 'integrations') this.onePerGroup(r, before)
      }
      return prefer.includes('return=representation') ? respond(hit) : new Response(null, { status: 204 })
    }
    if (method === 'POST') {
      const keys = KEYS[name]
      const out: Row[] = []
      for (const item of (Array.isArray(body) ? body : [body!])) {
        const existing = keys && rows.find(r => keys.every(k => r[k] === item[k]))
        if (existing && !prefer.includes('resolution=merge-duplicates')) return json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409)
        if (existing) { Object.assign(existing, item); out.push(existing) } else {
          const r = { ...(keys ? {} : { id: this.nextId++ }), ...item }
          rows.push(r)
          out.push(r)
        }
      }
      return prefer.includes('return=representation') ? respond(out, 201) : new Response(null, { status: 201 })
    }
    if (method === 'DELETE') {
      this.tables[name] = rows.filter(r => !match(r))
      return new Response(null, { status: 204 })
    }
    return json({ message: `fake Supabase: ${method} not supported` }, 405)
  }

  /** Migration 28: connecting (or choosing) one app in a group disconnects the others. */
  private onePerGroup(r: Row, before: unknown) {
    const g = GROUP[r.provider as string]
    if (!g || !['connected', 'pending'].includes(r.status as string) || before === r.status) return
    this.tables.integration_secrets = this.table('integration_secrets').filter(s => s.provider === r.provider || GROUP[s.provider as string] !== g)
    for (const o of this.table('integrations')) {
      if (o !== r && GROUP[o.provider as string] === g && o.status !== 'disconnected') {
        Object.assign(o, { status: 'disconnected', account_label: null, external: {}, last_error: null })
      }
    }
  }
}
