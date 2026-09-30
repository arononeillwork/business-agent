// Test accounts and clean-up for live tests against a real Supabase project.
// Only ever touches accounts with the @business-agent.test domain.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Page, TestInfo } from '@playwright/test'

export const DOMAIN = 'business-agent.test'
export const PASSWORD = process.env.E2E_PASSWORD ?? `e2e-${Math.random().toString(36).slice(2)}-Aa1!`
export const EMPLOYEE_PIN = '2468'

export const USERS = {
  admin: { email: `e2e-admin@${DOMAIN}`, name: 'Ana Test', role: 'admin', can_see_pay: true },
  employee: { email: `e2e-employee@${DOMAIN}`, name: 'Eva Test', role: 'employee', can_see_pay: false },
  other: { email: `e2e-other@${DOMAIN}`, name: 'Omar Test', role: 'employee', can_see_pay: false },
  kiosk: { email: `e2e-tablet@${DOMAIN}`, name: 'Tablet Test', role: 'kiosk', can_see_pay: false },
} as const
export type UserKey = keyof typeof USERS

export interface LiveConfig { supabaseUrl: string; supabaseKey: string }

export async function liveConfig(baseURL: string): Promise<LiveConfig> {
  const res = await fetch(`${baseURL}/api/config`)
  return res.json() as Promise<LiveConfig>
}

export function service(cfg: LiveConfig): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY to run live tests')
  return createClient(cfg.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function signedIn(cfg: LiveConfig, who: UserKey) {
  const sb = createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email: USERS[who].email, password: PASSWORD })
  if (error) throw error
  return { sb, session: data.session!, userId: data.user.id }
}

async function testUserIds(admin: SupabaseClient) {
  const ids: Record<string, string> = {}
  for (let page = 1; page < 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    for (const u of data.users) if (u.email?.endsWith(`@${DOMAIN}`)) ids[u.email] = u.id
    if (data.users.length < 200) break
  }
  return ids
}

/** Remove everything the test accounts created, then the accounts. */
export async function cleanUp(admin: SupabaseClient) {
  const ids = Object.values(await testUserIds(admin))
  if (!ids.length) return
  const must = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message) }
  must(await admin.from('correction_requests').delete().in('profile_id', ids))
  must(await admin.from('time_entries').delete().in('profile_id', ids))
  must(await admin.from('shifts').delete().in('profile_id', ids))
  must(await admin.from('shifts').delete().in('created_by', ids))
  must(await admin.from('calendar_events').delete().in('created_by', ids))
  must(await admin.from('pay_rates').delete().in('profile_id', ids))
  must(await admin.from('kiosk_attempts').delete().in('profile_id', ids))
  // Rows the journey tests (live-journeys.spec.ts) may leave behind. Columns that point at a
  // test account without "on delete" would otherwise block deleting the account.
  must(await admin.from('time_off').delete().in('profile_id', ids))
  must(await admin.from('expenses').delete().like('name', `${TEST_ROW_PREFIX}%`))
  must(await admin.from('expenses').update({ updated_by: null }).in('updated_by', ids))
  for (const table of ['business', 'business_admin_notes', 'settings']) {
    must(await admin.from(table).update({ updated_by: null }).in('updated_by', ids))
  }
  await purgeTestAlerts(admin, ids)
  await Promise.all(ids.map(async id => must(await admin.auth.admin.deleteUser(id))))
}

/** Names of rows the tests create (expenses, events) start with this, so clean-up can find them. */
export const TEST_ROW_PREFIX = 'E2E test '

/** An outside business with a read-only login (payroll + finances), for the partner journey. */
export const PARTNER = {
  email: `e2e-partner@${DOMAIN}`, name: 'Paula Test', company: 'E2E Gestoría Test', access: ['payroll', 'finances'],
} as const

/** Create the partner account (after setUp). cleanUp removes it with the other test accounts. */
export async function addPartner(cfg: LiveConfig) {
  const admin = service(cfg)
  const { data, error } = await admin.auth.admin.createUser({
    email: PARTNER.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: PARTNER.name },
  })
  if (error) throw error
  const { error: e2 } = await admin.from('profiles').update({
    role: 'partner', can_see_pay: false, active: true, partner_company: PARTNER.company, partner_access: [...PARTNER.access],
  }).eq('id', data.user.id)
  if (e2) throw e2
  return data.user.id
}

