// A stand-in for Supabase (PostgREST, auth and storage) with the tables and files in memory, so the Worker's routes can
// be run end to end in unit tests. It understands the queries the Worker makes (select with eq/neq/
// in/is/gte/gt/lte/lt/not, order and limit, single/maybeSingle, counts, insert/upsert/update/delete, rpc is_admin/my_role, the plan checks and any a test adds) and
// mirrors the one-app-per-group trigger from migration 28 (supabase/tests prove the real one).
// Several businesses (the several_businesses migration): a row without business_id is business 1's,
// what the Worker writes is the business its x-business-id header names, and current_business_id()
// answers like the real one.
import { PROVIDERS } from '../connections'
import { CONNECTION_FEATURE } from '../../shared/plans'

export type Row = Record<string, unknown>

/** integration_group() (migrations 28, 34, 40, 45 and 65: Google Drive and OneDrive no longer exclude each other). */
export const GROUP: Record<string, string> = {
  gmail: 'email', outlook: 'email',
  google_calendar: 'calendar', outlook_calendar: 'calendar', spotify: 'music', youtube_music: 'music', whatsapp: 'communication', square: 'payments', sumup: 'payments',
}

/** Primary keys, for upserts. Tables not listed get a numeric id. */
const KEYS: Record<string, string[]> = {
  integrations: ['provider'], integration_secrets: ['provider'], calendar_feeds: ['profile_id', 'scope'], profiles: ['id'], business: ['id'], api_keys: ['id'], referrals: ['email'],
  whatsapp_messages: ['wa_message_id'], settings: ['id'], provider_cache: ['key'],
  competitor_radar: ['place_id'], competitor_snapshots: ['competitor_id', 'taken_on'],
  camera_status: ['camera_id'],
}
/** Keyed tables that still get a numeric id of their own (an identity column beside the unique key). */
const AUTO_ID = new Set(['whatsapp_messages'])
/** Tables whose id is a uuid (the tools check it is one). */
const UUID_ID = new Set(['competitors', 'competitor_items', 'competitor_prices', 'competitor_notes'])

/** The business a row is, unless it says (the one business most tests have). */
export const FIRST_BUSINESS = 1
/** Tables that aren't any one business's, and the business row itself (its id is the business). */
const UNSCOPED = new Set(['business', 'plan_limits', 'pay_per_use'])

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const bearerOf = (h: Headers) => h.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''

function matcher(params: URLSearchParams) {
  const tests: ((r: Row) => boolean)[] = []
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue
    const dot = raw.indexOf('.')
    const op = raw.slice(0, dot), arg = raw.slice(dot + 1)
    // A field inside a json column ("data->>review") or the column itself.
    const [col, inner] = key.split('->>')
    const at = (r: Row) => (inner ? (r[col] as Row | null | undefined)?.[inner] : key === 'business_id' ? r[key] ?? FIRST_BUSINESS : r[key])
    const v = (r: Row) => at(r) == null ? null : String(at(r))
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
    else if (op === 'like') {
      // PostgREST's like: * or % for any run of characters, _ for one, \ before one to take it as it is.
      let re = ''
      const plain = (ch: string) => ch.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')
      for (let i = 0; i < arg.length; i++) {
        const ch = arg[i]
        re += ch === '\\' && i + 1 < arg.length ? plain(arg[++i]) : ch === '*' || ch === '%' ? '.*' : ch === '_' ? '.' : plain(ch)
      }
      const pattern = new RegExp(`^${re}$`, 's')
      tests.push(r => v(r) !== null && pattern.test(v(r)!))
    }
    else if (op === 'not') {
      const inner = matcher(new URLSearchParams([[key, arg]]))
      tests.push(r => !inner(r))
    }
    else throw new Error(`fake Supabase: unsupported filter ${key}=${raw}`)
  }
  return (r: Row) => tests.every(t => t(r))
}

function project(r: Row, select: string | null, table = '') {
  const row = UNSCOPED.has(table) || r.business_id !== undefined ? r : { ...r, business_id: FIRST_BUSINESS }
  if (!select || select === '*') return { ...row }
  return Object.fromEntries(select.split(',').map(s => s.trim()).map(k => [k, row[k] ?? null]))
}

