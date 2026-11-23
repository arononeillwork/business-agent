// Records the app scenes of the "prices set by feel" video ("What does a flat white really cost?", video/src/costing/):
// Easy Beans Coffee in the real app in demo mode, the till (Square) connected off camera as the owner video has it, so
// the advisor reads the takings too. A flat white on Menu costing, built from what goes in; the roaster's new price for
// the house blend typed once on Stock, and every coffee recosted; the advisor's "Some prices don't reach your margin",
// and Pain au chocolat put at €2,90. Into video/public/clips (costing-*.mp4 + .json).
//   npm run dev  (in the repo root, http://127.0.0.1:5173)
//   node video/capture/costing.mjs [scene …]      (no scene: all of them)
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
  env: { ...process.env, LANG: 'en_GB.UTF-8', LC_ALL: 'en_GB.UTF-8', LANGUAGE: 'en_GB' },
})

const toast = (page, text) => page.getByRole('alert').filter({ hasText: text }).first().waitFor()
/** One of the advisor's findings, in its group. */
const finding = (page, title, where) => page.getByRole('region', { name: where }).getByRole('article', { name: title })

/** Signed in as the owner with the till (Square) connected, off camera, on `path`; the cursor resting out of the way. */
async function owner(path) {
  const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: SCALE, locale: 'en-GB', timezoneId: 'Europe/Madrid' })
  await prepare(ctx)
  const page = await openDemo(ctx, { time: TIME, path: '/connections' })
  const sales = page.getByRole('region', { name: 'Payments and sales' })
  await sales.getByRole('button', { name: 'Connect Square' }).click()
  await sales.getByRole('article', { name: 'Square' }).filter({ hasText: 'Connected' }).waitFor()
  await go(page, path)
  await page.waitForTimeout(1200)
  await page.mouse.move(1180, 300)
  await page.waitForTimeout(800)
  return { ctx, page }
}

