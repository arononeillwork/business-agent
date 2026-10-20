// End-to-end tests in demo mode (in-memory Easy Beans data, no backend needed).
// The browser clock is fixed to Wednesday 30 Sep 2026, 09:00 in Madrid so the sample rota and
// the clock-in rules give the same results whenever the tests run.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { FEATURES } from '../src/app/features'
import { readFileSync } from 'node:fs'

const WED_0900 = new Date('2026-09-30T07:00:00Z') // 09:00 Europe/Madrid (CEST)

/** Open the demo and sign in (everyone starts at the sign-in screen), as the admin by default. */
/** Your own pages (My account, Billing, Referrals, Appearance) open from the account menu: your name at the bottom left. */
async function fromAccountMenu(page: Page, item: string) {
  await page.getByRole('button', { name: /^Account menu/ }).first().click()
  await page.getByRole('menuitem', { name: item }).click()
}

async function open(page: Page, path = '/', email = 'aron@example.com') {
  await page.clock.install({ time: WED_0900 })
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}demo`)
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0)
}

test('the app opens at the sign-in screen and shows nothing before login', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
  await page.goto('/rota')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText('Labour cost')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Email' }).fill('maria@example.com')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Rota' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Rota' })).toBeVisible() // stays signed in
  await page.getByRole('button', { name: 'Sign out' }).first().click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

async function signInAs(page: Page, email: string) {
  await page.getByRole('button', { name: 'Sign out' }).first().click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

const toast = (page: Page, text: string | RegExp) => expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible()

/** In a choose-one group on Connections: pick another app from "Also works with", switch to it and close its details. */
async function switchApp(page: Page, group: Locator, name: string) {
  await group.getByRole('group', { name: /^Other / }).getByRole('button', { name: `Use ${name} instead` }).click()
  const details = page.getByRole('dialog', { name, exact: true })
  await details.getByRole('button', { name: `Switch to ${name}` }).click()
  await page.getByRole('dialog', { name: `Switch to ${name}?` }).getByRole('button', { name: `Switch to ${name}` }).click()
  await expect(details).toContainText('Connected')
  await details.getByRole('button', { name: 'Close' }).click()
}

test.describe('clock in and out', () => {
  test('admin clocks in on time, takes a break and sees the workday summary', async ({ page }) => {
    await open(page)
    await expect(page.getByRole('heading', { name: 'Hola, Aron' })).toBeVisible()
    await expect(page.getByText('Your shift today: 08:00–12:00')).toBeVisible()

    await page.getByRole('button', { name: 'Clock in' }).click()
    await toast(page, 'Clocked in')
    await expect(page.getByText('Clocked in', { exact: true })).toBeVisible()
    await expect(page.getByText('Since 09:00')).toBeVisible()

    await page.getByRole('button', { name: 'Start break' }).click()
    await page.getByRole('menuitem', { name: 'Rest 15 min (paid)' }).click()
    await expect(page.getByText('On a break')).toBeVisible()

    await page.clock.fastForward('15:00')
    await page.getByRole('button', { name: 'End break' }).click()
    await toast(page, 'Welcome back')

    await page.clock.fastForward('02:00:00')
    await page.getByRole('button', { name: 'Clock out' }).click()
    const summary = page.getByRole('dialog', { name: 'Workday summary' })
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('Clock in09:00')
    await expect(summary).toContainText('Breaks15 min')
    await expect(summary).toContainText('Paid hours2h 15m')
  })

  test('clock-in more than 10 minutes before the shift is blocked, then allowed', async ({ page }) => {
    await open(page)
    await signInAs(page, 'maria@example.com')
    await expect(page.getByText('Your shift today: 10:00–17:30')).toBeVisible()

    await page.getByRole('button', { name: 'Clock in' }).click()
    await toast(page, 'Too early: your shift starts at 10:00. You can clock in from 09:50.')

    await page.clock.fastForward('52:00') // 09:52
    await page.getByRole('button', { name: 'Clock in' }).click()
    await toast(page, 'Clocked in')
  })
})

test.describe('employee permissions', () => {
  test('employees see no pay, no admin pages and no admin controls', async ({ page }) => {
    await open(page)
    await signInAs(page, 'maria@example.com')

    // Business info is readable by everyone, but only admins can edit it or see admin notes.
    await page.getByRole('link', { name: 'Business' }).first().click()
    await expect(page.getByRole('heading', { name: 'Easy Beans Coffee' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0)
    await expect(page.getByText('Admin-only notes')).toHaveCount(0)

    await page.getByRole('link', { name: 'Rota' }).first().click()
    await expect(page.getByText('Your hours')).toBeVisible()
    await expect(page.getByText('Labour cost')).toHaveCount(0)
    await expect(page.getByText('€')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add shift' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Team' }).first().click()
    await expect(page.getByRole('button', { name: 'Invite' })).toHaveCount(0)
    await expect(page.getByLabel('Hourly rate')).toHaveCount(0)
  })

  test('employee picks up an open shift', async ({ page }) => {
    await open(page, '/rota')
    await signInAs(page, 'maria@example.com')
    await page.getByRole('link', { name: 'Rota' }).first().click()
    await page.getByText('Tap to take').click()
    await toast(page, 'Shift is yours')
    await expect(page.getByText('Tap to take')).toHaveCount(0)
  })

  test('employee requests a timecard correction', async ({ page }) => {
    await open(page)
    await signInAs(page, 'maria@example.com')
    await page.getByRole('link', { name: 'Timecards' }).first().click()
    await page.getByRole('button', { name: 'Request correction' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Request a correction' })
    await dialog.getByLabel('Clock out').fill('2026-09-28T15:30')
    await dialog.getByRole('button', { name: 'Send request' }).click()
    await toast(page, 'Please add a note')
    await dialog.getByLabel(/What happened/).fill('Stayed to close the till')
    await dialog.getByRole('button', { name: 'Send request' }).click()
    await toast(page, 'Correction requested')
    await expect(page.getByText('My pending requests')).toBeVisible()
    await expect(page.getByText('“Stayed to close the till”')).toBeVisible()
  })
})

test.describe('admin', () => {
  test('rota warns about a long shift without a break and saves it', async ({ page }) => {
    await open(page, '/rota')
    await expect(page.getByText('Labour cost')).toBeVisible()
    await expect(page.getByText('08:00–15:00')).toHaveCount(0)

    await page.getByRole('button', { name: 'Add shift' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add shift' })
    await dialog.getByLabel('Break (minutes)').fill('0')
    await expect(dialog.getByText('Over 6h without a 15-min break')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Shift saved')
    await expect(page.getByText('08:00–15:00')).toHaveCount(1)
  })

  test('approves a correction request and locks the week', async ({ page }) => {
    await open(page, '/timecards')
    const requests = page.locator('.MuiCard-root', { hasText: 'Correction requests' })
    await expect(requests).toContainText('Stayed 20 min to help with the bakery delivery')
    await requests.getByRole('button', { name: 'Approve' }).click()
    await toast(page, 'Approved and applied')
    await expect(page.getByText('Correction requests')).toHaveCount(0)
    await expect(page.getByText('Edited').first()).toBeVisible()

    await page.getByRole('button', { name: 'Approve week' }).click()
    await toast(page, 'Week approved and locked')
    await expect(page.getByRole('button', { name: 'Approved' })).toBeDisabled()
  })

  test('exports the week as Excel or CSV, for the gestoría', async ({ page }) => {
    await open(page, '/timecards')
    await page.getByRole('button', { name: 'Export' }).click()
    for (const f of ['Excel', 'CSV', 'PDF', 'Copy']) await expect(page.getByRole('menuitem', { name: new RegExp(f) })).toBeVisible()
    const xlsx = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: /Excel/ }).click()
    expect((await xlsx).suggestedFilename()).toBe('timecards-2026-09-28.xlsx')
    await page.getByRole('button', { name: 'Export' }).click()
    const csv = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: /CSV/ }).click()
    const text = await (await csv).createReadStream().then(s => new Response(s as unknown as ReadableStream).text())
    const lines = text.replace(/^\ufeff/, '').split('\r\n')
    expect(lines[0]).toBe('"Employee";"Date";"Position";"Clock in";"Clock out";"Break (min)";"Paid hours";"Holiday";"Flags";"Approved";"Rate €/h";"Gross €"')
    expect(lines[1]).toMatch(/^"[^"]+";"2026-09-28";/)
    expect(lines.at(-1)).toMatch(/^"Total";/)
  })

  test('edits a timecard only with a reason, and the change is logged', async ({ page }) => {
    await open(page, '/timecards')
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Edit timecard' })
    await dialog.getByLabel('Clock out').fill('2026-09-28T15:10')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'A reason is required')
    await dialog.getByLabel('Reason (required)').fill('Forgot to clock out')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Timecard updated')
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    await expect(page.getByRole('dialog').getByText(/via app: Forgot to clock out/)).toBeVisible()
  })

  test('calendar: month or week view, with Today and previous/next in one toolbar', async ({ page }) => {
    await open(page, '/calendar')
    const bar = page.getByRole('toolbar', { name: 'Calendar' })
    await expect(bar.getByRole('heading', { name: 'September 2026' })).toBeVisible()
    await expect(bar.getByRole('button', { name: 'Today' })).toBeDisabled() // already showing today
    await bar.getByRole('button', { name: 'Week', exact: true }).click()
    await expect(bar.getByRole('heading', { name: '28 Sep – 4 Oct 2026' })).toBeVisible()
    const grid = page.getByRole('grid')
    await expect(grid.getByRole('columnheader')).toHaveText(['Mon 28', 'Tue 29', 'Wed 30', 'Thu 1', 'Fri 2', 'Sat 3', 'Sun 4'])
    await expect(grid.getByRole('gridcell', { name: 'Friday 2 October' })).toContainText('Real Madrid vs FC Barcelona')
    await bar.getByRole('button', { name: 'Next week' }).click()
    await expect(bar.getByRole('heading', { name: '5 – 11 Oct 2026' })).toBeVisible()
    await bar.getByRole('button', { name: 'Today' }).click()
    await expect(bar.getByRole('heading', { name: '28 Sep – 4 Oct 2026' })).toBeVisible()
    // The choice is remembered.
    await page.reload()
    await expect(page.getByRole('toolbar', { name: 'Calendar' }).getByRole('button', { name: 'Week', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Month', exact: true }).click()
    await expect(page.getByRole('grid').getByRole('columnheader')).toHaveText(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  })

  test('calendar list view: what is coming up, with holidays and closures marked', async ({ page }) => {
    await open(page, '/calendar')
    const bar = page.getByRole('toolbar', { name: 'Calendar' })
    await bar.getByRole('button', { name: 'List', exact: true }).click()
    await expect(bar.getByRole('heading', { name: 'September – November 2026' })).toBeVisible()
    const list = page.getByRole('list', { name: 'Events' })
    await expect(list.getByRole('listitem', { name: 'Fiesta Nacional de España' })).toContainText('Holiday')
    // Add a closure: it shows as Closed (and closes the Google listing that day).
    await page.getByRole('button', { name: 'Add a closure' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a closure' })
    await expect(dialog.getByLabel('Title')).toHaveValue('Closed')
    await dialog.getByLabel('Title').fill('Closed: Deep clean')
    await dialog.getByLabel('From').fill('2026-10-20')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Closure added')
    const closure = list.getByRole('listitem', { name: 'Closed: Deep clean' })
    await expect(closure).toContainText('Closed')
    await expect(page.getByRole('region', { name: 'October 2026' })).toContainText('Closed: Deep clean')
    // The next three months, and the choice is remembered.
    await bar.getByRole('button', { name: 'Next 3 months' }).click()
    await expect(bar.getByRole('heading', { name: 'December 2026 – February 2027' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('toolbar', { name: 'Calendar' }).getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('adds a calendar event', async ({ page }) => {
    await open(page, '/calendar')
    await expect(page.getByText('Fiesta Nacional de España')).toHaveCount(0) // October
    await page.getByRole('button', { name: 'Add event' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add event' })
    await dialog.getByLabel('Title').fill('Feria de prueba')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Event saved')
    await expect(page.getByText('Feria de prueba')).toBeVisible()
    await page.getByRole('button', { name: 'Next month' }).click()
    await expect(page.getByText('Fiesta Nacional de España')).toBeVisible()
  })

  test('edits business details right on the page; phone is digits, Instagram has its @, and the CIF/NIF is checked', async ({ page }) => {
    await open(page, '/business')
    // Just the business: no opening hours or notes here (hours have their own page).
    await expect(page.getByText('Admin-only notes')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Opening hours' })).toHaveCount(0)
    await expect(page.getByText('C. Pizarro, 8', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('B12345674')).toBeVisible()
    await expect(page.getByText('Nearby towns')).toHaveCount(0)

    const contact = page.getByRole('region', { name: 'Contact' })
    await contact.getByRole('button', { name: 'Edit' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0) // fields open in place, not in a pop-up
    // The country code is picked from a list (searchable); the number is typed after it.
    await expect(contact.getByRole('combobox', { name: 'Country code' })).toHaveValue('🇪🇸 +34')
    const phone = contact.getByRole('textbox', { name: 'Phone' })
    await expect(phone).toHaveAttribute('type', 'tel')
    await phone.fill('')
    await phone.pressSequentially('600-abc 000 000')
    await expect(phone).toHaveValue('600 000 000')
    const insta = contact.getByRole('textbox', { name: 'Instagram' })
    await expect(insta).toHaveValue('easy.beans.coffee')
    await expect(contact.getByText('@', { exact: true })).toBeVisible()
    await insta.fill('@easybeans.marbella!')
    await expect(insta).toHaveValue('easybeans.marbella')
    await contact.getByRole('button', { name: 'Save' }).click()
    await toast(page, /^Saved$/)
    await expect(contact.getByRole('textbox')).toHaveCount(0)
    await expect(contact).toContainText('+34 600 000 000')
    await expect(contact.getByRole('link', { name: '@easybeans.marbella' })).toHaveAttribute('href', 'https://instagram.com/easybeans.marbella')

    const company = page.getByRole('region', { name: 'Company' })
    await company.getByRole('button', { name: 'Edit' }).click()
    await expect(company.getByText('Nearby towns')).toHaveCount(0)
    const cif = company.getByRole('textbox', { name: 'CIF / NIF' })
    await cif.fill('B12345678')
    await expect(company.getByText(/control character/)).toBeVisible()
    await company.getByRole('button', { name: 'Save' }).click()
    await toast(page, /control character/)
    await cif.fill('12345678-z')
    await expect(company.getByText('Valid NIF')).toBeVisible()
    await company.getByRole('button', { name: 'Save' }).click()
    await expect(company.getByRole('textbox')).toHaveCount(0)
    await expect(company).toContainText('12345678Z')
  })

})

test.describe('café tablet (kiosk)', () => {
  test('rejects a wrong PIN and clocks in with the right one', async ({ page }) => {
    test.skip(!FEATURES.kiosk, 'The café tablet is switched off for now')
    await open(page, '/kiosk')
    await page.getByRole('button', { name: /Julio/ }).click()
    const pad = page.getByRole('dialog')
    await expect(pad).toContainText('Clock in: enter your PIN')
    for (const d of '9999') await pad.getByRole('button', { name: d, exact: true }).click()
    await expect(pad.getByText('Wrong PIN')).toBeVisible()
    for (const d of '1234') await pad.getByRole('button', { name: d, exact: true }).click()
    await expect(page.getByRole('dialog').getByText('Julio · 09:00')).toBeVisible()
    await page.clock.fastForward('00:06')
    await expect(page.getByRole('button', { name: /Julio/ })).toContainText('In since 09:00')
  })
})

test.describe('sign-in', () => {
  test('unknown demo account shows a helpful error', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Sign out' }).first().click()
    await page.getByRole('textbox', { name: 'Email' }).fill('nobody@example.com')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await toast(page, /Demo: sign in as aron@example.com/)
  })
})

test('@phone layout: bottom navigation and a full-width clock-in button', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('link', { name: 'Rota' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Hours' })).toBeVisible()
  // My account is in the account menu at the top (with Referrals, Appearance and Sign out).
  await page.getByRole('button', { name: /^Account menu/ }).click()
  await expect(page.getByRole('menuitem', { name: 'My account' })).toBeVisible()
  await page.keyboard.press('Escape')
  const button = page.getByRole('button', { name: 'Clock in' })
  const box = await button.boundingBox()
  expect(box!.width).toBeGreaterThan(250)
  // Every admin page is reachable on a phone: the rest sit under "More".
  await page.getByRole('button', { name: 'More' }).click()
  const sheet = page.getByRole('list', { name: 'More pages' })
  for (const name of ['Opening hours', 'Brand', 'Finances', 'Sports', 'Team', 'Notifications', 'Connections', 'Analytics']) {
    await expect(sheet.getByRole('link', { name })).toBeVisible()
  }
  await sheet.getByRole('link', { name: 'Finances' }).click()
  await expect(page.getByRole('heading', { name: 'Finances' })).toBeVisible()
})

test('@phone a message never covers the sign-in buttons', async ({ page }) => {
  await page.goto('/?demo')
  const google = (await page.getByRole('button', { name: 'Google' }).boundingBox())!
  await page.getByRole('button', { name: 'Google' }).click()
  const alert = (await page.getByRole('alert').filter({ hasText: 'Google sign-in' }).boundingBox())!
  expect(alert.y + alert.height, 'message sits above the sign-in buttons').toBeLessThan(google.y)
})

test.describe('guard rails', () => {
  test('an admin cannot switch themselves off or demote themselves', async ({ page }) => {
    await open(page, '/team')
    await page.getByRole('row', { name: /\(you\)/ }).click()
    const mine = page.getByRole('dialog', { name: "Aron O'Neill (you)" })
    await expect(mine.getByRole('switch', { name: 'Active' }).or(mine.getByLabel('Active'))).toBeDisabled()
    await expect(mine.getByText('Another admin can change this')).toBeVisible()
  })

  test('the business keeps a name, and invites need a real email', async ({ page }) => {
    await open(page, '/business')
    const company = page.getByRole('region', { name: 'Company' })
    await company.getByRole('button', { name: 'Edit' }).click()
    await company.getByRole('textbox', { name: 'Business name' }).fill('')
    await company.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'The business needs a name')
    await company.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Easy Beans Coffee' })).toBeVisible()

    await page.getByRole('link', { name: 'Team' }).first().click()
    await page.getByRole('button', { name: 'Invite' }).click()
    const invite = page.getByRole('dialog', { name: 'Invite to the team' })
    await invite.getByLabel('Full name').fill('Test')
    await invite.getByRole('textbox', { name: 'Email' }).fill('notanemail')
    await invite.getByRole('button', { name: 'Create account' }).click()
    await toast(page, 'Enter a full email address')
  })

  test('staff can\'t open the café tablet screen from their own login', async ({ page }) => {
    await open(page)
    await signInAs(page, 'maria@example.com')
    await page.goto('/kiosk')
    await expect(page).not.toHaveURL(/kiosk/)
    await expect(page.getByRole('heading', { name: /Hola, Maria/ })).toBeVisible()
  })
})

test('sidebar is grouped into sections that fold away, and the logo goes to Today', async ({ page }) => {
  await open(page, '/business')
  const nav = page.getByRole('navigation', { name: 'Main' })
  for (const section of ['Business', "What's on", 'Team', 'Settings']) await expect(nav.getByRole('button', { name: section, exact: true })).toBeVisible()
  // Your own pages are in the account menu, not the sidebar.
  await expect(nav.getByRole('button', { name: 'You', exact: true })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Opening hours' })).toBeVisible()
  await nav.getByRole('button', { name: 'Settings' }).click()
  await expect(nav.getByRole('link', { name: 'Connections' })).toBeHidden()
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Connections' })).toBeHidden() // remembered
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Connections' })).toBeVisible()
  await page.getByRole('link', { name: 'Home: Today' }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Aron' })).toBeVisible()
})

test('missing timecards are filled from the rota and marked for review', async ({ page }) => {
  await open(page, '/rota')
  // Mark is on the rota on Monday but never clocked in.
  await page.getByRole('button', { name: 'Add shift' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add shift' })
  await dialog.getByLabel('Team member').click()
  await page.getByRole('option', { name: 'Mark Murray' }).click()
  await dialog.getByLabel('Date').fill('2026-09-28')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await toast(page, 'Shift saved')

  await page.getByRole('link', { name: 'Timecards' }).first().click()
  // Wait for the week to load, then check no card is tagged yet ("Fill from rota" is the button).
  await expect(page.getByRole('button', { name: 'Fill from rota' })).toBeVisible()
  await expect(page.getByText('Labour cost')).toBeVisible()
  await expect(page.getByText('From rota', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Fill from rota' }).click()
  await toast(page, 'Missing timecards filled from the rota')
  const mark = page.locator('.MuiCard-root', { hasText: 'Mark Murray' })
  await expect(mark.getByText('From rota', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Fill from rota' }).click()
  await toast(page, 'Nothing to fill')
})

test.describe('time off', () => {
  test('employee requests holiday; limits and overlaps are enforced', async ({ page }) => {
    await open(page, '/time-off')
    await signInAs(page, 'julio@example.com')
    await page.getByRole('link', { name: 'Time off' }).first().click()
    await expect(page.getByText('Holiday left in 2026')).toBeVisible()
    await page.getByRole('button', { name: 'Request time off' }).click()
    const dialog = page.getByRole('dialog', { name: 'Request time off' })
    await dialog.getByLabel('First day').fill('2026-11-10')
    await dialog.getByLabel('Last day').fill('2026-12-31')
    await dialog.getByRole('button', { name: 'Send request' }).click()
    await toast(page, 'more than your 30 holiday days')
    await dialog.getByLabel('First day').fill('2026-10-05')
    await dialog.getByLabel('Last day').fill('2026-10-09')
    await dialog.getByLabel(/Note for the manager/).fill('Trip to Granada')
    await dialog.getByRole('button', { name: 'Send request' }).click()
    await toast(page, 'Request sent')
    await expect(page.getByText('Waiting for approval')).toBeVisible()
    await page.getByRole('button', { name: 'Request time off' }).click()
    await page.getByRole('dialog').getByLabel('First day').fill('2026-10-08')
    await page.getByRole('dialog').getByLabel('Last day').fill('2026-10-08')
    await page.getByRole('dialog').getByRole('button', { name: 'Send request' }).click()
    await toast(page, 'already have time off')
  })

  test('admin approves a request and her shifts become open shifts', async ({ page }) => {
    await open(page)
    await expect(page.getByText('Time off requests waiting for approval')).toBeVisible()
    await page.getByRole('link', { name: 'Time off' }).first().click()
    const card = page.locator('.MuiCard-root', { hasText: 'Requests to approve' })
    await expect(card).toContainText('Family wedding in Sevilla')
    await card.getByRole('button', { name: 'Review' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(/has \d+ shifts? in this period/)
    await dialog.getByRole('button', { name: 'Approve' }).click()
    await toast(page, 'Time off approved')
    await expect(page.locator('.MuiCard-root', { hasText: "Who's away" })).toContainText('Maria')

    await page.getByRole('link', { name: 'Rota' }).first().click()
    await page.getByRole('button', { name: 'Next week' }).click()
    await expect(page.getByRole('main').getByText('Time off', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/Released: Maria off/).first()).toBeVisible()
  })
})

test.describe('connections', () => {
  test('admin sees Google Maps, WhatsApp and Instagram, and compares opening hours with Google', async ({ page }) => {
    await open(page, '/connections')
    await expect(page.getByRole('region', { name: 'Maps and search' }).getByRole('article', { name: 'Google Maps' })).toContainText('Connected')
    await expect(page.getByRole('region', { name: 'Social media' }).getByRole('article', { name: 'Instagram' })).toContainText('@easy.beans.coffee')
    await expect(page.getByText('followers', { exact: true })).toHaveCount(0) // no Instagram posts section here

    const maps = page.getByRole('region', { name: 'Google Maps settings' })
    await maps.getByRole('button', { name: 'Compare with Google' }).click()
    const compare = page.getByRole('dialog', { name: /app vs Google/ })
    await expect(compare).toContainText('10:00–15:00')
    await compare.getByRole('button', { name: 'Put the app’s hours on Google' }).click()
    await toast(page, 'Google updated')

    await page.getByRole('button', { name: 'Manage WhatsApp' }).click()
    const wa = page.getByRole('dialog', { name: 'WhatsApp' })
    await expect(wa).toContainText('Send template messages from the café’s number')
    await wa.getByLabel('Test number').fill('12')
    await wa.getByRole('button', { name: 'Send a test' }).click()
    await toast(page, 'full number with country code')
  })

  test('employees do not see connections', async ({ page }) => {
    await open(page)
    await signInAs(page, 'maria@example.com')
    await expect(page.getByRole('link', { name: 'Connections' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Finances' })).toHaveCount(0)
    await page.goto('/connections')
    await expect(page.getByRole('heading', { name: 'Business connections' })).toHaveCount(0)
    await expect(page.getByRole('article', { name: 'Gmail' })).toHaveCount(0)
  })

  test('share an event to Instagram and Google', async ({ page }) => {
    await open(page, '/calendar')
    await page.getByRole('button', { name: 'Next month' }).click()
    await page.getByText('Feria de San Pedro').first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Share' }).click()
    const share = page.getByRole('dialog', { name: /Share “Feria de San Pedro”/ })
    await expect(share.getByLabel('Caption')).toHaveValue(/Feria de San Pedro/)
    await share.getByRole('button', { name: 'Post' }).click()
    await toast(page, 'Instagram posts need a photo')
    await share.getByLabel('Instagram').uncheck()
    await share.getByRole('button', { name: 'Post' }).click()
    await toast(page, 'Post queued')
  })

  test('send the rota on WhatsApp, and choose WhatsApp as the way to be reached on My account', async ({ page }) => {
    await open(page, '/rota')
    await page.getByRole('button', { name: 'Send on WhatsApp' }).click()
    await toast(page, 'Rota sent on WhatsApp')
    await fromAccountMenu(page, 'My account')
    // No separate WhatsApp switch: picking WhatsApp as the preferred contact is the opt-in.
    await expect(page.getByLabel(/shift reminders and rota updates on WhatsApp/)).toHaveCount(0)
    await page.getByLabel('Preferred contact').click()
    await page.getByRole('option', { name: 'WhatsApp', exact: true }).click()
    await expect(page.getByText('Add your mobile number so the café can reach you that way.')).toBeVisible()
  })
})

test('café music: admin approves a Spotify playlist, staff play it', async ({ page }) => {
  await open(page, '/connections')
  await page.getByRole('button', { name: 'Manage Spotify' }).click()
  const card = page.getByRole('dialog', { name: 'Spotify' })
  await expect(card).toContainText('SGAE/AGEDI')
  await card.getByLabel('Approved playlist').click()
  await page.getByRole('option', { name: /Afternoon chill/ }).click()
  await toast(page, '“Easy Beans · Afternoon chill” is now the café playlist')
  await card.getByRole('button', { name: 'Close' }).click()

  await signInAs(page, 'maria@example.com')
  await page.getByRole('link', { name: 'Today' }).first().click()
  const music = page.locator('.MuiCard-root', { hasText: 'Café music' })
  await expect(music).toContainText('Easy Beans · Afternoon chill')
  await music.getByRole('button', { name: 'Play' }).click()
  await toast(page, 'Playing the café playlist')
  await expect(music).toContainText('On Café speaker')
  await music.getByRole('button', { name: 'Pause' }).click()
  await expect(music).toContainText('Not playing')
})

test('sign-in: one-tap accounts first, then email and password underneath', async ({ page }) => {
  await page.goto('/?demo')
  const google = page.getByRole('button', { name: 'Google', exact: true })
  await expect(page.getByText('or with your email')).toBeVisible()
  expect((await google.boundingBox())!.y).toBeLessThan((await page.getByLabel('Password').boundingBox())!.y)
  await google.click()
  await toast(page, 'Google sign-in works on the live app')
  await page.getByRole('button', { name: 'Microsoft', exact: true }).click()
  await toast(page, 'Microsoft sign-in works on the live app')
})

test.describe('finances', () => {
  test('admin with pay access sees the monthly expenses from the accounts sheet and edits one', async ({ page }) => {
    await open(page, '/finances')
    await expect(page.getByRole('heading', { name: 'Finances' })).toBeVisible()
    await expect(page.getByText('18 items')).toBeVisible()
    await expect(page.getByText('Rent', { exact: true })).toBeVisible()
    await expect(page.getByText(/7[.,]?865[.,]09/).first()).toBeVisible()
    // The four headline figures sit in one row on a computer.
    const tiles = page.getByRole('list', { name: 'At a glance' }).getByRole('listitem')
    await expect(tiles).toHaveCount(4)
    const boxes = await Promise.all([0, 1, 2, 3].map(i => tiles.nth(i).boundingBox()))
    for (const b of boxes) expect(Math.abs(b!.y - boxes[0]!.y)).toBeLessThan(2)

    // Sort by a column heading; filter by category with the chips above the table.
    const names = () => page.getByRole('table', { name: 'Expenses' }).locator('tbody tr td:first-child').allTextContents()
    await page.getByRole('button', { name: 'Per month' }).click()
    await expect.poll(async () => (await names())[0]).toMatch(/^Staff wages/)
    await page.getByRole('button', { name: 'Per month' }).click()
    await expect.poll(async () => (await names())[0]).toMatch(/^Broadband/)
    const filters = page.getByRole('group', { name: 'Filter by category' })
    await filters.getByRole('button', { name: 'Utilities 3' }).click()
    await expect.poll(names).toEqual(['Broadband', 'Water', 'Electricity'])
    await expect(page.getByRole('row').filter({ hasText: 'Total shown' })).toContainText(/270/)
    await filters.getByRole('button', { name: 'Premises 4' }).click()
    await expect(page.getByRole('table', { name: 'Expenses' }).locator('tbody tr')).toHaveCount(7)
    await filters.getByRole('button', { name: 'All 18' }).click()
    await expect(page.getByRole('table', { name: 'Expenses' }).locator('tbody tr')).toHaveCount(18)

    // Export: Excel, CSV, PDF and copy.
    await page.getByRole('button', { name: 'Export' }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: /Excel/ }).click()
    expect((await download).suggestedFilename()).toMatch(/^expenses-.*\.xlsx$/)
    await page.getByRole('button', { name: 'Export' }).click()
    const csv = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: /CSV/ }).click()
    expect((await csv).suggestedFilename()).toMatch(/\.csv$/)

    // One Edit button for the whole list; every change saves at once.
    await page.getByRole('button', { name: 'Edit expenses' }).click()
    await page.getByLabel('Per month for Broadband').fill('30')
    await page.getByLabel('Count Loan in the total').uncheck()
    await page.getByRole('button', { name: 'Add expense' }).click()
    await page.getByLabel('Name').last().fill('Coffee beans')
    // Category is a list; a new one can be added to it.
    await page.getByLabel('Category for Coffee beans').click()
    await page.getByRole('option', { name: 'Add category…' }).click()
    await page.getByLabel('Category name').fill('Beans')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByLabel('Category for Coffee beans')).toHaveText('Beans')
    await page.getByLabel('Per month for Coffee beans').fill('250')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await toast(page, 'Expenses saved')
    // 7,865.09 + 10 (broadband) + 250 (beans) − 641.53 (loan, no longer counted)
    await expect(page.getByText(/7[.,]?483[.,]56/).first()).toBeVisible()
    await expect(page.getByText('18 items · 1 not counted')).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'Loan' })).toContainText('Not counted')
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Filter by category' }).getByRole('button', { name: 'Beans 1' })).toBeVisible()
  })

  test('employees cannot see finances', async ({ page }) => {
    await open(page)
    await signInAs(page, 'maria@example.com')
    await expect(page.getByRole('link', { name: 'Finances' })).toHaveCount(0)
    await page.goto('/finances')
    await expect(page.getByText('Rent', { exact: true })).toHaveCount(0)
  })
})

test('notifications: admin switches a team alert off and sees what was sent (the old Alerts address still lands)', async ({ page }) => {
  await open(page, '/alerts')
  await expect(page).toHaveURL(/\/notifications$/)
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible()
  const reminders = page.getByRole('switch', { name: 'Shift reminders' }).or(page.getByLabel('Shift reminders'))
  await expect(reminders).toBeChecked()
  await reminders.click()
  await toast(page, 'Shift reminders: switched off')
  await expect(reminders).not.toBeChecked()
  await expect(page.getByText('Recently sent')).toBeVisible()
})

test('clock-in rules live on the Timecards page', async ({ page }) => {
  await open(page, '/timecards')
  const rules = page.locator('.MuiCard-root', { hasText: 'Clock-in rules' })
  await expect(rules).toContainText('Clock in up to 10 min early')
  await rules.getByRole('button', { name: 'Show' }).click()
  await expect(rules.getByText(/before your shift/)).toBeVisible()
  await rules.getByRole('button', { name: 'Edit rules' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('business page is just the business: no suppliers', async ({ page }) => {
  await open(page, '/business')
  await expect(page.getByRole('heading', { name: 'Easy Beans Coffee' })).toBeVisible()
  // The page itself: the menu has a Suppliers page of its own (Stock).
  await expect(page.getByRole('main').getByText(/Suppliers/i)).toHaveCount(0)
})

test.describe('partners (outside businesses)', () => {
  test('the gestoría sees payroll and finances read-only, and nothing else', async ({ page }) => {
    await open(page, '/', 'laura@gestoria.example')
    await expect(page).toHaveURL(/\/business/)
    const nav = page.getByRole('navigation', { name: 'Main' })
    for (const name of ['Business', 'Rota', 'Timecards', 'Finances']) await expect(nav.getByRole('link', { name })).toBeVisible()
    for (const name of ['Today', 'Team', 'Time off', 'Calendar', 'Notifications', 'Connections', 'Partners']) {
      await expect(nav.getByRole('link', { name })).toHaveCount(0)
    }
    await expect(page.getByText('Gestoría Marbella').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0)

    await nav.getByRole('link', { name: 'Finances' }).click()
    await expect(page.getByText(/7[.,]?865[.,]09/).first()).toBeVisible()
    await expect(page.getByRole('main').getByText('Read-only', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add expense' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0)

    await nav.getByRole('link', { name: 'Timecards' }).click()
    await expect(page.getByRole('main').getByText('Read-only', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Approve week' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Request correction' })).toHaveCount(0)
    await expect(page.getByText('Labour cost')).toBeVisible()

    await nav.getByRole('link', { name: 'Rota' }).click()
    await expect(page.getByText('Tap to take')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add shift' })).toHaveCount(0)

    await page.goto('/team')
    await expect(page).toHaveURL(/\/business/)
    await page.goto('/calendar')
    await expect(page).toHaveURL(/\/business/)
  })

  test('admin invites a partner, chooses what they see, then removes access', async ({ page }) => {
    test.skip(!FEATURES.partners, 'The Partners page is switched off for now')
    await open(page, '/partners')
    await expect(page.getByRole('heading', { name: 'Partners' })).toBeVisible()
    await expect(page.locator('.MuiCard-root', { hasText: 'Gestoría Marbella' })).toContainText('Payroll')
    await page.getByRole('button', { name: 'Invite partner' }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite a partner' })
    await dialog.getByLabel('Company').fill('Café Supplies SL')
    await dialog.getByLabel('Contact name').fill('Pedro')
    await dialog.getByRole('textbox', { name: 'Email' }).fill('pedro@supplies.example')
    await dialog.getByLabel(/Calendar/).check()
    await dialog.getByRole('button', { name: 'Create account' }).click()
    await toast(page, 'Account created')
    await expect(dialog.getByText(/Account ready\. Send them: pedro@supplies\.example/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Done' }).click()
    const card = page.locator('.MuiCard-root', { hasText: 'Café Supplies SL' })
    await expect(card).toContainText('Calendar')
    await expect(card).not.toContainText('Payroll')

    await signInAs(page, 'pedro@supplies.example')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'Calendar' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Timecards' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Finances' })).toHaveCount(0)
    await nav.getByRole('link', { name: 'Calendar' }).click()
    await expect(page.getByRole('button', { name: 'Add event' })).toHaveCount(0)

    await signInAs(page, 'aron@example.com')
    await page.getByRole('link', { name: 'Partners' }).first().click()
    await page.locator('.MuiCard-root', { hasText: 'Café Supplies SL' }).getByRole('button', { name: 'Remove access' }).click()
    await toast(page, 'Access removed')
    await signInAs(page, 'pedro@supplies.example')
    await expect(page.getByText(/isn.t active/i).first()).toBeVisible()
  })
})

test('sign in is one-tap accounts or email and password: no emailed code', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible()
  await expect(page.getByText(/sign-in code/i)).toHaveCount(0)
})

test('admin creates a staff account with a temporary password, and can reset it', async ({ page }) => {
  await open(page, '/team')
  await page.getByRole('button', { name: 'Invite' }).click()
  const dialog = page.getByRole('dialog', { name: 'Invite to the team' })
  await dialog.getByLabel('Full name').fill('Lucía')
  await dialog.getByRole('textbox', { name: 'Email' }).fill('lucia@example.com')
  await expect(dialog.getByRole('textbox', { name: 'Temporary password' })).toHaveValue(/^[a-z]+-[a-z]+-\d{4}$/)
  await dialog.getByRole('textbox', { name: 'Temporary password' }).fill('short')
  await dialog.getByRole('button', { name: 'Create account' }).click()
  await toast(page, 'at least 8 characters')
  await dialog.getByRole('button', { name: 'New' }).click()
  await dialog.getByRole('button', { name: 'Create account' }).click()
  await toast(page, 'Account created for Lucía')
  await expect(dialog.getByText('Account ready')).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('row', { name: /Lucía/ }).click()
  await page.getByRole('dialog', { name: 'Lucía' }).getByRole('button', { name: 'Temporary password' }).click()
  const reset = page.getByRole('dialog', { name: 'Temporary password for Lucía' })
  await reset.getByRole('button', { name: 'Set password' }).click()
  await toast(page, 'Password set')
  await expect(reset.getByText('Account ready')).toBeVisible()
  await reset.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('dialog', { name: 'Lucía' }).getByRole('button', { name: 'Close' }).click()
  // Admins change their own passwords; there is no reset button in an admin's panel.
  await page.getByRole('row', { name: /\(you\)/ }).click()
  await expect(page.getByRole('dialog', { name: "Aron O'Neill (you)" })).toBeVisible()
  await expect(page.getByRole('dialog', { name: "Aron O'Neill (you)" }).getByRole('button', { name: 'Temporary password' })).toHaveCount(0)
})

test('a message never covers the buttons it is about', async ({ page }) => {
  await open(page, '/business')
  const company = page.getByRole('region', { name: 'Company' })
  await company.getByRole('button', { name: 'Edit' }).click()
  await company.getByRole('textbox', { name: 'Business name' }).fill('')
  await company.getByRole('button', { name: 'Save' }).click()
  await toast(page, 'The business needs a name')
  // Clickable straight away, while the message is still showing.
  await company.getByRole('button', { name: 'Cancel' }).click({ timeout: 2000 })
  await expect(company.getByRole('textbox')).toHaveCount(0)
})

test.describe('sports', () => {
  test('staff see the next three weeks by day, with big nights, a sport at a time and times to be confirmed', async ({ page }) => {
    await open(page, '/sports', 'maria@example.com')
    await expect(page.getByRole('heading', { name: 'Sports' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Competitions' })).toHaveCount(0) // admins choose
    await expect(page.getByRole('list', { name: 'At a glance' })).toHaveCount(0) // no counts, straight to the games
    const today = page.getByRole('region', { name: /^Today/ })
    await expect(today.getByText('Real Betis')).toBeVisible()
    const clasico = page.getByRole('article', { name: /Barcelona vs Real Madrid/ })
    await expect(clasico.getByText('Big night')).toBeVisible()
    await expect(clasico.getByText('Matchday 10')).toBeVisible()
    await expect(page.getByRole('article', { name: /Time to be confirmed UFC 322/ }).getByText('TBC')).toBeVisible()

    // One row of sports; no "Big nights" filter (big nights are marked on the games themselves).
    const sport = page.getByRole('group', { name: 'Sport' })
    await expect(sport.getByRole('button')).toHaveText(['All', 'Football', 'Rugby', 'UFC', 'Boxing'])
    await expect(page.getByRole('button', { name: 'Big nights' })).toHaveCount(0)
    await sport.getByRole('button', { name: 'UFC', exact: true }).click()
    await expect(page.getByText('UFC 322: Makhachev vs Topuria')).toBeVisible()
    await expect(page.getByText('Barcelona')).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Which football' })).toHaveCount(0)
  })

  test('rugby has its own chip; football narrows to national teams or a country in a second row', async ({ page }) => {
    await open(page, '/sports', 'maria@example.com')
    const sport = page.getByRole('group', { name: 'Sport' })
    await sport.getByRole('button', { name: 'Rugby' }).click()
    await expect(page.getByRole('article', { name: /Ireland vs England/ })).toContainText('Six Nations')
    await expect(page.getByRole('article', { name: /Leinster vs Toulouse/ })).toBeVisible()
    await expect(page.getByRole('article', { name: /Real Betis/ })).toHaveCount(0)
    await expect(page.getByRole('article', { name: /Ireland vs England/ }).getByText('Big night')).toBeVisible()

    await sport.getByRole('button', { name: 'Football' }).click()
    const which = page.getByRole('group', { name: 'Which football' })
    await expect(which.getByRole('button')).toHaveText(['All football', 'National teams', 'Spain', 'England', 'Netherlands', 'Europe'])
    await which.getByRole('button', { name: 'National teams' }).click()
    await expect(page.getByRole('article', { name: /Spain vs Netherlands/ })).toBeVisible()
    await expect(page.getByRole('article', { name: /Real Betis/ })).toHaveCount(0)
    await which.getByRole('button', { name: 'Spain' }).click()
    await expect(page.getByRole('article', { name: /Real Betis vs Sevilla/ })).toBeVisible()
    await expect(page.getByRole('article', { name: /Arsenal/ })).toHaveCount(0)
    await expect(page.getByRole('article', { name: /Spain vs Netherlands/ })).toHaveCount(0)
    await expect(page.getByRole('article', { name: /Leinster/ })).toHaveCount(0)
  })

  test('admin stops following a competition and refreshes', async ({ page }) => {
    await open(page, '/sports')
    await expect(page.getByRole('article', { name: /Barcelona vs Real Madrid/ })).toBeVisible()
    await page.getByRole('button', { name: 'Competitions' }).click()
    const dialog = page.getByRole('dialog', { name: 'Competitions to follow' })
    await dialog.getByRole('checkbox', { name: 'La Liga', exact: true }).uncheck()
    await toast(page, 'Stopped following La Liga')
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('article', { name: /Barcelona vs Real Madrid/ })).toHaveCount(0)
    await expect(page.getByRole('article', { name: /Liverpool vs Manchester United/ })).toBeVisible()
    await page.getByRole('button', { name: 'Refresh now' }).click()
    await toast(page, 'Fixtures updated')
    await expect(page.getByText(/Updated just now/)).toBeVisible()
  })

  test('admin switches Sports off and on again; turning it on explains match days first', async ({ page }) => {
    await open(page, '/sports')
    const sports = page.getByRole('switch', { name: 'Sports' })
    await sports.click()
    await toast(page, 'Sports is off')
    await expect(page.getByRole('region', { name: 'Sports is off' })).toContainText('Turn it back on with the switch above')
    await expect(page.getByRole('article', { name: /Barcelona vs Real Madrid/ })).toHaveCount(0)
    await page.getByRole('link', { name: 'Today' }).first().click()
    await expect(page.getByRole('region', { name: 'My next shifts' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Big nights' })).toHaveCount(0)

    // Staff see it's off but can't switch it.
    await signInAs(page, 'maria@example.com')
    await page.getByRole('link', { name: 'Sports' }).first().click()
    await expect(page.getByRole('region', { name: 'Sports is off' })).toContainText('An admin can turn it back on')
    await expect(page.getByRole('switch', { name: 'Sports' })).toHaveCount(0)

    await signInAs(page, 'aron@example.com')
    await page.getByRole('link', { name: 'Sports' }).first().click()
    await page.getByRole('switch', { name: 'Sports' }).click()
    const ask = page.getByRole('dialog', { name: 'Turn on Sports?' })
    await expect(ask).toContainText('On match days')
    await expect(ask).toContainText('1.1.1.1 app (WARP)')
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('region', { name: 'Sports is off' })).toBeVisible()
    await page.getByRole('switch', { name: 'Sports' }).click()
    await page.getByRole('dialog', { name: 'Turn on Sports?' }).getByRole('button', { name: 'Turn on' }).click()
    await toast(page, 'Sports is on')
    await expect(page.getByRole('article', { name: /Barcelona vs Real Madrid/ })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Sports' })).toBeChecked()
  })

  test('partners do not get the sports page', async ({ page }) => {
    await open(page, '/sports', 'laura@gestoria.example')
    await expect(page.getByRole('link', { name: 'Sports' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Sports' })).toHaveCount(0)
  })
})

test.describe('music', () => {
  test('your own music is optional: connect Spotify or YouTube Music to see your playlists', async ({ page }) => {
    await open(page, '/music', 'maria@example.com')
    const gate = page.getByRole('region', { name: 'Connect a music account' })
    await expect(gate.getByText(/Only you see your account/)).toBeVisible()
    await expect(page.getByRole('list', { name: 'Your playlists' })).toHaveCount(0)

    await gate.getByRole('button', { name: 'Connect Spotify' }).click()
    const lists = page.getByRole('list', { name: 'Your playlists' })
    await expect(lists.getByRole('button', { name: 'Morning coffee' })).toHaveAttribute('aria-pressed', 'true')
    await lists.getByRole('button', { name: 'Gym mix' }).click()
    await expect(page.getByRole('region', { name: 'Player' }).getByText('Gym mix')).toBeVisible()
    await page.getByRole('button', { name: 'Play on my devices' }).click()
    await toast(page, 'Playing Gym mix')
    await expect(page.getByText('On iPhone')).toBeVisible()

    // A second service gets its own tab.
    await page.getByRole('button', { name: 'Connect YouTube Music' }).click()
    await page.getByRole('tab', { name: 'YouTube Music' }).click()
    await expect(lists.getByRole('button', { name: 'Spanish summer' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play on my devices' })).toHaveCount(0)
  })

  test('each person connects their own account, and can disconnect it', async ({ page }) => {
    await open(page, '/music', 'maria@example.com')
    await page.getByRole('button', { name: 'Connect Spotify' }).click()
    await expect(page.getByRole('list', { name: 'Your playlists' })).toBeVisible()
    await signInAs(page, 'aron@example.com')
    await page.getByRole('link', { name: 'Music' }).first().click()
    await expect(page.getByRole('region', { name: 'Connect a music account' })).toBeVisible() // Maria's account is hers
    await signInAs(page, 'maria@example.com')
    await page.getByRole('link', { name: 'Music' }).first().click()
    await page.locator('.MuiChip-deleteIcon').first().click()
    await toast(page, 'Spotify disconnected')
    await expect(page.getByRole('region', { name: 'Connect a music account' })).toBeVisible()
  })

  test('café music: one device plays the café’s YouTube Music, with now playing, controls, queue and playlists', async ({ page }) => {
    await open(page, '/connections')
    const cafe = page.getByRole('region', { name: 'Café music' })
    await switchApp(page, cafe, 'YouTube Music')
    await expect(cafe.getByRole('article', { name: 'YouTube Music' })).toContainText('Connected')

    // No personal connection needed: the café account's music is right there.
    await page.getByRole('link', { name: 'Music' }).first().click()
    const now = page.getByRole('region', { name: 'Now playing' })
    await expect(now).toContainText('Nothing playing')
    await expect(page.getByRole('region', { name: 'Café playlists' }).getByRole('button', { name: 'Easy Beans · Café mix', exact: true })).toBeVisible()
    await now.getByRole('button', { name: 'Play on this device' }).click()
    await expect(now).toContainText('Playing on this device')
    await expect(now.getByRole('heading', { name: 'Sunday Morning' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Café speaker' })).toBeVisible()

    await now.getByRole('button', { name: 'Next song' }).click()
    await expect(now.getByRole('heading', { name: 'Coffee' })).toBeVisible()
    await now.getByRole('button', { name: 'Pause' }).click()
    await expect(now.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    // Pick a song from the queue, then another playlist.
    const queue = page.getByRole('list', { name: 'Queue' })
    await queue.getByRole('button', { name: 'Play Bloom' }).click()
    await expect(now.getByRole('heading', { name: 'Bloom' })).toBeVisible()
    await expect(queue.getByRole('listitem', { name: 'Bloom' })).toHaveAttribute('aria-current', 'true')
    await page.getByRole('region', { name: 'Café playlists' }).getByRole('button', { name: 'Sunday slow bar', exact: true }).click()
    await expect(now.getByRole('heading', { name: 'Holocene' })).toBeVisible()
    await expect(queue.getByRole('listitem')).toHaveCount(3)

    // Keeps playing on other pages; Today shows it with the buttons.
    await page.getByRole('link', { name: 'Home: Today' }).click()
    const card = page.getByRole('region', { name: 'Café music' })
    await expect(card).toContainText('Holocene')
    await expect(card).toContainText('on this device')
    await expect(page.getByRole('region', { name: 'Café speaker' })).toBeVisible()
    await page.getByRole('region', { name: 'Café speaker' }).getByRole('button', { name: 'Stop playing on this device' }).click()
    await expect(page.getByRole('region', { name: 'Café speaker' })).toHaveCount(0)
    await expect(card).toContainText('Nothing playing')
  })

  test('café music: search all of YouTube Music, and play a song now, next or at the end, or a whole playlist', async ({ page }) => {
    await open(page, '/connections')
    await switchApp(page, page.getByRole('region', { name: 'Café music' }), 'YouTube Music')
    await page.getByRole('link', { name: 'Music' }).first().click()
    // No header text or speaker instructions: the page opens on what's playing.
    await expect(page.getByText('connected to the speaker')).toHaveCount(0)
    await expect(page.getByText('What’s on')).toHaveCount(0)
    const now = page.getByRole('region', { name: 'Now playing' })
    await now.getByRole('button', { name: 'Play on this device' }).click()
    await expect(now.getByRole('heading', { name: 'Sunday Morning' })).toBeVisible()

    const find = page.getByRole('region', { name: 'Find music' })
    await find.getByLabel('Search music').fill('Lofi')
    await find.getByRole('button', { name: 'Search', exact: true }).click()
    const songs = find.getByRole('list', { name: 'Songs found' })
    await expect(songs.getByRole('listitem')).toHaveCount(3)
    const queue = page.getByRole('list', { name: 'Queue' })
    await songs.getByRole('button', { name: 'Play Lofi (Live) next' }).click()
    await toast(page, 'Lofi (Live) plays next')
    await expect(queue.getByRole('listitem').nth(1)).toHaveAccessibleName('Lofi (Live)')
    await songs.getByRole('button', { name: 'Add Lofi (Acoustic) to the queue' }).click()
    await expect(queue.getByRole('listitem').last()).toHaveAccessibleName('Lofi (Acoustic)')
    // The X takes a song off the queue; the one playing carries on (and has no X).
    await queue.getByRole('button', { name: 'Remove Lofi (Acoustic) from the queue' }).click()
    await toast(page, 'Removed Lofi (Acoustic)')
    await expect(queue.getByRole('listitem', { name: 'Lofi (Acoustic)' })).toHaveCount(0)
    await expect(now.getByRole('heading', { name: 'Sunday Morning' })).toBeVisible()
    await expect(queue.getByRole('button', { name: 'Remove Sunday Morning from the queue' })).toHaveCount(0)
    await songs.getByRole('button', { name: 'Play Lofi now' }).click()
    await expect(now.getByRole('heading', { name: 'Lofi', exact: true })).toBeVisible()
    await expect(queue.getByRole('listitem', { name: 'Lofi', exact: true })).toHaveAttribute('aria-current', 'true')

    await find.getByRole('button', { name: 'Playlists' }).click()
    const lists = find.getByRole('list', { name: 'Playlists found' })
    await lists.getByRole('listitem', { name: 'Lofi mix' }).getByRole('button', { name: 'Play' }).click()
    await expect(now.getByRole('heading', { name: 'Holocene' })).toBeVisible()
    // The X in the search box clears it and the results.
    await find.getByRole('button', { name: 'Clear search' }).click()
    await expect(find.getByLabel('Search music')).toHaveValue('')
    await expect(find.getByRole('list', { name: 'Playlists found' })).toHaveCount(0)
    await expect(find.getByRole('button', { name: 'Clear search' })).toHaveCount(0)
  })

  test('café music: playlists play one after another, in an order anyone can drag; only music playlists show', async ({ page }) => {
    await open(page, '/connections')
    await switchApp(page, page.getByRole('region', { name: 'Café music' }), 'YouTube Music')
    await page.getByRole('link', { name: 'Music' }).first().click()
    const cafe = page.getByRole('region', { name: 'Café playlists' })
    const order = () => cafe.getByRole('list', { name: 'Café playlists' }).getByRole('listitem').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))
    await expect(cafe).toContainText('They play one after another, in this order.')
    await expect.poll(order).toEqual(['Easy Beans · Café mix', 'Sunday slow bar'])

    // When the last song of a playlist ends, the next playlist starts (and after the last, the first).
    const now = page.getByRole('region', { name: 'Now playing' })
    await cafe.getByRole('button', { name: 'Sunday slow bar', exact: true }).click()
    await now.getByRole('button', { name: 'Play on this device' }).click()
    await expect(now.getByRole('heading', { name: 'Holocene' })).toBeVisible()
    for (const song of ['Skinny Love', 'Ho Hey', 'Sunday Morning']) {
      await now.getByRole('button', { name: 'Next song' }).click()
      await expect(now.getByRole('heading', { name: song })).toBeVisible()
    }
    await expect(cafe.getByRole('button', { name: 'Easy Beans · Café mix', exact: true })).toHaveAttribute('aria-pressed', 'true')

    // Keyboard drag: Sunday slow bar goes first, and the order is kept.
    await cafe.getByRole('button', { name: 'Move Sunday slow bar' }).focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('status').filter({ hasText: 'over droppable area yt1' })).toHaveCount(1)
    await page.keyboard.press('Space')
    await toast(page, 'Playlist order saved')
    await expect.poll(order).toEqual(['Sunday slow bar', 'Easy Beans · Café mix'])
    await page.getByRole('link', { name: 'Home: Today' }).click()
    await page.getByRole('link', { name: 'Music' }).first().click()
    await expect.poll(order).toEqual(['Sunday slow bar', 'Easy Beans · Café mix'])

    // Plain YouTube playlists (not music) stay hidden unless asked for.
    await expect(cafe.getByText('Café refit timelapse')).toHaveCount(0)
    await cafe.getByRole('button', { name: 'Show 1 other YouTube playlist (not music)' }).click()
    await expect(cafe.getByRole('button', { name: 'Café refit timelapse', exact: true })).toBeVisible()
    await cafe.getByRole('button', { name: 'Hide other YouTube playlists' }).click()
    await expect(cafe.getByText('Café refit timelapse')).toHaveCount(0)
  })

  test('partners do not get music', async ({ page }) => {
    await open(page, '/music', 'laura@gestoria.example')
    await expect(page.getByRole('link', { name: 'Music' })).toHaveCount(0)
  })
})

test.describe('business-wide vs personal', () => {
  test('My account is just your personal details, password and data: no connections or access keys', async ({ page }) => {
    await open(page, '/account', 'maria@example.com')
    const details = page.getByRole('region', { name: 'Personal details' })
    await expect(details.getByRole('heading', { name: 'Personal details' })).toBeVisible()
    // The email is a field like the others, not a line under the title; it can't be edited here.
    await expect(details.getByLabel('Email')).toHaveValue('maria@example.com')
    await expect(details.getByLabel('Email')).not.toBeEditable()
    await expect(details.getByRole('button', { name: 'Save' })).toBeDisabled()
    await details.getByLabel('Name').fill('Maria García')
    await details.getByRole('button', { name: 'Save' }).click()
    await toast(page, /^Saved$/)
    for (const name of ['My shifts in my calendar', 'My music', 'AI assistants', 'Access keys']) {
      await expect(page.getByRole('region', { name })).toHaveCount(0)
    }
    await expect(page.getByRole('region', { name: 'Password' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Your data' })).toBeVisible()
    // Employees never see the team calendar or the business's own accounts.
    await expect(page.getByRole('region', { name: 'Team calendar' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Connections' })).toHaveCount(0)
  })

  test('admins manage the business connections and the team calendar separately', async ({ page }) => {
    await open(page, '/connections')
    await expect(page.getByRole('heading', { level: 1, name: 'Business connections' })).toBeVisible()
    const team = page.getByRole('region', { name: 'Team calendar' })
    await team.getByRole('button', { name: 'Make the team calendar link' }).click()
    await expect(team.getByLabel('Calendar link')).toContainText('.ics')
    await team.getByRole('button', { name: 'Switch off' }).click()
    await toast(page, 'Calendar link switched off')
    await expect(team.getByRole('button', { name: 'Make the team calendar link' })).toBeVisible()
  })
})

test.describe('data retention', () => {
  test('admins choose how long WhatsApp messages are kept: 3 months to start, shorter deletes older ones now', async ({ page }) => {
    await open(page, '/account')
    const retention = page.getByRole('region', { name: 'Data retention' })
    const keep = retention.getByRole('combobox', { name: 'Keep for' })
    await expect(keep).toHaveText('3 months (default)')

    // Shorter: asks first; Cancel changes nothing.
    await keep.click()
    await page.getByRole('option', { name: '1 month' }).click()
    const ask = page.getByRole('dialog', { name: 'Keep WhatsApp messages for 1 month?' })
    await expect(ask).toContainText('will be deleted now')
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await expect(keep).toHaveText('3 months (default)')

    await keep.click()
    await page.getByRole('option', { name: '1 month' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete older messages' }).click()
    await toast(page, 'WhatsApp messages are now kept for 1 month. 3 older messages deleted.')
    await expect(keep).toHaveText('1 month')

    // The Messages page shows only what's left: Sofía's chat from 45 days ago (both sides) and Julio's rota from 60 days ago went.
    await page.getByRole('link', { name: 'Messages' }).first().click()
    await page.getByRole('group', { name: 'Apps' }).getByRole('button', { name: 'WhatsApp' }).click()
    await page.getByRole('list', { name: 'Chats' }).getByRole('listitem', { name: 'Sofía Martín' }).getByRole('button').click()
    await expect(page.getByRole('region', { name: 'Chat with Sofía Martín' })).not.toContainText('leche de avena')

    // Longer: no question (nothing is deleted).
    await fromAccountMenu(page, 'My account')
    await keep.click()
    await page.getByRole('option', { name: '1 year' }).click()
    await toast(page, 'WhatsApp messages are now kept for 1 year.')
    await expect(keep).toHaveText('1 year')
  })

  test('employees don’t see it', async ({ page }) => {
    await open(page, '/account', 'maria@example.com')
    await expect(page.getByRole('region', { name: 'Your data' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Data retention' })).toHaveCount(0)
  })
})

test.describe('monthly hours record (registro de jornada)', () => {
  test('an employee prints only their own month', async ({ page }) => {
    await open(page, '/account', 'maria@example.com')
    await page.getByRole('link', { name: 'My monthly hours record' }).click()
    await page.getByLabel('Month').fill('2026-09')
    const sheet = page.getByRole('article', { name: 'Hours record: Maria' })
    await expect(sheet.getByText('Registro diario de jornada')).toBeVisible()
    await expect(sheet.getByText(/Total \(\d+ days worked\)/)).toBeVisible()
    await expect(sheet.getByText('Firma del trabajador/a / Worker signature')).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(1)
    await expect(page.getByLabel('Person')).toHaveCount(0)
  })

  test('an admin prints everyone, one page each, from Timecards', async ({ page }) => {
    await open(page, '/timecards')
    await page.getByRole('link', { name: 'Monthly record' }).click()
    await expect(page).toHaveURL(/\/registro\?month=2026-09/)
    await expect.poll(() => page.getByRole('article').count()).toBeGreaterThan(1)
    await page.getByLabel('Person').click()
    await page.getByRole('option', { name: 'Maria' }).click()
    await expect(page.getByRole('article')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Print / save PDF' })).toBeEnabled()
  })
})

test.describe('appearance and accessibility', () => {
  test('each person picks their theme and text size; it applies everywhere and is kept', async ({ page }) => {
    await open(page, '/appearance', 'maria@example.com')
    const root = page.locator('html')
    await page.getByRole('radio', { name: 'Dark' }).click()
    await expect(root).toHaveAttribute('data-eb-theme', 'dark')
    await page.getByRole('radio', { name: 'Extra large' }).click()
    await expect(root).toHaveAttribute('style', /font-size: 125%/)
    await page.getByLabel(/Higher contrast/).check()
    await expect(root).toHaveAttribute('data-eb-contrast', 'high')
    await page.getByRole('link', { name: 'Rota' }).first().click()
    await expect(root).toHaveAttribute('data-eb-theme', 'dark')
    // Someone else signing in on the same device gets their own settings.
    await signInAs(page, 'aron@example.com')
    await expect(page.getByRole('heading', { name: 'Rota' })).toBeVisible()
    await expect(root).not.toHaveAttribute('data-eb-contrast', 'high')
    await expect(root).toHaveAttribute('style', /font-size: 100%/)
  })
  test('each person picks a decimal comma or point, and amounts follow it', async ({ page }) => {
    await open(page, '/team')
    const maria = page.getByRole('row', { name: /Maria/ })
    await expect(maria).toContainText('€8,80/h')
    await fromAccountMenu(page, 'Appearance')
    await page.getByRole('radio', { name: 'Decimal point' }).click()
    await toast(page, 'Numbers: decimal point')
    await page.getByRole('link', { name: 'Team' }).first().click()
    await expect(maria).toContainText('€8.80/h')
    // Another person on this device still sees their own choice (the comma).
    await signInAs(page, 'mark@example.com')
    await page.getByRole('link', { name: 'Team' }).first().click()
    await expect(maria).toContainText('€8,80/h')
  })
})

test.describe('opening hours', () => {
  test('admin changes a day; closures live in the calendar; staff see the hours read-only', async ({ page }) => {
    await open(page, '/opening-hours')
    await expect(page.getByRole('region', { name: 'Busiest hours' })).toHaveCount(0)
    const week = page.getByRole('region', { name: 'Weekly hours' })
    await week.getByLabel('Open on Sunday').uncheck()
    await page.getByRole('button', { name: 'Save hours' }).click()
    await toast(page, 'Opening hours saved')
    // Holidays and closures moved to the calendar's list view.
    await expect(page.getByRole('region', { name: 'Holidays and closures' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add a closure' })).toHaveCount(0)
    await signInAs(page, 'maria@example.com')
    await page.getByRole('link', { name: 'Opening hours' }).first().click()
    await expect(page.getByRole('region', { name: 'Weekly hours' }).getByText('Closed').last()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save hours' })).toHaveCount(0)
  })
})

test.describe('brand', () => {
  test('admin edits a colour and picks a font by searching; staff can only look', async ({ page }) => {
    await open(page, '/brand')
    await page.getByRole('button', { name: 'Edit Rose Pink' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit Rose Pink' })
    await dialog.getByLabel('Hex code').fill('#F08A96')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Colour saved')
    await expect(page.getByText('#F08A96')).toBeVisible()
    await page.getByRole('region', { name: 'Fonts' }).getByRole('button', { name: 'Change' }).first().click()
    const picker = page.getByRole('dialog', { name: 'Heading font' })
    await picker.getByLabel('Search fonts').fill('playfair')
    await picker.getByRole('option', { name: /Playfair Display/ }).click()
    await toast(page, 'Heading font: Playfair Display')
    await expect(page.getByText('Headings · Playfair Display')).toBeVisible()
    await signInAs(page, 'maria@example.com')
    await page.getByRole('link', { name: 'Brand' }).first().click()
    await expect(page.getByText('#F08A96')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit Rose Pink' })).toHaveCount(0)
  })
})

test.describe('event alerts', () => {
  test('admin rings the bell on an event and the reminder arrives in notifications', async ({ page }) => {
    await open(page, '/sports')
    await page.getByRole('button', { name: 'Alert me about Barcelona vs Real Madrid' }).click()
    await toast(page, 'Alert on: admins will be reminded')
    await expect(page.getByRole('button', { name: 'Alert on for Barcelona vs Real Madrid' })).toHaveAttribute('aria-pressed', 'true')
    // The demo also has Instagram mentions waiting, so the count is more than one.
    await page.getByRole('button', { name: /Notifications, \d+ new/ }).first().click()
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Barcelona vs Real Madrid')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: /Notifications, \d+ new/ })).toHaveCount(0)
    // Staff see the bell is on but can't change it.
    await signInAs(page, 'maria@example.com')
    await page.getByRole('link', { name: 'Sports' }).first().click()
    await expect(page.getByRole('button', { name: 'Alert on for Barcelona vs Real Madrid' })).toBeDisabled()
  })
})

test('Today is a short overview: who’s on and the hours, what’s coming up, your shifts, big nights and music', async ({ page }) => {
  await open(page, '/', 'maria@example.com')
  await expect(page.getByRole('heading', { name: 'Hola, Maria' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'At a glance' })).toHaveCount(0) // no counters
  const who = page.getByRole('region', { name: "Who's on today" })
  await expect(who).toContainText(/The café is (open \d\d:\d\d–\d\d:\d\d|closed today)/)
  for (const name of ['Coming up', 'My next shifts', 'Big nights']) await expect(page.getByRole('region', { name })).toBeVisible()
  // Two columns on a computer: your own things on the right.
  const left = (await who.boundingBox())!, right = (await page.getByRole('region', { name: 'My next shifts' }).boundingBox())!
  expect(right.x).toBeGreaterThan(left.x + left.width - 2)
  expect(Math.abs(right.y - left.y)).toBeLessThan(4)
})

test('Connections lists what’s connected first, and a kind moves up once one of its apps is connected', async ({ page }) => {
  await open(page, '/connections')
  await expect(page.getByRole('region', { name: 'Team messages' }).getByRole('article', { name: 'WhatsApp' })).toContainText('Connected')
  const kinds = () => page.getByRole('main').locator('section[aria-label] > div > h2').allTextContents()
  const first = await kinds()
  const connected = ['Team messages', 'Maps and search', 'Analytics', 'Social media', 'Advertising', 'Café music']
  expect(first.slice(0, connected.length).sort()).toEqual([...connected].sort())
  expect(first.indexOf('Files and storage')).toBeGreaterThan(first.indexOf('Email'))
  await page.getByRole('region', { name: 'Files and storage' }).getByRole('button', { name: 'Connect Google Drive' }).click()
  await expect(page.getByRole('region', { name: 'Files and storage' }).getByRole('article', { name: 'Google Drive' })).toContainText('Connected')
  await expect.poll(async () => { const k = await kinds(); return k.indexOf('Files and storage') < k.indexOf('Email') }).toBe(true)
})

test('the contact preference label sits above the field, never on top of “No preference”', async ({ page }) => {
  await open(page, '/account', 'maria@example.com')
  const label = page.locator('.MuiInputLabel-root', { hasText: 'Preferred contact' })
  await expect(label).toHaveAttribute('data-shrink', 'true')
  const field = page.getByRole('combobox', { name: 'Preferred contact' })
  expect((await label.boundingBox())!.y + 6).toBeLessThan((await field.boundingBox())!.y)
})

test.describe('menu', () => {
  test('business first, then accounts, what\'s on and the team; partners and the café tablet are switched off', async ({ page }) => {
    await open(page, '/')
    const nav = page.getByRole('navigation', { name: 'Main' })
    const headings = await nav.locator('section > button').allTextContents()
    expect(headings.map(h => h.trim())).toEqual(['Business', 'Sales', 'Accounts', 'Marketing', "What's on", 'Team', 'Settings'])
    await expect(nav.getByRole('link', { name: 'Partners' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Café tablet' })).toHaveCount(0)
    // Today is the landing page: no menu item, the logo takes you there.
    await expect(nav.getByRole('link', { name: 'Today', exact: true })).toHaveCount(0)
    await nav.getByRole('link', { name: 'Business', exact: true }).click()
    await nav.getByRole('link', { name: 'Home: Today' }).click()
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
    for (const path of ['/partners', '/kiosk']) {
      await page.goto(`${path}?demo`)
      await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
    }
  })

  test('a pin puts a page at the top of its section, on a soft pink; unpinning puts it back', async ({ page }) => {
    await open(page, '/')
    const team = page.getByRole('navigation', { name: 'Main' }).getByRole('region', { name: 'Team' })
    await expect(team.getByRole('link')).toHaveText(['Rota', 'Time off', 'Timecards', 'Team'])
    await team.getByRole('link', { name: 'Timecards' }).hover()
    await team.getByRole('button', { name: 'Pin Timecards to the top' }).click()
    await expect(team.getByRole('link')).toHaveText(['Timecards', 'Rota', 'Time off', 'Team'])
    await expect(team.getByRole('button', { name: 'Unpin Timecards' })).toHaveAttribute('aria-pressed', 'true')
    await team.getByRole('button', { name: 'Unpin Timecards' }).click()
    await expect(team.getByRole('link')).toHaveText(['Rota', 'Time off', 'Timecards', 'Team'])
  })

  test('the sidebar folds down to icons and remembers it', async ({ page }) => {
    await open(page, '/')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('button', { name: 'Collapse menu to icons' }).click()
    expect((await nav.boundingBox())!.width).toBeLessThan(100)
    await expect(nav.getByText('Opening hours')).toHaveCount(0)
    // Still every page, by icon (with its name for screen readers and on hover).
    await nav.getByRole('link', { name: 'Rota' }).click()
    await expect(page.getByRole('heading', { name: 'Rota' })).toBeVisible()
    await page.reload()
    await expect(nav.getByRole('button', { name: 'Expand menu' })).toBeVisible()
    await nav.getByRole('button', { name: 'Expand menu' }).click()
    expect((await nav.boundingBox())!.width).toBeGreaterThan(200)
    await expect(nav.getByText('Opening hours')).toBeVisible()
  })
})

test('admins pick the café\'s currency on the Business page; euro until they do', async ({ page }) => {
  await open(page, '/team')
  const maria = page.getByRole('row', { name: /Maria/ })
  await expect(maria).toContainText('€8,80/h')
  await page.getByRole('link', { name: 'Business', exact: true }).first().click()
  const company = page.getByRole('region', { name: 'Company' })
  await expect(company).toContainText('€ Euro')
  await company.getByRole('button', { name: 'Edit' }).click()
  // A plain dropdown, edited right on the page (no pop-up).
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await company.getByRole('combobox', { name: 'Currency' }).selectOption({ label: '£ Pound sterling' })
  await company.getByRole('button', { name: 'Save' }).click()
  await toast(page, /^Saved$/)
  await expect(company).toContainText('£ Pound sterling')
  await page.getByRole('link', { name: 'Team', exact: true }).first().click()
  await expect(maria).toContainText('£8,80/h')
})

test('people choose how they like to be contacted; admins see it on the team list', async ({ page }) => {
  await open(page, '/account', 'maria@example.com')
  await page.getByLabel('Preferred contact').click()
  // Call, Slack and Telegram are listed but not ready yet.
  await expect(page.getByRole('option', { name: /Phone call.*Coming soon/ })).toHaveAttribute('aria-disabled', 'true')
  await page.getByRole('option', { name: 'Text message' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await toast(page, /^Saved$/)
  await signInAs(page, 'aron@example.com')
  await page.getByRole('link', { name: 'Team', exact: true }).first().click()
  const maria = page.getByRole('row', { name: /Maria/ })
  await expect(maria.getByRole('cell').nth(3)).toHaveText('Text message')
  // Texts aren't connected yet: the list warns, and says what happens meanwhile.
  await expect(maria.getByLabel(/Alerts won’t reach Maria this way: Prefers text messages, which are coming soon. Until then: WhatsApp/)).toBeVisible()
  const julio = page.getByRole('row', { name: /Julio/ })
  await expect(julio.getByRole('cell').nth(3)).toHaveText('WhatsApp')
  await expect(julio.getByLabel(/Alerts won’t reach/)).toHaveCount(0)
  await julio.click()
  const panel = page.getByRole('dialog', { name: 'Julio' })
  await expect(panel.getByRole('status', { name: 'How alerts reach them' })).toContainText('WhatsApp to +34 600 111 222')
  await panel.getByLabel('Prefers to be contacted by').click()
  await page.getByRole('option', { name: 'Email' }).click()
  await toast(page, 'Contact preference saved')
  await expect(panel.getByLabel('Prefers to be contacted by')).toContainText('Email')
  await expect(panel.getByRole('status', { name: 'How alerts reach them' })).toContainText('Prefers email, but no mailbox is connected')
  await panel.getByRole('button', { name: 'Close' }).click()
  await expect(julio.getByRole('cell').nth(3)).toHaveText('Email')

  // Once a mailbox is connected, email people really get email.
  await page.getByRole('link', { name: 'Connections' }).first().click()
  await page.getByRole('button', { name: 'Connect Gmail' }).click()
  await page.getByRole('link', { name: 'Team', exact: true }).first().click()
  await page.getByRole('row', { name: /Julio/ }).click()
  await expect(page.getByRole('dialog', { name: 'Julio' }).getByRole('status', { name: 'How alerts reach them' }))
    .toContainText('Email to julio@example.com, from easybeanscafe@gmail.com')
})

test('an admin sets a new person’s mobile and contact preference when inviting them', async ({ page }) => {
  await open(page, '/team')
  await page.getByRole('button', { name: 'Invite' }).click()
  const dialog = page.getByRole('dialog', { name: 'Invite to the team' })
  await dialog.getByLabel('Full name').fill('Lucía')
  await dialog.getByRole('textbox', { name: 'Email' }).fill('lucia@example.com')
  await dialog.getByRole('textbox', { name: 'Mobile (optional)' }).fill('600 999 000')
  await dialog.getByLabel('Prefers to be contacted by').click()
  await page.getByRole('option', { name: 'WhatsApp', exact: true }).click()
  await dialog.getByRole('button', { name: 'Create account' }).click()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('row', { name: /Lucía/ }).getByRole('cell').nth(3)).toHaveText('WhatsApp')
})

test.describe('top bar', () => {
  test('search finds pages and people and goes there', async ({ page }) => {
    await open(page, '/')
    await page.getByRole('button', { name: 'Search' }).click()
    const box = page.getByRole('combobox', { name: 'Search pages and people' })
    await page.keyboard.type('open')
    await expect(box).toHaveValue('open')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Opening hours', level: 1 })).toBeVisible()
    await page.keyboard.press('Control+k')
    await page.keyboard.type('julio')
    await page.getByRole('option', { name: /Julio/ }).click()
    await expect(page.getByRole('dialog', { name: 'Julio' })).toBeVisible()
  })

  test('the sun/moon button switches the theme and remembers it', async ({ page }) => {
    await open(page, '/')
    const root = page.locator('html')
    const before = await root.getAttribute('data-eb-theme')
    const toDark = page.getByRole('button', { name: 'Switch to dark mode' })
    if (before === 'dark') await page.getByRole('button', { name: 'Switch to light mode' }).click()
    await toDark.click()
    await expect(root).toHaveAttribute('data-eb-theme', 'dark')
    await fromAccountMenu(page, 'Appearance')
    await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: 'Switch to light mode' }).click()
    await expect(root).toHaveAttribute('data-eb-theme', 'light')
  })
})

test('each person stars teams; the Favourites button opens them and can show only their games', async ({ page }) => {
  await open(page, '/sports', 'maria@example.com')
  // The matches are the page: favourites wait behind a button with a count.
  await expect(page.getByRole('region', { name: 'Favourites' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Favourites (0)' }).click()
  let favourites = page.getByRole('dialog', { name: 'Favourites' })
  await expect(favourites).toContainText('Tap the ☆')
  await favourites.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Add Arsenal to favourites' }).first().click()
  await toast(page, 'Arsenal added to favourites')
  await expect(page.getByRole('article').getByRole('button', { name: 'Remove Arsenal from favourites' }).first()).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Favourites (1)' }).click()
  favourites = page.getByRole('dialog', { name: 'Favourites' })
  await expect(favourites.getByRole('listitem', { name: 'Arsenal' })).toBeVisible()
  await favourites.getByRole('button', { name: /Show only their games/ }).click()
  await expect(page.getByRole('button', { name: 'Favourites (1)' })).toHaveAttribute('aria-pressed', 'true')
  for (const card of await page.getByRole('article').all()) await expect(card).toContainText('Arsenal')
  await page.getByRole('button', { name: 'Favourites (1)' }).click()
  await page.getByRole('dialog', { name: 'Favourites' }).getByRole('button', { name: 'Show all games' }).click()
  await expect(page.getByRole('article', { name: /Real Betis vs Sevilla/ })).toBeVisible()
  // Favourites are personal: Aron has his own.
  await signInAs(page, 'aron@example.com')
  await page.getByRole('link', { name: 'Sports' }).first().click()
  await page.getByRole('button', { name: /^Favourites \(\d+\)$/ }).click()
  await expect(page.getByRole('dialog', { name: 'Favourites' })).toContainText('Real Betis')
  await expect(page.getByRole('dialog', { name: 'Favourites' })).not.toContainText('Arsenal')
})

test('each person can tint the background with a brand colour', async ({ page }) => {
  await open(page, '/appearance', 'maria@example.com')
  const root = page.locator('html')
  const background = page.getByRole('radiogroup', { name: 'Background' })
  await expect(background.getByRole('radio', { name: 'Cream (default)' })).toHaveAttribute('aria-checked', 'true')
  await background.getByRole('radio', { name: 'Ube Lilac' }).click()
  await toast(page, 'Background: Ube Lilac')
  await expect(root).toHaveAttribute('data-eb-bg', 'tint')
  const tinted = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await background.getByRole('radio', { name: 'Cream (default)' }).click()
  await expect(root).not.toHaveAttribute('data-eb-bg', 'tint')
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(tinted)
})

test('pages can be dragged into a new order, but only within their own section', async ({ page }) => {
  await open(page, '/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  // The café's name sits next to the logo.
  await expect(nav.getByRole('link', { name: 'Home: Today' })).toContainText('Easy Beans Coffee')
  const team = nav.locator('section', { has: page.getByRole('button', { name: 'Team', exact: true }) })
  const names = () => team.getByRole('link').allTextContents()
  expect(await names()).toEqual(['Rota', 'Time off', 'Timecards', 'Team'])
  // Keyboard: pick up Team, move it up a place, drop it; twice. Each drop waits for the screen-reader
  // announcement of the move, so a busy machine can't drop it before the move has registered.
  const handle = team.getByRole('button', { name: 'Reorder Team' })
  for (const [over, order] of [['timecards', ['Rota', 'Time off', 'Team', 'Timecards']], ['timeoff', ['Rota', 'Team', 'Time off', 'Timecards']]] as const) {
    await handle.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowUp')
    await expect(team.getByRole('status')).toContainText(`over droppable area ${over}`)
    await page.keyboard.press('Space')
    await expect.poll(names).toEqual(order)
  }
  // Mouse: dragging Rota far down stops at the end of its own section.
  const rota = team.getByRole('button', { name: 'Reorder Rota' })
  const box = (await rota.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 5 })
  await page.mouse.move(box.x + box.width / 2, box.y + 600, { steps: 10 })
  await page.mouse.up()
  await expect.poll(names).toEqual(['Team', 'Time off', 'Timecards', 'Rota'])
  expect(await nav.locator('section', { has: page.getByRole('button', { name: 'Settings', exact: true }) }).getByRole('link').allTextContents())
    .toEqual(['Connections', 'Notifications'])
  // Saved to Aron's account: someone else gets the usual order, and Aron his own when he's back.
  await signInAs(page, 'mark@example.com')
  await expect.poll(names).toEqual(['Rota', 'Time off', 'Timecards', 'Team'])
  await signInAs(page, 'aron@example.com')
  await expect.poll(names).toEqual(['Team', 'Time off', 'Timecards', 'Rota'])
})

test('signed out: the Business Agent landing page; a new registration waits to be added, then sees the café', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.getByRole('heading', { level: 1, name: /runs your business/ })).toBeVisible()
  await expect(page.getByText('Business Agent').first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Enterprise plan' })).toHaveCount(0) // only on the pricing page
  // None of the café's branding before sign-in.
  await expect(page.getByText('Easy Beans')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Create account' }).click()
  await page.getByLabel('Your name').fill('Sofía Ruiz')
  await page.getByRole('textbox', { name: 'Email' }).fill('sofia@example.com')
  await page.getByLabel('Password').fill('short')
  await page.getByRole('button', { name: 'Create account' }).click()
  await toast(page, 'at least 8 characters')
  await page.getByLabel('Password').fill('cafe-con-leche-7')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: "You're registered, Sofía" })).toBeVisible()
  await expect(page.getByText('sofia@example.com').first()).toBeVisible()
  // An admin switches her on from the Team page; next time she's in the café's app.
  await signInAs(page, 'aron@example.com')
  await page.getByRole('link', { name: 'Team', exact: true }).first().click()
  await page.getByRole('button', { name: 'Switched off' }).click()
  await page.getByRole('row', { name: /Sofía Ruiz/ }).click()
  const panel = page.getByRole('dialog', { name: 'Sofía Ruiz' })
  await panel.getByLabel('Active').check()
  await toast(page, 'Access restored')
  await panel.getByRole('button', { name: 'Close' }).click()
  await signInAs(page, 'sofia@example.com')
  await page.getByRole('link', { name: 'Home: Today' }).first().click()
  await expect(page.getByRole('heading', { name: /Hola, Sofía/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toContainText('Easy Beans Coffee')
})

test('signed out: one-tap Google, Apple, Facebook and Microsoft sign-in next to email', async ({ page }) => {
  await page.goto('/?demo')
  for (const name of ['Google', 'Apple', 'Facebook', 'Microsoft']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeEnabled()
  }
  await page.getByRole('button', { name: 'Facebook', exact: true }).click()
  await toast(page, 'Facebook sign-in works on the live app')
})

test('pricing: four plans, a simple feature table, Enterprise at the foot, and "Try free" opens Create account', async ({ page }) => {
  await page.goto('/pricing?demo')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Start free')
  await expect(page.getByRole('article', { name: /plan$/ })).toHaveCount(4)
  const pro = page.getByRole('article', { name: 'Pro plan' })
  await expect(pro).toContainText('€79')
  await expect(page.getByRole('article', { name: 'Free plan' })).toContainText('1 social account, 1 scheduled post a month')
  await page.getByRole('button', { name: /Yearly/ }).first().click()
  await expect(pro).toContainText('€65.83')
  await expect(pro).toContainText('€790 billed yearly')
  await expect(page.getByRole('region', { name: 'Plan details' })).toHaveCount(0)
  // Enterprise, at the foot: by conversation with sales.
  const enterprise = page.getByRole('region', { name: 'Enterprise plan' })
  await expect(enterprise).toContainText('For groups, franchises and multi-site operators.')
  await expect(enterprise.getByRole('link', { name: 'Contact sales' })).toHaveAttribute('href', /^mailto:sales@businesssagent\.com\?subject=Business%20Agent%20Enterprise/)
  const table = page.getByRole('table', { name: 'Plan comparison' })
  await expect(table.getByRole('row', { name: /Custom MCP connection/ }).getByLabel('Included')).toHaveCount(4)
  await expect(table.getByRole('row', { name: /Scheduled posts per month/ }).getByRole('cell')).toHaveText(['Scheduled posts per month', '1', '12', '60', 'Unlimited'])
  // Enterprise is the last section before the closing banner, and only on this page.
  const sections = await page.locator('main > *').evaluateAll(els => els.map(e => (e.querySelector('[aria-label="Enterprise plan"]') ? 'enterprise' : e.textContent?.includes('Give your') ? 'closing' : 'other')))
  expect(sections.slice(-2)).toEqual(['enterprise', 'closing'])
  await page.getByRole('article', { name: 'Business plan' }).getByRole('link', { name: 'Try free for 2 months' }).click()
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Create account' })).toHaveAttribute('aria-selected', 'true')
})

test('compare: Square against Pro and GoHighLevel against Business, line by line', async ({ page }) => {
  await page.goto('/pricing?demo')
  await page.getByRole('link', { name: /Compare with Square and GoHighLevel/ }).click()
  const square = page.getByRole('table', { name: 'Square stack' })
  await expect(square.getByRole('row')).toHaveCount(5) // heading, 3 lines, total
  await expect(square.getByRole('row', { name: /Total with Square/ })).toContainText('€94')
  await expect(page.getByLabel('Savings')).toContainText('Business Agent Pro€79/mo')
  await expect(page.getByLabel('Savings')).toContainText('€15/mo')
  await expect(page.getByLabel('Savings')).toContainText('€180 a year')
  await page.getByRole('button', { name: 'vs GoHighLevel' }).click()
  await expect(page.getByRole('table', { name: 'GoHighLevel stack' }).getByRole('row', { name: /Total with GoHighLevel/ })).toContainText('€169.69')
  await expect(page.getByLabel('Savings')).toContainText('Business Agent Business€129/mo')
  await expect(page.getByLabel('Savings')).toContainText('€40.69/mo')
  await expect(page.getByLabel('Savings')).toContainText('€488.28 a year')
})

test.describe('team export', () => {
  test('team: admins export the list, sorted and filtered as shown', async ({ page }) => {
    await open(page, '/team')
    await page.getByRole('button', { name: 'Name' }).click()
    await page.getByRole('button', { name: 'Name' }).click()
    await page.getByRole('button', { name: 'Export' }).click()
    const csv = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: /CSV/ }).click()
    const download = await csv
    expect(download.suggestedFilename()).toMatch(/^team-.*\.csv$/)
    const lines = (await new Response((await download.createReadStream()) as unknown as ReadableStream).text()).replace(/^\ufeff/, '').split('\r\n')
    expect(lines[0]).toBe('"Name";"Email";"Role";"Status";"Prefers";"Phone";"Hourly rate (€)"')
    const names = lines.slice(1).map(l => l.split(';')[0].replace(/"/g, ''))
    expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)))
    expect(names).toContain('Maria')
  })

  test('employees don’t get the team export', async ({ page }) => {
    await open(page, '/team', 'maria@example.com')
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0)
  })
})

test.describe('billing', () => {
  test('on Free: paid pages show what they need, the trial of Business unlocks them', async ({ page }) => {
    await open(page, '/sports?plan=free')
    await expect(page.getByRole('heading', { name: /is on the Pro plan/ })).toBeVisible()
    await page.getByRole('link', { name: 'See plans' }).click()
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible()
    await expect(page.getByText('People on the team')).toBeVisible()
    await page.getByRole('button', { name: 'Start 2-month free trial' }).click()
    await toast(page, "You're on Business")
    await expect(page.getByText(/Free trial: 60 days left/)).toBeVisible()
    await page.getByRole('link', { name: 'Sports', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: /is on the Pro plan/ })).toHaveCount(0)
  })

  test('the sample café is the founding account: the top plan, free, nothing to choose', async ({ page }) => {
    await open(page, '/billing')
    // Billing lives under My account now; the old address still lands on it.
    await expect(page).toHaveURL(/\/account\/billing(\?|$)/)
    await expect(page.getByText('Founding account: free')).toBeVisible()
    await expect(page.getByLabel('Business plan').getByRole('button', { name: 'Current plan' })).toBeVisible()
    await expect(page.getByLabel('Pro plan').getByRole('button', { name: 'Choose Pro' })).toBeDisabled()
  })

  test('Billing opens from the account menu, and is found by search', async ({ page }) => {
    await open(page, '/team')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'Billing' })).toHaveCount(0)
    await fromAccountMenu(page, 'Billing')
    await expect(page).toHaveURL(/\/account\/billing(\?|$)/)
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible()
  })

  test('Sales (with Customers) and Marketing (Social planner, Ads, Analytics) are menu sections of their own; old Sales links still land', async ({ page }) => {
    await open(page, '/team')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('region', { name: 'Sales' }).getByRole('link', { name: 'Sales' }).click()
    await expect(page).toHaveURL(/\/sales$/)
    await expect(page.getByRole('heading', { name: 'Sales', level: 1 })).toBeVisible()
    await expect(nav.getByRole('region', { name: 'Sales' }).getByRole('link')).toHaveText(['Sales', 'Customers'])
    await expect(nav.getByRole('region', { name: 'Marketing' }).getByRole('link')).toHaveText(['Social planner', 'Ads', 'Analytics', 'Reviews', 'Website & SEO'])
    await nav.getByRole('region', { name: 'Marketing' }).getByRole('link', { name: 'Analytics' }).click()
    await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible()
    await expect(nav.getByRole('region', { name: 'Accounts' }).getByRole('link')).toHaveText(['Finances', 'Profit & loss', 'Invoices', 'Tax', 'Grants'])
    await page.goto('/finances/sales')
    await expect(page).toHaveURL(/\/sales$/)
  })

  test('employees never see Billing', async ({ page }) => {
    await open(page, '/billing', 'maria@example.com')
    await expect(page.getByRole('heading', { name: 'Billing' })).toHaveCount(0)
  })
})

test('guest link: opens already signed in as a Guest admin, no sign-in page', async ({ page }) => {
  await page.goto('/?demo&guest')
  await expect(page.getByRole('heading', { name: /Hola, Guest/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Team', exact: true }).first().click()
  await expect(page.getByRole('row', { name: /Guest \(you\)/ })).toBeVisible()
})

test.describe('connections for email, files and music', () => {
  test('like AI connectors: one click to connect, one app per kind, and "Connected" says what it proved', async ({ page }) => {
    await open(page, '/connections')
    const email = page.getByRole('region', { name: 'Email', exact: true })
    const files = page.getByRole('region', { name: 'Files and storage' })
    const comms = page.getByRole('region', { name: 'Team messages' })
    const music = page.getByRole('region', { name: 'Café music' })
    await expect(comms.getByRole('article', { name: 'WhatsApp' })).toContainText('Connected')
    // Each kind is just its heading and its apps, no line of text underneath.
    await expect(page.getByText(/Connect every account you post to|How the team hears about shifts/)).toHaveCount(0)
    // A choose-one group shows just the app in use (WhatsApp), not the alternatives.
    await expect(comms.getByRole('article', { name: 'Slack' })).toHaveCount(0)
    await expect(files.getByRole('article', { name: 'SharePoint' })).toContainText('Coming soon')
    await expect(music.getByRole('article', { name: 'Spotify' })).toContainText('Connected')

    // Details first, like an AI connector: what it can do before you connect.
    await email.getByRole('button', { name: 'Gmail details' }).click()
    const details = page.getByRole('dialog', { name: 'Gmail' })
    await expect(details).toContainText('It can’t read, delete or search your inbox')
    await expect(details).toContainText('It shows as connected only once it has really worked')
    await details.getByRole('button', { name: 'Connect Gmail' }).click()
    await expect(details).toContainText('Connected')
    await expect(details).toContainText('A confirmation email was sent from this mailbox to itself.')
    await details.getByRole('button', { name: 'Close' }).click()
    await expect(email.getByRole('article', { name: 'Gmail' })).toContainText('Connected')
    await expect(email.getByRole('article', { name: 'Gmail' })).toContainText('easybeanscafe@gmail.com')

    // One mailbox at a time: Outlook only shows when asked for; switching to it replaces Gmail.
    await expect(email.getByRole('article', { name: 'Outlook' })).toHaveCount(0)
    await expect(email.getByRole('group', { name: 'Other email apps' })).toContainText('Also works with')
    await switchApp(page, email, 'Outlook')
    await expect(email.getByRole('article', { name: 'Outlook' })).toContainText('Connected')
    await expect(email.getByRole('article', { name: 'Gmail' })).toHaveCount(0)
    await expect(email.getByRole('button', { name: 'Use Gmail instead' })).toBeVisible()
    await email.getByRole('button', { name: 'Manage Outlook' }).click()
    const outlook = page.getByRole('dialog', { name: 'Outlook' })
    await expect(outlook).toContainText('A confirmation email was sent from this mailbox to itself.')
    await outlook.getByRole('button', { name: 'Check now' }).click()
    await toast(page, 'Outlook works')
    await outlook.getByRole('button', { name: 'Send a test' }).click()
    await page.getByRole('dialog', { name: 'Send a test email' }).getByRole('button', { name: 'Send' }).click()
    await toast(page, 'Test email sent to aron@example.com')
    await outlook.getByRole('button', { name: 'Close' }).click()

    // No storage yet: no "Save to" on Timecards.
    await page.getByRole('link', { name: 'Timecards' }).first().click()
    await page.getByRole('button', { name: 'Export' }).click()
    await expect(page.getByRole('menuitem', { name: /Excel/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Save to/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.getByRole('link', { name: 'Connections' }).first().click()
    await page.getByRole('button', { name: 'Connect Google Drive' }).click()
    await expect(page.getByRole('region', { name: 'Files and storage' }).getByRole('article', { name: 'Google Drive' })).toContainText('Connected')
    await page.getByRole('link', { name: 'Timecards' }).first().click()
    const popup = page.waitForEvent('popup')
    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('menuitem', { name: /Save to Drive/ }).click()
    await toast(page, 'Saved to Google Drive › Business Agent › Timecards')
    await popup // the saved file opens in a new tab

    await page.getByRole('link', { name: 'Connections' }).first().click()
    await page.getByRole('button', { name: 'Check all connections' }).click()
    await toast(page, 'Every connection works')
  })

  test('calendar: waits until the calendar app has fetched the team calendar, then shows connected', async ({ page }) => {
    await open(page, '/connections')
    const calendar = page.getByRole('region', { name: 'Calendar', exact: true })
    await page.context().route('https://calendar.google.com/**', r => r.fulfill({ body: 'Google Calendar' }))
    const popup = page.waitForEvent('popup')
    await calendar.getByRole('button', { name: 'Add to Google Calendar' }).click()
    const tab = await popup
    await expect.poll(() => tab.url()).toMatch(/calendar\.google\.com\/calendar\/render\?cid=webcal/)
    await expect(calendar.getByRole('article', { name: 'Google Calendar' })).toContainText('Waiting')
    await calendar.getByRole('button', { name: 'Manage Google Calendar' }).click()
    const dialog = page.getByRole('dialog', { name: 'Google Calendar' })
    await expect(dialog).toContainText('Waiting for Google Calendar to fetch the team calendar')
    await dialog.getByRole('button', { name: 'Check now' }).click() // the demo pretends Google fetched it
    await expect(dialog).toContainText('Google Calendar has fetched the team calendar.')
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(calendar.getByRole('article', { name: 'Google Calendar' })).toContainText('Connected')
    await expect(page.getByRole('region', { name: 'Team calendar' }).getByLabel('Calendar link')).toContainText('.ics')
  })

  test('café music: switching to YouTube Music replaces Spotify; staff open the playlist on the café device', async ({ page }) => {
    await open(page, '/connections')
    const music = page.getByRole('region', { name: 'Café music' })
    await switchApp(page, music, 'YouTube Music')
    await expect(music.getByRole('article', { name: 'YouTube Music' })).toContainText('Connected')
    await expect(music.getByRole('article', { name: 'Spotify' })).toHaveCount(0)
    await music.getByRole('button', { name: 'Manage YouTube Music' }).click()
    const dialog = page.getByRole('dialog', { name: 'YouTube Music' })
    await dialog.getByLabel('Approved playlist').click()
    await page.getByRole('option', { name: /Café mix/ }).click()
    await toast(page, '“Easy Beans · Café mix” is now the café playlist')
    await dialog.getByRole('button', { name: 'Close' }).click()

    await signInAs(page, 'maria@example.com')
    const card = page.getByRole('region', { name: 'Café music' })
    await expect(card).toContainText('Nothing playing')
    await card.getByRole('link', { name: 'Open Music' }).click()
    await expect(page.getByRole('region', { name: 'Café playlists' }).getByRole('button', { name: 'Easy Beans · Café mix', exact: true })).toContainText('Approved')
  })

  test('one logo: admins click it to replace it ("Replace" shows on hover); staff only look', async ({ page }) => {
    await open(page, '/brand')
    const card = page.getByRole('region', { name: 'Logo' })
    await expect(card.getByRole('img', { name: 'Logo' })).toHaveCount(1) // no dark version
    const logo = card.getByRole('button', { name: 'Replace logo' })
    const hint = card.getByText('Replace', { exact: true })
    await expect(hint).toHaveCSS('opacity', '0')
    await logo.hover()
    await expect(hint).toHaveCSS('opacity', '1')
    const box = (await logo.boundingBox())!
    const at = (await hint.boundingBox())!
    expect(at.x).toBeGreaterThan(box.x + box.width / 2)
    expect(at.y).toBeGreaterThan(box.y + box.height / 2)
    const chooser = page.waitForEvent('filechooser')
    await logo.click()
    await (await chooser).setFiles({ name: 'new-logo.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') })
    await toast(page, 'Logo updated')
    await expect(card.getByRole('img', { name: 'Logo' })).toHaveAttribute('src', /^data:image\/png/)
    await signInAs(page, 'maria@example.com')
    await page.getByRole('link', { name: 'Brand' }).first().click()
    await expect(page.getByRole('region', { name: 'Logo' }).getByRole('img', { name: 'Logo' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Logo' }).getByRole('button', { name: 'Replace logo' })).toHaveCount(0)
  })

  test('the brand page shows one logo and the main brand colours only', async ({ page }) => {
    await open(page, '/brand')
    await expect(page.getByText('Small version (icon)')).toHaveCount(0)
    await expect(page.getByText('Rose Wash')).toHaveCount(0)
    await expect(page.getByText('Rose Pink').first()).toBeVisible()
    // The logo on the left, the colours beside it on the right.
    const logo = (await page.locator('.MuiCard-root', { hasText: 'Logo' }).first().boundingBox())!
    const colours = (await page.locator('.MuiCard-root', { hasText: 'Rose Pink' }).first().boundingBox())!
    expect(colours.x).toBeGreaterThan(logo.x + logo.width - 2)
    expect(Math.abs(colours.y - logo.y)).toBeLessThan(4)
  })
})

test.describe('social planner', () => {
  // A 1×1 PNG: the planner turns photos into JPEG before they're uploaded.
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG })
  const video = (name: string) => ({ name, mimeType: 'video/mp4', buffer: Buffer.from('not really a video') })
  const view = (page: Page, name: 'List' | 'Calendar' | 'Table') => page.getByRole('group', { name: 'View' }).getByRole('button', { name }).click()
  async function connectDrive(page: Page) {
    await page.getByRole('link', { name: 'Connections' }).first().click()
    await page.getByRole('region', { name: 'Files and storage' }).getByRole('button', { name: 'Connect Google Drive' }).click()
    await expect(page.getByRole('region', { name: 'Files and storage' }).getByRole('article', { name: 'Google Drive' })).toContainText('Connected')
    await page.getByRole('link', { name: 'Social planner' }).first().click()
    // The planner has loaded and knows where photos and videos go.
    await expect(page.getByRole('main').getByRole('region', { name: 'Accounts' })).toContainText('Google Drive · easybeanscafe@gmail.com')
    await expect(page.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true')
  }

  test('plan a post for several accounts, schedule it, post another now, and see where it went', async ({ page }) => {
    await open(page, '/connections')
    // Connect Facebook in one click (Instagram and Google Maps are already connected in the demo).
    await page.getByRole('button', { name: 'Connect Facebook' }).click()
    await expect(page.getByRole('region', { name: 'Social media' }).getByRole('article', { name: 'Facebook' })).toContainText('Connected')
    await connectDrive(page)

    await expect(page.getByRole('heading', { level: 1, name: 'Social planner' })).toBeVisible()
    const accounts = page.getByRole('main').getByRole('region', { name: 'Accounts' })
    await expect(accounts).toContainText('@easy.beans.coffee')
    await expect(accounts.getByRole('link', { name: 'Connect' })).toHaveCount(1) // TikTok only
    await expect(accounts).toContainText('Google Drive · easybeanscafe@gmail.com')
    const coming = page.getByRole('region', { name: 'Coming up' })
    await expect(coming).toContainText('Feria week')
    await expect(page.getByRole('region', { name: 'Sent' })).toContainText('Iced oat latte')

    await page.getByRole('button', { name: 'New post' }).click()
    const dialog = page.getByRole('dialog', { name: 'New post' })
    await dialog.getByLabel('Caption', { exact: true }).fill('Matcha week starts Monday: 2x1 on iced matcha before 11:00.')
    // Storage connected: it posts by itself. Connected accounts start ticked; Instagram needs a photo.
    await expect(dialog.getByRole('radio', { name: /Post it automatically/ })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: /TikTok/ })).toBeDisabled()
    await expect(dialog.getByRole('alert')).toContainText('Instagram and TikTok posts need a photo')
    await dialog.getByRole('checkbox', { name: /Instagram/ }).uncheck()
    await dialog.getByRole('radio', { name: 'Schedule' }).check()
    await dialog.getByLabel('Date').fill('2026-10-05')
    await dialog.getByLabel('Time (Madrid)').fill('09:30')
    await dialog.getByRole('button', { name: 'Schedule' }).click()
    await toast(page, 'Scheduled for Mon 5 Oct, 09:30')
    await expect(coming.getByRole('article', { name: /Matcha week/ })).toContainText('09:30')

    await page.getByRole('button', { name: 'New post' }).click()
    const now = page.getByRole('dialog', { name: 'New post' })
    await now.getByLabel('Caption', { exact: true }).fill('Open until 23:00 tonight!')
    await now.getByRole('checkbox', { name: /Instagram/ }).uncheck()
    await now.getByRole('button', { name: 'Post now' }).click()
    await toast(page, 'Posting now')
    const sent = page.getByRole('region', { name: 'Sent' }).getByRole('article', { name: /Open until 23:00/ })
    await expect(sent).toContainText('Posted')
    await expect(sent.getByRole('list', { name: 'Where it went' })).toContainText('Facebook: posted')
    await expect(sent.getByRole('list', { name: 'Where it went' })).toContainText('Google Maps: posted')
  })

  test('without storage, posts are reminders: it’s your turn, copy the caption, mark it posted', async ({ page }) => {
    await open(page, '/social')
    await expect(page.getByRole('main').getByRole('region', { name: 'Accounts' }).getByLabel('Photos and videos')).toHaveAttribute('title', 'Connect storage to add photos and videos and post automatically')
    const turn = page.getByRole('region', { name: 'Your turn to post' })
    const due = turn.getByRole('article', { name: /Poll sticker/ })
    await expect(due).toContainText('Planned for Wed 30 Sep, 08:00 on Instagram')
    await expect(due.getByRole('link', { name: 'Open Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/')

    // Composer: no photos without storage, and posting by itself is off.
    await page.getByRole('button', { name: 'New post' }).click()
    const dialog = page.getByRole('dialog', { name: 'New post' })
    await expect(dialog.getByRole('group', { name: 'Photos and videos' })).toContainText('Connect Google Drive or OneDrive to add photos and videos')
    await expect(dialog.getByRole('radio', { name: /Post it automatically/ })).toBeDisabled()
    await expect(dialog.getByRole('radio', { name: /Remind me to post it myself/ })).toBeChecked()
    await dialog.getByRole('button', { name: 'Story' }).click()
    await expect(dialog.getByRole('checkbox', { name: /Google Maps/ })).toBeDisabled()
    await expect(dialog.getByRole('group', { name: 'Post to' })).toContainText('posts only')
    await dialog.getByLabel(/Note \(for you/).fill('Behind the bar: new grinder')
    await dialog.getByRole('radio', { name: 'Schedule' }).check()
    await dialog.getByLabel('Date').fill('2026-10-02')
    await dialog.getByLabel('Time (Madrid)').fill('18:00')
    await dialog.getByRole('button', { name: 'Set reminder' }).click()
    await toast(page, 'Reminder set for Fri 2 Oct, 18:00')
    const planned = page.getByRole('region', { name: 'Coming up' }).getByRole('article', { name: /Behind the bar/ })
    await expect(planned).toContainText('Reminder')
    await expect(planned).toContainText('Story')

    await due.getByRole('button', { name: 'Mark as posted' }).click()
    await toast(page, 'Marked as posted')
    await expect(turn).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Sent' }).getByRole('article', { name: /Poll sticker/ })).toContainText('Instagram: posted by hand')
  })

  test('with Google Drive: a reel’s video and a carousel’s photos, the kinds, photos or videos, calendar and table', async ({ page }) => {
    await open(page, '/connections')
    await connectDrive(page)

    // A reel: one video, Instagram only, saved in Drive › Business Agent › Social › Reels.
    await page.getByRole('button', { name: 'New post' }).click()
    let dialog = page.getByRole('dialog', { name: 'New post' })
    await dialog.getByRole('button', { name: 'Reel' }).click()
    await expect(dialog).toContainText('Saved in Google Drive › Business Agent › Social › Reels')
    await expect(dialog.getByRole('alert')).toContainText('Add the reel’s video')
    await dialog.getByLabel('Photo or video file').setInputFiles(video('pour.mp4'))
    await expect(dialog.getByRole('button', { name: 'Remove video 1' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Add the video' })).toHaveCount(0)
    await dialog.getByLabel('Caption', { exact: true }).fill('Slow pour, new beans')
    await dialog.getByRole('radio', { name: 'Schedule' }).check()
    await dialog.getByLabel('Date').fill('2026-10-07')
    await dialog.getByLabel('Time (Madrid)').fill('12:00')
    await dialog.getByRole('button', { name: 'Schedule' }).click()
    await toast(page, 'Scheduled for Wed 7 Oct, 12:00')

    // A carousel: photos in order (moved around), then saved as a draft.
    await page.getByRole('button', { name: 'New post' }).click()
    dialog = page.getByRole('dialog', { name: 'New post' })
    await dialog.getByRole('button', { name: 'Carousel' }).click()
    await dialog.getByLabel('Photo or video file').setInputFiles([photo('a.png'), photo('b.png'), photo('c.png')])
    await expect(dialog.getByRole('button', { name: /Remove photo/ })).toHaveCount(3)
    await expect(dialog.getByRole('group', { name: 'Photos and videos' })).toContainText('3 of up to 10')
    await dialog.getByRole('button', { name: 'Move 1 later' }).click()
    await dialog.getByLabel('Caption', { exact: true }).fill('Autumn menu, swipe →')
    await dialog.getByRole('button', { name: 'Save draft' }).click()
    await toast(page, 'Draft saved')

    // Folders: each kind on its own tab; photos or videos.
    const tabs = page.getByRole('tablist', { name: 'Kinds of post' })
    await tabs.getByRole('tab', { name: /^Reels/ }).click()
    await expect(page.getByRole('region', { name: 'Coming up' }).getByRole('article')).toHaveCount(2) // the demo's reel and the new one
    await expect(page.getByRole('region', { name: 'Drafts' })).toHaveCount(0)
    await tabs.getByRole('tab', { name: /^Carousels/ }).click()
    await expect(page.getByRole('region', { name: 'Drafts' }).getByRole('article', { name: /Autumn menu/ })).toBeVisible()
    await tabs.getByRole('tab', { name: /^All/ }).click()
    await page.getByRole('group', { name: 'Photos or videos' }).getByRole('button', { name: 'Videos' }).click()
    await expect(page.getByRole('region', { name: 'Coming up' }).getByRole('article', { name: /Feria week/ })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Coming up' }).getByRole('article', { name: /Slow pour/ })).toBeVisible()
    await page.getByRole('group', { name: 'Photos or videos' }).getByRole('button', { name: 'All' }).click()

    // Calendar: the month, each post on its day; opening one edits it.
    await view(page, 'Calendar')
    const cal = page.getByRole('region', { name: 'Calendar' })
    await expect(cal.getByRole('heading', { name: 'September 2026' })).toBeVisible()
    await cal.getByRole('button', { name: 'Next month' }).click()
    await expect(cal.getByRole('gridcell', { name: 'Wednesday 7 October' }).getByRole('button', { name: /Reel at 12:00: Slow pour/ })).toBeVisible()
    await cal.getByRole('gridcell', { name: 'Wednesday 7 October' }).getByRole('button', { name: /Reel at 12:00/ }).click()
    await expect(page.getByRole('dialog', { name: 'Edit post' }).getByLabel('Caption', { exact: true })).toHaveValue('Slow pour, new beans')
    await page.getByRole('dialog', { name: 'Edit post' }).getByRole('button', { name: 'Cancel' }).click()

    // Table: every post, newest first by default; the kind, how and status of each.
    await view(page, 'Table')
    const table = page.getByRole('table', { name: 'Posts' })
    const reel = table.getByRole('row', { name: /Slow pour/ })
    await expect(reel).toContainText('Reel')
    await expect(reel).toContainText('Automatically')
    await expect(reel).toContainText('Scheduled')
    await expect(table.getByRole('row', { name: /Poll sticker/ })).toContainText('Reminder')
    // The view is remembered.
    await page.reload()
    await expect(page.getByRole('table', { name: 'Posts' })).toBeVisible()
  })

  test('every row has edit and bin; a post that didn’t go out is fixed and posted again', async ({ page }) => {
    await open(page, '/connections')
    await connectDrive(page)

    // Instagram refused it: it says why, and it can be edited to try again.
    const failed = page.getByRole('region', { name: 'Sent' }).getByRole('article', { name: /Acai bowls/ })
    await expect(failed).toContainText('Not posted')
    await expect(failed).toContainText('Instagram: not posted (Instagram couldn’t use the photo or video)')
    await failed.getByRole('button', { name: 'Edit post' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit post' })
    await expect(dialog.getByRole('alert').first()).toContainText('This didn’t go out: Instagram couldn’t use the photo or video')
    // Its time has passed, so it starts from Now; the caption, photo and accounts can all change.
    await expect(dialog.getByRole('radio', { name: 'Now' })).toBeChecked()
    await dialog.getByLabel('Caption', { exact: true }).fill('Acai bowls are back, all week.')
    await dialog.getByRole('button', { name: 'Remove photo 1' }).click()
    await dialog.getByLabel('Photo or video file').setInputFiles(photo('acai.png'))
    await expect(dialog.getByRole('button', { name: 'Remove photo 1' })).toBeVisible()
    await dialog.getByRole('checkbox', { name: /Google Maps/ }).check()
    await dialog.getByRole('button', { name: 'Post now' }).click()
    await toast(page, 'Posting now')
    const again = page.getByRole('region', { name: 'Sent' }).getByRole('article', { name: /all week/ })
    await expect(again).toContainText('Posted')
    await expect(again.getByRole('list', { name: 'Where it went' })).toContainText('Instagram: posted')
    await expect(again.getByRole('list', { name: 'Where it went' })).toContainText('Google Maps: posted')
    // Gone out: it can't change on the networks, so editing it starts a new post from it.
    await again.getByRole('button', { name: 'Edit post' }).click()
    const copy = page.getByRole('dialog', { name: 'Post again' })
    await expect(copy.getByRole('alert').first()).toContainText('Saving makes a new post')
    await expect(copy.getByLabel('Caption', { exact: true })).toHaveValue('Acai bowls are back, all week.')
    await copy.getByRole('button', { name: 'Cancel' }).click()
    // Edit sits left of the bin; the bin doesn't change under the pointer, and asks first.
    const pencil = (await again.getByRole('button', { name: 'Edit post' }).boundingBox())!
    const bin = again.getByRole('button', { name: 'Delete post' })
    expect((await bin.boundingBox())!.x).toBeGreaterThan(pencil.x)
    await bin.hover()
    expect(await bin.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    await bin.click()
    const remove = page.getByRole('dialog', { name: 'Remove this post from the list?' })
    await expect(remove).toContainText('stays on the networks it went to')
    await remove.getByRole('button', { name: 'Remove' }).click()
    await toast(page, 'Removed from the list')
    await expect(page.getByRole('region', { name: 'Sent' }).getByRole('article', { name: /all week/ })).toHaveCount(0)

    // The reminder that's due has both too.
    const due = page.getByRole('region', { name: 'Your turn to post' }).getByRole('article', { name: /Poll sticker/ })
    await expect(due.getByRole('button', { name: 'Edit post' })).toBeVisible()
    await expect(due.getByRole('button', { name: 'Delete post' })).toBeVisible()

    // The table: edit and bin at the end of each row. The bin asks first.
    await view(page, 'Table')
    const row = page.getByRole('table', { name: 'Posts' }).getByRole('row', { name: /Feria week/ })
    await row.getByRole('button', { name: 'Edit post' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit post' })
    await expect(edit.getByRole('radio', { name: 'Schedule' })).toBeChecked()
    await edit.getByRole('checkbox', { name: /Google Maps/ }).uncheck()
    await edit.getByLabel('Caption', { exact: true }).fill('Feria week: open until midnight, Thursday to Sunday.')
    await edit.getByRole('button', { name: 'Schedule' }).click()
    await toast(page, /^Scheduled for/)
    const feria = page.getByRole('table', { name: 'Posts' }).getByRole('row', { name: /until midnight/ })
    await expect(feria.getByLabel('Google Maps', { exact: true })).toHaveCount(0)
    await feria.getByRole('button', { name: 'Delete post' }).click()
    const confirm = page.getByRole('dialog', { name: 'Delete this post?' })
    await confirm.getByRole('button', { name: 'Keep' }).click()
    await expect(feria).toBeVisible()
    await feria.getByRole('button', { name: 'Delete post' }).click()
    await page.getByRole('dialog', { name: 'Delete this post?' }).getByRole('button', { name: 'Delete' }).click()
    await toast(page, 'Post deleted')
    await expect(page.getByRole('table', { name: 'Posts' }).getByRole('row', { name: /until midnight/ })).toHaveCount(0)
  })

  test('posts are planned in your own time zone, chosen in My account', async ({ page }) => {
    await open(page, '/account')
    const zone = page.getByRole('region', { name: 'Time zone' })
    // The café's until you choose.
    await expect(zone.getByRole('combobox', { name: 'Time zone' })).toHaveValue(/^Europe\/Madrid/)
    await expect(zone).toContainText('It’s 09:00 there now')
    await zone.getByRole('combobox', { name: 'Time zone' }).fill('London')
    await page.getByRole('option', { name: /Europe\/London/ }).click()
    await toast(page, 'Time zone set to London')
    await expect(zone).toContainText('It’s 08:00 there now')

    // 09:30 in London is 10:30 at the café.
    await page.getByRole('link', { name: 'Social planner' }).first().click()
    await page.getByRole('button', { name: 'New post' }).click()
    const dialog = page.getByRole('dialog', { name: 'New post' })
    await dialog.getByLabel('Caption', { exact: true }).fill('Flat white Friday')
    await dialog.getByRole('checkbox', { name: /Instagram/ }).uncheck()
    await dialog.getByRole('radio', { name: 'Schedule' }).check()
    await dialog.getByLabel('Date').fill('2026-10-02')
    await dialog.getByLabel('Time (London)').fill('09:30')
    await dialog.getByRole('button', { name: /Schedule|Set reminder/ }).click()
    await toast(page, /for Fri 2 Oct, 09:30/)
    await expect(page.getByRole('region', { name: 'Coming up' }).getByRole('article', { name: /Flat white Friday/ })).toContainText('09:30')

    await fromAccountMenu(page, 'My account')
    await zone.getByRole('combobox', { name: 'Time zone' }).fill('Madrid')
    await page.getByRole('option', { name: /Europe\/Madrid/ }).click()
    await toast(page, 'Time zone set to Madrid')
    await page.getByRole('link', { name: 'Social planner' }).first().click()
    await expect(page.getByRole('region', { name: 'Coming up' }).getByRole('article', { name: /Flat white Friday/ })).toContainText('10:30')
  })

  test('@phone the calendar shows dots per day and the chosen day’s posts below', async ({ page }) => {
    await open(page, '/social')
    await view(page, 'Calendar')
    const cal = page.getByRole('region', { name: 'Calendar' })
    await cal.getByRole('gridcell', { name: 'Wednesday 30 September' }).click()
    await expect(page.getByRole('region', { name: 'Wednesday 30 September' }).getByRole('article', { name: /Poll sticker/ })).toBeVisible()
    await cal.getByRole('button', { name: 'Next month' }).click()
    await cal.getByRole('gridcell', { name: 'Thursday 1 October' }).click()
    await expect(page.getByRole('region', { name: 'Thursday 1 October' }).getByRole('article', { name: /Feria week/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('employees don’t get the planner', async ({ page }) => {
    await open(page, '/', 'maria@example.com')
    await expect(page.getByRole('link', { name: 'Social planner' })).toHaveCount(0)
    await page.goto('/social')
    await expect(page.getByRole('heading', { name: 'Social planner' })).toHaveCount(0)
  })
})

test('Square: connect the payment system, then takings show on Finances next to the team’s cost', async ({ page }) => {
  test.skip(!FEATURES.square, 'Square is switched off for now')
  await open(page, '/finances')
  const prompt = page.getByRole('alert').filter({ hasText: 'Connect Square, SumUp or Stripe to see takings' })
  await expect(prompt).toBeVisible()
  await prompt.getByRole('link', { name: 'Connect' }).click()
  const payments = page.getByRole('region', { name: 'Payments and sales' })
  // The till: Square or SumUp, pick one. Stripe (online payments) sits apart, on top of either.
  await expect(payments.getByRole('button', { name: 'Connect Square' })).toBeVisible()
  expect(await payments.getByRole('article').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))).toEqual(['Square', 'SumUp'])
  await expect(page.getByRole('region', { name: 'Online payments' }).getByRole('article', { name: 'Stripe' })).toBeVisible()
  await payments.getByRole('button', { name: 'Connect Square' }).click()
  await expect(payments.getByRole('article', { name: 'Square' })).toContainText('Connected')
  await page.getByRole('link', { name: 'Finances' }).first().click()
  const takings = page.getByRole('region', { name: 'Takings' })
  await expect(takings).toContainText('from Square')
  await expect(takings).toContainText('This week')
  await expect(takings).toContainText('Last 30 days')
  await expect(takings).toContainText(/€/)
})

test('Sales page: its own menu section; connect Square, then sales, charts and best sellers against the period before', async ({ page }) => {
  test.skip(!FEATURES.square, 'Square is switched off for now')
  await open(page, '/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  const accounts = nav.getByRole('region', { name: 'Accounts' })
  const salesNav = nav.getByRole('region', { name: 'Sales' })
  await salesNav.getByRole('link', { name: 'Sales' }).click()
  await expect(page.getByRole('heading', { name: 'Sales', level: 1 })).toBeVisible()
  await expect(page.getByText('Connect your till to see your sales')).toBeVisible()
  await page.getByRole('link', { name: 'Go to Connections' }).click()
  await page.getByRole('region', { name: 'Payments and sales' }).getByRole('button', { name: 'Connect Square' }).click()
  await expect(page.getByRole('region', { name: 'Payments and sales' }).getByRole('article', { name: 'Square' })).toContainText('Connected')
  await salesNav.getByRole('link', { name: 'Sales' }).click()
  await expect(page.getByText('From Square')).toBeVisible()
  const tiles = page.getByRole('list', { name: 'At a glance' })
  for (const label of ['Gross sales', 'Net sales', 'Transactions', 'Average sale']) await expect(tiles).toContainText(label)
  await expect(tiles).toContainText(/vs last week|nothing last week to compare/)
  await expect(page.getByRole('region', { name: 'Sales over time' }).getByRole('img')).toBeVisible()
  await expect(page.getByRole('region', { name: 'How people paid' })).toContainText('Card')
  await expect(page.getByRole('region', { name: 'Best sellers' }).getByRole('table')).toContainText('Iced Matcha Latte')
  // Last 30 days: every chart, the weekday averages and one row per day.
  await page.getByRole('combobox', { name: 'Period' }).click()
  await page.getByRole('option', { name: 'Last 30 days' }).click()
  await expect(tiles).toContainText('the 30 days before')
  await expect(page.getByRole('region', { name: 'Days of the week' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Busiest hours' })).toContainText('Busiest at')
  await expect(page.getByRole('table', { name: 'Sales by day' }).locator('tbody tr')).toHaveCount(30)
  // One day: sales by the hour against the same day last week.
  await page.getByRole('combobox', { name: 'Period' }).click()
  await page.getByRole('option', { name: 'Yesterday' }).click()
  await expect(page.getByRole('region', { name: 'Sales over time' })).toContainText('Sales by hour')
  // Finances links across.
  await accounts.getByRole('link', { name: 'Finances' }).click()
  await page.getByRole('region', { name: 'Takings' }).getByRole('link', { name: 'See sales' }).click()
  await expect(page.getByRole('heading', { name: 'Sales', level: 1 })).toBeVisible()
})

test('Sales page: employees don’t get it', async ({ page }) => {
  await open(page, '/', 'maria@example.com')
  await expect(page.getByRole('link', { name: 'Sales' })).toHaveCount(0)
  await page.goto('/sales')
  await expect(page.getByRole('heading', { name: 'Sales', level: 1 })).toHaveCount(0)
})

test('Stripe: connect it in one click, then takings show on Finances; with Square too, Sales adds them up', async ({ page }) => {
  await open(page, '/finances')
  const prompt = page.getByRole('alert').filter({ hasText: 'Connect Square, SumUp or Stripe to see takings' })
  await expect(prompt).toBeVisible()
  await prompt.getByRole('link', { name: 'Connect' }).click()
  const payments = page.getByRole('region', { name: 'Online payments' })
  await payments.getByRole('button', { name: 'Stripe details' }).click()
  const details = page.getByRole('dialog', { name: 'Stripe', exact: true })
  await expect(details).toContainText('it can’t take, refund or change anything')
  await details.getByRole('button', { name: 'Connect Stripe' }).click()
  await expect(details).toContainText('Easy Beans Coffee SL')
  await expect(details).toContainText('The Stripe account was found and its payments can be read.')
  await details.getByRole('button', { name: 'Close' }).click()
  await expect(payments.getByRole('article', { name: 'Stripe' })).toContainText('Connected')
  // Stripe doesn't take the till's place: Square and SumUp are still there to connect.
  const till = page.getByRole('region', { name: 'Payments and sales' })
  await expect(till.getByRole('button', { name: 'Connect Square' })).toBeVisible()
  await expect(till.getByRole('article', { name: 'SumUp' })).toBeVisible()

  await page.getByRole('link', { name: 'Finances' }).first().click()
  const takings = page.getByRole('region', { name: 'Takings' })
  await expect(takings).toContainText('from Stripe')
  await expect(takings).toContainText('This week')
  await expect(takings).toContainText('Last 30 days')
  await expect(takings).toContainText(/€/)
  // Square as the till as well: both are added up, and Sales shows each one's share.
  if (FEATURES.square) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Connections' }).click()
    await page.getByRole('region', { name: 'Payments and sales' }).getByRole('button', { name: 'Connect Square' }).click()
    await expect(page.getByRole('region', { name: 'Online payments' }).getByRole('article', { name: 'Stripe' })).toContainText('Connected')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('region', { name: 'Sales' }).getByRole('link', { name: 'Sales' }).click()
    await expect(page.getByText('From Square + Stripe')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Where sales came from' })).toContainText('Stripe')
    await expect(page.getByRole('region', { name: 'Best sellers' })).toContainText('online payments through Stripe')
  }
})

test('TikTok connects in one click and says posts stay private until TikTok approves the app', async ({ page }) => {
  await open(page, '/connections')
  const social = page.getByRole('region', { name: 'Social media' })
  await social.getByRole('button', { name: 'Connect TikTok' }).click()
  await social.getByRole('button', { name: 'Manage TikTok' }).click()
  await expect(page.getByRole('dialog', { name: 'TikTok' })).toContainText('private')
})

test('the privacy policy is public, linked from the sign-in page, and covers Google user data', async ({ page }) => {
  await page.goto('/?demo')
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy policy' }).click()
  await expect(page).toHaveURL(/\/privacy/)
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveCount(0) // no sign-in needed
  await expect(page.getByText(/Limited Use requirements/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Google API Services User Data Policy' })).toHaveAttribute('href', 'https://developers.google.com/terms/api-services-user-data-policy')
  for (const s of ['Gmail', 'Google Drive', 'Google Business Profile (Google Maps)']) await expect(page.getByRole('cell', { name: s, exact: true })).toBeVisible()
  await expect(page.getByText(/Ireland/)).toBeVisible()
})

test('the data deletion instructions are public and linked from the privacy policy', async ({ page }) => {
  await page.goto('/privacy?demo')
  await page.getByRole('link', { name: 'data deletion' }).click()
  await expect(page.getByRole('heading', { name: 'Data deletion' })).toBeVisible()
  await expect(page.getByText(/Delete my data/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0)
})

test('the terms of service are public, linked from the sign-in page and the privacy policy', async ({ page }) => {
  await page.goto('/?demo')
  await page.getByRole('contentinfo').getByRole('link', { name: 'Terms of service' }).click()
  await expect(page).toHaveURL(/\/terms/)
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveCount(0) // no sign-in needed
  await expect(page.getByRole('heading', { name: '6. Connected apps' })).toBeVisible()
  await expect(page.getByText(/governed by Spanish law/)).toBeVisible()
  // Each legal page links to the other at the bottom (exact: the terms also mention the privacy policy in a sentence).
  await page.getByRole('link', { name: 'Privacy policy', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Terms of service', exact: true })).toBeVisible()
})

test('every page in the menu shows its title, whatever buttons its header has', async ({ page }) => {
  await open(page, '/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  const links = await nav.getByRole('region').getByRole('link').evaluateAll(els => els.map(e => e.getAttribute('href')!))
  expect(links.length).toBeGreaterThan(10)
  for (const href of links) {
    await nav.locator(`a[href="${href}"]`).click()
    await expect(page).toHaveURL(new RegExp(`${href.split('?')[0]}(\\?|$)`))
    const h1 = page.getByRole('main').getByRole('heading', { level: 1 })
    // Music starts straight with what's playing: its title is there for screen readers only.
    if (href === '/music') { await expect(h1, href).toHaveText('Music'); await expect(h1, href).toBeVisible(); continue }
    await expect(h1, href).toBeVisible()
    await expect.poll(async () => (await h1.boundingBox().catch(() => null))?.width ?? 0, { message: `${href}: title squeezed` }).toBeGreaterThan(80)
  }
})

test.describe('To Do List', () => {
  test('groups jobs by category, with no priority headings', async ({ page }) => {
    await open(page, '/todo')
    await expect(page.getByRole('heading', { name: 'To Do List', level: 1 })).toBeVisible()
    const shop = page.getByRole('region', { name: 'Shop' })
    await expect(shop.getByRole('heading', { name: 'Shop' })).toBeVisible()
    await expect(shop).toContainText('Get the AC serviced before summer')
    await expect(page.getByRole('region', { name: 'Tech & till' }).getByRole('heading', { name: 'Square' })).toBeVisible()
    await expect(page.getByText(/before we (re)?open/i)).toHaveCount(0)
    await expect(page.getByText(/priority/i)).toHaveCount(0)
    // Open, done and starred on one line.
    const glance = page.getByRole('list', { name: 'At a glance' }).getByRole('listitem')
    await expect(glance).toHaveCount(3)
    const [a, b, c] = await Promise.all([0, 1, 2].map(i => glance.nth(i).boundingBox()))
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(4)
    expect(Math.abs(a!.y - c!.y)).toBeLessThan(4)
    await expect(glance.nth(0)).toContainText('open')
    // Done jobs stay hidden until asked for.
    await expect(page.getByText('Clean the outside terrace')).toHaveCount(0)
    await page.getByLabel('Show done').check()
    await expect(page.getByText('Clean the outside terrace')).toBeVisible()
  })

  test('add a job under the chosen category, tick it off, delete and undo', async ({ page }) => {
    await open(page, '/todo')
    const filters = page.getByRole('group', { name: 'Filter by category' })
    await filters.getByRole('button', { name: /^Design/ }).click()
    await expect(page.getByLabel('Category for the new job')).toHaveValue(/.+/)
    await page.getByLabel('New job', { exact: true }).fill('Window vinyl')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const design = page.getByRole('region', { name: 'Design' })
    // New jobs go to the top, under any pinned ones (the branded fans are pinned).
    await expect(design.getByTestId('todo-row').nth(1)).toContainText('Window vinyl')
    await expect(page.getByRole('region', { name: 'Shop' })).toHaveCount(0) // the filter is on

    const row = page.getByTestId('todo-row').filter({ hasText: 'Window vinyl' })
    // Ticked-off jobs leave the list (the box goes with them, so click rather than check).
    await row.getByLabel('Mark as done').click()
    await expect(page.getByText('Window vinyl')).toHaveCount(0)
    await page.getByLabel('Show done').check()
    await row.getByLabel('Mark as not done').click()
    await expect(row.getByLabel('Mark as done')).not.toBeChecked()
    await row.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('Window vinyl', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(row).toBeVisible()
  })

  test('rename a job, give it a sub-heading, star it and assign it', async ({ page }) => {
    await open(page, '/todo')
    const row = page.getByTestId('todo-row').filter({ hasText: 'Menu board for the counter' })
    await row.getByRole('button', { name: 'Rename' }).click()
    await page.getByLabel('Job', { exact: true }).fill('Chalk menu board')
    await page.getByLabel('Sub-heading').fill('Counter')
    await page.getByRole('button', { name: 'Save' }).click()
    const design = page.getByRole('region', { name: 'Design' })
    await expect(design.getByRole('heading', { name: 'Counter' })).toBeVisible()
    const renamed = page.getByTestId('todo-row').filter({ hasText: 'Chalk menu board' })
    await renamed.getByRole('button', { name: 'Star' }).click()
    await expect(renamed.getByRole('button', { name: 'Star' })).toHaveAttribute('aria-pressed', 'true')
    await renamed.getByRole('button', { name: 'Assign to someone' }).click()
    await page.getByRole('menuitem', { name: 'Julio' }).click()
    await expect(renamed.getByRole('button', { name: 'Assigned to Julio' })).toBeVisible()
    // Move it to another category from the row itself.
    await renamed.getByLabel('Change category').selectOption({ label: 'Marketing' })
    await expect(page.getByRole('main').getByRole('region', { name: 'Marketing' })).toContainText('Chalk menu board')
  })

  test('admins add and remove categories; removed categories keep their jobs', async ({ page }) => {
    await open(page, '/todo')
    await page.getByRole('button', { name: 'Categories' }).click()
    const manager = page.getByRole('region', { name: 'Categories' })
    await manager.getByLabel('New category').fill('Kitchen')
    await manager.getByRole('button', { name: 'Add category' }).click()
    const filters = page.getByRole('group', { name: 'Filter by category' })
    await expect(filters.getByRole('button', { name: /^Kitchen/ })).toBeVisible()
    await manager.getByLabel('New category').fill('kitchen')
    await manager.getByRole('button', { name: 'Add category' }).click()
    await expect(page.getByText('There is already a category called “kitchen”')).toBeVisible()

    await manager.getByRole('button', { name: 'Remove Shop' }).click()
    await expect(manager.getByText(/Its \d jobs? move to No category/)).toBeVisible()
    await manager.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(filters.getByRole('button', { name: /^Shop/ })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'No category' })).toContainText('Get the AC serviced before summer')
  })

  test('employees use the list but cannot change the categories', async ({ page }) => {
    await open(page, '/todo', 'julio@example.com')
    await expect(page.getByRole('heading', { name: 'To Do List', level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Categories' })).toHaveCount(0)
    await page.getByLabel('New job', { exact: true }).fill('Restock napkins')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText('Restock napkins')).toBeVisible()
  })
})

test.describe('messages', () => {
  test('admin reads Instagram DMs by kind, answers one, and sees when Instagram no longer allows a reply', async ({ page }) => {
    await open(page, '/messages')
    const apps = page.getByRole('group', { name: 'Apps' })
    // All is first and chosen to start with: every app's chats, the newest at the top.
    await expect(apps.getByRole('button').first()).toHaveText('All')
    await expect(apps.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    await expect(apps.getByRole('button', { name: 'Instagram' })).toHaveAttribute('aria-pressed', 'false')
    for (const soon of ['TikTok · soon', 'LinkedIn · soon']) await expect(apps.getByText(soon)).toBeVisible()
    await expect(apps.getByRole('button', { name: 'WhatsApp' })).toBeEnabled() // the demo café's WhatsApp is connected
    await expect(apps.getByRole('button', { name: 'Messenger' })).toBeEnabled() // comes with the Facebook connection

    // All: Instagram's seven chats and the three WhatsApp ones the app saved.
    const chats = page.getByRole('list', { name: 'Chats' })
    await expect(chats.getByRole('listitem')).toHaveCount(10)
    await apps.getByRole('button', { name: 'Instagram' }).click()
    await expect(apps.getByRole('button', { name: 'Instagram' })).toHaveAttribute('aria-pressed', 'true')
    await expect(chats.getByRole('listitem')).toHaveCount(7)
    expect(await chats.locator(':scope > li').evaluateAll(els => els.map(e => e.getAttribute('aria-label'))))
      .toEqual(['@lucia.marbella', '@sanpedro.eats', '@tom_runs', '@marta.g', '@happy.client', '@weekend.visitor', '@old.friend'])
    await page.getByRole('button', { name: 'Mentions & tags 1' }).click()
    await expect(chats.getByRole('listitem')).toHaveCount(1)
    await expect(chats.getByRole('listitem', { name: '@sanpedro.eats' })).toContainText('Story mention')
    await expect(page.getByRole('region', { name: 'Posts you’re tagged in' }).getByRole('link')).toHaveCount(2)
    await page.getByRole('button', { name: 'Shared posts 1' }).click()
    await expect(chats).toContainText('Marta')
    await page.getByRole('button', { name: 'Needs reply 6' }).click()
    await expect(chats.getByRole('listitem', { name: '@happy.client' })).toHaveCount(0)

    await chats.getByRole('listitem', { name: '@lucia.marbella' }).getByRole('button').click()
    const chat = page.getByRole('region', { name: 'Chat with @lucia.marbella' })
    await expect(chat.getByRole('list', { name: 'Messages' })).toContainText('Do you have oat milk')
    await chat.getByRole('textbox', { name: 'Reply' }).fill('Yes! Oat and almond.')
    await chat.getByRole('button', { name: 'Send' }).click()
    await toast(page, 'Sent')
    await expect(chat.getByRole('listitem', { name: 'You: Yes! Oat and almond.' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Needs reply 5' })).toBeVisible()

    // Three days since their message: a personal reply (Instagram's human agent tag) is still allowed.
    await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'All', exact: true }).click()
    await chats.getByRole('listitem', { name: '@weekend.visitor' }).getByRole('button').click()
    const later = page.getByRole('region', { name: 'Chat with @weekend.visitor' })
    await expect(later.getByRole('note', { name: 'Personal reply' })).toContainText('more than 24 hours')
    await later.getByRole('textbox', { name: 'Reply' }).fill('Yes, Sundays 9 to 2!')
    await later.getByRole('button', { name: 'Send' }).click()
    await toast(page, 'Sent')

    // Nine days: Instagram doesn't allow a reply from other apps any more.
    await chats.getByRole('listitem', { name: '@old.friend' }).getByRole('button').click()
    const old = page.getByRole('region', { name: 'Chat with @old.friend' })
    await expect(old).toContainText('up to 7 days after their last message')
    await expect(old.getByRole('textbox', { name: 'Reply' })).toHaveCount(0)
  })

  test('profile photos (or initials), and the chats use the full width until one is open', async ({ page }) => {
    await open(page, '/messages')
    const chats = page.getByRole('list', { name: 'Chats' })
    const lucia = chats.getByRole('listitem', { name: '@lucia.marbella' })
    await expect(lucia.locator('img')).toHaveAttribute('src', /^data:image\/svg/)
    await expect(chats.getByRole('listitem', { name: '@tom_runs' }).locator('.MuiAvatar-root')).toHaveText('T')
    await expect(chats.getByRole('listitem', { name: '@tom_runs' }).locator('img')).toHaveCount(0)

    const fullWidth = (await chats.boundingBox())!.width
    expect(fullWidth).toBeGreaterThan(600)
    await lucia.getByRole('button').click()
    const chat = page.getByRole('region', { name: 'Chat with @lucia.marbella' })
    await expect(chat.getByRole('list', { name: 'Messages' }).locator('img').first()).toBeVisible() // their photo beside their message
    expect((await chats.boundingBox())!.width).toBeLessThan(360)
    await chat.getByRole('button', { name: 'Close chat' }).click()
    await expect(chat).toHaveCount(0)
    expect((await chats.boundingBox())!.width).toBeGreaterThan(600)
  })

  test('connecting Instagram from Messages is the same connection as on Connections', async ({ page }) => {
    await open(page, '/connections')
    await page.getByRole('button', { name: 'Manage Instagram' }).click()
    await page.getByRole('dialog', { name: 'Instagram' }).getByRole('button', { name: 'Disconnect' }).click()
    await toast(page, 'Instagram disconnected')
    await page.getByRole('link', { name: 'Messages' }).first().click()
    // WhatsApp's chats still show under All; Instagram's own chip offers to connect it.
    await page.getByRole('group', { name: 'Apps' }).getByRole('button', { name: 'Instagram' }).click()
    const connect = page.getByRole('region', { name: 'Connect Instagram' })
    await expect(connect).toContainText('Read and answer your direct messages')
    await connect.getByRole('button', { name: 'Connect Instagram' }).click()
    await expect(page.getByRole('list', { name: 'Chats' })).toBeVisible()
    await page.getByRole('link', { name: 'Connections' }).first().click()
    await expect(page.getByRole('region', { name: 'Social media' }).getByRole('article', { name: 'Instagram' })).toContainText('@easy.beans.coffee')
  })

  test('Messenger comes with the Facebook connection: connect it from Messages, then the Page’s chats sit next to Instagram’s', async ({ page }) => {
    await open(page, '/messages')
    const apps = page.getByRole('group', { name: 'Apps' })
    await apps.getByRole('button', { name: 'Messenger' }).click()
    const connect = page.getByRole('region', { name: 'Connect Facebook' })
    await expect(connect).toContainText('Read and answer your Page’s Messenger messages on the Messages page')
    await connect.getByRole('button', { name: 'Connect Facebook' }).click()
    const chats = page.getByRole('list', { name: 'Chats' })
    expect(await chats.locator(':scope > li').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))).toEqual(['Carmen Ruiz', 'Hotel Puente Romano'])
    await chats.getByRole('listitem', { name: 'Carmen Ruiz' }).getByRole('button').click()
    const chat = page.getByRole('region', { name: 'Chat with Carmen Ruiz' })
    await chat.getByRole('textbox', { name: 'Reply' }).fill('Yes! See you at 11.')
    await chat.getByRole('button', { name: 'Send' }).click()
    await toast(page, 'Sent')
    await expect(chat.getByRole('listitem', { name: 'You: Yes! See you at 11.' })).toBeVisible()
    // All: every app's chats together (Instagram, Messenger, WhatsApp), newest first.
    await apps.getByRole('button', { name: 'All' }).click()
    await expect(chats.getByRole('listitem')).toHaveCount(12)
    await expect(chats.locator(':scope > li').first()).toHaveAttribute('aria-label', 'Carmen Ruiz')
  })

  test('WhatsApp: the chats the app saved, a photo and a location, a reply within 24 hours, and none after', async ({ page }) => {
    await open(page, '/messages')
    const apps = page.getByRole('group', { name: 'Apps' })
    await apps.getByRole('button', { name: 'WhatsApp' }).click()
    await expect(page.getByText('WhatsApp doesn’t let apps read chats back')).toBeVisible()
    const chats = page.getByRole('list', { name: 'Chats' })
    expect(await chats.locator(':scope > li').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))).toEqual(['Sofía Martín', 'Julio', 'By Eric'])
    await expect(chats.getByRole('listitem', { name: 'Sofía Martín' })).toContainText('Sent a photo')

    await chats.getByRole('listitem', { name: 'Sofía Martín' }).getByRole('button').click()
    const sofia = page.getByRole('region', { name: 'Chat with Sofía Martín' })
    await expect(sofia).toContainText('+34611222333')
    await expect(sofia.getByRole('list', { name: 'Messages' }).locator('img')).toBeVisible()
    await expect(sofia.getByRole('link', { name: 'Instagram' })).toHaveCount(0) // no other app to open
    await sofia.getByRole('textbox', { name: 'Reply' }).fill('Yes, until 6!')
    await sofia.getByRole('button', { name: 'Send' }).click()
    await toast(page, 'Sent')
    await expect(sofia.getByRole('listitem', { name: 'You: Yes, until 6!' })).toContainText('Sent')

    // Three days since By Eric wrote: WhatsApp allows only templates now.
    await chats.getByRole('listitem', { name: 'By Eric' }).getByRole('button').click()
    const eric = page.getByRole('region', { name: 'Chat with By Eric' })
    await expect(eric.getByRole('link', { name: 'Open map' })).toHaveAttribute('href', /google\.com\/maps/)
    await expect(eric).toContainText('only allows free replies for 24 hours')
    await expect(eric.getByRole('textbox', { name: 'Reply' })).toHaveCount(0)
  })

  test('staff don’t get Messages', async ({ page }) => {
    await open(page, '/messages', 'maria@example.com')
    await expect(page.getByRole('link', { name: 'Messages' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Messages' })).toHaveCount(0)
  })

  test('@phone the chat list opens a chat full width, with a way back', async ({ page }) => {
    await open(page, '/messages')
    await page.getByRole('list', { name: 'Chats' }).getByRole('listitem', { name: '@tom_runs' }).getByRole('button').click()
    await expect(page.getByRole('region', { name: 'Chat with @tom_runs' })).toContainText('Replied to your story')
    await page.getByRole('button', { name: 'Back to chats' }).click()
    await expect(page.getByRole('list', { name: 'Chats' })).toBeVisible()
  })
})

test.describe('referrals', () => {
  test('your name at the bottom left opens the account menu, with Referrals for admins', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open(page, '/')
    await page.getByRole('button', { name: /^Account menu/ }).click()
    const menu = page.getByRole('menu')
    for (const item of ['My account', 'Referrals', 'Appearance', 'Sign out']) await expect(menu.getByRole('menuitem', { name: item })).toBeVisible()
    await menu.getByRole('menuitem', { name: 'Referrals' }).click()
    await expect(page.getByRole('heading', { name: 'Referrals', level: 1 })).toBeVisible({ timeout: 15_000 })

    // Four businesses finished set-up: four free months of twelve.
    await expect(page.getByRole('figure', { name: '4 of 12 free months earned' })).toBeVisible()
    const stats = page.getByRole('region', { name: 'How your link is doing' })
    await expect(stats).toContainText('Link opened46')
    await expect(stats).toContainText('Joined7')
    await expect(stats).toContainText('Set up4')
    const list = page.getByRole('region', { name: 'Businesses you referred' })
    await expect(list.getByRole('listitem')).toHaveCount(7)
    await expect(list.getByRole('listitem', { name: 'La Tostadora' })).toContainText('Set up · +1 month')
    await expect(list.getByRole('listitem', { name: 'Café Alameda' })).toContainText('Joined · setting up')

    const chart = page.getByRole('region', { name: 'Free months over time' })
    await chart.getByRole('img', { name: /4 of 12 now/ }).focus()
    await page.keyboard.press('ArrowLeft')
    await expect(chart.getByRole('status')).toContainText('Week of')
    await chart.getByRole('button', { name: 'Show as table' }).click()
    await expect(chart.getByRole('table')).toContainText('Free months')

    await expect(page.getByRole('textbox', { name: 'Your link' })).toHaveValue(/\?ref=EASYBEAN$/)
    await page.getByRole('button', { name: 'Copy link' }).click()
    await toast(page, 'Link copied')
  })

  test('staff don’t get Referrals', async ({ page }) => {
    await open(page, '/', 'maria@example.com')
    await page.getByRole('button', { name: /^Account menu/ }).click()
    await expect(page.getByRole('menuitem', { name: 'My account' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Referrals' })).toHaveCount(0)
  })

  test('a referral link says who invited you, joins the waitlist, and shows up for the café that shared it', async ({ page }) => {
    await page.clock.install({ time: WED_0900 })
    await page.goto('/?ref=easybean&demo')
    const invite = page.getByRole('region', { name: 'You’re invited' })
    await expect(invite).toContainText('Invited by Easy Beans')
    await invite.getByRole('textbox', { name: 'Business name' }).fill('Café Nuevo')
    await invite.getByRole('textbox', { name: 'Your name' }).fill('Lola')
    await invite.getByRole('textbox', { name: 'Email' }).fill('lola@cafenuevo.test')
    await invite.getByRole('button', { name: 'Join the waitlist' }).click()
    await expect(invite).toContainText('You’re on the list')

    await page.getByRole('textbox', { name: 'Email', exact: true }).last().fill('aron@example.com')
    await page.getByRole('button', { name: 'Sign in' }).last().click()
    await page.getByRole('button', { name: /^Account menu/ }).click()
    await page.getByRole('menuitem', { name: 'Referrals' }).click()
    await expect(page.getByRole('region', { name: 'Businesses you referred' }).getByRole('listitem', { name: 'Café Nuevo' })).toContainText('Joined')
    await expect(page.getByRole('region', { name: 'How your link is doing' })).toContainText('Link opened47')
  })

  test('a wrong referral code shows no invite', async ({ page }) => {
    await page.goto('/?ref=NOPE1234&demo')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'You’re invited' })).toHaveCount(0)
  })

  test('@phone the account icon opens the same menu', async ({ page }) => {
    await open(page, '/')
    await page.getByRole('button', { name: /^Account menu/ }).click()
    await page.getByRole('menuitem', { name: 'Referrals' }).click()
    await expect(page.getByRole('figure', { name: '4 of 12 free months earned' })).toBeVisible()
  })
})

test.describe('language', () => {
  test('someone picks English and Spanish in My account; flags at the top right switch the whole app', async ({ page }) => {
    await open(page, '/account')
    // English only to start with: no flags.
    await expect(page.getByRole('group', { name: 'Language' })).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Languages' }).click()
    await page.getByRole('option', { name: 'Español' }).click()
    await page.keyboard.press('Escape')
    const flags = page.getByRole('group', { name: 'Language' })
    await expect(flags.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
    await flags.getByRole('button', { name: 'Español' }).click()
    await expect(page.getByRole('heading', { name: 'Mi cuenta', level: 1 })).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Principal' })
    await expect(nav.getByRole('link', { name: 'Cuadrante' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Fichajes' })).toBeVisible()
    await nav.getByRole('link', { name: 'Cuadrante' }).click()
    await expect(page.getByRole('heading', { name: 'Cuadrante', level: 1 })).toBeVisible()
    await page.getByRole('group', { name: 'Idioma' }).getByRole('button', { name: 'English' }).click()
    await expect(page.getByRole('heading', { name: 'Rota', level: 1 })).toBeVisible()
    await fromAccountMenu(page, 'My account')
    await expect(page.getByRole('heading', { name: 'My account', level: 1 })).toBeVisible()
  })

  test('with only Spanish picked, the app is in Spanish and there are no flags', async ({ page }) => {
    await open(page, '/account')
    await page.getByRole('combobox', { name: 'Languages' }).click()
    await page.getByRole('option', { name: 'Español' }).click()
    await page.getByRole('option', { name: 'English' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Mi cuenta', level: 1 })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Idioma' })).toHaveCount(0)
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Finanzas' }).click()
    await expect(page.getByRole('heading', { name: 'Finanzas', level: 1 })).toBeVisible()
    // Money keeps the euro sign in front.
    await expect(page.getByRole('list', { name: 'De un vistazo' })).toContainText(/€\d/)
  })

  test('the last language can\'t be unticked, and it says why', async ({ page }) => {
    await open(page, '/account')
    await page.getByRole('combobox', { name: 'Languages' }).click()
    await page.getByRole('option', { name: 'English' }).click()
    await expect(page.getByText('Keep at least one. To change language, tick the other one first, then untick this one.')).toBeVisible()
    await page.getByRole('option', { name: 'Español' }).click()
    await page.getByRole('option', { name: 'English' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Mi cuenta', level: 1 })).toBeVisible()
  })

  test('the public pages have the flags too', async ({ page }) => {
    await page.goto('/pricing?demo')
    await page.getByRole('group', { name: 'Language' }).first().getByRole('button', { name: 'Español' }).click()
    await expect(page.getByRole('link', { name: 'Precios' }).first()).toBeVisible()
  })
})

test.describe('new connections and details', () => {
  test('Analytics shows Google Search Console: clicks, searches and pages, against the period before', async ({ page }) => {
    await open(page, '/analytics')
    await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible()
    await expect(page.getByText('www.easybeanscoffee.com')).toBeVisible()
    const tiles = page.getByRole('list', { name: 'At a glance' })
    for (const label of ['Clicks', 'Times shown', 'Click rate', 'Average position']) await expect(tiles).toContainText(label)
    await expect(tiles).toContainText('vs the 28 days before')
    await expect(page.getByRole('region', { name: 'What people searched for' }).getByRole('table')).toContainText('easy beans coffee')
    await expect(page.getByRole('region', { name: 'Clicks from Google' }).getByRole('img')).toBeVisible()
    await page.getByRole('combobox', { name: 'Period' }).click()
    await page.getByRole('option', { name: 'Last 7 days' }).click()
    await expect(tiles).toContainText('vs the 7 days before')
  })

  test('Connections offers SumUp, LinkedIn and Search Console, and Slack has its logo', async ({ page }) => {
    await open(page, '/connections')
    await expect(page.getByRole('region', { name: 'Social media' }).getByRole('article', { name: 'LinkedIn' })).toContainText('Connected')
    await expect(page.getByRole('region', { name: 'Analytics' }).getByRole('article', { name: 'Search Console' })).toContainText('Connected')
    await expect(page.getByRole('region', { name: 'Payments and sales' }).getByRole('article', { name: 'SumUp' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Team messages' }).locator('svg path[fill="#E01E5A"]').first()).toBeAttached()
  })

  test('a phone number is a country code picked from a list, then the number', async ({ page }) => {
    await open(page, '/account')
    const details = page.getByRole('region', { name: 'Personal details' })
    const code = details.getByRole('combobox', { name: 'Country code' })
    await expect(code).toHaveValue('🇪🇸 +34')
    await code.click()
    await code.fill('Irel')
    await page.getByRole('option', { name: /Ireland/ }).click()
    await expect(code).toHaveValue('🇮🇪 +353')
    await details.getByRole('textbox', { name: 'Mobile' }).fill('87 123 4567')
    await details.getByRole('button', { name: 'Save' }).click()
    await toast(page, /^Saved$/)
    // Searching by the code works too.
    await code.click()
    await code.fill('44')
    await expect(page.getByRole('option', { name: /United Kingdom/ })).toBeVisible()
  })

  test('the business has a website, shown as a link', async ({ page }) => {
    await open(page, '/business')
    const contact = page.getByRole('region', { name: 'Contact' })
    await expect(contact.getByRole('link', { name: 'www.easybeanscoffee.com' })).toHaveAttribute('href', 'https://www.easybeanscoffee.com/')
    await contact.getByRole('button', { name: 'Edit' }).click()
    await contact.getByRole('textbox', { name: 'Website' }).fill('easybeans.example')
    await contact.getByRole('button', { name: 'Save' }).click()
    await toast(page, /^Saved$/)
    await expect(contact.getByRole('link', { name: 'easybeans.example' })).toHaveAttribute('href', 'https://easybeans.example')
    // The name top left is the one on this page.
    await expect(page.getByRole('region', { name: 'Company' })).toContainText('Business name')
  })
})

test.describe('notifications and Instagram mentions', () => {
  test('the bell links to the Notifications page; a story mention or tag can be reposted or ignored in one press', async ({ page }) => {
    await open(page, '/')
    await page.getByRole('button', { name: /^Notifications/ }).first().click()
    const bell = page.getByRole('region', { name: 'Notifications' })
    await expect(bell).toContainText('@sanpedro.eats mentioned you in their story')
    await bell.getByRole('button', { name: 'Repost @sanpedro.eats’s story to your story' }).click()
    await toast(page, 'Reposted to your Instagram story')
    await bell.getByRole('link', { name: 'See all notifications' }).click()
    await expect(page).toHaveURL(/\/notifications$/)
    const mentions = page.getByRole('region', { name: 'Instagram tags and mentions' })
    await expect(mentions).toContainText('Reposted to your story')
    await expect(mentions).toContainText('@costa.del.sol.food tagged you in a post')
    await mentions.getByRole('button', { name: 'Ignore @costa.del.sol.food’s post' }).click()
    await toast(page, 'Ignored')
    await expect(mentions.getByRole('switch', { name: 'Instagram tags and mentions' })).toBeChecked()
  })

  test('employees get their own notifications, without the admin settings', async ({ page }) => {
    await open(page, '/notifications', 'maria@example.com')
    await expect(page.getByRole('region', { name: 'Your notifications' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Instagram tags and mentions' })).toHaveCount(0)
    await expect(page.getByLabel('Shift reminders')).toHaveCount(0)
  })

  test('Search Console connects from its Connect button', async ({ page }) => {
    await open(page, '/connections')
    const analytics = page.getByRole('region', { name: 'Analytics' })
    await analytics.getByRole('button', { name: 'Manage Search Console' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click()
    await toast(page, 'Search Console disconnected')
    await analytics.getByRole('button', { name: 'Connect Search Console' }).click()
    await expect(analytics.getByRole('article', { name: 'Search Console' })).toContainText('Connected')
  })
})

test.describe('customers', () => {
  const rows = (page: Page) => page.getByRole('table', { name: 'Customers' }).locator('tbody tr')

  test('admins see customers and leads, filter them, and export what is shown', async ({ page }) => {
    await open(page, '/')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Customers' }).click()
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible()
    const tile = (label: string) => page.getByRole('list', { name: 'At a glance' }).getByRole('listitem').filter({ hasText: label })
    await expect(tile('Leads')).toContainText('7')
    await expect(tile('Agreed to marketing')).toContainText('9')
    await expect(tile('Added this month')).toContainText('8')
    await expect(rows(page)).toHaveCount(15)

    const filters = page.getByRole('group', { name: 'Filter by type' })
    await filters.getByRole('button', { name: 'Leads 7' }).click()
    await expect(rows(page)).toHaveCount(7)
    await expect(page.getByRole('row', { name: /^Lucía García López/ })).toHaveCount(0)
    // Only those who agreed to marketing (GDPR).
    await filters.getByRole('button', { name: 'Marketing OK' }).click()
    await expect(rows(page)).toHaveCount(3)
    await filters.getByRole('button', { name: 'Customers 8' }).click()
    await expect(rows(page)).toHaveCount(6)
    await filters.getByRole('button', { name: 'Marketing OK' }).click()
    await filters.getByRole('button', { name: 'All 15' }).click()
    await page.getByRole('textbox', { name: 'Search customers' }).fill('nomad')
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toContainText(/Elena\s*Vidal/) // first and last name, a column each
    await page.getByRole('textbox', { name: 'Search customers' }).fill('')
    await page.getByRole('combobox', { name: 'Source' }).click()
    await page.getByRole('option', { name: 'Instagram' }).click()
    await expect(rows(page)).toHaveCount(3)
    await page.getByRole('combobox', { name: 'Source' }).click()
    await page.getByRole('option', { name: 'Every source' }).click()

    // Export the leads: exactly the rows shown, named after the filter.
    await filters.getByRole('button', { name: 'Leads 7' }).click()
    await page.getByRole('button', { name: 'Export' }).click()
    await expect(page.getByRole('menuitem', { name: /Excel/ })).toBeVisible()
    const csv = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: /CSV/ }).click()
    const download = await csv
    expect(download.suggestedFilename()).toMatch(/^leads-.*\.csv$/)
    const lines = (await new Response((await download.createReadStream()) as unknown as ReadableStream).text()).replace(/^﻿/, '').split('\r\n')
    expect(lines[0]).toBe('"First name";"Last name";"Type";"Email";"Phone";"Company";"Source";"Tags";"Marketing OK";"Birthday";"Notes";"Added"')
    expect(lines).toHaveLength(8)
    expect(lines.slice(1).every(l => l.includes('"Lead"'))).toBe(true)
  })

  test('admins add a lead, edit it, mark them as a customer and delete them', async ({ page }) => {
    await open(page, '/customers')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a customer or lead' })
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await toast(page, 'Add a name, an email or a phone number')
    await expect(dialog.getByRole('button', { name: 'Lead' })).toHaveAttribute('aria-pressed', 'true')
    await dialog.getByLabel('First name').fill('Nora')
    await dialog.getByLabel('Last name').fill('Quinn')
    await dialog.getByRole('textbox', { name: 'Email' }).fill('nora@example.com')
    await dialog.getByRole('textbox', { name: 'Phone' }).fill('600 123 456')
    await dialog.getByLabel('Company (optional)').fill('Sunset Yoga')
    await dialog.getByRole('combobox', { name: 'Tags' }).fill('collab')
    await dialog.getByRole('combobox', { name: 'Tags' }).press('Enter')
    await dialog.getByLabel('Agreed to receive marketing').check()
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await toast(page, 'Added Nora Quinn')
    const nora = page.getByRole('row', { name: 'Nora Quinn: open details' })
    await expect(nora).toContainText('Lead')
    await expect(nora).toContainText('+34 600 123 456')
    await expect(nora.getByRole('cell', { name: 'Yes', exact: true })).toBeVisible() // Marketing OK
    await expect(nora.getByRole('link', { name: 'nora@example.com' })).toHaveAttribute('href', 'mailto:nora@example.com')

    await nora.getByRole('cell').first().click() // the name, not the email or phone links
    const edit = page.getByRole('dialog', { name: 'Nora Quinn' })
    await expect(edit).toContainText('They said yes on')
    await expect(edit.getByRole('button', { name: 'collab' })).toBeVisible()
    await edit.getByLabel('Notes').fill('Wants a joint post for the opening')
    await edit.getByRole('button', { name: 'Save' }).click()
    await toast(page, /^Saved$/)

    await nora.getByRole('cell').first().click()
    await page.getByRole('dialog', { name: 'Nora Quinn' }).getByRole('button', { name: 'Mark as customer' }).click()
    await toast(page, 'Nora Quinn is now a customer')
    await expect(nora).toContainText('Customer')
    await expect(page.getByRole('group', { name: 'Filter by type' }).getByRole('button', { name: 'Customers 9' })).toBeVisible()

    await nora.getByRole('cell').first().click()
    const again = page.getByRole('dialog', { name: 'Nora Quinn' })
    await expect(again.getByRole('button', { name: 'Mark as customer' })).toHaveCount(0)
    await expect(again.getByLabel('Notes')).toHaveValue('Wants a joint post for the opening')
    await again.getByRole('button', { name: 'Delete' }).click()
    await expect(again).toContainText('Delete Nora Quinn?')
    await again.getByRole('button', { name: 'Delete' }).click()
    await toast(page, 'Deleted Nora Quinn')
    await expect(nora).toHaveCount(0)
  })

  test('admins import a CSV from Spanish Excel; people already on the list are left out', async ({ page }) => {
    await open(page, '/customers')
    await page.getByRole('button', { name: 'Import' }).click()
    const dialog = page.getByRole('dialog', { name: 'Import from a CSV file' })
    await dialog.getByLabel('CSV file').setInputFiles({ name: 'clientes.csv', mimeType: 'text/csv',
      buffer: Buffer.from('﻿Nombre;Apellidos;Correo;Móvil\r\nRosa;Marín;rosa@example.es;611 000 111\r\nLucía;García López;lucia.garcia@example.com;\r\n') })
    await expect(dialog.getByRole('status')).toContainText('1 new person to add')
    await expect(dialog.getByRole('status')).toContainText('1 is already on your list')
    await expect(dialog).toContainText('Móvil → Phone')
    await dialog.getByRole('button', { name: 'Customers' }).click()
    await dialog.getByRole('button', { name: 'Add 1 customer' }).click()
    await toast(page, '1 customer added')
    const rosa = page.getByRole('row', { name: 'Rosa Marín: open details' })
    await expect(rosa).toContainText('Customer')
    await expect(rosa).toContainText('+34 611 000 111')
    await expect(rosa.getByRole('cell', { name: 'No', exact: true })).toBeVisible() // Marketing OK: nobody is ticked on import
  })

  test('employees don’t get the customers page', async ({ page }) => {
    await open(page, '/', 'maria@example.com')
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Customers' })).toHaveCount(0)
    await page.goto('/customers?demo')
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Customers' })).toHaveCount(0)
  })
})

test.describe('tax', () => {
  const pdf = (name: string, text = name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.7 ${text}`) })

  test('the tax returns for the year come from what the business files, and a status is changed in place', async ({ page }) => {
    await open(page, '/tax')
    await expect(page.getByRole('heading', { name: 'Tax', exact: true })).toBeVisible()
    const glance = page.getByRole('list', { name: 'At a glance' })
    await expect(glance).toContainText('111 · Q3')
    await expect(glance).toContainText('By 20 Oct 2026 · in 20 days')
    const returns = page.getByRole('region', { name: 'Tax returns' })
    await expect(returns.getByRole('row').filter({ hasText: 'VAT return' }).first()).toBeVisible()
    await expect(returns.getByRole('row').filter({ hasText: 'EU trade summary' })).toHaveCount(0)

    // Trade with EU businesses adds modelo 349 for every quarter.
    await page.getByRole('region', { name: 'What you file' }).getByRole('switch', { name: /Trade with EU businesses/ }).check()
    await expect(returns.getByRole('row').filter({ hasText: 'EU trade summary' })).toHaveCount(4)

    await returns.getByRole('combobox', { name: 'Status of 111 Q3' }).click()
    await page.getByRole('option', { name: 'Filed' }).click()
    await toast(page, '111 Q3: Filed')
    await expect(glance).toContainText('115 · Q3')

    // The returns export like every Accounts table.
    await returns.getByRole('button', { name: 'Export' }).click()
    await expect(page.getByRole('menuitem', { name: /Excel/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /CSV/ })).toBeVisible()
  })

  test('bulk upload: files are sorted by kind and quarter into the connected Drive, and the same file is refused twice', async ({ page }) => {
    await open(page, '/tax')
    await expect(page.getByText('Connect Google Drive or OneDrive to upload documents.')).toBeVisible()
    await page.getByRole('link', { name: 'Connections' }).first().click()
    await page.getByRole('region', { name: 'Files and storage' }).getByRole('button', { name: 'Connect Google Drive' }).click()
    await expect(page.getByRole('region', { name: 'Files and storage' }).getByRole('article', { name: 'Google Drive' })).toContainText('Connected')
    await page.getByRole('link', { name: 'Tax', exact: true }).first().click()

    await page.getByRole('button', { name: 'Upload documents' }).click()
    const dialog = page.getByRole('dialog', { name: 'Upload documents' })
    const chooser = page.waitForEvent('filechooser')
    await dialog.getByRole('button', { name: 'Choose files' }).click()
    await (await chooser).setFiles([pdf('Factura Makro 2026-09-14.pdf'), pdf('Nómina Julio 2026-09-30.pdf'), pdf('virus.exe')])
    const files = dialog.getByRole('table', { name: 'Files to upload' })
    await expect(files.getByRole('row').filter({ hasText: 'virus.exe' })).toContainText('Not taken')
    await expect(dialog.getByRole('combobox', { name: 'Kind of Nómina Julio 2026-09-30.pdf' })).toHaveText('Payslips')
    await expect(dialog.getByRole('combobox', { name: 'Period of Factura Makro 2026-09-14.pdf' })).toHaveText('Q3 2026')
    await dialog.getByRole('button', { name: 'Upload 2 documents' }).click()
    await toast(page, '2 documents kept')
    await expect(files.getByRole('row').filter({ hasText: 'Factura Makro' })).toContainText('Kept')
    await dialog.getByRole('button', { name: 'Done' }).click()

    const docs = page.getByRole('region', { name: 'Documents' })
    await expect(docs.getByRole('row').filter({ hasText: 'Factura Makro 2026-09-14.pdf' })).toContainText('2026 › Q3 › Purchase invoices')
    await expect(docs.getByRole('row').filter({ hasText: 'Nómina Julio 2026-09-30.pdf' })).toContainText('2026 › Q3 › Payslips')

    // The same file again: caught before it goes anywhere.
    await page.getByRole('button', { name: 'Upload documents' }).click()
    const again = page.waitForEvent('filechooser')
    await dialog.getByRole('button', { name: 'Choose files' }).click()
    await (await again).setFiles([pdf('Copy of the invoice.pdf', 'Factura Makro 2026-09-14.pdf')])
    await expect(files).toContainText('Already kept as “Factura Makro 2026-09-14.pdf”')
    await expect(dialog.getByRole('button', { name: /^Upload/ }).last()).toBeDisabled()
  })

  test('upload into a folder chosen, or made there', async ({ page }) => {
    await open(page, '/connections')
    await page.getByRole('region', { name: 'Files and storage' }).getByRole('button', { name: 'Connect Google Drive' }).click()
    await expect(page.getByRole('region', { name: 'Files and storage' }).getByRole('article', { name: 'Google Drive' })).toContainText('Connected')
    await page.getByRole('link', { name: 'Tax', exact: true }).first().click()
    await page.getByRole('button', { name: 'Upload documents' }).click()
    const dialog = page.getByRole('dialog', { name: 'Upload documents' })
    await dialog.getByRole('radio', { name: 'All into one folder I choose' }).check()
    const picker = dialog.getByRole('region', { name: 'Choose a folder' })
    await picker.getByRole('listitem').filter({ hasText: '2026' }).click()
    await picker.getByRole('listitem').filter({ hasText: 'Gestoría' }).click()
    await picker.getByRole('textbox', { name: 'New folder' }).fill('Octubre')
    await picker.getByRole('button', { name: 'Make folder' }).click()
    await expect(picker).toContainText('Files go into: Business Agent › Tax › 2026 › Gestoría › Octubre')
    const chooser = page.waitForEvent('filechooser')
    await dialog.getByRole('button', { name: 'Choose files' }).click()
    await (await chooser).setFiles([pdf('ticket gasolina.pdf')])
    await dialog.getByRole('button', { name: 'Upload 1 document' }).click()
    await toast(page, '1 document kept')
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('region', { name: 'Documents' }).getByRole('row').filter({ hasText: 'ticket gasolina.pdf' })).toContainText('2026 › Gestoría › Octubre')
  })

  test('employees don’t get the tax page', async ({ page }) => {
    await open(page, '/', 'maria@example.com')
    await expect(page.getByRole('link', { name: 'Tax', exact: true })).toHaveCount(0)
    await page.goto('/tax?demo')
    await expect(page.getByText('Tax is only visible to admins with pay access.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Upload documents' })).toHaveCount(0)
  })
})

