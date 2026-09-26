// Smoke tests for the deployed app: is it up, can people reach the sign-in screen, and does
// Supabase have every sign-in method switched on? Run by the uptime monitor every 15 minutes.
//   E2E_BASE_URL=https://app.example.com npx playwright test e2e/smoke.spec.ts --project desktop
// Optional: SMOKE_EMAIL + SMOKE_PASSWORD (a low-privilege test account) also signs in for real.
// EXPECT_PROVIDERS (default "email,google,microsoft") lists the sign-in methods that must be on.
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

test('the sign-in screen loads with email, Google and Microsoft', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Google' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Microsoft' })).toBeVisible()
  expect(errors).toEqual([])
})

test('the AI connector publishes its OAuth metadata', async ({ request }) => {
  const res = await request.get('/.well-known/oauth-authorization-server')
  expect(res.status()).toBe(200)
  expect((await res.json()).authorization_endpoint).toBeTruthy()
})

test('a real account can sign in', async ({ page }) => {
  test.skip(!process.env.SMOKE_EMAIL || !process.env.SMOKE_PASSWORD, 'Set SMOKE_EMAIL and SMOKE_PASSWORD')
  await page.goto('/')
  await page.getByLabel('Email').fill(process.env.SMOKE_EMAIL!)
  await page.getByLabel('Password').fill(process.env.SMOKE_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign out' }).first()).toBeVisible({ timeout: 15_000 })
})
