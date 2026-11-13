// Records the app scenes of the Google reviews & opening hours video ("Right on Google.", video/src/listing/):
// Easy Beans Coffee in the real app in demo mode, Square and Google Drive connected off camera as the owner
// video has them. Sunday's hours changed once on Opening hours (Google Maps is kept in step), and a review
// answered from the reply drafted for it, posted on Google. Into video/public/clips (listing-*.mp4 + .json).
//   npm run dev  (in the repo root, http://127.0.0.1:5173)
//   node video/capture/listing.mjs [scene …]      (no scene: all of them)
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP, Recorder, go, openDemo, prepare } from './lib.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'clips')
mkdirSync(OUT, { recursive: true })
/** Wednesday 9 December 2026, 09:55 in Madrid, as the other videos. */
const TIME = '2026-12-09T08:55:00Z'
const SCALE = 1.5
const DESKTOP = { width: 1440, height: 900 }

const browser = await chromium.launch({
  args: ['--lang=en-GB', `--force-device-scale-factor=${SCALE}`],
  // 24-hour times in the time fields, as a Spanish café has them.
  env: { ...process.env, LANG: 'en_GB.UTF-8', LC_ALL: 'en_GB.UTF-8', LANGUAGE: 'en_GB' },
})

async function desktop() {
  const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: SCALE, locale: 'en-GB', timezoneId: 'Europe/Madrid' })
  await prepare(ctx)
  return ctx
}
const toast = (page, text) => page.getByRole('alert').filter({ hasText: text }).first().waitFor()

/** Signed in as the owner with the till (Square) and Google Drive connected, off camera, on `path`. */
async function owner(ctx, path) {
  const page = await openDemo(ctx, { time: TIME, path: '/connections' })
  const sales = page.getByRole('region', { name: 'Payments and sales' })
  await sales.getByRole('button', { name: 'Connect Square' }).click()
  await sales.getByRole('article', { name: 'Square' }).filter({ hasText: 'Connected' }).waitFor()
  const files = page.getByRole('region', { name: 'Files and storage' })
  await files.getByRole('button', { name: 'Connect Google Drive' }).click()
  await files.getByRole('article', { name: 'Google Drive' }).filter({ hasText: 'Connected' }).waitFor()
  await go(page, path)
  return page
}

const SCENES = {
  /** Opening hours: Sunday closes at three from now on, saved once; Google Maps is kept in step. */
  async hours() {
    const ctx = await desktop()
    const page = await owner(ctx, '/opening-hours')
    await page.getByRole('heading', { name: 'Opening hours' }).waitFor()
    await page.mouse.move(1100, 300)
    await page.waitForTimeout(1500)
    const r = new Recorder(page, 'listing-hours', OUT)
    r.mouse = { x: 1100, y: 300 }
    await r.start()
    await r.pause(1300)
    const closes = page.getByLabel('Closes').nth(6)
    await r.focus(closes, 'sunday', { move: true }); await r.pause(700)
    await r.click(closes, { label: 'closes', dx: 0.18, ms: 500, after: 250 })
    await page.keyboard.type('1500', { delay: 160 }); await r.pause(800)
    await r.click(page.getByRole('button', { name: 'Save hours' }), { label: 'save', ms: 800, after: 200 })
    await toast(page, 'Opening hours saved')
    await r.pause(900)
    await r.focus(page.getByText(/Kept in step by itself/), 'google', { move: true })
    await r.pause(2400)
    await r.stop()
    await ctx.close()
  },

  /** Reviews: Tom's review, a reply drafted in his language, made personal, posted on Google. */
  async reviews() {
    const ctx = await desktop()
    const page = await owner(ctx, '/reviews')
    await page.getByRole('heading', { name: 'Reviews', level: 1 }).waitFor()
    await page.mouse.move(1100, 300)
    await page.waitForTimeout(1500)
    const v = new Recorder(page, 'listing-reviews', OUT)
    v.mouse = { x: 1100, y: 300 }
    await v.start()
    await v.pause(1300)
    const review = page.getByText('Coffee was good but we waited 20 minutes').first()
    await review.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await v.pause(1300)
    await v.focus(review, 'review', { move: true }); await v.pause(1400)
    const card = page.locator('article, li, [class*="MuiCard"], div').filter({ has: review }).filter({ has: page.getByRole('button', { name: 'Reply' }) }).last()
    await v.click(card.getByRole('button', { name: 'Reply' }), { label: 'reply', ms: 700, after: 1300 })
    const box = page.getByLabel(/^Reply to /)
    await v.focus(box, 'draft', { move: true }); await v.pause(1800)
    await v.click(page.getByRole('button', { name: 'Post reply' }), { label: 'post', ms: 800, after: 200 })
    await toast(page, 'Reply posted on Google')
    await v.pause(2200)
    await v.stop()
    await ctx.close()
  },
}

const wanted = process.argv.slice(2)
for (const [name, scene] of Object.entries(SCENES)) {
  if (wanted.length && !wanted.includes(name)) continue
  console.log(`▶ ${name}`)
  try { await scene() } catch (e) {
    // What the page looked like when it went wrong (VIDEO_DEBUG=folder).
    if (process.env.VIDEO_DEBUG) for (const c of browser.contexts()) for (const [i, p] of c.pages().entries()) await p.screenshot({ path: join(process.env.VIDEO_DEBUG, `listing-${name}-${i}.png`) }).catch(() => {})
    throw e
  }
}
await browser.close()
console.log(`Clips in ${OUT} (app: ${APP})`)