export class FakeSupabase {
  readonly url = 'https://db.test'
  tables: Record<string, Row[]> = {}
  /** The plan in force (public.plan_status / plan_check_connect, migration 36): everything unless a test says otherwise. */
  plan: { plan: string; people: number | null; features: string[] } = {
    plan: 'business', people: null, features: ['google_maps', 'apps', 'whatsapp', 'takings', 'sports', 'music', 'kiosk', 'partners'] }
  /** Functions a test answers itself (by name, given the call's arguments); any other unknown one is a 404. */
  rpcs: Record<string, (args: Row) => unknown> = {}
  /** AI music (migration 86): free uses left this month, the price of the rest, and why the next can't be made (null: it can). */
  music = { freeLeft: 1, unitCents: 99, reason: null as string | null }
  /** Bearer token → signed-in person. */
  people = new Map<string, { id: string; role: 'admin' | 'employee' }>()
  /** Sign-ins made by the Worker for access keys (one-time links used, sessions refreshed). */
  auth = { links: 0, refreshes: 0 }
  /** Storage: the buckets made, and each file by "bucket/path". */
  buckets = new Set<string>()
  files = new Map<string, { bytes: Uint8Array; type: string }>()
  private links = new Map<string, string>()
  private refreshTokens = new Map<string, string>()
  private nextId = 1

