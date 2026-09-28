// End-to-end tests in demo mode (in-memory Easy Beans data, no backend needed).
// The browser clock is fixed to Wednesday 30 Sep 2026, 09:00 in Madrid so the sample rota and
// the clock-in rules give the same results whenever the tests run.
import { expect, test, type Page } from '@playwright/test'
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
  await expect(page.getByRole('navigation')).toHaveCount(0)
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

  test('edits business details, and the CIF/NIF is checked before saving', async ({ page }) => {
    await open(page, '/business')
    // Just the business: no opening hours or notes here (hours have their own page).
    await expect(page.getByText('Admin-only notes')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Opening hours' })).toHaveCount(0)
    await expect(page.getByText('C. Pizarro, 8', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('B12345674')).toBeVisible()
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Business details' })
    await dialog.getByRole('textbox', { name: 'Phone', exact: true }).fill('+34 600 000 000')
    const cif = dialog.getByRole('textbox', { name: 'CIF / NIF' })
    await cif.fill('B12345678')
    await expect(dialog.getByText(/control character/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, /control character/)
    await cif.fill('12345678-z')
    await expect(dialog.getByText('Valid NIF')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText('+34 600 000 000')).toBeVisible()
    await expect(page.getByText('12345678Z')).toBeVisible()
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
  await expect(page.getByRole('link', { name: 'My account' })).toBeVisible()
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
    await page.getByRole('button', { name: 'Edit' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Business details' })
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'The business needs a name')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
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
    await expect(page.getByText('Add your mobile number above')).toBeVisible()
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

test('sign-in: email and password first, then Google and Microsoft underneath', async ({ page }) => {
  await page.goto('/?demo')
  const password = await page.getByLabel('Password').boundingBox()
  const google = page.getByRole('button', { name: 'Google' })
  const microsoft = page.getByRole('button', { name: 'Microsoft' })
  await expect(page.getByText('or continue with')).toBeVisible()
  expect((await google.boundingBox())!.y).toBeGreaterThan(password!.y)
  await google.click()
  await toast(page, 'Google sign-in works on the live app')
  await microsoft.click()
  await toast(page, 'Microsoft sign-in works on the live app')
})

test.describe('finances', () => {
  test('admin with pay access sees the monthly expenses from the accounts sheet and edits one', async ({ page }) => {
    await open(page, '/finances')
    await expect(page.getByRole('heading', { name: 'Finances' })).toBeVisible()
    await expect(page.getByText('18 items')).toBeVisible()
    await expect(page.getByText('Rent', { exact: true })).toBeVisible()
    await expect(page.getByText(/7[.,]?865[.,]09/).first()).toBeVisible()
    await page.getByRole('button', { name: 'Edit Broadband' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Per month').fill('30')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await toast(page, 'Expense saved')
    await expect(page.getByText(/7[.,]?875[.,]09/).first()).toBeVisible()
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
    await expect(page.getByRole('button', { name: 'Add expense' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0)

    await nav.getByRole('link', { name: 'Timecards' }).click()
    await expect(page.getByText('read-only. Download the CSV for payroll')).toBeVisible()
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

test('a message never covers a dialog\'s buttons', async ({ page }) => {
  await open(page, '/business')
  await page.getByRole('button', { name: 'Edit' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Business details' })
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await toast(page, 'The business needs a name')
  // Clickable straight away, while the message is still showing.
  await dialog.getByRole('button', { name: 'Cancel' }).click({ timeout: 2000 })
  await expect(dialog).toHaveCount(0)
})

test.describe('sports', () => {
  test('staff see the next three weeks by day, with big nights, filters and times to be confirmed', async ({ page }) => {
    await open(page, '/sports', 'maria@example.com')
    await expect(page.getByRole('heading', { name: 'Sports' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Competitions' })).toHaveCount(0) // admins choose
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

  test('partners do not get the sports page', async ({ page }) => {
    await open(page, '/sports', 'laura@gestoria.example')
    await expect(page.getByRole('link', { name: 'Sports' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Sports' })).toHaveCount(0)
  })
})

test.describe('music', () => {
  test('music is locked until you connect Spotify or YouTube Music, then shows your playlists', async ({ page }) => {
    await open(page, '/music', 'maria@example.com')
    const gate = page.getByRole('region', { name: 'Connect a music account' })
    await expect(gate.getByText('Connect to use Music')).toBeVisible()
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
    await expect(page.getByText('Connect to use Music')).toBeVisible() // Maria's account is hers
    await signInAs(page, 'maria@example.com')
    await page.getByRole('link', { name: 'Music' }).first().click()
    await page.locator('.MuiChip-deleteIcon').first().click()
    await toast(page, 'Spotify disconnected')
    await expect(page.getByText('Connect to use Music')).toBeVisible()
  })

  test('partners do not get music', async ({ page }) => {
    await open(page, '/music', 'laura@gestoria.example')
    await expect(page.getByRole('link', { name: 'Music' })).toHaveCount(0)
  })
})

test.describe('business-wide vs personal', () => {
  test('everyone has their own connections on My account: calendar link, music, Claude', async ({ page }) => {
    await open(page, '/account', 'maria@example.com')
    const mine = page.getByRole('region', { name: 'My shifts in my calendar' })
    await mine.getByRole('button', { name: 'Add my shifts to my calendar' }).click()
    await toast(page, 'Calendar link ready')
    const link = await mine.getByLabel('Calendar link').textContent()
    expect(link).toMatch(/\/cal\/[a-z0-9]{40,}\.ics$/)
    await expect(mine.getByRole('link', { name: 'Add to Google Calendar' })).toHaveAttribute('href', /calendar\.google\.com.*cid=webcal/)
    await expect(mine.getByRole('link', { name: 'Apple / Outlook' })).toHaveAttribute('href', /^webcal:/)
    await mine.getByRole('button', { name: 'Make a new link' }).click()
    await expect(mine.getByLabel('Calendar link')).not.toHaveText(link!)
    await expect(page.getByRole('region', { name: 'My music' }).getByText('Not connected')).toBeVisible()
    await expect(page.getByRole('region', { name: 'AI connector' })).toContainText('/mcp')
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
    await page.getByRole('link', { name: 'My account' }).last().click()
    await expect(page.getByRole('region', { name: 'My shifts in my calendar' })).toBeVisible()
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
  test('admin changes a day and adds a closure; staff see them read-only', async ({ page }) => {
    await open(page, '/opening-hours')
    const week = page.getByRole('region', { name: 'Weekly hours' })
    await week.getByLabel('Open on Sunday').uncheck()
    await page.getByRole('button', { name: 'Save hours' }).click()
    await toast(page, 'Opening hours saved')
    await page.getByRole('button', { name: 'Add a closure' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a closure' })
    await dialog.getByLabel('Closed from').fill('2026-10-20')
    await dialog.getByLabel('Reason (optional)').fill('Deep clean')
    await dialog.getByRole('button', { name: 'Add closure' }).click()
    await toast(page, 'Closure added')
    await expect(page.getByRole('region', { name: 'Holidays and closures' }).getByText('Closed: Deep clean')).toBeVisible()
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

test('admins pick the café\'s currency; euro until they do', async ({ page }) => {
  await open(page, '/team')
  const maria = page.getByRole('row', { name: /Maria/ })
  await expect(maria).toContainText('8,80 €/h')
  await page.getByRole('link', { name: 'Business', exact: true }).first().click()
  // Right on the Business page: a selector, euro to start with.
  const currency = page.getByRole('combobox', { name: 'Currency' })
  await expect(currency).toContainText('€ Euro')
  await currency.click()
  await page.getByRole('option', { name: /Pound sterling/ }).click()
  await toast(page, 'Currency: £ Pound sterling')
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
  await expect(favourites).toContainText('Arsenal')
  await expect(page.getByRole('button', { name: 'Remove Arsenal from favourites' }).first()).toHaveAttribute('aria-pressed', 'true')
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
  // Keyboard: pick up Team, move it up twice, drop it.
  const handle = team.getByRole('button', { name: 'Reorder Team' })
  await handle.focus()
  await page.keyboard.press('Space')
  for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(250) }
  await page.keyboard.press('Space')
  await expect.poll(names).toEqual(['Rota', 'Team', 'Time off', 'Timecards'])
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
    .toEqual(['Set-up', 'Connections', 'Alerts'])
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
    await expect(comms.getByRole('article', { name: 'Slack' })).toContainText('Coming soon')
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

    // One mailbox at a time: switching to Outlook replaces Gmail.
    await email.getByRole('button', { name: 'Switch to Outlook' }).click()
    await page.getByRole('dialog', { name: 'Switch to Outlook?' }).getByRole('button', { name: 'Switch to Outlook' }).click()
    await expect(email.getByRole('article', { name: 'Outlook' })).toContainText('Connected')
    await expect(email.getByRole('article', { name: 'Gmail' })).not.toContainText('Connected')
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
    await music.getByRole('button', { name: 'Switch to YouTube Music' }).click()
    await page.getByRole('dialog', { name: 'Switch to YouTube Music?' }).getByRole('button', { name: 'Switch to YouTube Music' }).click()
    await expect(music.getByRole('article', { name: 'YouTube Music' })).toContainText('Connected')
    await expect(music.getByRole('article', { name: 'Spotify' })).not.toContainText('Connected')
    await music.getByRole('button', { name: 'Manage YouTube Music' }).click()
    const dialog = page.getByRole('dialog', { name: 'YouTube Music' })
    await dialog.getByLabel('Approved playlist').click()
    await page.getByRole('option', { name: /Café mix/ }).click()
    await toast(page, '“Easy Beans · Café mix” is now the café playlist')
    await dialog.getByRole('button', { name: 'Close' }).click()

    await signInAs(page, 'maria@example.com')
    const card = page.locator('.MuiCard-root', { hasText: 'Café music' })
    await expect(card).toContainText('Easy Beans · Café mix')
    await expect(card).toContainText('Plays on the café device')
    await expect(card.getByRole('link', { name: 'Open playlist' })).toHaveAttribute('href', 'https://music.youtube.com/playlist?list=yt1')
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
  })
})
