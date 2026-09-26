// End-to-end tests in demo mode (in-memory Easy Beans data, no backend needed).
// The browser clock is fixed to Wednesday 30 Sep 2026, 09:00 in Madrid so the sample rota and
// the clock-in rules give the same results whenever the tests run.
import { expect, test, type Page } from '@playwright/test'

const WED_0900 = new Date('2026-09-30T07:00:00Z') // 09:00 Europe/Madrid (CEST)

async function open(page: Page, path = '/') {
  await page.clock.install({ time: WED_0900 })
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}demo`)
}

async function signInAs(page: Page, email: string) {
  await page.getByRole('button', { name: 'Sign out' }).first().click()
  await expect(page.getByText('Team sign-in')).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

const toast = (page: Page, text: string | RegExp) => expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible()

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
    await page.getByRole('button', { name: 'Edit' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Edit timecard' })
    await dialog.getByLabel('Clock out').fill('2026-09-28T15:10')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'A reason is required')
    await dialog.getByLabel('Reason (required)').fill('Forgot to clock out')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Timecard updated')
    await page.getByRole('button', { name: 'Edit' }).first().click()
    await expect(page.getByRole('dialog').getByText(/via app: Forgot to clock out/)).toBeVisible()
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

  test('sees and edits admin-only business notes', async ({ page }) => {
    await open(page, '/business')
    await expect(page.getByText('Admin-only notes')).toBeVisible()
    await expect(page.getByText('C. Pizarro, 8', { exact: false }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Edit' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Business details' })
    await dialog.getByRole('textbox', { name: 'Phone', exact: true }).fill('+34 600 000 000')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, /^Saved$/)
    await expect(page.getByText('+34 600 000 000')).toBeVisible()
  })
})

test.describe('café tablet (kiosk)', () => {
  test('rejects a wrong PIN and clocks in with the right one', async ({ page }) => {
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
    await page.getByLabel('Email').fill('nobody@example.com')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await toast(page, /Demo: sign in as aron@example.com/)
  })
})

test('@phone layout: bottom navigation and a full-width clock-in button', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('link', { name: 'Rota' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Business' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'My account' })).toBeVisible()
  const button = page.getByRole('button', { name: 'Clock in' })
  const box = await button.boundingBox()
  expect(box!.width).toBeGreaterThan(250)
})

test('sidebar starts with Business and rows can be reordered by keyboard, remembered after reload', async ({ page }) => {
  await open(page)
  const rows = page.getByRole('navigation', { name: 'Main' }).getByRole('link')
  await expect(rows.first()).toHaveText(/Business/)
  await rows.nth(1).focus() // Today
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Space')
  await expect(rows.first()).toHaveText(/Today/)
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link').first()).toHaveText(/Today/)
  await page.getByRole('button', { name: 'Reset menu order' }).click()
  await expect(rows.first()).toHaveText(/Business/)
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
  await expect(page.getByText('From rota')).toHaveCount(0)
  await page.getByRole('button', { name: 'Fill from rota' }).click()
  await toast(page, 'Missing timecards filled from the rota')
  const mark = page.locator('.MuiCard-root', { hasText: 'Mark Murray' })
  await expect(mark.getByText('From rota')).toBeVisible()
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
  test('admin sees Google, WhatsApp and Instagram, and compares opening hours with Google', async ({ page }) => {
    await open(page, '/business')
    const card = page.locator('.MuiCard-root', { hasText: 'Connections' })
    await expect(card).toContainText('Google Maps & Search')
    await expect(card).toContainText('WhatsApp')
    await expect(page.getByText('@easy.beans.coffee').first()).toBeVisible()
    await expect(page.getByText('followers', { exact: true })).toBeVisible()

    await card.getByRole('button', { name: 'Compare with Google' }).click()
    const compare = page.getByRole('dialog', { name: /app vs Google/ })
    await expect(compare).toContainText('10:00–15:00')
    await compare.getByRole('button', { name: 'Put the app’s hours on Google' }).click()
    await toast(page, 'Google updated')

    await card.getByLabel('Test number').fill('12')
    await card.getByRole('button', { name: 'Send test' }).click()
    await toast(page, 'full number with country code')
  })

  test('employees do not see connections', async ({ page }) => {
    await open(page)
    await signInAs(page, 'maria@example.com')
    await page.getByRole('link', { name: 'Business' }).first().click()
    await expect(page.getByText('Connections')).toHaveCount(0)
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
    await expect(page.getByText('Add your mobile number above')).toBeVisible()
  })
})
