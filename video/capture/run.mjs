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
  /** The set-up guide, taken slowly: a ready-made setup, each kind of business looked at, the café's apps, five connected, all set. */
  async setup() {
    const ctx = await desktop()
    const page = await openDemo(ctx, { time: TIME, path: '/setup' })
    await page.getByRole('heading', { name: /I’m your Business Agent/ }).waitFor()
    const r = new Recorder(page, 'setup', OUT)
    await r.start()
    await r.glide(980, 600, 10); await r.pause(1400)
    const ready = page.getByRole('button', { name: /^Use a ready-made setup/ })
    await r.focus(ready, 'ready-made-look', { move: true }); await r.pause(900)
    await r.click(ready, { label: 'ready-made', after: 1200 })
    // The business templates, one by one, then the café.
    for (const kind of ['Café & coffee shop', 'Restaurant & bar', 'Salon & beauty', 'Something else']) {
      const card = page.getByRole('button', { name: new RegExp(`^${kind.replace(/[&]/g, '\\&')}`) })
      const b = await r.boxOf(card)
      await r.glide(b.x + b.width / 2, b.y + b.height * 0.55, 650)
      r.mark('focus', { box: b, label: `kind-${kind}` })
      await r.pause(950)
    }
    await r.click(page.getByRole('button', { name: /^Café & coffee shop/ }), { label: 'cafe', ms: 900, after: 900 })
    await r.click(page.getByRole('button', { name: 'Next' }), { label: 'next', ms: 800, after: 1500 })
    r.mark('focus', { label: 'apps', box: await page.getByRole('heading', { name: 'Your recommended setup' }).boundingBox() })
    await r.glide(1000, 560, 700); await r.pause(1300)
    await r.scrollBy(420, 1800); await r.pause(900)
    await r.click(page.getByRole('button', { name: /^Connect \d+ apps?$/ }), { label: 'connect-all', ms: 800, after: 1100 })
    for (const app of ['Square', 'Facebook', 'TikTok', 'Google Drive', 'Gmail']) {
      await r.click(page.getByRole('button', { name: `Continue to ${app}` }), { label: `continue-${app}`, ms: 450, after: 700 })
    }
    await page.getByRole('heading', { name: /You’re all set/ }).waitFor()
    await r.focus(page.getByRole('heading', { name: /You’re all set/ }), 'all-set')
    await r.glide(1080, 420, 900); await r.pause(2400)
    await r.stop()
    await ctx.close()
  },

  /** Opening hours: closed on Sundays from now on, saved, Google Maps kept in step. Then the calendar: the bank holidays already in, Christmas added as a closure. */
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
    await page.mouse.move(820, 300)
    await page.waitForTimeout(600)
    const r = new Recorder(page, 'hours', OUT)
    r.mouse = { x: 820, y: 300 }
    await r.start()
    await r.pause(1300)
    await r.focus(page.getByRole('region', { name: 'Weekly hours' }), 'week')
    await r.click(page.getByLabel('Open on Sunday'), { label: 'sunday', ms: 1000, after: 1100 })
    await r.click(page.getByRole('button', { name: 'Save hours' }), { label: 'save', ms: 800, after: 200 })
    await toast(page, 'Opening hours saved')
    await r.pause(900)
    await r.focus(page.getByText(/Google Maps is kept in step/), 'google', { move: true })
    await r.pause(2200)
    await r.stop()

    await go(page, '/calendar')
    await page.getByRole('heading', { name: 'Calendar' }).waitFor()
    // Off camera: just the holidays and the café's own days (theme days, the routine and football hidden).
    const show = page.getByRole('group', { name: 'Show on the calendar' })
    for (const name of ['Theme days', 'Routine']) {
      const chip = show.getByRole('button', { name })
      if (await chip.count() && (await chip.getAttribute('aria-pressed')) === 'true') await chip.click()
    }
    await page.getByRole('button', { name: 'Football', exact: true }).click()
    await page.mouse.move(r.mouse.x, r.mouse.y)
    await page.waitForTimeout(800)
    const c = new Recorder(page, 'closure', OUT)
    c.mouse = r.mouse
    await c.start()
    await c.pause(900)
    // December's bank holidays are already there.
    for (const day of ['Día de la Constitución', 'Inmaculada Concepción', 'Natividad del Señor']) {
      await c.focus(page.getByText(day, { exact: false }).first(), `holiday-${day}`, { move: true })
      await c.pause(750)
    }
    await c.pause(500)
    await c.click(page.getByRole('button', { name: 'Add a closure' }), { label: 'add-closure', ms: 900, after: 900 })
    const dialog = page.getByRole('dialog', { name: 'Add a closure' })
    await c.type(dialog.getByLabel('Title'), 'Closed for Christmas', { label: 'title', delay: 70 })
    await c.click(dialog.getByLabel('From'), { label: 'from', after: 200 })
    await dialog.getByLabel('From').fill('2026-12-24'); await c.pause(600)
    await c.click(dialog.getByLabel('To (optional)'), { label: 'to', after: 200 })
    await dialog.getByLabel('To (optional)').fill('2026-12-26'); await c.pause(800)
    await c.click(dialog.getByRole('button', { name: 'Save' }), { label: 'save', after: 200 })
    await toast(page, 'Closure added')
    await page.getByRole('alert').filter({ hasText: 'Closure added' }).getByRole('button', { name: 'Close' }).click().catch(() => {})
    await c.glide(1500, 860, 900)
    await c.focus(page.getByText('Closed for Christmas').first(), 'closed-days')
    await c.pause(3200)
    await c.stop()
    await ctx.close()
  },

  /** The menu follows Square by itself: Flat White's new price on the Menu page, kept in step with Google Maps; the TV board with it. */
  async menu() {
    const ctx = await desktop()
    const page = await openDemo(ctx, { time: TIME, path: '/connections' })
    await page.getByRole('region', { name: 'Payments and sales' }).getByRole('button', { name: 'Connect Square' }).click()
    await page.getByRole('region', { name: 'Payments and sales' }).getByRole('article', { name: 'Square' }).filter({ hasText: 'Connected' }).waitFor()
    // Off camera: the menu comes from Square (it's read every hour by itself; the buttons that read it
    // or send it on by hand aren't part of the story, so they're hidden while recording).
    await go(page, '/menu')
    await page.getByRole('heading', { name: 'Menu', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Square', exact: true }).click()
    await page.getByRole('dialog', { name: 'Read the menu from Square?' }).getByRole('button', { name: 'Read from Square' }).click()
    await toast(page, /Read \d+ items from Square/)
    await page.getByRole('alert').filter({ hasText: /Read \d+ items from Square/ }).getByRole('button', { name: 'Close' }).click().catch(() => {})
    await page.evaluate(() => {
      const hide = () => document.querySelectorAll('button').forEach(b => {
        if (/^(Read from Square now|Send to Google Maps now)$/.test((b.textContent || '').trim())) b.style.visibility = 'hidden'
      })
      hide(); new MutationObserver(hide).observe(document.body, { childList: true, subtree: true })
    })
    // The TV menu board showed the old sections (Coffee, Tea & matcha); Square calls them Classics.
    await page.getByRole('tab', { name: 'Design' }).click()
    await page.getByRole('button', { name: 'Digital', exact: true }).click()
    await page.getByText('TV menu board', { exact: true }).first().click()
    await page.getByRole('group', { name: 'Sections on it' }).getByRole('button', { name: 'Classics', exact: true }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await toast(page, 'Saved')
    await page.getByRole('alert').filter({ hasText: 'Saved' }).getByRole('button', { name: 'Close' }).click().catch(() => {})
    await page.getByRole('tab', { name: 'Items' }).click()
    await page.getByRole('heading', { name: 'Menu', exact: true }).waitFor()
    await page.mouse.move(1100, 260)
    await page.waitForTimeout(1500)

    const r = new Recorder(page, 'menu', OUT)
    r.mouse = { x: 1100, y: 260 }
    await r.start()
    await r.pause(1200)
    await r.focus(page.getByText('Flat White', { exact: true }).first(), 'new-price', { move: true })
    await r.pause(1600)
    await r.focus(page.getByLabel('Menu on Google Maps'), 'google', { move: true })
    await r.pause(2200)
    await r.stop()

    await page.getByRole('tab', { name: 'Design' }).click()
    await page.getByRole('button', { name: 'Digital', exact: true }).click()
    await page.getByText('TV menu board', { exact: true }).first().click()
    await page.mouse.move(1500, 1000)
    await page.waitForTimeout(1500)
    const tv = new Recorder(page, 'tv', OUT)
    await tv.start()
    await tv.pause(2500)
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

  /** The Business advisor: what the takings, the team, the menu and the reviews say, and what to try. */
  async advisor() {
    const ctx = await desktop()
    const page = await openDemo(ctx, { time: TIME, path: '/connections' })
    // Off camera: the till connected, so the advice covers the takings too.
    await page.getByRole('region', { name: 'Payments and sales' }).getByRole('button', { name: 'Connect Square' }).click()
    await page.getByRole('region', { name: 'Payments and sales' }).getByRole('article', { name: 'Square' }).filter({ hasText: 'Connected' }).waitFor()
    await go(page, '/advisor')
    await page.getByRole('heading', { name: 'Business advisor' }).waitFor()
    await page.mouse.move(1100, 300)
    await page.waitForTimeout(2500)
    const r = new Recorder(page, 'advisor', OUT)
    r.mouse = { x: 1100, y: 300 }
    await r.start()
    await r.pause(1800)
    await r.glide(760, 360, 1100); await r.pause(1200)
    await r.scrollBy(520, 2600); await r.pause(1400)
    await r.scrollBy(520, 2600); await r.pause(1600)
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
for (const [still, clip, at] of [['web-hours', 'webhours', 5.4], ['calendar', 'closure', -0.3], ['tv', 'tv', 1.5]]) {
  if (wanted.length && !wanted.some(w => clip.startsWith(w) || (w === 'hours' && clip === 'closure') || (w === 'menu' && clip === 'tv'))) continue
  // A negative time counts back from the end of the recording.
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...(at < 0 ? ['-sseof', String(at)] : ['-ss', String(at)]), '-i', join(OUT, `${clip}.mp4`), '-frames:v', '1', join(STILLS, `${still}.png`)])
}
console.log(`Clips in ${OUT}, stills in ${STILLS} (app: ${APP})`)
