// Records the app scenes of the third landing video, "Run your café from one place" (video/src/owner/):
// the owner's morning in the real app in demo mode (Easy Beans' sample data, Square connected so the
// advisor reads the takings). Today and the Business advisor say what to do; each change is made once
// (Sunday's hours, a price, the last-day offer's story, a review's reply); the café's TV and its printed
// menu show the new price. Into video/public/clips (owner-*.mp4 + .json) and video/public/stills.
//   npm run dev  (in the repo root, http://127.0.0.1:5173)
//   node video/capture/owner.mjs [scene …]      (no scene: all of them)
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP, Recorder, go, openDemo, prepare } from './lib.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'clips')
const STILLS = join(OUT, '..', 'stills')
mkdirSync(OUT, { recursive: true })
mkdirSync(STILLS, { recursive: true })
/** Wednesday 9 December 2026, 09:55 in Madrid, as the other videos. */
const TIME = '2026-12-09T08:55:00Z'
const SCALE = 1.5
const DESKTOP = { width: 1440, height: 900 }
/** The café's TV: 16:9, recorded at 1920 × 1080. */
const TV = { width: 1600, height: 900 }
const SCREEN = '/display/c0ffee00beef00c0ffee00beef00cafe'

const browser = await chromium.launch({
  args: ['--lang=en-GB', `--force-device-scale-factor=${SCALE}`],
  // 24-hour times and day/month dates in the time and date fields, as a Spanish café has them.
  env: { ...process.env, LANG: 'en_GB.UTF-8', LC_ALL: 'en_GB.UTF-8', LANGUAGE: 'en_GB' },
})

async function desktop(viewport = DESKTOP, scale = SCALE) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, locale: 'en-GB', timezoneId: 'Europe/Madrid' })
  await prepare(ctx)
  return ctx
}
const toast = (page, text) => page.getByRole('alert').filter({ hasText: text }).first().waitFor()
const closeToast = async (page, text) => {
  await page.getByRole('alert').filter({ hasText: text }).getByRole('button', { name: 'Close' }).click().catch(() => {})
  await page.getByRole('alert').filter({ hasText: text }).waitFor({ state: 'detached' }).catch(() => {})
}

/** Signed in as the owner with the till (Square) connected, off camera, on `path`. */
async function owner(ctx, path) {
  const page = await openDemo(ctx, { time: TIME, path: '/connections' })
  const sales = page.getByRole('region', { name: 'Payments and sales' })
  await sales.getByRole('button', { name: 'Connect Square' }).click()
  await sales.getByRole('article', { name: 'Square' }).filter({ hasText: 'Connected' }).waitFor()
  // And Google Drive, where the story's picture waits for Instagram.
  const files = page.getByRole('region', { name: 'Files and storage' })
  await files.getByRole('button', { name: 'Connect Google Drive' }).click()
  await files.getByRole('article', { name: 'Google Drive' }).filter({ hasText: 'Connected' }).waitFor()
  await go(page, path)
  return page
}

/** An advisor finding's "Open page" link. */
const finding = (page, title, where = 'Worth acting on first') =>
  page.getByRole('region', { name: where }).getByRole('article', { name: title })

/** Off camera: Pain au chocolat to €2.90 on Menu costing. */
async function newPrice(page) {
  await go(page, '/recipes')
  await page.getByRole('heading', { name: 'Menu costing' }).waitFor()
  await page.getByRole('row', { name: 'Pain au chocolat' }).click()
  await page.getByLabel('Menu price, with IVA').fill('2.90')
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await toast(page, 'Saved')
  await closeToast(page, 'Saved')
}

