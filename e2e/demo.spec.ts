// End-to-end tests in demo mode (in-memory Easy Beans data, no backend needed).
// The browser clock is fixed to Wednesday 30 Sep 2026, 09:00 in Madrid so the sample rota and
// the clock-in rules give the same results whenever the tests run.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { FEATURES } from '../src/app/features'

const WED_0900 = new Date('2026-09-30T07:00:00Z') // 09:00 Europe/Madrid (CEST)

/** Open the demo and sign in (everyone starts at the sign-in screen), as the admin by default. */
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
    const phone = contact.getByRole('textbox', { name: 'Phone' })
    await expect(phone).toHaveAttribute('type', 'tel')
    await phone.fill('')
    await phone.pressSequentially('+34 600-abc 000 000')
    await expect(phone).toHaveValue('+34 600 000 000')
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
  for (const name of ['Opening hours', 'Brand', 'Finances', 'Sports', 'Team', 'Alerts', 'Connections', 'Appearance']) {
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
    await company.getByRole('textbox', { name: 'Name', exact: true }).fill('')
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
  for (const section of ['Business', "What's on", 'Team', 'Settings', 'You']) await expect(nav.getByRole('button', { name: section, exact: true })).toBeVisible()
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
    await expect(page.getByText('followers', { exact: true })).toBeVisible()

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
    await expect(page.getByRole('link', { name: 'Alerts' })).toHaveCount(0)
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

  test('send the rota on WhatsApp and opt in from My account', async ({ page }) => {
    await open(page, '/rota')
    await page.getByRole('button', { name: 'Send on WhatsApp' }).click()
    await toast(page, 'Rota sent on WhatsApp')
    await page.getByRole('link', { name: 'My account' }).first().click()
    await page.getByLabel(/shift reminders and rota updates on WhatsApp/).check()
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
    // The four headline figures sit side by side, two by two.
    const tiles = page.getByRole('list', { name: 'At a glance' }).getByRole('listitem')
    await expect(tiles).toHaveCount(4)
    const [first, second, third] = await Promise.all([0, 1, 2].map(i => tiles.nth(i).boundingBox()))
    expect(Math.abs(first!.y - second!.y)).toBeLessThan(2)
    expect(third!.y).toBeGreaterThan(first!.y + first!.height - 2)

    // One Edit button for the whole list; every change saves at once.
    await page.getByRole('button', { name: 'Edit expenses' }).click()
    await page.getByLabel('Per month for Broadband').fill('30')
    await page.getByLabel('Count Loan in the total').uncheck()
    await page.getByRole('button', { name: 'Add expense' }).click()
    await page.getByLabel('Name').last().fill('Coffee beans')
    await page.getByLabel('Per month for Coffee beans').fill('250')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await toast(page, 'Expenses saved')
    // 7,865.09 + 10 (broadband) + 250 (beans) − 641.53 (loan, no longer counted)
    await expect(page.getByText(/7[.,]?483[.,]56/).first()).toBeVisible()
    await expect(page.getByText('18 items · 1 not counted')).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'Loan' })).toContainText('Not counted')
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
  })

  test('employees cannot see finances', async ({ page }) => {
    await open(page)
    await signInAs(page, 'maria@example.com')
    await expect(page.getByRole('link', { name: 'Finances' })).toHaveCount(0)
    await page.goto('/finances')
    await expect(page.getByText('Rent', { exact: true })).toHaveCount(0)
  })
})

test('alerts: admin switches an alert off and sees what was sent', async ({ page }) => {
  await open(page, '/alerts')
  await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible()
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
  await expect(page.getByText(/Suppliers/i)).toHaveCount(0)
})

