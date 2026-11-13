// Records the app scenes of the food waste video ("Don't bin it. Sell it.", video/src/waste/): Easy Beans
// Coffee in the real app in demo mode. A batch of banana bread is logged once, with how long it keeps and
// when it goes on offer, and then the clock moves on two days: it goes on offer by itself, on Offers &
// specials and on the café's TV. Into video/public/clips (waste-*.mp4 + .json).
//   npm run dev  (in the repo root, http://127.0.0.1:5173)
//   node video/capture/waste.mjs [scene …]      (no scene: all of them)
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
/** The café's TV: 16:9. */
const TV = { width: 1600, height: 900 }
/** The window slideshow's own link (the demo's screen with the bakery on its menu board). */
const SCREEN = '/display/c0ffee00beef00c0ffee00beef00cafe'
/** Banana bread keeps three days; its discount starts a day before the end. Two days on, it's on offer. */
const JUMP = '48:10:00'

const browser = await chromium.launch({
  args: ['--lang=en-GB', `--force-device-scale-factor=${SCALE}`],
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

/**
 * Off camera: the banana bread on the menu (€4,00, so its offer shows a price and the old one crossed out),
 * and the sample batches cleared, so the counter shows only what the video is about once the days go by.
 */
async function setUp(ctx) {
  const page = await openDemo(ctx, { time: TIME, path: '/recipes' })
  await page.getByRole('heading', { name: 'Menu costing' }).waitFor()
  await page.getByRole('button', { name: 'Add menu item' }).click()
  const d = page.getByRole('dialog')
  await d.getByLabel('Name').fill('Banana bread')
  await d.getByLabel('Category').fill('Bakery')
  await page.getByRole('option', { name: 'Bakery' }).first().click().catch(() => {})
  await d.getByLabel('Menu price, with VAT').fill('4.00')
  await d.getByRole('button', { name: 'Add', exact: true }).click()
  await d.waitFor({ state: 'detached' })
  await page.waitForTimeout(500)
  await go(page, '/stock?tab=fresh')
  await page.getByRole('button', { name: 'Record a batch', exact: true }).waitFor()
  await page.waitForTimeout(800)
  for (const name of ['Ham & cheese toasties', 'Brownies', 'Pain au chocolat', 'Banana bread']) {
    const sold = page.getByRole('button', { name: `${name}: sold out` })
    if (await sold.count()) { await sold.first().click(); await page.waitForTimeout(350) }
  }
  return page
}

/** The batch dialog, filled in: 12 banana breads, 3 days, 50% off from a day before the end. Returns when it's saved. */
async function fillBatch(page, r) {
  const act = r
    ? { click: (l, o) => r.click(l, o), type: (l, t, o) => r.type(l, t, o), pause: ms => r.pause(ms), focus: (l, n, o) => r.focus(l, n, o) }
    : { click: l => l.click(), type: (l, t) => l.fill(t), pause: ms => page.waitForTimeout(ms), focus: async () => {} }
  const d = page.getByRole('dialog')
  await act.type(d.getByLabel('What was made'), 'Banana bread', { label: 'name', delay: 90 })
  await act.pause(500)
  const option = page.getByRole('option', { name: 'Banana bread' }).first()
  if (await option.count()) await act.click(option, { label: 'option', ms: 500, after: 400 })
  const many = d.getByLabel('How many')
  await act.click(many, { label: 'many', ms: 600, after: 150 })
  await many.press('ControlOrMeta+a')
  await many.pressSequentially('12', { delay: 160 })
  await act.pause(500)
  await act.click(d.getByLabel('Shelf life'), { label: 'shelf', ms: 600, after: 450 })
  await act.click(page.getByRole('option', { name: '3 days' }), { label: 'days', ms: 500, after: 500 })
  await act.pause(500)
  const offer = d.getByLabel('Put it on offer before it goes off')
  if (!(await offer.isChecked())) await act.click(offer, { label: 'offer-on', ms: 700, after: 600 })
  await act.click(d.getByRole('group', { name: 'Start the discount' }).getByRole('button', { name: '1 day before' }), { label: 'lead', ms: 700, after: 500 })
  const percent = d.getByLabel('Off the menu price')
  await act.click(percent, { label: 'percent', ms: 600, after: 150 })
  await percent.press('ControlOrMeta+a')
  await percent.pressSequentially('50', { delay: 200 })
  await act.pause(700)
  await act.focus(d.getByText(/On Offers & specials from/), 'summary', { move: true })
  await act.pause(1500)
  await act.click(d.getByRole('button', { name: 'Record', exact: true }), { label: 'save', ms: 800, after: 300 })
  await toast(page, 'recorded, with its offer')
}

const SCENES = {
  /** Logging a batch, the days going by, and its offer there on Offers & specials by itself. */
  async batch() {
    const ctx = await desktop()
    const page = await setUp(ctx)
    await page.mouse.move(1100, 330)
    await page.waitForTimeout(1500)
    const r = new Recorder(page, 'waste-batch', OUT)
    r.mouse = { x: 1100, y: 330 }
    await r.start()
    await r.pause(1300)
    await r.focus(page.getByRole('region', { name: 'Freshly made' }).getByRole('heading', { name: 'On the counter' }).or(page.getByText('On the counter', { exact: true })), 'counter', { move: true })
    await r.pause(700)
    await r.click(page.getByRole('button', { name: 'Record a batch', exact: true }), { label: 'record', ms: 900, after: 700 })
    await fillBatch(page, r)
    await r.pause(900)
    await closeToast(page, 'recorded, with its offer')
    const card = page.getByRole('list', { name: 'On the counter' }).getByRole('listitem', { name: 'Banana bread' })
    await card.waitFor()
    await r.focus(card, 'card', { move: true })
    await r.pause(2200)
    // The days go by: nothing is done. Banana bread's last day starts, and it's on offer.
    r.mark('focus', { label: 'jump' })
    await page.clock.fastForward(JUMP)
    await r.pause(2600)
    await r.focus(card, 'on-offer', { move: true })
    await r.pause(1800)
    await r.click(card.getByRole('link', { name: /on Offers & specials/ }), { label: 'offer-link', ms: 800, after: 500 })
    await page.getByRole('heading', { name: 'Offers & specials' }).waitFor()
    r.mark('focus', { label: 'offers-page' })
    await r.pause(1200)
    const offer = page.locator('.MuiCard-root').filter({ has: page.getByText('Banana bread', { exact: true }) }).first()
    await r.focus(offer, 'offer', { move: true }); await r.pause(1500)
    await r.focus(page.getByText(/On Counter TV/).first(), 'tv', { move: true })
    await r.pause(2200)
    await r.stop()
    await ctx.close()
  },

  /** The café's TV, full screen, two days on: the banana bread's offer comes round in its slideshow. */
  async tv() {
    const ctx = await desktop(TV, 1.2)
    const page = await setUp(ctx)
    await page.getByRole('button', { name: 'Record a batch', exact: true }).click()
    await fillBatch(page, null)
    await closeToast(page, 'recorded, with its offer')
    await page.clock.fastForward(JUMP)
    await page.waitForTimeout(800)
    await page.evaluate(() => { document.getElementById('__ba_cursor')?.remove() })
    await go(page, SCREEN)
    await page.evaluate(() => { document.getElementById('__ba_cursor')?.remove() })
    await page.waitForTimeout(1500)
    const r = new Recorder(page, 'waste-tv', OUT)
    await r.start()
    await r.pause(45_000)
    await r.stop()
    await ctx.close()
  },
}

const wanted = process.argv.slice(2)
for (const [name, scene] of Object.entries(SCENES)) {
  if (wanted.length && !wanted.includes(name)) continue
  console.log(`▶ ${name}`)
  try { await scene() } catch (e) {
    // What the page looked like when it went wrong (VIDEO_DEBUG=folder).
    if (process.env.VIDEO_DEBUG) for (const c of browser.contexts()) for (const [i, p] of c.pages().entries()) await p.screenshot({ path: join(process.env.VIDEO_DEBUG, `waste-${name}-${i}.png`) }).catch(() => {})
    throw e
  }
}
await browser.close()
console.log(`Clips in ${OUT} (app: ${APP})`)