  constructor() {
    this.tables.integrations = PROVIDERS.map(provider => ({
      provider, status: 'disconnected', account_label: null, external: {}, connected_by: null, connected_at: null,
      last_sync_at: null, last_error: null, last_checked_at: null, updated_at: null,
    }))
    this.tables.integration_secrets = []
    this.tables.business = [{ id: 1, name: 'Easy Beans', address: 'Calle Mayor 1', timezone: 'Europe/Madrid' }]
    this.tables.profiles = [
      { id: 'admin-1', full_name: 'Aron', email: 'aron@example.com', role: 'admin', active: true, can_see_pay: true },
      { id: 'admin-2', full_name: 'Maria', email: 'maria@example.com', role: 'admin', active: true, can_see_pay: false },
      { id: 'staff-1', full_name: 'Julio', email: 'julio@example.com', role: 'employee', active: true },
      { id: 'admin-gone', full_name: 'Former admin', email: 'gone@example.com', role: 'admin', active: false },
    ]
    this.tables.api_keys = []
    this.tables.outbox = []
    this.tables.notifications = []
    this.tables.calendar_feeds = []
    this.tables.settings = [{ id: 1, whatsapp_retention_days: 90 }]
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
    // Access keys: the Worker signs in as the key's owner with a one-time link, then refreshes.
    if (url.pathname === '/auth/v1/admin/generate_link') {
      const { email } = JSON.parse(String(init.body)) as { email: string }
      const person = this.table('profiles').find(p => p.email === email)
      if (!person) return json({ code: 404, msg: 'User not found' }, 404)
      const hashed = `link-${this.nextId++}`
      this.links.set(hashed, person.id as string)
      return json({ id: person.id, aud: 'authenticated', email, action_link: 'https://db.test/verify', email_otp: '123456', hashed_token: hashed, verification_type: 'magiclink', redirect_to: '' })
    }
    if (url.pathname === '/auth/v1/verify') {
      const { token_hash } = JSON.parse(String(init.body)) as { token_hash: string }
      const uid = this.links.get(token_hash)
      if (!uid) return json({ code: 403, msg: 'Token has expired or is invalid' }, 403)
      this.links.delete(token_hash)
      this.auth.links++
      return json(this.session(uid))
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const { refresh_token } = JSON.parse(String(init.body)) as { refresh_token: string }
      const uid = this.refreshTokens.get(refresh_token)
      if (!uid) return json({ code: 400, error: 'invalid_grant', msg: 'Invalid Refresh Token: Already Used' }, 400)
      this.refreshTokens.delete(refresh_token)
      this.auth.refreshes++
      return json(this.session(uid))
    }
    if (url.pathname.startsWith('/storage/v1/')) return this.storage(url, method, init)
    if (url.pathname === '/auth/v1/user') {
      const who = this.people.get(bearerOf(headers))
      return who
        ? json({ id: who.id, aud: 'authenticated', role: 'authenticated', email: `${who.id}@test`, app_metadata: {}, user_metadata: {}, created_at: '' })
        : json({ code: 401, msg: 'invalid JWT' }, 401)
    }
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)
    if (rpc) {
      if (this.rpcs[rpc[1]]) return json(this.rpcs[rpc[1]](init.body ? JSON.parse(String(init.body)) as Row : {}))
      const who = this.people.get(bearerOf(headers))
      if (rpc[1] === 'current_business_id') {
        if (who) return json(this.table('profiles').find(p => p.id === who.id)?.business_id ?? FIRST_BUSINESS)
        return json(Number(headers.get('x-business-id')) || null)
      }
      if (rpc[1] === 'is_admin') return json(who?.role === 'admin')
      if (rpc[1] === 'my_role') return json(who?.role ?? null)
      if (rpc[1] === 'can_see_pay') return json(who?.role === 'admin' && this.table('profiles').some(p => p.id === who.id && p.can_see_pay === true))
      if (rpc[1] === 'plan_status') {
        const people = this.table('profiles').filter(p => p.active !== false && ['admin', 'employee'].includes(p.role as string)).length
        return json({ plan: this.plan.plan, limits: { people: this.plan.people, features: this.plan.features }, usage: { people } })
      }
      if (rpc[1] === 'referral_months_earned') {
        const setUp = this.table('referrals').filter(r => r.set_up_at).length
        return json(Math.min(12, setUp) + (this.table('billing')[0]?.referred_month ? 1 : 0))
      }
      if (rpc[1] === 'plan_allows') return json(this.plan.features.includes((JSON.parse(String(init.body)) as { p_feature: string }).p_feature))
      if (rpc[1] === 'plan_check_connect') {
        const { p_provider } = JSON.parse(String(init.body)) as { p_provider: string }
        const needs = CONNECTION_FEATURE[p_provider]
        return needs && !this.plan.features.includes(needs)
          ? json({ message: 'Connecting this app needs the Pro plan or higher. Upgrade on the Billing page.', code: 'P0402' }, 400)
          : json(null)
      }
      // The outbox (migration 7): the Worker claims due jobs, then reports each one back.
      if (rpc[1] === 'claim_outbox') {
        const due = this.table('outbox').filter(j => j.status === 'pending' || j.status === 'failed')
        for (const j of due) Object.assign(j, { status: 'sending', attempts: Number(j.attempts ?? 0) + 1 })
        return json(due.map(j => ({ id: j.id, kind: j.kind, payload: j.payload })))
      }
      if (rpc[1] === 'complete_outbox') {
        const a = JSON.parse(String(init.body)) as { p_id: number; p_ok: boolean; p_error?: string; p_external_id?: string | null }
        const j = this.table('outbox').find(x => x.id === a.p_id)!
        Object.assign(j, a.p_ok ? { status: 'sent', external_id: a.p_external_id ?? null, last_error: null } : { status: 'failed', last_error: a.p_error })
        return json(null)
      }
      // Migration 86: AI music uses, quoted, reserved before ElevenLabs is asked and settled after.
      if (rpc[1] === 'ai_music_quote') {
        const { p_seconds } = JSON.parse(String(init.body)) as { p_seconds: number }
        const uses = Math.max(1, Math.ceil(Math.max(3, p_seconds) / 60))
        const free = Math.min(uses, this.music.freeLeft)
        return json({ allowed: !this.music.reason, plan: 'business', uses, free, free_left: this.music.freeLeft, included: 1, unit_cents: this.music.unitCents,
          price_cents: (uses - free) * this.music.unitCents, spent_cents: 0, limit_cents: 2500, reason: this.music.reason })
      }
      if (rpc[1] === 'ai_music_start') {
        if (who?.role !== 'admin') return json({ message: 'Only an admin can make AI music' }, 400)
        if (this.music.reason) return json({ message: this.music.reason, code: 'P0402' }, 400)
        const a = JSON.parse(String(init.body)) as { p_prompt: string; p_seconds: number; p_post: string | null }
        const uses = Math.max(1, Math.ceil(Math.max(3, a.p_seconds) / 60))
        const free = Math.min(uses, this.music.freeLeft)
        this.music.freeLeft -= free
        const row = { id: `gen-${this.nextId++}`, prompt: a.p_prompt, seconds: a.p_seconds, uses, free, price_cents: (uses - free) * this.music.unitCents,
          status: 'working', post_id: a.p_post, track_ids: [], charged_at: null, stripe_invoice_item: null, created_at: new Date().toISOString() }
        this.table('music_generations').push(row)
        return json({ allowed: true, uses, free, price_cents: row.price_cents, unit_cents: this.music.unitCents, reason: null, id: row.id })
      }
      if (rpc[1] === 'ai_music_finish') {
        const a = JSON.parse(String(init.body)) as { p_id: string; p_status: string; p_track_ids: string[]; p_model: string | null; p_error: string | null }
        const g = this.table('music_generations').find(r => r.id === a.p_id && r.status === 'working')
        if (g) {
          Object.assign(g, { status: a.p_status, track_ids: a.p_track_ids, model: a.p_model, error: a.p_error })
          if (a.p_status !== 'done') { this.music.freeLeft += Number(g.free); Object.assign(g, { free: 0, price_cents: 0 }) }
        }
        return json(null)
      }
      if (rpc[1] === 'ai_music_charged') {
        const a = JSON.parse(String(init.body)) as { p_id: string; p_invoice_item: string }
        const g = this.table('music_generations').find(r => r.id === a.p_id && r.status === 'done' && Number(r.price_cents) > 0 && !r.charged_at)
        if (g) Object.assign(g, { stripe_invoice_item: a.p_invoice_item, charged_at: new Date().toISOString() })
        return json(null)
      }
      // Migration 47: delete WhatsApp messages older than the chosen time, returning their files.
      if (rpc[1] === 'purge_whatsapp_messages') {
        const days = Number(this.table('settings')[0]?.whatsapp_retention_days ?? 90)
        const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
        const gone = this.table('whatsapp_messages').filter(r => String(r.at) < cutoff)
        this.tables.whatsapp_messages = this.table('whatsapp_messages').filter(r => !gone.includes(r))
        return json(gone.map(r => r.media_path ?? null))
      }
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
        return data.length === 1 ? json(project(data[0], select, name), status) : json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 406)
      }
      return json(data.map(r => project(r, select, name)), status)
    }
    // A count only (select … { count: 'exact', head: true }).
    if (method === 'HEAD') {
      const n = rows.filter(match).length
      return new Response(null, { status: 200, headers: { 'content-range': n ? `0-${n - 1}/${n}` : '*/0' } })
    }
    if (method === 'GET') {
      let hit = rows.filter(match)
      const order = url.searchParams.get('order')
      if (order) {
        const [col, dir] = order.split('.')
        hit = [...hit].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (dir === 'desc' ? -1 : 1))
      }
      const limit = Number(url.searchParams.get('limit') ?? '') || null
      return respond(limit ? hit.slice(0, limit) : hit)
    }
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
      // What the Worker writes for a business is that business's (business_id's default in the database).
      const business = Number(headers.get('x-business-id')) || null
      const businessOf = (r: Row) => (r.business_id as number | undefined) ?? FIRST_BUSINESS
      for (const raw of (Array.isArray(body) ? body : [body!])) {
        const item = business && !UNSCOPED.has(name) && raw.business_id === undefined ? { ...raw, business_id: business } : raw
        const existing = keys && rows.find(r => keys.every(k => r[k] === item[k]) && (UNSCOPED.has(name) || businessOf(r) === businessOf(item)))
        if (existing && prefer.includes('resolution=ignore-duplicates')) continue
        if (existing && !prefer.includes('resolution=merge-duplicates')) return json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409)
        if (existing) { Object.assign(existing, item); out.push(existing) } else {
          const r = { ...(keys && !AUTO_ID.has(name) ? {} : { id: UUID_ID.has(name) ? crypto.randomUUID() : this.nextId++ }), ...item }
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

  /** Supabase Storage: make a bucket, upload, sign links, remove (an upload to a missing bucket fails as the real one does). */
  private storage(url: URL, method: string, init: RequestInit) {
    const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ''))
    const body = () => JSON.parse(String(init.body)) as Record<string, unknown>
    if (method === 'POST' && path === '/bucket') {
      const { name, id } = body() as { name?: string; id?: string }
      this.buckets.add(String(id ?? name))
      return json({ name: id ?? name })
    }
    const sign = path.match(/^\/object\/sign\/([^/]+)$/)
    if (method === 'POST' && sign) {
      const { paths } = body() as { paths: string[] }
      return json(paths.map(p => (this.files.has(`${sign[1]}/${p}`)
        ? { path: p, signedURL: `/object/sign/${sign[1]}/${p}?token=signed`, error: null }
        : { path: p, signedURL: null, error: 'Object not found' })))
    }
    const object = path.match(/^\/object\/([^/]+)(?:\/(.+))?$/)
    if (!object) return json({ message: 'not found' }, 404)
    const [, bucket, key] = object
    if (method === 'POST' && key) {
      if (!this.buckets.has(bucket)) return json({ statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' }, 400)
      const raw = init.body
      const bytes = raw instanceof Uint8Array ? raw : raw instanceof ArrayBuffer ? new Uint8Array(raw) : new TextEncoder().encode(String(raw ?? ''))
      this.files.set(`${bucket}/${key}`, { bytes, type: new Headers(init.headers).get('content-type') ?? '' })
      return json({ Key: `${bucket}/${key}`, Id: key })
    }
    if (method === 'DELETE' && !key) {
      const { prefixes } = body() as { prefixes: string[] }
      const gone = prefixes.filter(p => this.files.delete(`${bucket}/${p}`))
      return json(gone.map(name => ({ name, bucket_id: bucket })))
    }
    return json({ message: `fake Supabase storage: ${method} ${path} not supported` }, 405)
  }

  /** A new session for this person (access tokens work with /auth/v1/user; refresh tokens rotate). */
  session(uid: string, expiresIn = 3600) {
    const person = this.table('profiles').find(p => p.id === uid)!
    const access = `access-${this.nextId++}`, refresh = `refresh-${this.nextId++}`
    this.people.set(access, { id: uid, role: person.role as 'admin' | 'employee' })
    this.refreshTokens.set(refresh, uid)
    return { access_token: access, refresh_token: refresh, token_type: 'bearer', expires_in: expiresIn, expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      user: { id: uid, aud: 'authenticated', role: 'authenticated', email: person.email, app_metadata: {}, user_metadata: {}, created_at: '' } }
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