test.describe('profit and loss', () => {
  /** Connect Square (the till) from the page's own prompt, then come back by the menu. */
  async function withSquare(page: Page) {
    await open(page, '/profit-and-loss')
    const prompt = page.getByRole('alert').filter({ hasText: /Connect Square, SumUp or Stripe to count takings as income/ })
    await prompt.getByRole('link', { name: 'Connect' }).click()
    await page.getByRole('region', { name: 'Payments and sales' }).getByRole('button', { name: 'Connect Square' }).click()
    await expect(page.getByRole('region', { name: 'Payments and sales' }).getByRole('article', { name: 'Square' })).toContainText('Connected')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Profit & loss' }).click()
    await expect(page.getByRole('heading', { name: 'Profit & loss', exact: true })).toBeVisible()
  }

  test('the statement shows the months since the café opened: takings without IVA, costs and profit', async ({ page }) => {
    test.skip(!FEATURES.square, 'Square is switched off for now')
    await withSquare(page)
    const statement = page.getByRole('table', { name: 'Profit & loss statement' })
    // This year, from April (when Easy Beans opened) to September; September is still going.
    await expect(statement.getByRole('columnheader', { name: /^Apr 26/ })).toBeVisible()
    await expect(statement.getByRole('columnheader', { name: /^Sep 26/ })).toBeVisible()
    await expect(statement.getByRole('columnheader', { name: /^Mar 26/ })).toHaveCount(0)
    for (const line of ['Takings, without IVA', 'Total cost of sales', 'Gross profit', 'Total team', 'Total running costs', 'Operating profit']) {
      await expect(statement.getByRole('rowheader', { name: new RegExp(`^${line}`) })).toBeVisible()
    }
    // Finances' wages estimate fills the months before there are timecards; expenses are grouped by category.
    await expect(statement.getByRole('rowheader', { name: /^Wages estimate from Finances/ })).toBeVisible()
    await expect(statement.getByRole('rowheader', { name: /^Premises/ })).toBeVisible()
    await expect(statement.getByRole('rowheader', { name: /^Rent/ })).toHaveCount(0)
    const tiles = page.getByRole('list', { name: 'At a glance' }).getByRole('listitem')
    await expect(tiles.filter({ hasText: 'Income' })).toContainText('with IVA from the till')
    await expect(page.getByText(/An estimate from the app’s own figures/)).toBeVisible()
  })

  test('adding a one-off cost lowers the operating profit by that much', async ({ page }) => {
    await open(page, '/profit-and-loss')
    const profit = page.getByRole('list', { name: 'At a glance' }).getByRole('listitem').filter({ hasText: 'Operating profit' })
    await expect(profit).toContainText('€')
    const amount = async () => Number((await profit.locator('p').nth(1).textContent())!.replace(/[^\d,-]/g, '').replace(',', '.'))
    const before = await amount()
    await expect(page.getByRole('table', { name: 'One-off income and costs' })).toContainText('Grinder service')
    await page.getByRole('button', { name: 'Add a line' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a line' })
    await dialog.getByLabel('What it is').fill('New fridge')
    await dialog.getByLabel('Amount').fill('500')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Line saved')
    await expect.poll(amount).toBeCloseTo(before - 500, 1)
    await expect(page.getByRole('table', { name: 'Profit & loss statement' }).getByRole('rowheader', { name: /^New fridge/ })).toBeVisible()
    await page.getByRole('button', { name: 'Remove New fridge' }).click()
    await expect.poll(amount).toBeCloseTo(before, 1)
  })

  test('the statement exports like the other Accounts pages: Excel, CSV, PDF and copy', async ({ page }) => {
    test.skip(!FEATURES.square, 'Square is switched off for now')
    await withSquare(page)
    const statement = page.getByRole('region', { name: 'Profit & loss statement' })
    await statement.getByRole('button', { name: 'Export' }).click()
    await expect(page.getByRole('menuitem', { name: /PDF/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Copy/ })).toBeVisible()
    const xlsx = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: /Excel/ }).click()
    expect((await xlsx).suggestedFilename()).toBe('profit-and-loss-2026-04-2026-09.xlsx')
    await statement.getByRole('button', { name: 'Export' }).click()
    const csv = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: /CSV/ }).click()
    const file = await csv
    expect(file.suggestedFilename()).toBe('profit-and-loss-2026-04-2026-09.csv')
    const text = readFileSync((await file.path())!, 'utf8')
    expect(text).toContain('"Operating profit"')
    expect(text).toContain('"Takings, without IVA"')
  })

  test('employees cannot open profit and loss', async ({ page }) => {
    await open(page, '/', 'maria@example.com')
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Profit & loss' })).toHaveCount(0)
    await page.goto('/profit-and-loss?demo')
    await expect(page.getByText('Takings, without IVA')).toHaveCount(0)
  })
})