const SCENES = {
  /** Today, the owner's first page: the day at a glance and the advisor's first tip; then everything the advisor found. */
  async today() {
    const ctx = await desktop()
    const page = await owner(ctx, '/')
    await page.getByRole('heading', { name: 'Hola, Aron' }).waitFor()
    await page.mouse.move(980, 260)
    await page.waitForTimeout(1500)
    const r = new Recorder(page, 'owner-today', OUT)
    r.mouse = { x: 980, y: 260 }
    await r.start()
    await r.pause(1200)
    const glance = page.getByRole('region', { name: 'At a glance' })
    await r.focus(glance.getByRole('region', { name: 'Takings today' }), 'takings', { move: true }); await r.pause(900)
    await r.focus(glance.getByRole('region', { name: 'Low on stock' }), 'stock', { move: true }); await r.pause(900)
    await r.focus(glance.getByRole('region', { name: 'Jobs to do' }), 'jobs', { move: true }); await r.pause(900)
    await r.scrollBy(330, 1300); await r.pause(500)
    const tip = page.getByRole('region', { name: 'Business advisor' }).getByRole('article').first()
    await r.focus(tip, 'tip', { move: true }); await r.pause(1800)
    await r.click(page.getByRole('button', { name: 'Everything the advisor found' }).or(page.getByRole('link', { name: 'Everything the advisor found' })),
      { label: 'advisor', ms: 900, after: 300 })
    await page.getByRole('heading', { name: 'Business advisor' }).waitFor()
    r.mark('focus', { label: 'advisor-page' })
    await r.pause(1400)
    for (const [i, a] of (await page.getByRole('region', { name: 'Worth acting on first' }).getByRole('article').all()).entries()) {
      await r.focus(a, `first-${i}`, { move: true }); await r.pause(800)
    }
    await r.scrollBy(560, 2200); await r.pause(900)
    await r.focus(page.getByRole('region', { name: 'The menu', exact: true }), 'menu-group', { move: true }); await r.pause(900)
    await r.focus(page.getByRole('region', { name: 'Stock and waste' }), 'waste-group', { move: true }); await r.pause(900)
    await r.scrollBy(560, 2200); await r.pause(700)
    await r.focus(page.getByRole('region', { name: 'Reviews', exact: true }), 'reviews-group', { move: true }); await r.pause(1600)
    await r.stop()
    await ctx.close()
  },

  /**
   * The advisor's tips acted on, one after another in the same morning: Sunday closes an hour earlier
   * (Google Maps kept in step), Pain au chocolat's price up to reach its margin, the last-day offer's
   * story, a review answered.
   */
  async fixes() {
    const ctx = await desktop()
    const page = await owner(ctx, '/advisor')
    await page.getByRole('heading', { name: 'Business advisor' }).waitFor()
    await page.mouse.move(1100, 300)
    await page.waitForTimeout(1500)

    // Opening hours: "Closing an hour earlier could pay" → Sunday closes at 15:00.
    const h = new Recorder(page, 'owner-hours', OUT)
    h.mouse = { x: 1100, y: 300 }
    await h.start()
    await h.pause(900)
    const quiet = finding(page, 'Closing an hour earlier could pay')
    await h.focus(quiet, 'tip', { move: true }); await h.pause(1300)
    await h.click(quiet.getByRole('link', { name: 'Open page' }), { label: 'open', ms: 800, after: 300 })
    await page.getByRole('heading', { name: 'Opening hours' }).waitFor()
    h.mark('focus', { label: 'hours-page' })
    await h.pause(1100)
    const closes = page.getByLabel('Closes').nth(6)
    await h.focus(closes, 'sunday', { move: true }); await h.pause(500)
    await h.click(closes, { label: 'closes', dx: 0.18, ms: 500, after: 250 })
    await page.keyboard.type('1500', { delay: 160 }); await h.pause(700)
    await h.click(page.getByRole('button', { name: 'Save hours' }), { label: 'save', ms: 800, after: 200 })
    await toast(page, 'Opening hours saved')
    await h.pause(900)
    await h.focus(page.getByText(/Google Maps is kept in step/), 'google', { move: true })
    await h.pause(2200)
    await h.stop()
    await closeToast(page, 'Opening hours saved')

    // The menu: "Some prices don't reach your margin" → Pain au chocolat at €2.90.
    await go(page, '/advisor')
    await page.getByRole('heading', { name: 'Business advisor' }).waitFor()
    const margin = finding(page, 'Some prices don’t reach your margin', 'The menu')
    await margin.evaluate(el => el.scrollIntoView({ block: 'center' }))
    await page.mouse.move(1100, 300)
    await page.waitForTimeout(1200)
    const p = new Recorder(page, 'owner-price', OUT)
    p.mouse = { x: 1100, y: 300 }
    await p.start()
    await p.pause(900)
    await p.focus(margin, 'tip', { move: true }); await p.pause(1300)
    await p.click(margin.getByRole('link', { name: 'Open page' }), { label: 'open', ms: 800, after: 300 })
    await page.getByRole('heading', { name: 'Menu costing' }).waitFor()
    p.mark('focus', { label: 'costing-page' })
    await p.pause(1200)
    const row = page.getByRole('row', { name: 'Pain au chocolat' })
    await p.focus(row, 'row', { move: true }); await p.pause(700)
    await p.click(row, { label: 'item', dx: 0.2, ms: 500, after: 900 })
    await p.type(page.getByLabel('Menu price, with IVA'), '2.90', { label: 'price', delay: 140 }); await p.pause(800)
    await p.click(page.getByRole('dialog').getByRole('button', { name: 'Save' }), { label: 'save', ms: 800, after: 200 })
    await toast(page, 'Saved')
    await p.pause(700)
    await p.focus(page.getByRole('row', { name: 'Pain au chocolat' }), 'after', { move: true })
    await p.pause(2200)
    await p.stop()
    await closeToast(page, 'Saved')

    // Leftovers: today's croissants already on offer by themselves (the last-day rule), and its story.
    await go(page, '/offers')
    await page.getByRole('heading', { name: 'Offers & specials' }).waitFor()
    await page.mouse.move(1100, 300)
    await page.waitForTimeout(1200)
    const o = new Recorder(page, 'owner-offer', OUT)
    o.mouse = { x: 1100, y: 300 }
    await o.start()
    await o.pause(1000)
    await o.focus(page.getByText('Automatic: last day').first(), 'automatic', { move: true }); await o.pause(1100)
    await o.focus(page.getByText(/On Counter TV/).first(), 'tv', { move: true }); await o.pause(1000)
    await o.click(page.getByRole('button', { name: 'Make its story' }).first(), { label: 'story', ms: 800, after: 300 })
    const composer = page.getByRole('dialog')
    await composer.getByRole('button', { name: /^(Schedule|Post now|Set reminder|Add to my list)$/ }).waitFor()
    await page.waitForTimeout(1200)
    o.mark('focus', { label: 'composer' })
    const picture = composer.locator('img').first()
    await picture.waitFor()
    await page.waitForTimeout(600)
    await o.focus(picture, 'picture', { move: true }); await o.pause(1800)
    // The story's own picture, for the phone in the video.
    const src = await picture.evaluate(async el => {
      const img = el.tagName === 'IMG' ? el : el.querySelector('img')
      if (!img) return null
      const blob = await (await fetch(img.src)).blob()
      return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob) })
    }).catch(() => null)
    if (src) writeFileSync(join(STILLS, 'owner-story.png'), Buffer.from(String(src).split(',')[1], 'base64'))
    await o.click(composer.getByRole('button', { name: /^(Schedule|Post now|Set reminder|Add to my list)$/ }), { label: 'schedule', ms: 800, after: 1400 })
    await o.pause(1400)
    await o.stop()

    // Reviews: "Reviews waiting for a reply" → a starting point in the review's language, made personal, posted.
    await go(page, '/advisor')
    await page.getByRole('heading', { name: 'Business advisor' }).waitFor()
    const reviews = finding(page, 'Reviews waiting for a reply', 'Reviews')
    await reviews.evaluate(el => el.scrollIntoView({ block: 'center' }))
    await page.mouse.move(1100, 300)
    await page.waitForTimeout(1200)
    const v = new Recorder(page, 'owner-reviews', OUT)
    v.mouse = { x: 1100, y: 300 }
    await v.start()
    await v.pause(900)
    await v.focus(reviews, 'tip', { move: true }); await v.pause(1200)
    await v.click(reviews.getByRole('link', { name: 'Open page' }), { label: 'open', ms: 800, after: 300 })
    await page.getByRole('heading', { name: 'Reviews' }).waitFor()
    v.mark('focus', { label: 'reviews-page' })
    await v.pause(900)
    const review = page.getByText('Coffee was good but we waited 20 minutes').first()
    await review.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await v.pause(1300)
    await v.focus(review, 'review', { move: true }); await v.pause(1300)
    const card = page.locator('article, li, [class*="MuiCard"], div').filter({ has: review }).filter({ has: page.getByRole('button', { name: 'Reply' }) }).last()
    await v.click(card.getByRole('button', { name: 'Reply' }), { label: 'reply', ms: 700, after: 1300 })
    const box = page.getByLabel(/^Reply to /)
    await v.focus(box, 'draft', { move: true }); await v.pause(1600)
    await v.click(page.getByRole('button', { name: 'Post reply' }), { label: 'post', ms: 800, after: 200 })
    await toast(page, 'Reply posted on Google')
    await v.pause(2000)
    await v.stop()
    await ctx.close()
  },

  /** The café's TV, full screen: the new price on its menu board (with the bakery on it), and the croissants' offer. */
  async tv() {
    const ctx = await desktop(TV, 1.2)
    const page = await openDemo(ctx, { time: TIME, path: '/' })
    await newPrice(page)
    // Off camera: the bakery on the TV's menu board too (it showed only the coffee and tea).
    await go(page, '/menu')
    await page.getByRole('heading', { name: 'Menu', exact: true }).waitFor()
    await page.getByRole('tab', { name: 'Design' }).click()
    await page.getByRole('button', { name: 'Digital', exact: true }).click()
    await page.getByText('TV menu board', { exact: true }).first().click()
    await page.getByRole('group', { name: 'Sections on it' }).getByRole('button', { name: 'Bakery', exact: true }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await toast(page, 'Saved')
    await closeToast(page, 'Saved')
    // And the line along the bottom of the TV, which still had last week's special on it.
    await go(page, '/screens')
    await page.getByLabel(/A line running along the bottom/).fill('Fresh bakes every morning · Free Wi-Fi: EasyBeans')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await toast(page, 'Saved')
    await closeToast(page, 'Saved')
    // The printed food menu with the new price, without the cursor.
    await page.evaluate(() => { document.getElementById('__ba_cursor')?.remove() })
    await go(page, '/menu/print/d-food')
    await page.waitForTimeout(2500)
    await page.screenshot({ path: join(STILLS, 'owner-print.png'), fullPage: true })
    await go(page, SCREEN)
    await page.evaluate(() => { document.getElementById('__ba_cursor')?.remove() })
    await page.waitForTimeout(1500)
    const r = new Recorder(page, 'owner-tv', OUT)
    await r.start()
    await r.pause(38_000)
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
console.log(`Clips in ${OUT}, stills in ${STILLS} (app: ${APP})`)