const SCENES = {
  /** Menu costing: the margins at a glance; a flat white, from what goes in to what it costs and earns; with oat milk. */
  async cost() {
    const { ctx, page } = await owner('/recipes')
    await page.getByRole('heading', { name: 'Menu costing' }).waitFor()
    const r = new Recorder(page, 'costing-cost', OUT)
    r.mouse = { x: 1180, y: 300 }
    await r.start()
    await r.pause(1200)
    await r.focus(page.getByText('on the price without VAT'), 'average', { move: true }); await r.pause(1500)
    await r.focus(page.getByText('Croissant, Pain au chocolat').first(), 'below', { move: true }); await r.pause(1500)
    const row = page.getByRole('row', { name: 'Flat white' })
    await r.focus(row, 'row', { move: true }); await r.pause(900)
    await r.click(row, { label: 'item', dx: 0.2, ms: 600, after: 1000 })
    const dialog = page.getByRole('dialog')
    await r.focus(dialog.getByLabel(/^Menu price, with/), 'price', { move: true }); await r.pause(1400)
    await r.focus(dialog.getByText('What goes in'), 'ingredients', { move: true }); await r.pause(600)
    for (const [i, label] of ['espresso', 'milk', 'cup', 'lid'].entries()) {
      await r.focus(dialog.getByLabel('Ingredient').nth(i), label, { move: true }); await r.pause(650)
    }
    await r.focus(dialog.getByText(/^Cost €0,61/), 'cost', { move: true }); await r.pause(2600)
    await r.focus(dialog.getByText(/^Cost €0,69/), 'oat', { move: true }); await r.pause(2000)
    await r.click(dialog.getByRole('button', { name: 'Cancel' }), { label: 'close', ms: 700, after: 800 })
    await r.stop()
    await ctx.close()
  },

  /** Stock: the roaster's new price for the house blend, typed once; Menu costing, every coffee recosted. */
  async beans() {
    const { ctx, page } = await owner('/stock')
    await page.getByRole('heading', { name: 'Current stock' }).waitFor()
    const item = page.getByRole('button', { name: 'House espresso blend', exact: true })
    const r = new Recorder(page, 'costing-beans', OUT)
    r.mouse = { x: 1180, y: 300 }
    await r.start()
    await r.pause(1000)
    await item.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await r.pause(1300)
    await r.focus(page.getByRole('row').filter({ has: item }), 'blend', { move: true }); await r.pause(1200)
    await r.click(item, { label: 'item', ms: 600, after: 1000 })
    const dialog = page.getByRole('dialog')
    await r.focus(dialog.getByLabel('Supplier'), 'supplier', { move: true }); await r.pause(1200)
    const cost = dialog.getByLabel('Cost per unit, without VAT')
    await r.type(cost, '21', { label: 'cost', delay: 220 }); await r.pause(1000)
    await r.click(dialog.getByRole('button', { name: 'Save' }), { label: 'save', ms: 700, after: 200 })
    await toast(page, 'Saved')
    await r.pause(900)
    // On to Menu costing: the coffees, each with the new cost.
    r.mark('cut', { label: 'costing' })
    await go(page, '/recipes')
    await page.getByRole('heading', { name: 'Menu costing' }).waitFor()
    await page.mouse.move(1180, 300); r.mouse = { x: 1180, y: 300 }
    await r.pause(1000)
    await r.click(page.getByLabel('Category', { exact: true }).or(page.getByRole('combobox').filter({ hasText: 'Every category' })).first(), { label: 'category', ms: 700, after: 500 })
    await r.click(page.getByRole('option', { name: 'Coffee' }), { label: 'coffee', ms: 500, after: 900 })
    await r.focus(page.getByRole('row', { name: 'Flat white' }), 'flat', { move: true }); await r.pause(1600)
    await r.focus(page.getByRole('columnheader', { name: 'Cost' }), 'costs', { move: true }); await r.pause(1600)
    await r.focus(page.getByText('on the price without VAT'), 'average', { move: true }); await r.pause(2000)
    await r.stop()
    await ctx.close()
  },

  /** The advisor: some prices don't reach your margin; to Menu costing, Pain au chocolat at €2,90, on target. */
  async margin() {
    const { ctx, page } = await owner('/advisor')
    await page.getByRole('heading', { name: 'Business advisor' }).waitFor()
    const tip = finding(page, 'Some prices don’t reach your margin', 'The menu')
    await tip.evaluate(el => el.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(800)
    const r = new Recorder(page, 'costing-margin', OUT)
    r.mouse = { x: 1180, y: 300 }
    await r.start()
    await r.pause(1000)
    await r.focus(tip, 'tip', { move: true }); await r.pause(2600)
    await r.click(tip.getByRole('link', { name: 'Open page' }), { label: 'open', ms: 700, after: 300 })
    await page.getByRole('heading', { name: 'Menu costing' }).waitFor()
    r.mark('focus', { label: 'costing-page' })
    await r.pause(1200)
    const row = page.getByRole('row', { name: 'Pain au chocolat' })
    await r.focus(row, 'row', { move: true }); await r.pause(1400)
    await r.click(row, { label: 'item', dx: 0.2, ms: 500, after: 1000 })
    const dialog = page.getByRole('dialog')
    await r.focus(dialog.getByText(/^Cost €1,05/), 'before', { move: true }); await r.pause(1600)
    await r.type(dialog.getByLabel(/^Menu price, with/), '2.90', { label: 'price', delay: 180 }); await r.pause(900)
    await r.focus(dialog.getByText(/^Cost €1,05/), 'after', { move: true }); await r.pause(2000)
    await r.click(dialog.getByRole('button', { name: 'Save' }), { label: 'save', ms: 800, after: 200 })
    await toast(page, 'Saved')
    await r.pause(800)
    await r.focus(page.getByRole('row', { name: 'Pain au chocolat' }), 'row-after', { move: true }); await r.pause(2400)
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
    if (process.env.VIDEO_DEBUG) for (const c of browser.contexts()) for (const [i, p] of c.pages().entries()) await p.screenshot({ path: join(process.env.VIDEO_DEBUG, `costing-${name}-${i}.png`) }).catch(() => {})
    throw e
  }
}
await browser.close()
console.log(`Clips in ${OUT} (app: ${APP})`)