/**
 * Drop WhatsApp alerts about test accounts that haven't gone out yet (e.g. "Eva Test requested
 * time off" queued for the real admins), so the tests never message real people.
 */
export async function purgeTestAlerts(admin: SupabaseClient, ids: string[] = []) {
  const names = [...Object.values(USERS).map(u => u.name), PARTNER.name]
  const must = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message) }
  for (const name of names) {
    must(await admin.from('outbox').delete().eq('kind', 'whatsapp').in('status', ['pending', 'failed'])
      .contains('payload', { params: [name] }))
  }
  for (const id of ids) {
    must(await admin.from('outbox').delete().eq('kind', 'whatsapp').in('status', ['pending', 'failed'])
      .contains('payload', { profile_id: id }))
  }
}

/** Fresh test accounts with known roles, a pay rate for "other", and a kiosk PIN for "employee". */
/** Time the set-up and clean-up hooks may take: they create and delete real accounts. */
export const HOOK_TIMEOUT = 120_000

export async function setUp(cfg: LiveConfig) {
  const admin = service(cfg)
  await cleanUp(admin)
  // In parallel: Supabase's account API can be slow, and one-by-one ran past the hook timeout.
  await Promise.all(Object.values(USERS).map(async u => {
    const { error } = await admin.auth.admin.createUser({
      email: u.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: u.name },
    })
    if (error) throw error
  }))
  const ids = await testUserIds(admin)
  await Promise.all(Object.values(USERS).map(async u => {
    const { error } = await admin.from('profiles')
      .update({ role: u.role, can_see_pay: u.can_see_pay, active: true }).eq('id', ids[u.email])
    if (error) throw error
  }))
  const { error } = await admin.from('pay_rates').insert([
    { profile_id: ids[USERS.other.email], hourly_rate: 11.5 },
    { profile_id: ids[USERS.employee.email], hourly_rate: 9.25 },
  ])
  if (error) throw error
  const emp = await signedIn(cfg, 'employee')
  const pin = await emp.sb.rpc('set_pin', { p_pin: EMPLOYEE_PIN })
  if (pin.error) throw pin.error
  return { admin, ids }
}

/**
 * Records what the browser did on the network: failed requests (never reached the server, so
 * they are missing from Supabase's logs), error responses, slow requests and console errors.
 * Printed only when a test fails, so a flaky live failure explains itself in the CI log.
 */
export function recordNetwork(test: {
  beforeEach: (fn: (args: { page: Page }) => void) => void
  afterEach: (fn: (args: { page: Page }, info: TestInfo) => void) => void
}) {
  const logs = new WeakMap<Page, string[]>()
  test.beforeEach(({ page }) => {
    const log: string[] = []
    const t0 = Date.now()
    const at = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`
    const short = (u: string) => u.replace(/^https?:\/\/[^/]+/, '').slice(0, 110)
    const started = new Map<object, number>()
    page.on('request', r => { started.set(r, Date.now()); if (!/\.(js|css|png|svg|woff2?)(\?|$)/.test(r.url())) log.push(`${at()} → ${r.method()} ${short(r.url())}`) })
    page.on('requestfailed', r => log.push(`${at()} ✗ ${r.method()} ${short(r.url())} FAILED: ${r.failure()?.errorText}`))
    page.on('response', r => {
      const ms = Date.now() - (started.get(r.request()) ?? Date.now())
      if (r.status() >= 400 || ms > 1500) log.push(`${at()} ← ${r.status()} ${short(r.url())} (${ms} ms)`)
    })
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.push(`${at()} console.${m.type()}: ${m.text().slice(0, 200)}`) })
    page.on('pageerror', e => log.push(`${at()} page error: ${e.message.slice(0, 200)}`))
    logs.set(page, log)
  })
  test.afterEach(({ page }, info) => {
    if (info.status === info.expectedStatus) return
    const log = logs.get(page) ?? []
    console.log(`\n── Network and console for "${info.title}" (last ${Math.min(log.length, 80)} of ${log.length}) ──\n${log.slice(-80).join('\n')}\n`)
  })
}
