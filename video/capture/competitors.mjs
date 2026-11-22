// Records the app scenes of the competitor insights video ("Know your competition.", video/src/competitors/):
// Easy Beans Coffee in the real app in demo mode, on the Competitors page (Marketing), with the demo's five
// made-up places around San Pedro de Alcántara. The page at a glance and what it means in plain words; one item
// (the cappuccino) against the street, and the price rises lately; and the new café Google found nearby, followed.
// Into video/public/clips (competitors-*.mp4 + .json).
//   npm run dev  (in the repo root, http://127.0.0.1:5173)
//   node video/capture/competitors.mjs [scene …]      (no scene: all of them)
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP, Recorder, openDemo, prepare } from './lib.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'clips')
mkdirSync(OUT, { recursive: true })
/** Wednesday 9 December 2026, 09:55 in Madrid, as the other videos. */
const TIME = '2026-12-09T08:55:00Z'
const SCALE = 1.5
const DESKTOP = { width: 1440, height: 900 }

const browser = await chromium.launch({
  args: ['--lang=en-GB', `--force-device-scale-factor=${SCALE}`],
  env: { ...process.env, LANG: 'en_GB.UTF-8', LC_ALL: 'en_GB.UTF-8', LANGUAGE: 'en_GB' },
})

/** Signed in as the owner, on the Competitors page, the cursor resting where it won't cover anything. */
async function competitors() {
  const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: SCALE, locale: 'en-GB', timezoneId: 'Europe/Madrid' })
  await prepare(ctx)
  const page = await openDemo(ctx, { time: TIME, path: '/competitors' })
  await page.getByRole('heading', { name: 'Competitors', level: 1 }).waitFor()
  await page.getByRole('region', { name: 'What it means for you' }).waitFor()
  await page.mouse.move(1180, 300)
  await page.waitForTimeout(1500)
  return { ctx, page }
}

const SCENES = {
  /** The page at a glance: the places followed, your prices against the area, your rating; then what it means for you. */
  async glance() {
    const { ctx, page } = await competitors()
    const r = new Recorder(page, 'competitors-glance', OUT)
    r.mouse = { x: 1180, y: 300 }
    await r.start()
    await r.pause(1200)
    await r.focus(page.getByText('Nearest: Molino Coffee Lab, 180 m'), 'following', { move: true }); await r.pause(1600)
    await r.focus(page.getByText('against the area, on 6 items'), 'prices', { move: true }); await r.pause(1600)
    await r.focus(page.getByText('The highest of the places you follow'), 'rating', { move: true }); await r.pause(1600)
    const means = page.getByRole('region', { name: 'What it means for you' })
    await r.focus(means.getByText(/^Breakfast: 4 of 5 nearby/), 'gap', { move: true }); await r.pause(1800)
    await r.focus(means.getByText(/^Wi-Fi & laptop friendly: only you/), 'edge', { move: true }); await r.pause(1800)
    await r.focus(means.getByText(/^3 of 5 open before you/), 'hours', { move: true }); await r.pause(1800)
    await r.focus(means.getByText(/^New on Google nearby/), 'new', { move: true }); await r.pause(1800)
    await r.stop()
    await ctx.close()
  },

  /** Prices: the cappuccino at every place, yours in purple, the area's average dashed; then the price rises lately. */
  async prices() {
    const { ctx, page } = await competitors()
    const r = new Recorder(page, 'competitors-prices', OUT)
    r.mouse = { x: 1180, y: 300 }
    await r.start()
    await r.pause(1000)
    await r.click(page.getByRole('tab', { name: 'Prices' }), { label: 'tab', ms: 700, after: 600 })
    await r.scrollBy(735, 1100); await r.pause(700)
    const compare = page.getByRole('region', { name: 'Compare one item' })
    await r.focus(compare.getByText(/^Your Cappuccino is/), 'sentence', { move: true }); await r.pause(2000)
    await r.focus(compare.getByRole('listitem').filter({ hasText: '(you)' }), 'you', { move: true }); await r.pause(1800)
    await r.click(compare.getByRole('button', { name: 'Croissant' }), { label: 'croissant', ms: 700, after: 500 })
    await r.focus(compare.getByText(/^Your Croissant is/), 'croissant-sentence', { move: true }); await r.pause(2000)
    const changes = page.getByText('Price changes in the last 90 days')
    await changes.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    await r.pause(1400)
    await r.focus(page.getByText('Horno de Santa Ana: Croissant'), 'rise', { move: true }); await r.pause(2200)
    await r.stop()
    await ctx.close()
  },

  /** Nearby: Google looked around again this week; the new café round the corner, followed. */
  async nearby() {
    const { ctx, page } = await competitors()
    const r = new Recorder(page, 'competitors-nearby', OUT)
    r.mouse = { x: 1180, y: 300 }
    await r.start()
    await r.pause(1000)
    await r.click(page.getByRole('tab', { name: /^Nearby/ }), { label: 'tab', ms: 700, after: 600 })
    await r.scrollBy(735, 1100); await r.pause(700)
    await r.focus(page.getByText('Look again every week and tell me about new places'), 'weekly', { move: true }); await r.pause(1800)
    const list = page.getByRole('region', { name: 'Nearby on Google' })
    const row = list.getByRole('listitem').filter({ hasText: 'Nuevo Rincón Café' }).first()
    await r.focus(row, 'new', { move: true }); await r.pause(2000)
    await r.click(row.getByRole('button', { name: 'Follow Nuevo Rincón Café' }), { label: 'follow', ms: 700, after: 200 })
    await page.getByRole('alert').filter({ hasText: 'Following Nuevo Rincón Café' }).first().waitFor()
    await r.pause(1500)
    await r.click(page.getByRole('tab', { name: 'Places' }), { label: 'places', ms: 800, after: 900 })
    const followed = page.getByRole('region', { name: 'Places followed' })
    await r.focus(followed.getByRole('row').filter({ hasText: 'Nuevo Rincón Café' }), 'followed', { move: true }); await r.pause(2400)
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
    if (process.env.VIDEO_DEBUG) for (const c of browser.contexts()) for (const [i, p] of c.pages().entries()) await p.screenshot({ path: join(process.env.VIDEO_DEBUG, `competitors-${name}-${i}.png`) }).catch(() => {})
    throw e
  }
}
await browser.close()
console.log(`Clips in ${OUT} (app: ${APP})`)
