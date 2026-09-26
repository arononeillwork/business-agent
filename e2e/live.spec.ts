// Live end-to-end tests against the real Supabase project: real sign-in, database rules and
// the AI connector's OAuth flow. Skipped unless E2E_LIVE=1.
//
//   E2E_LIVE=1 SUPABASE_SERVICE_ROLE_KEY=... npx playwright test e2e/live.spec.ts
//   (add E2E_BASE_URL=https://<worker-url> to test a deployed copy instead of the local one)
//
// Creates @business-agent.test accounts and removes them and their data afterwards.
import { createHash, randomBytes } from 'node:crypto'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { EMPLOYEE_PIN, PASSWORD, USERS, cleanUp, liveConfig, service, setUp, signedIn, type LiveConfig, type UserKey } from './live/fixtures'

test.skip(!process.env.E2E_LIVE, 'Live tests need E2E_LIVE=1 and SUPABASE_SERVICE_ROLE_KEY')
test.describe.configure({ mode: 'serial' })

let cfg: LiveConfig
let ids: Record<string, string>

test.beforeAll(async ({ baseURL }) => {
  cfg = await liveConfig(baseURL!)
  ;({ ids } = await setUp(cfg))
})

test.afterAll(async () => {
  if (cfg) await cleanUp(service(cfg))
})

