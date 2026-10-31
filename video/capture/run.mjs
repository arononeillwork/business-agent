// Records every app scene of the landing video from the real app in demo mode (Easy Beans' sample
// data), and the café's own website, into video/public/clips (<scene>.mp4 + <scene>.json).
//   npm run dev  (in the repo root, http://127.0.0.1:5173)
//   node video/capture/run.mjs [scene …]      (no scene: all of them)
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP, Recorder, go, openDemo, prepare } from './lib.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'clips')
mkdirSync(OUT, { recursive: true })
const SITE = 'https://www.easybeanscoffee.com'
/** Wednesday 9 December 2026, 09:55 in Madrid: Christmas coming, Maria's shift at 10:00. */
const TIME = '2026-12-09T08:55:00Z'
const SCALE = 1.5
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 393, height: 852 }

const browser = await chromium.launch({
  args: ['--lang=en-GB', `--force-device-scale-factor=${SCALE}`],
  // 24-hour times and day/month dates in the time and date fields, as a Spanish café has them.
  env: { ...process.env, LANG: 'en_GB.UTF-8', LC_ALL: 'en_GB.UTF-8', LANGUAGE: 'en_GB' },
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined,
})

async function desktop(opts = {}) {
  const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: SCALE, locale: 'en-GB', timezoneId: 'Europe/Madrid', ...opts })
  await prepare(ctx)
  return ctx
}
async function phone() {
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, locale: 'en-GB', timezoneId: 'Europe/Madrid' })
  await prepare(ctx)
  return ctx
}
const toast = (page, text) => page.getByRole('alert').filter({ hasText: text }).first().waitFor()

