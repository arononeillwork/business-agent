import { defineConfig, devices } from '@playwright/test'

// E2E tests drive the real app in a browser.
//   demo.spec.ts  – in-memory demo data, runs anywhere:      npm run test:e2e
//   live.spec.ts  – real Supabase logins and AI connector:   npm run test:e2e:live
//                   needs SUPABASE_SERVICE_ROLE_KEY; E2E_BASE_URL tests a deployed copy.
// PW_CHROMIUM lets a machine with a preinstalled Chromium skip `npx playwright install`.
// HTTPS_PROXY (if set) is used by the browser for outside hosts such as Supabase.
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173'
const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
const proxy = process.env.HTTPS_PROXY
  ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' }
  : undefined

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
    launchOptions,
    proxy,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions }, grepInvert: /@phone/ },
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions }, grep: /@phone/ },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npx vite --port 5173 --host 127.0.0.1',
    url: 'http://127.0.0.1:5173/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