test.describe('partners (outside businesses)', () => {
  test('the gestoría sees payroll and finances read-only, and nothing else', async ({ page }) => {
    await open(page, '/', 'laura@gestoria.example')
    await expect(page).toHaveURL(/\/business/)
    const nav = page.getByRole('navigation', { name: 'Main' })
    for (const name of ['Business', 'Rota', 'Timecards', 'Finances', 'My account']) await expect(nav.getByRole('link', { name })).toBeVisible()
    for (const name of ['Today', 'Team', 'Time off', 'Calendar', 'Alerts', 'Connections', 'Partners']) {
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

test('sign in with an emailed code instead of a link or password', async ({ page }) => {
  await page.clock.install({ time: WED_0900 })
  await page.goto('/?demo')
  await page.getByRole('button', { name: 'Email me a sign-in code' }).click()
  await toast(page, 'Enter your email first')
  await page.getByRole('textbox', { name: 'Email' }).fill('nobody@example.com')
  await page.getByRole('button', { name: 'Email me a sign-in code' }).click()
  await toast(page, 'No invited account uses this email')
  await page.getByRole('textbox', { name: 'Email' }).fill('maria@example.com')
  await page.getByRole('button', { name: 'Email me a sign-in code' }).click()
  await toast(page, 'Code sent to maria@example.com')
  await page.getByLabel('6-digit code').fill('000000')
  await page.getByRole('button', { name: 'Sign in with code' }).click()
  await toast(page, 'wrong or has expired')
  await page.getByLabel('6-digit code').fill('123 456')
  await page.getByRole('button', { name: 'Sign in with code' }).click()
  await expect(page.getByRole('heading', { name: /Hola, Maria/ })).toBeVisible()
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
  await company.getByRole('textbox', { name: 'Name', exact: true }).fill('')
  await company.getByRole('button', { name: 'Save' }).click()
  await toast(page, 'The business needs a name')
  // Clickable straight away, while the message is still showing.
  await company.getByRole('button', { name: 'Cancel' }).click({ timeout: 2000 })
  await expect(company.getByRole('textbox')).toHaveCount(0)
})

test.describe('sports', () => {
  test('staff see the next three weeks by day, with big nights, filters and times to be confirmed', async ({ page }) => {
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

    await page.getByRole('button', { name: 'UFC', exact: true }).click()
    await expect(page.getByText('UFC 322: Makhachev vs Topuria')).toBeVisible()
    await expect(page.getByText('Barcelona')).toHaveCount(0)
    await page.getByRole('button', { name: 'National teams' }).click()
    await expect(page.getByText('Spain', { exact: true })).toBeVisible()
    await expect(page.getByText('UFC 322: Makhachev vs Topuria')).toHaveCount(0)
    await page.getByRole('button', { name: 'Big nights' }).click()
    await expect(page.getByText('Villarreal')).toHaveCount(0)
    await expect(page.getByRole('article', { name: /Atlético Madrid vs Real Madrid/ })).toBeVisible()
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
    await expect(maria).toContainText('8,80 €/h')
    await page.getByRole('link', { name: 'Appearance' }).first().click()
    await page.getByRole('radio', { name: 'Decimal point' }).click()
    await toast(page, 'Numbers: decimal point')
    await page.getByRole('link', { name: 'Team' }).first().click()
    await expect(maria).toContainText('€8.80/h')
    // Another person on this device still sees their own choice (the comma).
    await signInAs(page, 'mark@example.com')
    await page.getByRole('link', { name: 'Team' }).first().click()
    await expect(maria).toContainText('8,80 €/h')
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
    await page.getByRole('button', { name: /Notifications, 1 new/ }).first().click()
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Barcelona vs Real Madrid')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: /Notifications, 1 new/ })).toHaveCount(0)
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
  const connected = ['Team messages', 'Maps and search', 'Social media', 'Café music']
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
  test('business first, then what\'s on, then the team; partners and the café tablet are switched off', async ({ page }) => {
    await open(page, '/')
    const nav = page.getByRole('navigation', { name: 'Main' })
    const headings = await nav.locator('section > button').allTextContents()
    expect(headings.map(h => h.trim())).toEqual(['Business', "What's on", 'Team', 'Settings', 'You'])
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
  await expect(maria).toContainText('8,80 €/h')
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
  await expect(maria).toContainText('8,80 £/h')
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
  await dialog.getByLabel('Mobile (optional)').fill('+34 600 999 000')
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
    await page.getByRole('link', { name: 'Appearance' }).first().click()
    await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: 'Switch to light mode' }).click()
    await expect(root).toHaveAttribute('data-eb-theme', 'light')
  })
})

test('each person stars teams and sees them in Favourites', async ({ page }) => {
  await open(page, '/sports', 'maria@example.com')
  const favourites = page.getByRole('region', { name: 'Favourites' })
  await expect(favourites).toContainText('Tap the ☆')
  await page.getByRole('button', { name: 'Add Arsenal to favourites' }).first().click()
  await toast(page, 'Arsenal added to favourites')
  await expect(favourites.getByRole('button', { name: /Arsenal/ })).toBeVisible()
  await expect(favourites.getByRole('listitem', { name: 'Arsenal' })).toBeVisible()
  await expect(favourites).not.toContainText('Nothing on for your favourites')
  await expect(page.getByRole('article').getByRole('button', { name: 'Remove Arsenal from favourites' }).first()).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '★ Favourites' }).click()
  for (const card of await page.getByRole('article').all()) await expect(card).toContainText('Arsenal')
  // Favourites are personal: Aron has his own.
  await signInAs(page, 'aron@example.com')
  await page.getByRole('link', { name: 'Sports' }).first().click()
  await expect(page.getByRole('region', { name: 'Favourites' })).toContainText('Real Betis')
  await expect(page.getByRole('region', { name: 'Favourites' })).not.toContainText('Arsenal')
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
    .toEqual(['Set-up', 'Connections', 'Alerts', 'Billing'])
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

test('pricing: four plans, every feature line by line, and "Try free" opens Create account', async ({ page }) => {
  await page.goto('/pricing?demo')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Start free')
  await expect(page.getByRole('article', { name: /plan$/ })).toHaveCount(4)
  const pro = page.getByRole('article', { name: 'Pro plan' })
  await expect(pro).toContainText('€49')
  await expect(page.getByRole('article', { name: 'Free plan' })).toContainText('1 social account, 1 scheduled post a month')
  await page.getByRole('button', { name: /Yearly/ }).first().click()
  await expect(pro).toContainText('€40.83')
  await expect(pro).toContainText('€490 billed yearly')
  const table = page.getByRole('table', { name: 'Plan comparison' })
  await expect(table.getByRole('row', { name: /Custom MCP connection/ }).getByLabel('Included')).toHaveCount(4)
  await expect(table.getByRole('row', { name: /Scheduled posts per month/ }).getByRole('cell')).toHaveText(['Scheduled posts per month', '1', '12', '60', 'Unlimited'])
  await page.getByRole('article', { name: 'Business plan' }).getByRole('link', { name: 'Try free for 2 months' }).click()
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Create account' })).toHaveAttribute('aria-selected', 'true')
})

test('compare: Square and GoHighLevel stacks add up line by line against Business', async ({ page }) => {
  await page.goto('/pricing?demo')
  await page.getByRole('link', { name: /Compare with Square and GoHighLevel/ }).click()
  const square = page.getByRole('table', { name: 'Square stack' })
  await expect(square.getByRole('row')).toHaveCount(5) // heading, 3 lines, total
  await expect(square.getByRole('row', { name: /Total with Square/ })).toContainText('€94')
  await expect(page.getByLabel('Savings')).toContainText('€15/mo')
  await expect(page.getByLabel('Savings')).toContainText('€180 a year')
  await page.getByRole('button', { name: 'vs GoHighLevel' }).click()
  await expect(page.getByRole('table', { name: 'GoHighLevel stack' }).getByRole('row', { name: /Total with GoHighLevel/ })).toContainText('€169.69')
  await expect(page.getByLabel('Savings')).toContainText('€90.69/mo')
  await expect(page.getByLabel('Savings')).toContainText('€1,088.28 a year')
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
    await expect(page.getByText('Founding account: free')).toBeVisible()
    await expect(page.getByLabel('Business plan').getByRole('button', { name: 'Current plan' })).toBeVisible()
    await expect(page.getByLabel('Pro plan').getByRole('button', { name: 'Choose Pro' })).toBeDisabled()
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
    await expect(page.getByRole('button', { name: /Save to/ })).toHaveCount(0)
    await page.getByRole('link', { name: 'Connections' }).first().click()
    await page.getByRole('button', { name: 'Connect Google Drive' }).click()
    await expect(page.getByRole('region', { name: 'Files and storage' }).getByRole('article', { name: 'Google Drive' })).toContainText('Connected')
    await page.getByRole('link', { name: 'Timecards' }).first().click()
    const popup = page.waitForEvent('popup')
    await page.getByRole('button', { name: 'Save to Drive' }).click()
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

  test('the set-up wizard walks an admin through details, team and apps; Today prompts until done', async ({ page }) => {
    await open(page, '/')
    const prompt = page.getByRole('region', { name: 'Finish setting up' })
    await expect(prompt).toBeVisible()
    await prompt.getByRole('link', { name: 'Continue set-up' }).click()
    await expect(page.getByRole('heading', { name: 'Set up your business' })).toBeVisible()
    const steps = page.getByRole('navigation', { name: 'Set-up steps' })
    await steps.getByRole('button', { name: /Your business/ }).click()
    const details = page.getByRole('region', { name: 'Your business' })
    await details.getByLabel('CIF / NIF').fill('B1234')
    await details.getByRole('button', { name: 'Save and continue' }).click()
    await toast(page, /Spanish CIF/)
    await details.getByLabel('CIF / NIF').fill('B12345674')
    await details.getByRole('button', { name: 'Save and continue' }).click()
    await expect(page.getByRole('region', { name: 'Your brand' })).toBeVisible()
    await steps.getByRole('button', { name: /Connect your apps/ }).click()
    const apps = page.getByRole('region', { name: 'Connect your apps' })
    await apps.getByRole('button', { name: 'Connect Outlook' }).click()
    await expect(apps.getByRole('article', { name: 'Outlook', exact: true })).toContainText('Connected')
    await apps.getByRole('button', { name: 'Finish set-up' }).click()
    await toast(page, 'All set')
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Finish setting up' })).toHaveCount(0)
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
  test('plan a post for several accounts, schedule it, post another now, and see where it went', async ({ page }) => {
    await open(page, '/connections')
    // Connect Facebook in one click (Instagram and Google Maps are already connected in the demo).
    await page.getByRole('button', { name: 'Connect Facebook' }).click()
    await expect(page.getByRole('region', { name: 'Social media' }).getByRole('article', { name: 'Facebook' })).toContainText('Connected')

    await page.getByRole('link', { name: 'Social planner' }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Social planner' })).toBeVisible()
    const accounts = page.getByRole('region', { name: 'Accounts' })
    await expect(accounts).toContainText('@easy.beans.coffee')
    await expect(accounts.getByRole('link', { name: 'Connect' })).toHaveCount(1) // TikTok only
    const coming = page.getByRole('region', { name: 'Coming up' })
    await expect(coming).toContainText('Feria week')
    await expect(page.getByRole('region', { name: 'Sent' })).toContainText('Iced oat latte')

    await page.getByRole('button', { name: 'New post' }).click()
    const dialog = page.getByRole('dialog', { name: 'New post' })
    await dialog.getByLabel('Caption').fill('Matcha week starts Monday: 2x1 on iced matcha before 11:00.')
    // Connected accounts start ticked; Instagram needs a photo, TikTok isn't connected.
    await expect(dialog.getByRole('checkbox', { name: /TikTok/ })).toBeDisabled()
    await expect(dialog.getByRole('alert')).toContainText('Instagram needs a photo')
    await dialog.getByRole('checkbox', { name: /Instagram/ }).uncheck()
    await dialog.getByRole('radio', { name: 'Schedule' }).check()
    await dialog.getByLabel('Date').fill('2026-10-05')
    await dialog.getByLabel('Time (Madrid)').fill('09:30')
    await dialog.getByRole('button', { name: 'Schedule' }).click()
    await toast(page, 'Scheduled for Mon 5 Oct, 09:30')
    await expect(coming.getByRole('article', { name: /Matcha week/ })).toContainText('09:30')

    await page.getByRole('button', { name: 'New post' }).click()
    const now = page.getByRole('dialog', { name: 'New post' })
    await now.getByLabel('Caption').fill('Open until 23:00 tonight!')
    await now.getByRole('checkbox', { name: /Instagram/ }).uncheck()
    await now.getByRole('button', { name: 'Post now' }).click()
    await toast(page, 'Posting now')
    const sent = page.getByRole('region', { name: 'Sent' }).getByRole('article', { name: /Open until 23:00/ })
    await expect(sent).toContainText('Posted')
    await expect(sent.getByRole('list', { name: 'Where it went' })).toContainText('Facebook: posted')
    await expect(sent.getByRole('list', { name: 'Where it went' })).toContainText('Google Maps: posted')
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
  const prompt = page.getByRole('alert').filter({ hasText: 'Connect Stripe or Square to see takings' })
  await expect(prompt).toBeVisible()
  await prompt.getByRole('link', { name: 'Connect' }).click()
  const payments = page.getByRole('region', { name: 'Payments and sales' })
  // Stripe and Square, nothing else (no SumUp).
  await expect(payments.getByRole('button', { name: 'Connect Square' })).toBeVisible()
  expect(await payments.getByRole('article').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))).toEqual(['Stripe', 'Square'])
  await payments.getByRole('button', { name: 'Connect Square' }).click()
  await expect(payments.getByRole('article', { name: 'Square' })).toContainText('Connected')
  await page.getByRole('link', { name: 'Finances' }).first().click()
  const takings = page.getByRole('region', { name: 'Takings' })
  await expect(takings).toContainText('from Square')
  await expect(takings).toContainText('This week')
  await expect(takings).toContainText('Last 30 days')
  await expect(takings).toContainText(/€/)
})

test('Stripe: connect it in one click, then takings show on Finances next to the team’s cost', async ({ page }) => {
  await open(page, '/finances')
  const prompt = page.getByRole('alert').filter({ hasText: 'Connect Stripe or Square to see takings' })
  await expect(prompt).toBeVisible()
  await prompt.getByRole('link', { name: 'Connect' }).click()
  const payments = page.getByRole('region', { name: 'Payments and sales' })
  await payments.getByRole('button', { name: 'Stripe details' }).click()
  const details = page.getByRole('dialog', { name: 'Stripe', exact: true })
  await expect(details).toContainText('it can’t take, refund or change anything')
  await details.getByRole('button', { name: 'Connect Stripe' }).click()
  await expect(details).toContainText('Easy Beans Coffee SL')
  await expect(details).toContainText('The Stripe account was found and its payments can be read.')
  await details.getByRole('button', { name: 'Close' }).click()
  await expect(payments.getByRole('article', { name: 'Stripe' })).toContainText('Connected')
  // One payment system at a time: Square waits under "Also works with".
  await expect(payments.getByRole('article', { name: 'Square' })).toHaveCount(0)
  await expect(payments.getByRole('group', { name: 'Other payments and sales apps' }).getByRole('button', { name: 'Use Square instead' })).toBeVisible()
  await expect(payments).not.toContainText('SumUp')

  await page.getByRole('link', { name: 'Finances' }).first().click()
  const takings = page.getByRole('region', { name: 'Takings' })
  await expect(takings).toContainText('from Stripe')
  await expect(takings).toContainText('This week')
  await expect(takings).toContainText('Last 30 days')
  await expect(takings).toContainText(/€/)
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
    await expect(page.getByRole('region', { name: 'Marketing' })).toContainText('Chalk menu board')
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
    await expect(apps.getByRole('button', { name: 'Instagram' })).toHaveAttribute('aria-pressed', 'true')
    for (const soon of ['WhatsApp · soon', 'Messenger · soon', 'TikTok · soon']) await expect(apps.getByText(soon)).toBeVisible()
    await expect(apps.getByRole('button', { name: /WhatsApp/ })).toBeDisabled()

    const chats = page.getByRole('list', { name: 'Instagram chats' })
    await expect(chats.getByRole('listitem')).toHaveCount(7)
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
    await page.getByRole('button', { name: 'All', exact: true }).click()
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
    const chats = page.getByRole('list', { name: 'Instagram chats' })
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
    const connect = page.getByRole('region', { name: 'Connect Instagram' })
    await expect(connect).toContainText('Read and answer your direct messages')
    await connect.getByRole('button', { name: 'Connect Instagram' }).click()
    await expect(page.getByRole('list', { name: 'Instagram chats' })).toBeVisible()
    await page.getByRole('link', { name: 'Connections' }).first().click()
    await expect(page.getByRole('region', { name: 'Social media' }).getByRole('article', { name: 'Instagram' })).toContainText('@easy.beans.coffee')
  })

  test('staff don’t get Messages', async ({ page }) => {
    await open(page, '/messages', 'maria@example.com')
    await expect(page.getByRole('link', { name: 'Messages' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Messages' })).toHaveCount(0)
  })

  test('@phone the chat list opens a chat full width, with a way back', async ({ page }) => {
    await open(page, '/messages')
    await page.getByRole('list', { name: 'Instagram chats' }).getByRole('listitem', { name: '@tom_runs' }).getByRole('button').click()
    await expect(page.getByRole('region', { name: 'Chat with @tom_runs' })).toContainText('Replied to your story')
    await page.getByRole('button', { name: 'Back to chats' }).click()
    await expect(page.getByRole('list', { name: 'Instagram chats' })).toBeVisible()
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
