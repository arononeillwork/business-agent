// Records the app scenes of the "customers who never come back" video ("Bring them back.", video/src/regulars/):
// Easy Beans Coffee in the real app in demo mode, the till (Square) connected off camera as the owner video has it,
// so the loyalty stamp card and the takings behind the quiet day are there. The regulars on Customers and the stamp
// card; the ready-made quiet-day campaign, sent to the regulars who said yes and planned for Monday; the Mondays draw
// the takings suggest. Into video/public/clips (regulars-*.mp4 + .json).
//   npm run dev  (in the repo root, http://127.0.0.1:5173)
//   node video/capture/regulars.mjs [scene …]      (no scene: all of them)
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
  // 24-hour times and day-first dates, as a Spanish café has them.
  env: { ...process.env, LANG: 'en_GB.UTF-8', LC_ALL: 'en_GB.UTF-8', LANGUAGE: 'en_GB' },
})

const toast = (page, text) => page.getByRole('alert').filter({ hasText: text }).first().waitFor()

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
  /** Customers: the regulars, and who said yes to marketing; then the stamp card from the till, and its members. */
  async regulars() {
    const { ctx, page } = await owner('/customers')
    await page.getByRole('heading', { name: 'Customers', level: 1 }).waitFor()
    const r = new Recorder(page, 'regulars-customers', OUT)
    r.mouse = { x: 1180, y: 300 }
    await r.start()
    await r.pause(1200)
    const search = page.getByLabel('Search customers')
    await r.click(search, { label: 'search', ms: 700, after: 300 })
    await search.pressSequentially('regular', { delay: 140 }); await r.pause(900)
    await r.focus(page.getByText('3 of 15 shown'), 'found', { move: true }); await r.pause(1200)
    const lucia = page.getByRole('row').filter({ hasText: 'Oat flat white every morning' })
    await r.focus(lucia, 'lucia', { move: true }); await r.pause(1800)
    await r.focus(lucia.getByText('Yes'), 'consent', { move: true }); await r.pause(1600)
    // On to Loyalty & gift cards: the stamp card, read from the till.
    r.mark('cut', { label: 'loyalty' })
    await go(page, '/loyalty')
    await page.getByText('Stamp card').first().waitFor()
    await page.mouse.move(1180, 300); r.mouse = { x: 1180, y: 300 }
    await r.pause(1400)
    await r.focus(page.getByText('9 stamps get Free coffee (the 10th)'), 'stamps', { move: true }); await r.pause(1800)
    await r.focus(page.getByText('38 stamps earned this month'), 'members', { move: true }); await r.pause(1600)
    await r.scrollBy(560, 1000); await r.pause(600)
    await r.focus(page.getByRole('columnheader', { name: 'Last visit' }), 'visits', { move: true }); await r.pause(2200)
    await r.stop()
    await ctx.close()
  },

  /** Campaigns: the ready-made quiet-day boost, to the customers tagged regular who said yes, planned for Monday at ten. */
  async campaign() {
    const { ctx, page } = await owner('/campaigns')
    await page.getByRole('heading', { name: 'Campaigns', level: 1 }).waitFor()
    const r = new Recorder(page, 'regulars-campaign', OUT)
    r.mouse = { x: 1180, y: 300 }
    await r.start()
    await r.pause(1000)
    await r.click(page.getByRole('tab', { name: /^Suggested/ }), { label: 'suggested', ms: 700, after: 700 })
    const idea = page.getByRole('article', { name: 'Quiet-day boost' })
    await r.focus(idea, 'idea', { move: true }); await r.pause(2200)
    await r.click(idea.getByRole('button', { name: 'Start this campaign: Quiet-day boost' }), { label: 'start', ms: 700, after: 900 })
    const dialog = page.getByRole('dialog')
    await r.focus(dialog.getByLabel('Message'), 'message', { move: true }); await r.pause(2200)
    const tagged = dialog.getByLabel('Tagged')
    await r.click(tagged, { label: 'tagged', ms: 700, after: 300 })
    await tagged.pressSequentially('regular', { delay: 140 }); await r.pause(500)
    await r.click(page.getByRole('option', { name: 'regular' }), { label: 'regular', ms: 500, after: 700 })
    await r.focus(dialog.getByText(/^Goes to \d+ people who said yes/), 'goes', { move: true }); await r.pause(1800)
    await r.focus(dialog.getByLabel('How it reads'), 'preview', { move: true }); await r.pause(2000)
    await r.focus(dialog.getByText('A reminder in the bell that day'), 'planned', { move: true }); await r.pause(1800)
    await r.click(dialog.getByRole('button', { name: 'Save' }), { label: 'save', ms: 700, after: 200 })
    await toast(page, 'Saved')
    await r.pause(700)
    await r.click(page.getByRole('tab', { name: /^Campaigns/ }), { label: 'list', ms: 700, after: 700 })
    await r.focus(page.getByRole('row').filter({ hasText: 'Quiet-day boost' }), 'row', { move: true }); await r.pause(2400)
    await r.stop()
    await ctx.close()
  },

  /** Competitions: the takings say Mondays are quiet; the Mondays draw, its rules and its post written, saved. */
  async draw() {
    const { ctx, page } = await owner('/competitions')
    await page.getByRole('heading', { name: 'Competitions', level: 1 }).waitFor()
    const r = new Recorder(page, 'regulars-draw', OUT)
    r.mouse = { x: 1180, y: 300 }
    await r.start()
    await r.pause(1000)
    const idea = page.getByRole('article', { name: 'Mondays draw' })
    await r.focus(idea, 'idea', { move: true }); await r.pause(2600)
    await r.click(idea.getByRole('button', { name: 'Use this idea: Mondays draw' }), { label: 'use', ms: 700, after: 900 })
    const dialog = page.getByRole('dialog')
    await r.focus(dialog.getByLabel('Prize', { exact: true }), 'prize', { move: true }); await r.pause(1600)
    await r.focus(dialog.getByRole('group', { name: 'How to enter' }), 'enter', { move: true }); await r.pause(2000)
    const content = dialog.locator('.MuiDialogContent-root')
    await content.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }))
    await r.pause(1300)
    await r.focus(dialog.getByLabel('Caption in English'), 'post', { move: true }); await r.pause(2200)
    await r.click(dialog.getByRole('button', { name: 'Save' }), { label: 'save', ms: 700, after: 200 })
    await toast(page, 'Saved')
    await r.pause(900)
    const row = page.getByRole('row').filter({ hasText: 'Mondays draw' })
    await row.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await r.pause(1200)
    await r.focus(row, 'row', { move: true }); await r.pause(2400)
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
    if (process.env.VIDEO_DEBUG) for (const c of browser.contexts()) for (const [i, p] of c.pages().entries()) await p.screenshot({ path: join(process.env.VIDEO_DEBUG, `regulars-${name}-${i}.png`) }).catch(() => {})
    throw e
  }
}
await browser.close()
console.log(`Clips in ${OUT} (app: ${APP})`)