const SCENES = {
  /** The set-up guide: a café's ready-made setup, five apps connected one after another, all set. */
  async setup() {
    const ctx = await desktop()
    const page = await openDemo(ctx, { time: TIME, path: '/setup' })
    await page.getByRole('heading', { name: /I’m your Business Agent/ }).waitFor()
    const r = new Recorder(page, 'setup', OUT)
    await r.start()
    await r.glide(900, 520, 10); await r.pause(500)
    await r.click(page.getByRole('button', { name: /^Use a ready-made setup/ }), { label: 'ready-made', after: 700 })
    await r.click(page.getByRole('button', { name: /^Café & coffee shop/ }), { label: 'cafe', after: 500 })
    await r.click(page.getByRole('button', { name: 'Next' }), { label: 'next', after: 900 })
    r.mark('focus', { label: 'apps', box: await page.getByRole('heading', { name: 'Your recommended setup' }).boundingBox() })
    await r.glide(1000, 600, 600)
    await r.scrollBy(420, 1100); await r.pause(400)
    await r.click(page.getByRole('button', { name: /^Connect \d+ apps?$/ }), { label: 'connect-all', after: 700 })
    for (const app of ['Square', 'Facebook', 'TikTok', 'Google Drive', 'Gmail']) {
      await r.click(page.getByRole('button', { name: `Continue to ${app}` }), { label: `continue-${app}`, ms: 380, after: 520 })
    }
    await page.getByRole('heading', { name: /You’re all set/ }).waitFor()
    await r.focus(page.getByRole('heading', { name: /You’re all set/ }), 'all-set')
    await r.glide(1080, 420, 700); await r.pause(1400)
    await r.stop()
    await ctx.close()
  },

  /** Opening hours: closed on Sundays from now on; saved, and Google Maps kept in step. Then Christmas, from the calendar. */
  async hours() {
    const ctx = await desktop()
    const page = await openDemo(ctx, { time: TIME, path: '/opening-hours' })
    await page.getByRole('heading', { name: 'Opening hours' }).waitFor()
    // Off camera: the café's real hours (Monday to Saturday 9 to 3), with Sundays still open for now.
    for (let i = 0; i < 7; i++) {
      await page.getByLabel('Opens').nth(i).fill('09:00')
      await page.getByLabel('Closes').nth(i).fill(i === 6 ? '14:00' : '15:00')
    }
    await page.getByRole('button', { name: 'Save hours' }).click()
    await toast(page, 'Opening hours saved')
    await page.getByRole('alert').filter({ hasText: 'Opening hours saved' }).getByRole('button', { name: 'Close' }).click()
    await page.getByRole('alert').filter({ hasText: 'Opening hours saved' }).waitFor({ state: 'detached' })
    await page.mouse.move(800, 420)
    await page.waitForTimeout(600)
    const r = new Recorder(page, 'hours', OUT)
    await r.start()
    await r.glide(800, 420, 10); await r.pause(400)
    await r.focus(page.getByRole('region', { name: 'Weekly hours' }), 'week')
    await r.click(page.getByLabel('Open on Sunday'), { label: 'sunday', after: 700 })
    await r.click(page.getByRole('button', { name: 'Save hours' }), { label: 'save', after: 200 })
    await toast(page, 'Opening hours saved')
    await r.pause(600)
    await r.focus(page.getByText(/Google Maps is kept in step/), 'google', { move: true })
    await r.pause(1500)
    await r.stop()

    await go(page, '/calendar')
    await page.getByRole('heading', { name: 'Calendar' }).waitFor()
    await page.waitForTimeout(600)
    const c = new Recorder(page, 'closure', OUT)
    c.mouse = r.mouse
    await c.start()
    await c.pause(300)
    await c.click(page.getByRole('button', { name: 'Add a closure' }), { label: 'add-closure', after: 600 })
    const dialog = page.getByRole('dialog', { name: 'Add a closure' })
    await c.type(dialog.getByLabel('Title'), 'Closed for Christmas', { label: 'title', delay: 55 })
    await c.click(dialog.getByLabel('From'), { label: 'from', after: 150 })
    await dialog.getByLabel('From').fill('2026-12-24'); await c.pause(350)
    await c.click(dialog.getByLabel('To (optional)'), { label: 'to', after: 150 })
    await dialog.getByLabel('To (optional)').fill('2026-12-26'); await c.pause(450)
    await c.focus(dialog.getByText(/shows as closed on Google Maps/), 'helper')
    await c.pause(500)
    await c.click(dialog.getByRole('button', { name: 'Save' }), { label: 'save', after: 200 })
    await toast(page, 'Closure added')
    await c.pause(500)
    await c.focus(page.getByText('Closed for Christmas').first(), 'closed-days', { move: true })
    await c.pause(1500)
    await c.stop()
    await ctx.close()
  },

  /** The menu follows Square: read from the till, Flat White's new price, the printed menu and the TV with it. */
  async menu() {
    const ctx = await desktop()
    const page = await openDemo(ctx, { time: TIME, path: '/connections' })
    await page.getByRole('region', { name: 'Payments and sales' }).getByRole('button', { name: 'Connect Square' }).click()
    await page.getByRole('region', { name: 'Payments and sales' }).getByRole('article', { name: 'Square' }).filter({ hasText: 'Connected' }).waitFor()
    await go(page, '/menu')
    await page.getByRole('heading', { name: 'Menu', exact: true }).waitFor()
    await page.waitForTimeout(500)
    const r = new Recorder(page, 'menu', OUT)
    await r.start()
    await r.glide(1100, 300, 10); await r.pause(300)
    await r.focus(page.getByText('Flat white', { exact: true }).first(), 'old-price', { move: true })
    await r.pause(700)
    await r.click(page.getByRole('button', { name: 'Square', exact: true }), { label: 'square', after: 700 })
    const dialog = page.getByRole('dialog', { name: 'Read the menu from Square?' })
    await r.focus(dialog, 'dialog')
    await r.click(dialog.getByRole('button', { name: 'Read from Square' }), { label: 'read', after: 200 })
    await toast(page, /Read \d+ items from Square/)
    await r.pause(700)
    const card = page.getByText('Flat White', { exact: true }).first()
    await r.focus(card, 'new-price', { move: true })
    await r.pause(1600)
    await r.stop()

    // Off camera: the TV menu board showed the old sections (Coffee, Tea & matcha); Square calls them Classics.
    await page.getByRole('alert').filter({ hasText: /Read \d+ items from Square/ }).getByRole('button', { name: 'Close' }).click().catch(() => {})
    await page.getByRole('tab', { name: 'Design' }).click()
    await page.getByRole('button', { name: 'Digital', exact: true }).click()
    await page.getByText('TV menu board', { exact: true }).first().click()
    await page.getByRole('group', { name: 'Sections on it' }).getByRole('button', { name: 'Classics', exact: true }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await toast(page, 'Saved')
    await page.getByRole('alert').filter({ hasText: 'Saved' }).getByRole('button', { name: 'Close' }).click().catch(() => {})
    await page.getByRole('button', { name: 'Physical', exact: true }).click()
    await page.getByText('Drinks menu', { exact: true }).first().click()
    await page.getByRole('tab', { name: 'Items' }).click()
    await page.waitForTimeout(800)
    await page.mouse.move(r.mouse.x, r.mouse.y)

    const p = new Recorder(page, 'print', OUT)
    p.mouse = r.mouse
    await p.start()
    await p.click(page.getByRole('tab', { name: 'Design' }), { label: 'design', after: 1200 })
    await p.focus(page.getByRole('img', { name: 'Preview of the printed menu' }), 'drinks')
    await p.glide(990, 720, 800)
    await p.pause(1800)
    await p.stop()

    const tv = new Recorder(page, 'tv', OUT)
    tv.mouse = p.mouse
    await tv.start()
    await tv.click(page.getByRole('button', { name: 'Digital', exact: true }), { label: 'digital', after: 600 })
    await tv.click(page.getByText('TV menu board', { exact: true }).first(), { label: 'board', after: 900 })
    await tv.focus(page.getByRole('img', { name: 'Preview of the screen menu' }), 'board')
    await tv.click(page.getByRole('button', { name: 'Full screen' }), { label: 'fullscreen', after: 300 })
    await page.mouse.move(1500, 1000)
    await tv.pause(3200)
    await tv.stop()
    await ctx.close()
  },

  /** An employee on her phone: today's shift, clocked in with one tap. */
  async clockin() {
    const ctx = await phone()
    const page = await openDemo(ctx, { email: 'maria@example.com', time: TIME })
    await page.getByRole('heading', { name: 'Hola, Maria' }).waitFor()
    const r = new Recorder(page, 'clockin', OUT)
    await r.start()
    await r.pause(900)
    await r.tap(page.getByRole('button', { name: 'Clock in' }), { label: 'clock-in', after: 200 })
    await toast(page, 'Clocked in')
    await r.pause(1600)
    await r.tap(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Rota' }), { label: 'rota', after: 1800 })
    await r.stop()
    await ctx.close()
  },

  /** The owner's morning: Today at a glance. */
  async today() {
    const ctx = await desktop()
    const page = await openDemo(ctx, { time: TIME })
    await page.getByRole('heading', { name: 'Hola, Aron' }).waitFor()
    await page.waitForTimeout(800)
    const r = new Recorder(page, 'today', OUT)
    await r.start()
    await r.glide(900, 380, 10); await r.pause(600)
    await r.scrollBy(520, 1600); await r.pause(600)
    await r.scrollBy(520, 1600); await r.pause(900)
    await r.stop()
    await ctx.close()
  },

  /** The café's own website: the opening hours (Sundays closed), as the app has them. */
  async webhours() {
    const ctx = await desktop()
    const page = await ctx.newPage()
    await page.goto(`${SITE}/en`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'No thanks' }).click().catch(() => {})
    await page.waitForTimeout(800)
    const r = new Recorder(page, 'webhours', OUT)
    await r.start()
    await r.glide(980, 520, 10); await r.pause(300)
    const hours = page.getByText('Sunday', { exact: true }).last()
    await hours.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await r.pause(2400)
    await r.focus(hours, 'sunday')
    await r.pause(1600)
    await r.stop()
    await ctx.close()
  },

  /** Click & collect on the café's website, on a phone: Flat White at the till's new price. */
  async weborder() {
    const ctx = await phone()
    const page = await ctx.newPage()
    await page.goto(`${SITE}/en/order`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'No thanks' }).click().catch(() => {})
    await page.waitForTimeout(1000)
    const r = new Recorder(page, 'weborder', OUT)
    await r.start()
    await r.pause(1200)
    const add = page.getByRole('button', { name: /Add to order/ }).first()
    await r.focus(add, 'add')
    await r.tap(add, { label: 'add', after: 1800 })
    await r.stop()
    await ctx.close()
  },
}

const wanted = process.argv.slice(2)
for (const [name, scene] of Object.entries(SCENES)) {
  if (wanted.length && !wanted.includes(name)) continue
  console.log(`▶ ${name}`)
  await scene()
}
await browser.close()

// The stills the "changed everywhere" cards are cut from: a moment of a recording each (the cursor out of the way).
const STILLS = join(OUT, '..', 'stills')
mkdirSync(STILLS, { recursive: true })
for (const [still, clip, at] of [['web-hours', 'webhours', 5.4], ['calendar', 'closure', 15.2], ['print', 'print', 3.0], ['tv', 'tv', 5.9]]) {
  if (wanted.length && !wanted.some(w => clip.startsWith(w) || (w === 'hours' && clip === 'closure') || (w === 'menu' && ['print', 'tv'].includes(clip)))) continue
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(at), '-i', join(OUT, `${clip}.mp4`), '-frames:v', '1', join(STILLS, `${still}.png`)])
}
console.log(`Clips in ${OUT}, stills in ${STILLS} (app: ${APP})`)