async function signInUi(page: Page, who: UserKey) {
  await page.goto('/?live')
  await page.getByLabel('Email').fill(USERS[who].email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

const toast = (page: Page, text: string | RegExp) =>
  expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible({ timeout: 10_000 })

test.describe('sign-in and time tracking', () => {
  test('wrong password is rejected', async ({ page }) => {
    await page.goto('/?live')
    await page.getByLabel('Email').fill(USERS.employee.email)
    await page.getByLabel('Password').fill('not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await toast(page, /Invalid login credentials/i)
  })

  test('employee signs in, clocks in without a shift (flagged), takes a break and clocks out', async ({ page }) => {
    await signInUi(page, 'employee')
    await expect(page.getByRole('heading', { name: 'Hola, Eva' })).toBeVisible()
    await expect(page.getByText('Demo mode')).toHaveCount(0)

    await page.getByRole('button', { name: 'Clock in' }).click()
    await toast(page, 'Clocked in')
    await expect(page.getByText('Unscheduled')).toBeVisible()

    await page.getByRole('button', { name: 'Start break' }).click()
    await page.getByRole('menuitem').first().click()
    await expect(page.getByText('On a break')).toBeVisible()
    await page.getByRole('button', { name: 'End break' }).click()
    await toast(page, 'Welcome back')

    await page.getByRole('button', { name: 'Clock out' }).click()
    await expect(page.getByRole('dialog', { name: 'Workday summary' })).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()

    await page.getByRole('link', { name: 'Timecards' }).first().click()
    await expect(page.getByText('Eva Test')).toBeVisible()
    await expect(page.getByText('Unscheduled').first()).toBeVisible()
  })

  test('the server clock is used and times cannot be written directly', async () => {
    const { sb, userId } = await signedIn(cfg, 'employee')
    const { data } = await sb.from('time_entries').select('clock_in').eq('profile_id', userId)
    expect(data!.length).toBeGreaterThan(0)
    expect(Math.abs(Date.now() - new Date(data![0].clock_in).getTime())).toBeLessThan(10 * 60_000)

    const insert = await sb.from('time_entries').insert({ profile_id: userId, clock_in: new Date().toISOString(), source: 'phone' })
    expect(insert.error?.message).toMatch(/permission denied/)
    const update = await sb.from('time_entries').update({ clock_in: '2020-01-01T00:00:00Z' }).eq('profile_id', userId)
    expect(update.error?.message).toMatch(/permission denied/)
    const del = await sb.from('time_entries').delete().eq('profile_id', userId)
    expect(del.error?.message).toMatch(/permission denied/)
    const still = await service(cfg).from('time_entries').select('id').eq('profile_id', userId)
    expect(still.data!.length).toBe(data!.length)
  })

  test('employees see only their own pay and timecards', async () => {
    const { sb } = await signedIn(cfg, 'employee')
    const rates = await sb.from('pay_rates').select('profile_id, hourly_rate')
    expect(rates.data).toEqual([{ profile_id: ids[USERS.employee.email], hourly_rate: 9.25 }])
    const others = await sb.from('time_entries').select('id').neq('profile_id', ids[USERS.employee.email])
    expect(others.data).toEqual([])
    const audit = await sb.from('audit_log').select('id').limit(1)
    expect(audit.data).toEqual([])
    const pin = await sb.from('profiles').select('pin_hash').limit(1)
    expect(pin.error?.message).toMatch(/permission denied/)
  })

  test('admin sees the timecard, and edits need a reason and are logged', async ({ page }) => {
    await signInUi(page, 'admin')
    await page.getByRole('link', { name: 'Timecards' }).first().click()
    const card = page.locator('.MuiCard-root', { hasText: 'Eva Test' })
    await card.getByRole('button', { name: 'Edit' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Edit timecard' })
    const clockIn = await dialog.getByLabel('Clock in').inputValue()
    const earlier = `${clockIn.slice(0, 11)}${String(Math.max(0, Number(clockIn.slice(11, 13)) - 1)).padStart(2, '0')}${clockIn.slice(13)}`
    await dialog.getByLabel('Clock in').fill(earlier)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'A reason is required')
    await dialog.getByLabel('Reason (required)').fill('E2E: started an hour earlier')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Timecard updated')

    const { data } = await service(cfg).from('time_entry_changes').select('reason, via, changed_by')
      .eq('changed_by', ids[USERS.admin.email])
    expect(data).toContainEqual({ reason: 'E2E: started an hour earlier', via: 'app', changed_by: ids[USERS.admin.email] })
  })

  test('café tablet account only shows the kiosk, and punches with a PIN', async ({ page }) => {
    await signInUi(page, 'kiosk')
    await expect(page.getByText('Tap your name')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Rota' })).toHaveCount(0)

    await page.getByRole('button').filter({ hasText: 'Eva' }).first().click()
    const pad = page.getByRole('dialog')
    await expect(pad).toContainText('Eva Test')
    for (const d of '0000') await pad.getByRole('button', { name: d, exact: true }).click()
    await expect(pad.getByText('Wrong PIN')).toBeVisible()
    for (const d of EMPLOYEE_PIN) await pad.getByRole('button', { name: d, exact: true }).click()
    await expect(page.getByRole('dialog').getByText('Clock in', { exact: true })).toBeVisible()

    const { data } = await service(cfg).from('time_entries').select('source')
      .eq('profile_id', ids[USERS.employee.email]).is('clock_out', null)
    expect(data).toEqual([{ source: 'kiosk' }])
  })
})

// ---------------------------------------------------------------------------------------------
// AI connector: the same flow Claude uses when you add the connector.
// ---------------------------------------------------------------------------------------------
async function connect(request: APIRequestContext, who: UserKey) {
  const redirect = 'https://claude.ai/api/mcp/auth_callback'
  const reg = await request.post('/register', {
    data: { client_name: 'E2E Claude', redirect_uris: [redirect], token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] },
  })
  expect(reg.ok()).toBeTruthy()
  const { client_id } = await reg.json()

  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const auth = await request.get('/authorize', { params: {
    response_type: 'code', client_id, redirect_uri: redirect, code_challenge: challenge,
    code_challenge_method: 'S256', state: 'e2e', scope: '',
  } })
  const html = await auth.text()
  expect(html).toContain('Connect E2E Claude')
  const state = html.match(/name="state" value="([^"]+)"/)![1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')

  const login = await request.post('/authorize', {
    form: { state, email: USERS[who].email, password: PASSWORD }, maxRedirects: 0,
  })
  expect(login.status()).toBe(302)
  const location = new URL(login.headers().location)
  expect(location.origin + location.pathname).toBe(redirect)
  const code = location.searchParams.get('code')!

  const token = await request.post('/token', { form: {
    grant_type: 'authorization_code', code, redirect_uri: redirect, client_id, code_verifier: verifier,
  } })
  expect(token.ok()).toBeTruthy()
  return { client_id, ...(await token.json()) as { access_token: string; refresh_token: string } }
}

async function mcp(request: APIRequestContext, token: string, method: string, params: unknown = {}) {
  const res = await request.post('/mcp', {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream',
      'content-type': 'application/json', 'mcp-protocol-version': '2025-06-18' },
    data: { jsonrpc: '2.0', id: Date.now(), method, params },
  })
  expect(res.status()).toBe(200)
  const text = await res.text()
  return JSON.parse(text.startsWith('{') ? text : text.split('\n').find(l => l.startsWith('data:'))!.slice(5))
}

const callTool = async (request: APIRequestContext, token: string, name: string, args: unknown = {}) => {
  const res = await mcp(request, token, 'tools/call', { name, arguments: args })
  return { isError: !!res.result.isError, text: res.result.content[0].text as string }
}

test.describe('AI connector (MCP over OAuth)', () => {
  test('rejects calls without a token', async ({ request }) => {
    const res = await request.post('/mcp', { data: {} })
    expect(res.status()).toBe(401)
    expect(res.headers()['www-authenticate']).toContain('resource_metadata')
  })

  test('wrong password on the connector sign-in page', async ({ request }) => {
    const reg = await request.post('/register', { data: { client_name: 'E2E', redirect_uris: ['https://claude.ai/cb'],
      token_endpoint_auth_method: 'none' } })
    const { client_id } = await reg.json()
    const html = await (await request.get('/authorize', { params: { response_type: 'code', client_id,
      redirect_uri: 'https://claude.ai/cb', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', state: 's' } })).text()
    const state = html.match(/name="state" value="([^"]+)"/)![1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    const res = await request.post('/authorize', { form: { state, email: USERS.employee.email, password: 'nope' }, maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(await res.text()).toContain('Wrong email or password')
  })

  test('employee connects: own tools only, admin actions refused', async ({ request }) => {
    const { access_token } = await connect(request, 'employee')
    await mcp(request, access_token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } })
    const names = (await mcp(request, access_token, 'tools/list')).result.tools.map((t: { name: string }) => t.name)
    expect(names).toContain('get_schedule')
    expect(names).not.toContain('create_shift')

    const me = await callTool(request, access_token, 'whoami')
    expect(JSON.parse(me.text)).toMatchObject({ name: 'Eva Test', role: 'employee', business: 'Easy Beans Coffee' })

    const team = JSON.parse((await callTool(request, access_token, 'list_team')).text)
    expect(JSON.stringify(team)).not.toContain('hourly_rate')
    const cards = JSON.parse((await callTool(request, access_token, 'list_timecards')).text) as { person: string }[]
    expect(cards.every(c => c.person === 'Eva Test')).toBeTruthy()
  })

  test('admin connects, adds a shift via AI, and it is logged as via AI', async ({ request }) => {
    const { access_token, refresh_token, client_id } = await connect(request, 'admin')
    const day = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10)
    const created = await callTool(request, access_token, 'create_shift',
      { person: 'Omar Test', date: day, start: '08:00', end: '15:30', position: 'Barista' })
    expect(created.isError).toBeFalsy()
    const shift = JSON.parse(created.text).shift
    expect(shift).toMatchObject({ person: 'Omar Test', start: '08:00', end: '15:30' })
    expect(shift.warnings.join(' ')).toContain('without a 15-min break')

    const { data } = await service(cfg).from('audit_log').select('via, actor')
      .eq('table_name', 'shifts').eq('row_id', shift.shift_id)
    expect(data).toContainEqual({ via: 'ai', actor: ids[USERS.admin.email] })

    const refused = await callTool(request, access_token, 'delete_shift', { shift_id: shift.shift_id })
    expect(refused.isError).toBeTruthy()
    expect(refused.text).toContain('confirm')

    // Token refresh also refreshes the Supabase session behind it.
    const refreshed = await request.post('/token', { form: { grant_type: 'refresh_token', refresh_token, client_id } })
    expect(refreshed.ok()).toBeTruthy()
    const { access_token: next } = await refreshed.json()
    const deleted = await callTool(request, next, 'delete_shift', { shift_id: shift.shift_id, confirm: true })
    expect(deleted.isError).toBeFalsy()
  })

  test('REST API runs the same tools with a Supabase token', async ({ request }) => {
    const { session } = await signedIn(cfg, 'employee')
    const res = await request.post('/api/v1/tools/whoami', { headers: { authorization: `Bearer ${session.access_token}` }, data: {} })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).result).toMatchObject({ name: 'Eva Test', role: 'employee' })
    const admin = await request.post('/api/v1/tools/create_shift', { headers: { authorization: `Bearer ${session.access_token}` },
      data: { date: '2030-01-01', start: '08:00', end: '09:00' } })
    expect(admin.status()).toBe(404) // admin tools don't exist for employees
  })
})
