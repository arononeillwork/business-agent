// Smoke tests for the deployed app: is it up, can people reach the sign-in screen, and does
// Supabase have every sign-in method switched on? Run by the uptime monitor every 15 minutes.
//   E2E_BASE_URL=https://app.example.com npx playwright test e2e/smoke.spec.ts --project desktop
// Optional: SMOKE_EMAIL + SMOKE_PASSWORD (a low-privilege test account) also signs in for real.
// EXPECT_PROVIDERS (default "email,google,microsoft") lists the sign-in methods that must be on
// (facebook and apple can be added once they are set up).
import { expect, test } from '@playwright/test'

test.skip(!process.env.E2E_BASE_URL, 'Set E2E_BASE_URL to the deployed app')

test('the Worker answers and Supabase is reachable', async ({ request }) => {
  const res = await request.get('/api/health?deep=1')
  const body = await res.json()
  expect(res.status(), JSON.stringify(body)).toBe(200)
  expect(body.supabase).toBe('up')
  for (const p of (process.env.EXPECT_PROVIDERS || 'email,google,microsoft').split(',').map(s => s.trim()).filter(Boolean)) {
    expect(body.sign_in?.[p], `${p} sign-in is switched off in Supabase`).toBe(true)
  }
})

test('the sign-in screen loads with email and every switched-on outside sign-in', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const on = (await (await request.get('/api/health?deep=1')).json()).sign_in ?? {}
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  for (const [label, key] of [['Google', 'google'], ['Apple', 'apple'], ['Facebook', 'facebook'], ['Microsoft', 'microsoft']]) {
    // Methods that are off are left out, so nobody lands on a provider's error page.
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(on[key] ? 1 : 0)
  }
  expect(errors).toEqual([])
})

test('the pricing page shows the plans and the free trial', async ({ page }) => {
  await page.goto('/pricing')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('article', { name: /plan$/ })).toHaveCount(4)
  await expect(page.getByText(/months free/).first()).toBeVisible()
})

// Clicking an outside sign-in button must reach that provider's real sign-in page (not its error
// page), sending people back to our Supabase project. If the method isn't switched on, the button
// is left off the page, and the run is flagged loudly. When the keys are in the repo secrets but
// Supabase still has the method off, that's a failure.
const SUPABASE_CALLBACK = 'https://lhakrmmoxaareykglmtx.supabase.co/auth/v1/callback'
for (const [label, key, hosts, secret, problems] of [
  ['Google', 'google', /(^|\.)accounts\.google\.com$/, 'GOOGLE_CLIENT_ID',
    /redirect_uri_mismatch|invalid_client|OAuth client was not found|Access blocked|Error 400|Error 401|deleted_client|disabled_client/i],
  ['Microsoft', 'microsoft', /(^|\.)(login\.microsoftonline\.com|login\.live\.com)$/, 'AZURE_CLIENT_ID',
    /AADSTS\d+|unauthorized_client|invalid_request/i],
  ['Facebook', 'facebook', /(^|\.)facebook\.com$/, 'META_APP_ID',
    /URL blocked|URL Blocked|Can't load URL|App not active|Invalid App ID|isn't available/i],
  ['Apple', 'apple', /(^|\.)appleid\.apple\.com$/, 'APPLE_CLIENT_ID', /invalid_client|invalid_request/i],
] as const) {
  test(`the ${label} button reaches ${label} sign-in (or says it isn't set up)`, async ({ page, request }) => {
    const on = (await (await request.get('/api/health?deep=1')).json()).sign_in?.[key]
    await page.goto('/')
    const button = page.getByRole('button', { name: label, exact: true })
    if (!on) {
      // Facebook can be switched off with the FACEBOOK_SIGN_IN=off repo variable, so its keys alone aren't a failure.
      if (key !== 'facebook') expect(process.env[secret], `${secret} is in the repo secrets, but ${label} sign-in is still off in Supabase`).toBeFalsy()
      const note = `${label} sign-in is OFF on the live site (docs/sign-in-setup.md).`
      console.log(`::warning::${note}`)
      test.info().annotations.push({ type: 'warning', description: note })
      await expect(button).toHaveCount(0)
      return
    }
    await button.click()
    await page.waitForURL(url => hosts.test(new URL(url).hostname), { timeout: 15_000 })
    // The provider must be told to send people back to our Supabase project…
    // (Google nests the address a few times over, so decode until it stops changing.)
    let target = page.url()
    for (let i = 0; i < 4; i++) { const next = decodeURIComponent(target); if (next === target) break; target = next }
    expect(target, `${label} isn't sending people back to Supabase`).toContain(SUPABASE_CALLBACK)
    // …and must show its sign-in form, not an error about our app's setup.
    await expect(page.locator('body')).not.toContainText(problems, { timeout: 5_000 })
    const res = await page.reload().catch(() => null)
    expect(res?.status() ?? 200, `${label} sign-in page answered with an error`).toBeLessThan(400)
    await expect(page.locator('body')).not.toContainText(problems)
  })
}

test('the AI connector publishes its OAuth metadata', async ({ request }) => {
  const res = await request.get('/.well-known/oauth-authorization-server')
  expect(res.status()).toBe(200)
  expect((await res.json()).authorization_endpoint).toBeTruthy()
})

test('a real account can sign in', async ({ page }) => {
  test.skip(!process.env.SMOKE_EMAIL || !process.env.SMOKE_PASSWORD, 'Set SMOKE_EMAIL and SMOKE_PASSWORD')
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Email' }).fill(process.env.SMOKE_EMAIL!)
  await page.getByLabel('Password').fill(process.env.SMOKE_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign out' }).first()).toBeVisible({ timeout: 15_000 })
})

test('the brand page can list Google Fonts', async ({ request }) => {
  const res = await request.get('/api/fonts')
  expect(res.status()).toBe(200)
  const body = await res.json() as { source: string; fonts: { family: string }[] }
  expect(body.fonts.length).toBeGreaterThan(40)
  expect(body.fonts.some(f => f.family === 'Poppins')).toBe(true)
  console.log(`Font list: ${body.fonts.length} families from ${body.source}`)
})
