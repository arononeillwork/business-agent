// End-to-end tests in demo mode (in-memory Easy Beans data, no backend needed).
// The browser clock is fixed to Wednesday 30 Sep 2026, 09:00 in Madrid so the sample rota and
// the clock-in rules give the same results whenever the tests run.
import { expect, test, type Page } from '@playwright/test'

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

  test('sees and edits admin-only business notes', async ({ page }) => {
    await open(page, '/business')
    await expect(page.getByText('Admin-only notes')).toBeVisible()
    await expect(page.getByText('C. Pizarro, 8', { exact: false }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
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
    await page.getByRole('textbox', { name: 'Email' }).fill('nobody@example.com')
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
  // Every admin page is reachable on a phone: the rest sit under "More".
  await page.getByRole('button', { name: 'More' }).click()
  const sheet = page.getByRole('list', { name: 'More pages' })
  for (const name of ['Calendar', 'Finances', 'Partners', 'Alerts', 'Connections', 'Café tablet']) {
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
    const mine = page.locator('.MuiCard-root', { hasText: '(you)' })
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

test('sidebar starts with Business and rows can be reordered by keyboard, remembered after reload', async ({ page }) => {
  await open(page)
  const rows = page.getByRole('navigation', { name: 'Main' }).getByRole('link')
  await expect(rows.first()).toHaveText(/Business/)
  // dnd-kit announces each step to screen readers; wait for each before the next key.
  const said = (text: RegExp) => expect(page.getByText(text)).toBeAttached()
  await rows.nth(1).focus() // Today
  await page.keyboard.press('Space')
  await said(/Picked up draggable item today|item today was moved over droppable area today/i)
  await page.keyboard.press('ArrowUp')
  await said(/moved over droppable area business/)
  await page.keyboard.press('Space')
  await said(/was dropped over droppable area business/)
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
  test('admin sees Google, WhatsApp and Instagram, and compares opening hours with Google', async ({ page }) => {
    await open(page, '/connections')
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
    await expect(page.getByRole('link', { name: 'Connections' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Alerts' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Finances' })).toHaveCount(0)
    await page.goto('/connections')
    await expect(page.getByText('Google Maps & Search')).toHaveCount(0)
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
  const card = page.locator('.MuiCard-root', { hasText: 'Connections' })
  await expect(card).toContainText('Spotify')
  await expect(card).toContainText('SGAE/AGEDI')
  await card.getByLabel('Approved playlist').click()
  await page.getByRole('option', { name: /Afternoon chill/ }).click()
  await toast(page, '“Easy Beans · Afternoon chill” is now the café playlist')

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

  const card = page.locator('.MuiCard-root', { hasText: 'Lucía' })
  await card.getByRole('button', { name: 'Temporary password' }).click()
  const reset = page.getByRole('dialog', { name: 'Temporary password for Lucía' })
  await reset.getByRole('button', { name: 'Set password' }).click()
  await toast(page, 'Password set')
  await expect(reset.getByText('Account ready')).toBeVisible()
  // Admins change their own passwords; there is no reset button on admin cards.
  await expect(page.locator('.MuiCard-root', { hasText: '(you)' }).getByRole('button', { name: 'Temporary password' })).toHaveCount(0)
})

test('a message never covers a dialog\'s buttons', async ({ page }) => {
  await open(page, '/partners')
  await page.getByRole('button', { name: 'Invite partner' }).click()
  const dialog = page.getByRole('dialog', { name: 'Invite a partner' })
  await dialog.getByLabel('Contact name').fill('Nobody')
  await dialog.getByRole('textbox', { name: 'Email' }).fill('nobody@example.com')
  await dialog.getByRole('button', { name: 'Create account' }).click()
  await toast(page, /company/i)
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
