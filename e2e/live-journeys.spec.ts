// Live user journeys: every role clicks through the real app against the real Supabase project,
// so a button that leads to an error page (or a page that throws) is caught. Skipped unless
// E2E_LIVE=1.
//
//   E2E_LIVE=1 SUPABASE_SERVICE_ROLE_KEY=... npx playwright test e2e/live-journeys.spec.ts --project desktop
//   (add E2E_BASE_URL=https://<worker-url> to test a deployed copy instead of the local one)
//
// Uses the same @business-agent.test accounts as live.spec.ts, plus a partner account. Both files
// reset those accounts, so run them one after the other (--workers=1), never side by side.
// Anything it changes on the real business (phone, an alert switch) is put back straight away,
// and every row it creates is removed afterwards.
import { expect, test as base, type Page } from '@playwright/test'
import { FEATURES } from '../src/app/features'
import {
  PARTNER, PASSWORD, TEST_ROW_PREFIX, USERS, addPartner, cleanUp, liveConfig, purgeTestAlerts, service, setUp,
  type LiveConfig, type UserKey,
} from './live/fixtures'

// Every test fails on an uncaught error thrown by the app's own page (not Google's or Microsoft's).
const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [async ({ page, baseURL }, use) => {
    const errors: string[] = []
    const app = new URL(baseURL!).origin
    page.on('pageerror', e => {
      let origin = ''
      try { origin = new URL(page.url()).origin } catch { /* about:blank */ }
      if (origin === app || origin === 'null' || origin === '') errors.push(`${e.name}: ${e.message}`)
    })
    await use(errors)
    expect(errors, 'uncaught errors in the page').toEqual([])
  }, { auto: true }],
})

test.skip(!process.env.E2E_LIVE, 'Live tests need E2E_LIVE=1 and SUPABASE_SERVICE_ROLE_KEY')
test.describe.configure({ mode: 'serial' })

const NET = { timeout: 10_000 }
const tag = Math.random().toString(36).slice(2, 7)
const PARTNER_EXPENSE = `${TEST_ROW_PREFIX}partner-visible ${tag}`

let cfg: LiveConfig
let ids: Record<string, string>
let business: { name: string; phone: string | null }
let shiftReminders: boolean

test.beforeAll(async ({ baseURL }) => {
  cfg = await liveConfig(baseURL!)
  ;({ ids } = await setUp(cfg))
  await addPartner(cfg)
  const sb = service(cfg)
  const b = await sb.from('business').select('name, phone').eq('id', 1).single()
  if (b.error) throw new Error(b.error.message)
  business = b.data
  const s = await sb.from('settings').select('alert_shift_reminders').eq('id', 1).single()
  if (s.error) throw new Error(s.error.message)
  shiftReminders = s.data.alert_shift_reminders
  // One expense that finance partners (read-only) and admins can see; never shown to employees.
  const e = await sb.from('expenses').insert({ name: PARTNER_EXPENSE, amount: 1.11, category: 'E2E', source: 'app' })
  if (e.error) throw new Error(e.error.message)
})

test.afterAll(async () => {
  if (!cfg) return
  const sb = service(cfg)
  // Put back anything a failed test may have left changed on the real business.
  if (business) {
    const now = await sb.from('business').select('phone').eq('id', 1).single()
    if (now.data && now.data.phone !== business.phone) await sb.from('business').update({ phone: business.phone }).eq('id', 1)
  }
  if (shiftReminders !== undefined) {
    const now = await sb.from('settings').select('alert_shift_reminders').eq('id', 1).single()
    if (now.data && now.data.alert_shift_reminders !== shiftReminders) {
      await sb.from('settings').update({ alert_shift_reminders: shiftReminders }).eq('id', 1)
    }
  }
  await cleanUp(sb)
})

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
async function signInUi(page: Page, email: string) {
  await page.goto('/?live')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible(NET)
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0, NET)
}
const signIn = (page: Page, who: UserKey) => signInUi(page, USERS[who].email)

const toast = (page: Page, text: string | RegExp) =>
  expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible(NET)

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' })