test.describe('grants', () => {
  test('answers change the grants straight away: the equipment grant is eligible on its last day once there is equipment to replace', async ({ page }) => {
    await open(page, '/grants')
    await expect(page.getByRole('heading', { name: 'Grants', level: 1 })).toBeVisible()
    // What the app knows already: an SL in Marbella (a large town), a café.
    const answers = page.getByRole('region', { name: 'Your answers' })
    await expect(answers.getByRole('group', { name: 'Business type' }).getByRole('button', { name: 'SL (limited company)' })).toHaveAttribute('aria-pressed', 'true')
    await expect(answers.getByRole('group', { name: 'Town size' }).getByRole('button', { name: 'Over 20,000' })).toHaveAttribute('aria-pressed', 'true')

    const results = page.getByRole('region', { name: 'Grants for you' })
    const equipment = results.getByRole('button', { name: 'Hospitality equipment renewal (RD 638/2026)' })
    const replace = answers.getByRole('group', { name: 'Is there older equipment you could replace with a more efficient model?' })
    await expect(equipment).toContainText('Confirm first')
    await expect(equipment).toContainText('30 Sep 2026 (last day)')
    await replace.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(equipment).toContainText('Eligible')
    await replace.getByRole('button', { name: 'No', exact: true }).click()
    await expect(equipment).toContainText('Not eligible')
    // Small-town and new-autónomo grants don't fit an SL in Marbella.
    await expect(results.getByRole('button', { name: /Diputación de Málaga/ })).toContainText('Not eligible')
    await expect(results.getByRole('button', { name: /Línea 2/ })).toContainText('Not eligible')

    // Each grant shows its official source and when it was checked; the filters narrow the list.
    await results.getByRole('button', { name: 'Hiring grant: Talento 45+' }).click()
    await expect(results.getByRole('link', { name: 'Official page' }).first()).toHaveAttribute('href', /camaramalaga\.com/)
    await expect(results.getByText(/^Checked on 23 Sep 2026/).first()).toBeVisible()
    await results.getByRole('button', { name: /^Staff & training/ }).click()
    await expect(results.getByRole('button', { name: /Diputación de Málaga/ })).toHaveCount(0)

    // The same export as Finances.
    await results.getByRole('button', { name: 'Export' }).click()
    await expect(page.getByRole('menuitem', { name: /^Excel/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /^CSV/ })).toBeVisible()
  })

  test('track a grant, move an application on a stage and tick its documents; deadlines go on the calendar', async ({ page }) => {
    await open(page, '/grants')
    const results = page.getByRole('region', { name: 'Grants for you' })
    await results.getByRole('button', { name: 'Hiring grant: Talento 45+' }).click()
    await results.getByRole('button', { name: 'Track this grant' }).click()
    await toast(page, 'Added to your applications')
    const mine = page.getByRole('region', { name: 'My applications' })
    await expect(mine.getByRole('article', { name: 'Hiring grant: Talento 45+' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Coming up' })).toContainText('Hiring grant: Talento 45+')

    const talento = mine.getByRole('article', { name: 'Hiring grant: Talento Joven' })
    await talento.getByRole('button', { name: 'Move to Submitted' }).click()
    await toast(page, 'Moved to Submitted')
    await expect(talento).toContainText('Submitted 30 Sep 2026')
    await expect(talento.getByRole('button', { name: 'Move to Awarded' })).toBeVisible()
    const contract = talento.getByRole('checkbox', { name: 'Signed full-time employment contract (6 months or more)' })
    await contract.check()
    await expect(contract).toBeChecked()
    await expect(talento).toContainText('Documents · 3 of 8')

    await mine.getByRole('button', { name: 'Export' }).click()
    await expect(page.getByRole('menuitem', { name: /^CSV/ })).toBeVisible()
    await page.keyboard.press('Escape')

    // Both deadlines are on the team calendar, for admins.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Calendar' }).click()
    const bar = page.getByRole('toolbar', { name: 'Calendar' })
    await bar.getByRole('button', { name: 'List', exact: true }).click()
    await bar.getByRole('button', { name: 'Next 3 months' }).click()
    const list = page.getByRole('list', { name: 'Events' })
    await expect(list.getByRole('listitem', { name: 'Grant deadline: Hiring grant: Talento 45+ (Apply)' })).toBeVisible()
    await expect(list.getByRole('listitem', { name: /^Grant deadline: Hiring grant: Talento Joven/ })).toBeVisible()
  })

  test('employees can’t see grants, and the gestoría reads them without changing anything', async ({ page }) => {
    await open(page, '/', 'maria@example.com')
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Grants' })).toHaveCount(0)
    await page.goto('/grants?demo')
    await expect(page.getByText('Grants are only visible to admins with pay access.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'My applications' })).toHaveCount(0)

    await signInAs(page, 'laura@gestoria.example')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Grants' }).click()
    await expect(page.getByRole('main').getByText('Read-only', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'My applications' }).getByRole('article', { name: 'Hiring grant: Talento Joven' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Track this grant' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Move to/ })).toHaveCount(0)
  })
})

test.describe('pages: hide what you don’t use', () => {
  test('each person hides a page from their own menu, and shows it again', async ({ page }) => {
    await open(page, '/', 'maria@example.com')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'Sports' })).toBeVisible()
    await nav.getByRole('link', { name: 'Pages' }).click()
    await expect(page.getByRole('heading', { name: 'Pages', level: 1 })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Show Sports for the team' })).toHaveCount(0) // employees: their own menu only
    await page.getByRole('switch', { name: 'Show Sports in my menu' }).uncheck()
    await expect(nav.getByRole('link', { name: 'Sports' })).toHaveCount(0)
    await expect(page.getByRole('switch', { name: 'Show Pages in my menu' })).toBeDisabled() // always there, to come back
    await page.getByRole('button', { name: 'Show 1 hidden page again' }).click()
    await toast(page, 'Every page is in the menu again')
    await expect(nav.getByRole('link', { name: 'Sports' })).toBeVisible()
  })

  test('admins hide a page for the whole team', async ({ page }) => {
    await open(page, '/pages')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await page.getByRole('switch', { name: 'Show Music for the team' }).uncheck()
    await expect(nav.getByRole('link', { name: 'Music' })).toHaveCount(0)
    await expect(page.getByRole('main').getByRole('region', { name: "What's on" })).toContainText('Hidden for the team')
    await expect(page.getByRole('switch', { name: 'Show Music in my menu' })).toBeDisabled()
    await signInAs(page, 'maria@example.com')
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Rota' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Music' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Search' }).click()
    await page.keyboard.type('Music')
    await expect(page.getByRole('option', { name: /Music/ })).toHaveCount(0)
  })
})

test.describe('loyalty and gift cards', () => {
  /** Connect Square on Connections, then open Loyalty & gift cards from the menu (it only shows once Square is the till). */
  async function openLoyalty(page: Page) {
    await open(page, '/connections')
    await expect(page.getByRole('link', { name: 'Loyalty & gift cards' })).toHaveCount(0)
    const payments = page.getByRole('region', { name: 'Payments and sales' })
    await payments.getByRole('button', { name: 'Connect Square' }).click()
    await expect(payments.getByRole('article', { name: 'Square' })).toContainText('Connected')
    // The menu item has only just appeared (the sidebar shifts as it does): press it once it's settled.
    await expect(async () => {
      await page.getByRole('link', { name: 'Loyalty & gift cards' }).first().click()
      await expect(page.getByRole('heading', { name: 'Loyalty & gift cards' })).toBeVisible({ timeout: 2000 })
    }).toPass()
  }

  test('the stamp card from Square, its members, and goodwill stamps for one of them', async ({ page }) => {
    await openLoyalty(page)
    await expect(page.getByRole('img', { name: '9 stamps, then Free coffee (the 10th)' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'At a glance' })).toContainText('Members40')
    const members = page.getByRole('region', { name: 'Members' })
    const lucia = members.getByRole('row').filter({ hasText: 'Lucía García' })
    await expect(lucia).toContainText('8 of 9')
    await lucia.getByRole('button', { name: 'Adjust Lucía García' }).click()
    const dialog = page.getByRole('dialog', { name: 'Adjust Lucía García' })
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled() // a reason is needed
    await dialog.getByRole('textbox', { name: 'Why' }).fill('Waited too long on Saturday')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Lucía García: +1 stamps')
    await expect(lucia).toContainText('0 of 9')
    await expect(lucia).toContainText('1 reward waiting')
    await members.getByRole('button', { name: 'Export' }).click()
    await expect(page.getByRole('menuitem', { name: /Excel/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /CSV/ })).toBeVisible()
  })

  test('gift cards show only their last 4 digits; selling one asks for confirmation first', async ({ page }) => {
    await openLoyalty(page)
    const cards = page.getByRole('table', { name: 'Gift cards' })
    await expect(cards.getByRole('row')).toHaveCount(9) // the heading row and 8 cards
    await expect(cards).toContainText('•••• ')
    await page.getByRole('button', { name: 'Sell a gift card' }).click()
    const dialog = page.getByRole('dialog', { name: 'Sell a digital gift card' })
    await dialog.getByRole('textbox', { name: 'Amount' }).fill('2')
    await expect(dialog).toContainText('Gift cards start at €5')
    await expect(dialog.getByRole('button', { name: 'Next' })).toBeDisabled()
    await dialog.getByRole('textbox', { name: 'Amount' }).fill('30')
    await dialog.getByRole('button', { name: 'Next' }).click()
    const confirm = page.getByRole('dialog', { name: 'Sell this gift card?' })
    await expect(confirm).toContainText('active straight away')
    await confirm.getByRole('button', { name: /^Sell for/ }).click()
    await toast(page, /Gift card for .*30.* is active/)
    await expect(cards.getByRole('row')).toHaveCount(10)
  })

  test('the menu item goes once Square is disconnected', async ({ page }) => {
    await openLoyalty(page)
    await page.getByRole('link', { name: 'Connections' }).first().click()
    await page.getByRole('button', { name: 'Manage Square' }).click()
    await page.getByRole('dialog', { name: 'Square' }).getByRole('button', { name: 'Disconnect' }).click()
    await toast(page, 'Square disconnected')
    await expect(page.getByRole('link', { name: 'Loyalty & gift cards' })).toHaveCount(0)
  })

  test('employees don’t get loyalty and gift cards', async ({ page }) => {
    await open(page, '/', 'maria@example.com')
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Loyalty & gift cards' })).toHaveCount(0)
    await page.goto('/loyalty?demo')
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Loyalty & gift cards' })).toHaveCount(0)
  })
})

test.describe('stock and suppliers', () => {
  test.describe.configure({ timeout: 60_000 })
  test('low items show, a delivery raises what is in, and the order list offers WhatsApp with the message', async ({ page }) => {
    await open(page, '/stock')
    await expect(page.getByRole('heading', { name: 'Stock', level: 1 })).toBeVisible()
    const tiles = page.getByRole('list', { name: 'At a glance' })
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Low on stock' })).toContainText('7')

    await page.getByRole('button', { name: /^Low only/ }).click()
    const table = page.getByRole('table', { name: 'Stock items' })
    const oat = table.getByRole('row', { name: 'Oat milk (barista)' })
    await expect(oat).toContainText('Low')
    await expect(table.getByRole('row', { name: 'Whole milk' })).toHaveCount(0)

    // A delivery of 12 litres: 8 → 20, no longer low.
    await oat.getByRole('button', { name: 'Delivery of Oat milk (barista)' }).click()
    const dialog = page.getByRole('dialog', { name: 'Oat milk (barista)' })
    await expect(dialog).toContainText('In stock now: 8 l')
    await dialog.getByRole('textbox', { name: 'How many' }).fill('12')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Recorded')
    await expect(table.getByRole('row', { name: 'Oat milk (barista)' })).toHaveCount(0)
    await page.getByRole('button', { name: /^Low only/ }).click()
    await expect(table.getByRole('row', { name: 'Oat milk (barista)' })).toContainText('20 l')

    // The order list: by supplier, with what's short of their minimum and the message ready.
    await page.getByRole('tab', { name: /^Order list/ }).click()
    const roaster = page.getByRole('region', { name: 'Tostadores del Sur' })
    await expect(roaster).toContainText('Guest filter coffee')
    await expect(roaster).toContainText('Order by Thu 1 Oct, 12:00')
    await expect(roaster).toContainText('under their minimum order')
    const whatsapp = roaster.getByRole('link', { name: 'WhatsApp' })
    const href = decodeURIComponent((await whatsapp.getAttribute('href'))!)
    expect(href).toMatch(/^https:\/\/wa\.me\/34952774110\?text=Hola Lucía, os hago un pedido para Easy Beans Coffee \(cliente EB-2041\):/)
    expect(href).toContain('- 2,5 kg · Guest filter coffee (500 g bag, ref. GUEST-500)')
    await expect(roaster.getByRole('link', { name: 'Order page' })).toHaveAttribute('href', 'https://tostadoresdelsur.example/trade')
    await expect(page.getByRole('region', { name: 'Lácteos Costa del Sol' })).toHaveCount(0) // nothing low there now
  })

  test('the export menu offers Excel and CSV, and a stocktake saves every count at once', async ({ page }) => {
    await open(page, '/stock')
    await page.getByRole('button', { name: 'Export' }).click()
    await expect(page.getByRole('menuitem', { name: /Excel/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /CSV/ })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Stocktake' }).click()
    const take = page.getByRole('dialog', { name: 'Stocktake' })
    await take.getByRole('combobox', { name: 'Location' }).click()
    await page.getByRole('option', { name: 'Bar' }).click()
    await take.getByRole('textbox', { name: 'Counted: Caramel syrup' }).fill('4')
    await take.getByRole('textbox', { name: 'Counted: Butter croissants' }).fill('20')
    await take.getByRole('button', { name: 'Save 2 counts' }).click()
    await toast(page, '2 counts saved')
    await expect(page.getByRole('table', { name: 'Stock items' }).getByRole('row', { name: 'Caramel syrup' })).toContainText('4 bottles')
    await page.getByRole('tab', { name: 'History' }).click()
    await expect(page.getByRole('table', { name: 'Stock history' }).getByRole('row').filter({ hasText: 'Caramel syrup' }).first()).toContainText('Stock count')
  })

  test('admin adds a supplier and an item with its link and price', async ({ page }) => {
    await open(page, '/suppliers')
    await page.getByRole('button', { name: 'Add supplier' }).click()
    const add = page.getByRole('dialog', { name: 'Add a supplier' })
    await add.getByRole('textbox', { name: 'Name' }).fill('Frutas Paqui')
    await add.getByRole('textbox', { name: 'Email' }).fill('paqui@frutas.example')
    await add.getByRole('textbox', { name: 'Website' }).fill('https://frutas.example')
    await add.getByRole('button', { name: 'Friday' }).click()
    await add.getByRole('button', { name: 'Add' }).click()
    await toast(page, 'Added Frutas Paqui')
    const card = page.getByRole('article', { name: 'Frutas Paqui' })
    await expect(card).toContainText('Orders: Fri')
    await expect(card.getByRole('link', { name: 'Website' })).toHaveAttribute('href', 'https://frutas.example')

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Stock', exact: true }).click()
    await page.getByRole('button', { name: 'Add item' }).click()
    const item = page.getByRole('dialog', { name: 'Add an item' })
    await item.getByRole('textbox', { name: 'Name' }).fill('Oranges')
    await item.getByRole('combobox', { name: 'Supplier' }).click()
    await page.getByRole('option', { name: 'Frutas Paqui' }).click()
    await item.getByRole('textbox', { name: 'Link to the item on their website' }).fill('https://frutas.example/naranjas')
    await item.getByRole('textbox', { name: 'Cost per unit, without IVA' }).fill('1,20')
    await item.getByRole('textbox', { name: 'In stock now' }).fill('5')
    await item.getByRole('textbox', { name: 'Reorder at' }).fill('10')
    await item.getByRole('button', { name: 'Add' }).click()
    await toast(page, 'Added Oranges')
    const row = page.getByRole('table', { name: 'Stock items' }).getByRole('row', { name: 'Oranges' })
    await expect(row).toContainText('Low')
    await expect(row.getByRole('link', { name: 'Oranges on the supplier’s website' })).toHaveAttribute('href', 'https://frutas.example/naranjas')
  })

  test('an employee can count but not see Suppliers or change prices', async ({ page }) => {
    await open(page, '/stock', 'maria@example.com')
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Stock' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Suppliers' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add item' })).toHaveCount(0)
    const row = page.getByRole('table', { name: 'Stock items' }).getByRole('row', { name: 'Napkins' })
    await row.getByRole('button', { name: 'Count Napkins' }).click()
    const count = page.getByRole('dialog', { name: 'Napkins' })
    await count.getByRole('textbox', { name: 'How many are there' }).fill('6')
    await count.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Counted: 6 packs')
    // The item opens read-only: no prices to change.
    await row.getByRole('button', { name: 'Napkins', exact: true }).click()
    const details = page.getByRole('dialog', { name: 'Napkins' })
    await expect(details.getByRole('textbox', { name: 'Cost per unit, without IVA' })).toBeDisabled()
    await expect(details.getByRole('button', { name: 'Save' })).toHaveCount(0)
    await details.getByRole('button', { name: 'Close' }).click()
  })
})

test.describe('recipes and waste', () => {
  test.describe.configure({ timeout: 60_000 })

  test('menu costing: margins from stock costs, below-target flagged, and the price that fixes it', async ({ page }) => {
    await open(page, '/recipes')
    await expect(page.getByRole('heading', { name: 'Menu costing', level: 1 })).toBeVisible()
    const tiles = page.getByRole('list', { name: 'At a glance' })
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Below target' })).toContainText('2')
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Lowest margin' })).toContainText('42,5%')
    const table = page.getByRole('table', { name: 'Menu costing' })
    // Sorted by margin, lowest first.
    await expect(table.getByRole('row').nth(1)).toHaveAccessibleName('Pain au chocolat')
    await expect(table.getByRole('row', { name: 'Flat white' })).toContainText('78,9%')

    await table.getByRole('row', { name: 'Croissant' }).click()
    const dialog = page.getByRole('dialog', { name: 'Croissant' })
    await expect(dialog).toContainText('Below the 60% aimed for. At €2,60 with IVA it would be on target.')
    await dialog.getByRole('textbox', { name: 'Menu price, with IVA' }).fill('2,60')
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, /^Saved$/)
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Below target' })).toContainText('1')

    await page.getByRole('button', { name: 'Export' }).click()
    await expect(page.getByRole('menuitem', { name: /Excel/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /CSV/ })).toBeVisible()
  })

  test('a new recipe costs itself as ingredients and a variant are added', async ({ page }) => {
    await open(page, '/recipes')
    await page.getByRole('button', { name: 'Add menu item' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a menu item' })
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Cortado')
    await dialog.getByRole('textbox', { name: 'Menu price, with IVA' }).fill('2,20')
    await dialog.getByRole('button', { name: 'Add ingredient' }).click()
    await dialog.getByRole('combobox', { name: 'Ingredient' }).fill('House espresso')
    await page.getByRole('option', { name: 'House espresso blend' }).click()
    await dialog.getByRole('textbox', { name: 'Amount' }).fill('18')
    await expect(dialog).toContainText('Cost €0,33 · €2,00 without IVA · margin €1,67 (83,4%)')
    await dialog.getByRole('button', { name: 'Add a variant' }).click()
    await dialog.getByRole('textbox', { name: 'Variant' }).fill('Extra shot')
    await dialog.getByRole('textbox', { name: 'Price change' }).fill('0,5')
    await dialog.getByRole('button', { name: 'Add ingredient' }).nth(1).click()
    await dialog.getByRole('combobox', { name: 'Ingredient' }).nth(1).fill('House espresso')
    await page.getByRole('option', { name: 'House espresso blend' }).click()
    await dialog.getByRole('textbox', { name: 'Amount' }).nth(1).fill('9')
    await expect(dialog).toContainText('Cost €0,50 · €2,45 without IVA')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await toast(page, 'Added Cortado')
    await expect(page.getByRole('table', { name: 'Menu costing' }).getByRole('row', { name: 'Cortado' })).toContainText('Extra shot')
  })

  test('the team logs waste and it comes off the stock; only admins with pay access see what it cost', async ({ page }) => {
    await open(page, '/waste')
    const tiles = page.getByRole('list', { name: 'At a glance' })
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Times logged' })).toContainText('3')
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Cost of waste' })).toBeVisible()
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Of what was delivered' })).toContainText('13,7%')

    await signInAs(page, 'maria@example.com')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Waste log' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Menu costing' })).toHaveCount(0)
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Cost of waste' })).toHaveCount(0)
    const log = page.getByRole('region', { name: 'Log waste' })
    await log.getByRole('combobox', { name: 'What' }).fill('Napkins')
    await page.getByRole('option', { name: 'Napkins' }).click()
    await log.getByRole('combobox', { name: 'Why' }).click()
    await page.getByRole('option', { name: 'Spilled or dropped' }).click()
    await log.getByRole('button', { name: 'Log it' }).click()
    await toast(page, '1 logged as waste')
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Times logged' })).toContainText('4')
    await expect(page.getByRole('region', { name: /Wednesday 30 September/ })).toContainText('Spilled or dropped')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Stock', exact: true }).click()
    await expect(page.getByRole('table', { name: 'Stock items' }).getByRole('row', { name: 'Napkins' })).toContainText('2 packs')
  })
})

test.describe('ads', () => {
  test('the Ads page shows both platforms’ spend and campaigns, with the monthly limits', async ({ page }) => {
    await open(page, '/ads')
    await expect(page.getByRole('heading', { name: 'Ads' })).toBeVisible()
    const tiles = page.getByRole('list', { name: 'At a glance' })
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Spent on ads' })).toContainText('on 2 platforms')
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Clicks' })).toContainText('times shown')
    const campaigns = page.getByRole('table', { name: /^Campaigns/ })
    await expect(campaigns.getByRole('row', { name: /new autumn menu/ })).toContainText('Meta Ads')
    await expect(campaigns.getByRole('row', { name: /café San Pedro de Alcántara/ })).toContainText('Google Ads')
    await expect(campaigns.getByRole('row', { name: /specialty coffee Marbella/ })).toContainText('Paused')
    // Google is on course to pass its limit this month; a lower Meta limit is passed already.
    const limits = page.getByRole('region', { name: 'Monthly limits' })
    await expect(limits.getByRole('article', { name: 'Google Ads' })).toContainText(/Close to the limit|Over the limit/)
    await limits.getByRole('button', { name: 'Change the Meta Ads monthly limit' }).click()
    await limits.getByRole('textbox', { name: 'Monthly limit' }).fill('100')
    await limits.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Monthly limit saved')
    await expect(limits.getByRole('article', { name: 'Meta Ads' })).toContainText('Over the limit by')
    // A new campaign is made on the platform itself.
    await expect(page.getByRole('link', { name: 'New on Meta Ads' })).toHaveAttribute('href', /adsmanager\.facebook\.com/)
  })

  test('pausing a campaign asks first, then shows it paused; resuming brings it back', async ({ page }) => {
    await open(page, '/ads')
    const row = page.getByRole('table', { name: /^Campaigns/ }).getByRole('row', { name: /new autumn menu/ })
    await row.getByRole('button', { name: /^Pause / }).click()
    const confirm = page.getByRole('dialog', { name: 'Pause this campaign?' })
    await expect(confirm).toContainText('stops showing ads on Meta Ads straight away')
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(row).toContainText('Active')
    await row.getByRole('button', { name: /^Pause / }).click()
    await page.getByRole('dialog', { name: 'Pause this campaign?' }).getByRole('button', { name: 'Pause on Meta Ads' }).click()
    await toast(page, 'Campaign paused')
    await expect(row).toContainText('Paused')
    await row.getByRole('button', { name: /^Resume / }).click()
    await page.getByRole('dialog', { name: 'Resume this campaign?' }).getByRole('button', { name: 'Resume on Meta Ads' }).click()
    await toast(page, 'Campaign resumed')
    await expect(row).toContainText('Active')
  })

  test('changing a campaign’s daily budget says the old and new amounts before it goes to Google', async ({ page }) => {
    await open(page, '/ads')
    const row = page.getByRole('table', { name: /^Campaigns/ }).getByRole('row', { name: /café San Pedro de Alcántara/ })
    await row.getByRole('button', { name: /^Change the daily budget of / }).click()
    const dialog = page.getByRole('dialog', { name: 'Daily budget' })
    await dialog.getByLabel('New daily budget').fill('0.5')
    await expect(dialog.getByRole('button', { name: 'Next' })).toBeDisabled()
    await dialog.getByLabel('New daily budget').fill('12')
    await dialog.getByRole('button', { name: 'Next' }).click()
    const confirm = page.getByRole('dialog', { name: 'Change the daily budget?' })
    await expect(confirm).toContainText(/on Google Ads goes from €8[.,]00 to €12[.,]00 a day/)
    await confirm.getByRole('button', { name: 'Change on Google Ads' }).click()
    await toast(page, 'Daily budget changed')
    await expect(row.getByRole('cell').nth(2)).toHaveText(/€12[.,]00/)
  })

  test('the UTM link builder makes a tracked link to the website', async ({ page }) => {
    await open(page, '/ads')
    const card = page.getByRole('region', { name: 'Tracked link' })
    await expect(card.getByLabel('Your link')).toContainText('Fill in')
    await card.getByLabel('Campaign').fill('Autumn menú')
    await card.getByLabel('Ad (optional)').fill('Reel 1')
    await expect(card.getByLabel('Your link')).toHaveText('https://www.easybeanscoffee.com/?utm_source=instagram&utm_medium=paid_social&utm_campaign=autumn-menu&utm_content=reel-1')
    await expect(card.getByRole('button', { name: 'Copy link' })).toBeEnabled()
  })

  test('Meta Ads and Google Ads are under Advertising on Connections', async ({ page }) => {
    await open(page, '/connections')
    const group = page.getByRole('region', { name: 'Advertising' })
    await expect(group.getByRole('article', { name: 'Meta Ads' })).toContainText('Connected')
    await expect(group.getByRole('article', { name: 'Google Ads' })).toContainText('Connected')
  })

  test('employees don’t get the Ads page', async ({ page }) => {
    await open(page, '/', 'maria@example.com')
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ads', exact: true })).toHaveCount(0)
    await page.goto('/ads?demo')
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ads' })).toHaveCount(0)
  })
})

test.describe('invoices', () => {
  test.describe.configure({ timeout: 90_000 })

  test('invoices received, by supplier: what’s to pay and overdue, a status changed in place, and exported', async ({ page }) => {
    await open(page, '/invoices')
    await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible()
    const glance = page.getByRole('list', { name: 'At a glance' })
    await expect(glance).toContainText('€1.120,00') // to pay: Tostadores €320 + By Eric €600 + Lácteos €200 (to check)
    const list = page.getByRole('region', { name: 'Invoices', exact: true })
    await expect(list.getByRole('row').filter({ hasText: '2026-0812' })).toContainText('Overdue') // By Eric, due 15 Sep
    const bySupplier = page.getByRole('region', { name: 'By supplier' })
    await expect(bySupplier.getByRole('row').filter({ hasText: 'Tostadores del Sur' })).toContainText('€690,00')

    await list.getByRole('combobox', { name: 'Status of 2026-0812' }).click()
    await page.getByRole('option', { name: 'Paid', exact: true }).click()
    await toast(page, /^Saved$/)
    await expect(list.getByRole('row').filter({ hasText: '2026-0812' })).not.toContainText('Overdue')

    // Categorised through the supplier: pick one to see only theirs.
    await bySupplier.getByRole('button', { name: 'Tostadores del Sur' }).click()
    await expect(list.getByRole('row')).toHaveCount(3) // the heading row and two invoices
    await list.getByRole('button', { name: 'Export' }).click()
    await expect(page.getByRole('menuitem', { name: /Excel/ })).toBeVisible()
  })

  test('from email: allow reading the mailbox, then bring an invoice in, matched to its supplier, with a note', async ({ page }) => {
    await open(page, '/connections')
    await page.getByRole('region', { name: 'Files and storage' }).getByRole('button', { name: 'Connect Google Drive' }).click()
    await expect(page.getByRole('region', { name: 'Files and storage' }).getByRole('article', { name: 'Google Drive' })).toContainText('Connected')
    await page.getByRole('region', { name: 'Email' }).getByRole('button', { name: 'Connect Gmail' }).click()
    await expect(page.getByRole('region', { name: 'Email' }).getByRole('article', { name: 'Gmail' })).toContainText('Connected')
    await page.getByRole('link', { name: 'Invoices', exact: true }).first().click()

    const email = page.getByRole('region', { name: 'From email' })
    await expect(email).toContainText('Gmail is connected to send email only.')
    await email.getByRole('button', { name: 'Allow reading' }).click()
    const roaster = email.getByRole('article', { name: 'Factura F2026-0142' })
    await expect(roaster.getByRole('combobox', { name: 'Supplier' })).toHaveText('Tostadores del Sur') // the same company domain
    await expect(email.getByRole('article', { name: 'Su factura Makro' }).getByRole('combobox', { name: 'Supplier' })).toHaveText('Not one of mine')
    await roaster.getByRole('button', { name: 'Bring in Factura F2026-0142.pdf' }).click()
    await toast(page, 'Invoice brought in')
    await expect(email.getByRole('article', { name: 'Factura F2026-0142' })).toHaveCount(0)

    const row = page.getByRole('region', { name: 'Invoices', exact: true }).getByRole('row').filter({ hasText: 'F2026-0142' })
    await expect(row).toContainText('Tostadores del Sur')
    await expect(row).toContainText('To check')
    await row.getByRole('button', { name: 'Edit F2026-0142' }).click()
    const dialog = page.getByRole('dialog', { name: 'Invoice F2026-0142' })
    await dialog.getByRole('textbox', { name: 'Notes' }).fill('September beans, 12 kg')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, /^Saved$/)
    await expect(row.getByRole('button', { name: 'Notes: September beans, 12 kg' })).toBeVisible()
  })

  test('employees don’t get invoices', async ({ page }) => {
    await open(page, '/', 'maria@example.com')
    await expect(page.getByRole('link', { name: 'Invoices', exact: true })).toHaveCount(0)
    await page.goto('/invoices?demo')
    await expect(page.getByText('Invoices are only visible to admins with pay access.')).toBeVisible()
  })
})

test.describe('reviews and website', () => {
  test('reviews: figures at the top, filters, and replying to an unanswered review from a template', async ({ page }) => {
    await open(page, '/reviews')
    await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible()
    const glance = page.getByRole('list', { name: 'At a glance' })
    await expect(glance).toContainText(/4[.,]3 ★/)
    await expect(glance).toContainText('12 reviews')
    const list = page.getByRole('region', { name: 'Google reviews' })
    const reviews = list.getByRole('article')
    await expect(reviews).toHaveCount(12)
    await list.getByRole('button', { name: '1 to 3 stars' }).click()
    await expect(reviews).toHaveCount(2)
    await list.getByRole('button', { name: '4 and 5 stars' }).click()
    await expect(reviews).toHaveCount(10)
    await list.getByRole('button', { name: 'No reply yet' }).click()
    await expect(reviews).toHaveCount(2)

    // The 2★ one: the template apologises, in English, with the café's email to write to.
    const tom = list.getByRole('article', { name: 'Tom Hughes, 2 stars' })
    await tom.getByRole('button', { name: 'Reply' }).click()
    const reply = tom.getByRole('textbox', { name: 'Reply to Tom Hughes' })
    await expect(reply).toHaveValue(/^Hi Tom, we're very sorry your visit wasn't what you hoped for\. .*easybeanscafe@gmail\.com/)
    await reply.fill('Hi Tom, sorry for the wait on Saturday. Your next flat whites are on us.')
    await tom.getByRole('button', { name: 'Post reply' }).click()
    await toast(page, 'Reply posted on Google')
    await expect(reviews).toHaveCount(1)
    await list.getByRole('button', { name: 'All' }).click()
    await expect(tom).toContainText('Your reply')
    await expect(tom).toContainText('Your next flat whites are on us.')

    // The 3★ one is in Spanish, so its template is too.
    const javier = list.getByRole('article', { name: 'Javier Ruiz, 3 stars' })
    await javier.getByRole('button', { name: 'Reply' }).click()
    await expect(javier.getByRole('textbox', { name: 'Reply to Javier Ruiz' })).toHaveValue(/^¡Hola, Javier! Gracias por contarnos tu experiencia/)

    await page.getByRole('button', { name: 'Export' }).click()
    await expect(page.getByRole('menuitem', { name: /Excel/ })).toBeVisible()
  })

  test('website: the SEO check lists what to fix with how, and whether the details match everywhere', async ({ page }) => {
    await open(page, '/website')
    await expect(page.getByRole('heading', { name: 'Website & SEO' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'www.easybeanscoffee.com' })).toBeVisible()
    await page.getByRole('button', { name: 'Check the website' }).click()
    await toast(page, 'Website checked')
    const check = page.getByRole('region', { name: 'SEO check' })
    const broken = check.getByRole('listitem').filter({ hasText: 'links lead to a page that isn’t there' })
    await expect(broken.getByRole('img', { name: 'To fix' })).toBeVisible()
    await expect(broken).toContainText('Fix or remove these links.')
    await expect(broken).toContainText('https://www.easybeanscoffee.com/carta-verano (404)')
    await expect(check.getByRole('listitem').filter({ hasText: 'The meta description is 43 characters long' })).toContainText('Aim for 70 to 160 characters')
    await expect(check).toContainText('The website’s opening hours differ from the app on Sunday')

    const same = page.getByRole('region', { name: 'Same details everywhere' })
    await expect(same.getByRole('row').filter({ hasText: 'Phone' })).toContainText('Matches')
    await expect(same.getByRole('row').filter({ hasText: 'Opening hours' })).toContainText('Different')

    const phone = page.getByRole('region', { name: 'On a phone' })
    await phone.getByRole('button', { name: 'Test' }).click()
    await expect(phone).toContainText('Speed: 64')
    await expect(phone).toContainText('Serve images in modern formats')
  })

  test('employees don’t get reviews or the website page', async ({ page }) => {
    await open(page, '/', 'maria@example.com')
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Reviews' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Website & SEO' })).toHaveCount(0)
    await page.goto('/reviews?demo')
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
    await page.goto('/website?demo')
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
  })
})