/** Let the page's data load, then make sure nothing on it is an error. */
async function expectNoErrorShown(page: Page, where: string) {
  await page.waitForLoadState('networkidle', NET).catch(() => { /* a live connection may keep it busy */ })
  await expect.soft(page.locator('.MuiAlert-colorError, .MuiAlert-standardError, .MuiAlert-filledError'), `error shown on ${where}`)
    .toHaveCount(0)
  await expect.soft(page.getByText("Can't reach the app"), `start-up error on ${where}`).toHaveCount(0)
  await expect.soft(page.getByRole('heading', { name: 'Sign in' }), `signed out on ${where}`).toHaveCount(0)
}

const isoDay = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86400_000).toISOString().slice(0, 10)

// ---------------------------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------------------------
test('health: the Worker answers and reaches Supabase', async ({ request }) => {
  const res = await request.get('/api/health?deep=1', NET)
  const body = await res.json()
  expect(res.status(), JSON.stringify(body)).toBe(200)
  expect(body).toMatchObject({ ok: true, supabase: 'up' })
})

// ---------------------------------------------------------------------------------------------
// Sign-in buttons: Google and Microsoft never end on a raw error page.
// ---------------------------------------------------------------------------------------------
for (const [label, hosts] of [
  ['Google', /(^|\.)accounts\.google\.com$/],
  ['Microsoft', /(^|\.)(login\.microsoftonline\.com|login\.live\.com)$/],
] as const) {
  test(`sign-in: the ${label} button reaches ${label} or explains it isn't switched on`, async ({ page }) => {
    await page.goto('/?live')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible(NET)
    const button = page.getByRole('button', { name: label, exact: true })
    await expect(button).toBeVisible()
    const explained = page.getByText(/not switched on|being set up/i)

    if (await button.isDisabled()) {
      // Allowed: the app knows the method is off and says so instead of offering a broken button.
      await expect(explained.first()).toBeVisible()
      return
    }
    await button.click()
    const outcome = async () => {
      let host = ''
      try { host = new URL(page.url()).hostname } catch { /* mid-navigation */ }
      if (hosts.test(host)) return 'provider'
      try {
        if (await page.getByRole('alert').filter({ hasText: /not switched on|being set up/i }).count()) return 'explained'
      } catch { /* page navigating */ }
      return `stuck at ${page.url()}`
    }
    await expect.poll(outcome, {
      timeout: 15_000,
      message: `${label} sign-in must open ${label}'s page or explain it isn't switched on (a raw Supabase error page is a bug)`,
    }).toMatch(/^(provider|explained)$/)

    if ((await outcome()) === 'provider') {
      // Reached the provider: it must be its sign-in page, not its error page (bad redirect URL, wrong app id…).
      await page.waitForLoadState('domcontentloaded').catch(() => {})
      expect(page.url(), `${label} showed an error page`).not.toMatch(/\/oauth\/error|authError=|[?&]error=/)
      const text = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '')
      expect(text, `${label} showed an error`).not.toMatch(/AADSTS\d+|redirect_uri_mismatch|invalid_client|Error 400/)
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------------------------
test.describe('admin', () => {
  test('every page in the menu opens without an error', async ({ page }) => {
    await signIn(page, 'admin')
    const pages: { link: string; path: string; check: (p: Page) => Promise<void> }[] = [
      { link: 'Business', path: '/business', check: p => expect(p.getByRole('heading', { level: 1, name: business.name })).toBeVisible(NET) },
      { link: 'Home: Today', path: '/', check: p => expect(p.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible(NET) },
      ...['Rota', 'Time off', 'Timecards', 'Team', 'Opening hours', 'Brand', 'Calendar', 'Sports', 'Music', 'Finances', 'Alerts', 'Connections', 'My account', 'Appearance'].map(name => ({
        link: name,
        path: { 'Time off': '/time-off', 'My account': '/account', 'Opening hours': '/opening-hours' }[name] ?? `/${name.toLowerCase()}`,
        check: (p: Page) => expect(p.getByRole('heading', { level: 1, name: { Connections: 'Business connections' }[name] ?? name, exact: true })).toBeVisible(NET),
      })),
    ]
    for (const { link, path, check } of pages) {
      await test.step(link, async () => {
        await nav(page).getByRole('link', { name: link, exact: true }).click()
        await expect(page).toHaveURL(url => new URL(url).pathname === path, NET)
        await check(page)
        await expectNoErrorShown(page, link)
      })
    }
    if (FEATURES.kiosk) await test.step('Café tablet', async () => {
      await nav(page).getByRole('link', { name: 'Café tablet' }).click()
      await expect(page).toHaveURL(/\/kiosk$/, NET)
      await expect(page.getByText('Tap your name')).toBeVisible(NET)
      await expectNoErrorShown(page, 'Café tablet')
    })
  })

  test('edits the business phone, sees it saved, and puts it back', async ({ page }) => {
    const phone = `+34 600 ${String(Math.floor(Math.random() * 1e6)).padStart(6, '0').replace(/(\d{3})(\d{3})/, '$1 $2')}`
    await signIn(page, 'admin')
    await page.goto('/business')
    await expect(page.getByRole('heading', { level: 1, name: business.name })).toBeVisible(NET)
    try {
      await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
      const dialog = page.getByRole('dialog', { name: 'Business details' })
      await dialog.getByRole('textbox', { name: 'Phone', exact: true }).fill(phone)
      await dialog.getByRole('button', { name: 'Save' }).click()
      await toast(page, /^Saved$/)
      await expect(page.getByText(phone)).toBeVisible(NET)
      await page.reload()
      await expect(page.getByText(phone)).toBeVisible(NET) // really saved, not just on screen
      const { data } = await service(cfg).from('business').select('phone').eq('id', 1).single()
      expect(data?.phone).toBe(phone)
    } finally {
      await service(cfg).from('business').update({ phone: business.phone }).eq('id', 1)
    }
    await expectNoErrorShown(page, 'Business')
  })

  test('adds a shift on the rota, sees it, then deletes it', async ({ page }) => {
    await signIn(page, 'admin')
    await nav(page).getByRole('link', { name: 'Rota', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Rota', exact: true })).toBeVisible(NET)
    // Next week, so the shift is never close enough to "now" to trigger reminders or missed clock-in alerts.
    await page.getByRole('button', { name: 'Next week' }).click()
    await page.getByRole('button', { name: 'Add shift' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add shift' })
    await dialog.getByLabel('Team member').click()
    await page.getByRole('option', { name: USERS.other.name }).click()
    await dialog.getByLabel('Start').fill('06:15')
    await dialog.getByLabel('End').fill('07:45')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Shift saved')
    const block = page.getByText('06:15–07:45')
    await expect(block).toHaveCount(1, NET)

    const { data } = await service(cfg).from('shifts').select('id, created_by').eq('profile_id', ids[USERS.other.email])
    expect(data?.some(s => s.created_by === ids[USERS.admin.email])).toBeTruthy()

    await block.click()
    const edit = page.getByRole('dialog', { name: 'Edit shift' })
    await edit.getByRole('button', { name: 'Delete' }).click()
    await toast(page, 'Shift removed')
    await expect(page.getByText('06:15–07:45')).toHaveCount(0, NET)
    await expectNoErrorShown(page, 'Rota')
  })

  test('adds a calendar event, sees it, then deletes it', async ({ page }) => {
    const title = `${TEST_ROW_PREFIX}event ${tag}`
    await signIn(page, 'admin')
    await nav(page).getByRole('link', { name: 'Calendar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible(NET)
    await page.getByRole('button', { name: 'Add event' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add event' })
    await dialog.getByLabel('Title').fill(title)
    await dialog.getByLabel('Admins only').check() // keep it off the team's and partners' calendars
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Event saved')
    const pill = page.getByText(title)
    await expect(pill.first()).toBeVisible(NET)

    await pill.first().click()
    const edit = page.getByRole('dialog', { name: 'Edit event' })
    await edit.getByRole('button', { name: 'Delete' }).click()
    await toast(page, 'Event removed')
    await expect(page.getByText(title)).toHaveCount(0, NET)
    await expectNoErrorShown(page, 'Calendar')
  })

  test('adds an expense, sees the total change, removes it and the total goes back', async ({ page }) => {
    const name = `${TEST_ROW_PREFIX}expense ${tag}`
    await signIn(page, 'admin')
    await nav(page).getByRole('link', { name: 'Finances', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Finances', exact: true })).toBeVisible(NET)
    await expect(page.getByText(PARTNER_EXPENSE)).toBeVisible(NET) // list loaded
    const total = page.locator('tfoot tr').first()
    const before = (await total.innerText()).trim()

    await page.getByRole('button', { name: 'Add expense' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add expense' })
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByLabel('Per month').fill('12.34')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Expense saved')
    await expect(page.getByText(name)).toBeVisible(NET)
    const totalText = async () => (await total.innerText()).trim()
    await expect.poll(totalText, NET).not.toBe(before)

    await page.getByRole('button', { name: `Edit ${name}` }).click()
    const edit = page.getByRole('dialog', { name: 'Edit expense' })
    await edit.getByRole('button', { name: 'Remove' }).click()
    await toast(page, 'Expense removed')
    await expect(page.getByText(name)).toHaveCount(0, NET)
    await expect.poll(totalText, NET).toBe(before)
    await expectNoErrorShown(page, 'Finances')
  })

  test('switches an alert off and back on', async ({ page }) => {
    await signIn(page, 'admin')
    await nav(page).getByRole('link', { name: 'Alerts', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Alerts', exact: true })).toBeVisible(NET)
    const reminders = page.getByRole('switch', { name: 'Shift reminders' }).or(page.getByLabel('Shift reminders'))
    await expect(reminders).toBeVisible(NET)
    const was = await reminders.isChecked()
    try {
      await reminders.click()
      await toast(page, `Shift reminders: switched ${was ? 'off' : 'on'}`)
      await expect(reminders).toBeChecked({ checked: !was, ...NET })
      await reminders.click()
      await toast(page, `Shift reminders: switched ${was ? 'on' : 'off'}`)
      await expect(reminders).toBeChecked({ checked: was, ...NET })
    } finally {
      await service(cfg).from('settings').update({ alert_shift_reminders: shiftReminders }).eq('id', 1)
    }
    const { data } = await service(cfg).from('settings').select('alert_shift_reminders').eq('id', 1).single()
    expect(data?.alert_shift_reminders).toBe(shiftReminders)
    await expectNoErrorShown(page, 'Alerts')
  })

  test('partners (and the café tablet, when off) have no menu item, and their pages send admins home', async ({ page }) => {
    test.skip(FEATURES.partners, 'Partners are switched on')
    await signIn(page, 'admin')
    await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible(NET)
    await expect(nav(page).getByRole('link', { name: 'Partners', exact: true })).toHaveCount(0)
    await page.goto('/partners')
    await expect(page).toHaveURL(url => new URL(url).pathname === '/', NET)
    if (!FEATURES.kiosk) {
      await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible(NET)
      await expect(nav(page).getByRole('link', { name: 'Café tablet', exact: true })).toHaveCount(0)
      await page.goto('/kiosk')
      await expect(page).toHaveURL(url => new URL(url).pathname === '/', NET)
    }
  })

  test('partners page lists the partner, and an invite without a company is refused', async ({ page }) => {
    test.skip(!FEATURES.partners, 'The Partners page is switched off for now')
    await signIn(page, 'admin')
    await nav(page).getByRole('link', { name: 'Partners', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Partners', exact: true })).toBeVisible(NET)
    const card = page.locator('.MuiCard-root', { hasText: PARTNER.company })
    await expect(card).toBeVisible(NET)
    await expect(card).toContainText(PARTNER.name)
    await expect(card).toContainText('Payroll')
    await expect(card).toContainText('Finances')
    await expect(card).not.toContainText('Calendar')
    await expectNoErrorShown(page, 'Partners')

    // The Worker checks the company before sending anything, so no email goes out.
    await page.getByRole('button', { name: 'Invite partner' }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite a partner' })
    await dialog.getByLabel('Contact name').fill('Nobody Test')
    await dialog.getByRole('textbox', { name: 'Email' }).fill(`e2e-invite-${tag}@business-agent.test`)
    await dialog.getByRole('button', { name: 'Create account' }).click()
    await toast(page, /company/i)
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
  })

  test('creates a staff account with a temporary password, and that person can sign in with it', async ({ page, browser }) => {
    const email = `e2e-temp-${tag}@business-agent.test`
    await signIn(page, 'admin')
    await nav(page).getByRole('link', { name: 'Team', exact: true }).click()
    await page.getByRole('button', { name: 'Invite' }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite to the team' })
    await dialog.getByLabel('Full name').fill('Temp Test')
    await dialog.getByRole('textbox', { name: 'Email' }).fill(email)
    const password = await dialog.getByRole('textbox', { name: 'Temporary password' }).inputValue()
    await dialog.getByRole('button', { name: 'Create account' }).click()
    await toast(page, 'Account created')
    await dialog.getByRole('button', { name: 'Done' }).click()

    // The new person signs in on their own device, with no email involved.
    const theirs = await browser.newPage()
    await theirs.goto('/?live')
    await theirs.getByRole('textbox', { name: 'Email' }).fill(email)
    await theirs.getByLabel('Password').fill(password)
    await theirs.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(theirs.getByRole('heading', { name: /Hola, Temp/ })).toBeVisible(NET)
    await theirs.close()
    const { data } = await service(cfg).from('profiles').select('role, active').eq('email', email).single()
    expect(data).toEqual({ role: 'employee', active: true })
  })
})

// ---------------------------------------------------------------------------------------------
// Employee
// ---------------------------------------------------------------------------------------------
test.describe('employee', () => {
  test('has no admin or money pages in the menu, and /finances shows no expenses', async ({ page }) => {
    await signIn(page, 'employee')
    await expect(page.getByRole('heading', { name: 'Hola, Eva' })).toBeVisible(NET)
    for (const name of ['Business', 'Home: Today', 'Rota', 'Time off', 'Timecards', 'Calendar', 'Team', 'My account']) {
      await expect.soft(nav(page).getByRole('link', { name, exact: true })).toBeVisible()
    }
    for (const name of ['Finances', 'Alerts', 'Connections', 'Partners', 'Café tablet']) {
      await expect.soft(nav(page).getByRole('link', { name, exact: true })).toHaveCount(0)
    }
    await expectNoErrorShown(page, 'Today')

    await page.goto('/finances')
    await expect(page.getByRole('heading', { name: 'Finances', exact: true })).toBeVisible(NET)
    await expect(page.getByText('only visible to admins')).toBeVisible(NET)
    await expect(page.getByText(PARTNER_EXPENSE)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add expense' })).toHaveCount(0)
    for (const path of ['/alerts', '/connections', '/partners']) {
      await page.goto(path)
      await expect(page).toHaveURL(url => new URL(url).pathname === '/', NET)
    }
  })

  test('clocks in and out on Today', async ({ page }) => {
    await signIn(page, 'employee')
    await expect(page.getByRole('heading', { name: 'Hola, Eva' })).toBeVisible(NET)
    await page.getByRole('button', { name: 'Clock in' }).click()
    await toast(page, 'Clocked in')
    await page.getByRole('button', { name: 'Clock out' }).click()
    const summary = page.getByRole('dialog', { name: 'Workday summary' })
    await expect(summary).toBeVisible(NET)
    await summary.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('button', { name: 'Clock in' })).toBeVisible(NET)

    const { data } = await service(cfg).from('time_entries').select('clock_in, clock_out').eq('profile_id', ids[USERS.employee.email])
    expect(data?.some(e => e.clock_out)).toBeTruthy()
    await expectNoErrorShown(page, 'Today')
  })

  test('requests time off and sees it waiting for approval', async ({ page }) => {
    const from = isoDay(200), to = isoDay(201)
    await signIn(page, 'employee')
    await nav(page).getByRole('link', { name: 'Time off', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Time off', exact: true })).toBeVisible(NET)
    await page.getByRole('button', { name: 'Request time off' }).click()
    const dialog = page.getByRole('dialog', { name: 'Request time off' })
    await dialog.getByLabel('First day').fill(from)
    await dialog.getByLabel('Last day').fill(to)
    await dialog.getByLabel(/Note for the manager/).fill(`${TEST_ROW_PREFIX}${tag}`)
    try {
      await dialog.getByRole('button', { name: 'Send request' }).click()
      await toast(page, 'Request sent')
    } finally {
      // The request queues a WhatsApp for the real admins; take it back out before it's sent.
      await purgeTestAlerts(service(cfg), Object.values(ids))
    }
    // Saved in the database first, then shown: tells "not saved" apart from "page didn't refresh".
    await expect.poll(async () => (await service(cfg).from('time_off').select('status, starts_on, ends_on')
      .eq('profile_id', ids[USERS.employee.email])).data, { ...NET, message: 'time-off request saved' })
      .toContainEqual({ status: 'pending', starts_on: from, ends_on: to })
    await expect(page.getByText('Waiting for approval').first(),
      'the saved request appears in "My requests" without reloading').toBeVisible(NET)
    await expectNoErrorShown(page, 'Time off')
  })
})

// ---------------------------------------------------------------------------------------------
// Partner (outside business, read-only payroll + finances)
// ---------------------------------------------------------------------------------------------
test.describe('partner', () => {
  test('lands on Business and only sees Business, Rota, Timecards, Finances and My account', async ({ page }) => {
    await signInUi(page, PARTNER.email)
    await expect(page).toHaveURL(url => new URL(url).pathname === '/business', NET)
    await expect(page.getByRole('heading', { level: 1, name: business.name })).toBeVisible(NET)
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0)
    for (const name of ['Business', 'Rota', 'Timecards', 'Finances', 'My account']) {
      await expect.soft(nav(page).getByRole('link', { name, exact: true })).toBeVisible()
    }
    for (const name of ['Today', 'Time off', 'Calendar', 'Team', 'Partners', 'Alerts', 'Connections', 'Café tablet']) {
      await expect.soft(nav(page).getByRole('link', { name, exact: true })).toHaveCount(0)
    }
    await expectNoErrorShown(page, 'Business (partner)')

    for (const [link, path] of [['Rota', '/rota'], ['Timecards', '/timecards'], ['My account', '/account']] as const) {
      await test.step(link, async () => {
        await nav(page).getByRole('link', { name: link, exact: true }).click()
        await expect(page).toHaveURL(url => new URL(url).pathname === path, NET)
        await expect(page.getByRole('heading', { level: 1, name: link, exact: true })).toBeVisible(NET)
        if (link === 'Rota') await expect(page.getByRole('button', { name: 'Add shift' })).toHaveCount(0)
        await expectNoErrorShown(page, `${link} (partner)`)
      })
    }
  })

  test('sees finances read-only', async ({ page }) => {
    await signInUi(page, PARTNER.email)
    await nav(page).getByRole('link', { name: 'Finances', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Finances', exact: true })).toBeVisible(NET)
    await expect(page.getByText(PARTNER_EXPENSE)).toBeVisible(NET)
    await expect(page.getByText('Read-only', { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add expense' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0)
    await expectNoErrorShown(page, 'Finances (partner)')
  })

  test('staff-only pages send the partner back to Business', async ({ page }) => {
    await signInUi(page, PARTNER.email)
    await expect(page).toHaveURL(url => new URL(url).pathname === '/business', NET)
    for (const path of ['/team', '/calendar', '/time-off', '/partners', '/alerts', '/']) {
      await test.step(path, async () => {
        await page.goto(path)
        await expect(page).toHaveURL(url => new URL(url).pathname === '/business', NET)
        await expect(page.getByRole('heading', { level: 1, name: business.name })).toBeVisible(NET)
      })
    }
  })
})
