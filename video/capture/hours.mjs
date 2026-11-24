// Records the app scenes of the "Adding up hours and tips" video ("Month end without the spreadsheet.",
// video/src/hours/): Easy Beans Coffee in the real app in demo mode, the last week of November 2026. Maria clocks in
// on her phone on Thursday morning and out after her shift (the clock moved on in between); on Sunday evening the
// owner's Timecards have the week's hours added up, a correction approved in one press, the week approved and saved
// for payroll; on Monday morning the tips: the card tips left at the till, in from Square by who took each payment,
// the jar's cash counted, and the lot shared out by the hours each person worked. Square and Google Drive are
// connected off camera; the demo's own ready-made tips for that week are taken off first, and "only tips from days
// above breakeven" switched off, so the film shares them out from the start. The demo's Julio is shown as Sam
// throughout (his name kept out of the film). Into video/public/clips (hours-*.mp4 + .json, and hours-shares.json:
// the shares, for the film's drawn phone).
//   npm run dev  (in the repo root, http://127.0.0.1:5173)
//   node video/capture/hours.mjs [scene …]      (no scene: all of them)
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP, Recorder, go, openDemo, prepare } from './lib.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'clips')
mkdirSync(OUT, { recursive: true })
/** Thursday 26 November 2026, 09:55 in Madrid: Maria's shift is 10:00 to 15:00. */
const MORNING = '2026-11-26T08:55:00Z'
/** Sunday 29 November, 19:30: the week's done. */
const SUNDAY = '2026-11-29T18:30:00Z'
/** Monday 30 November, 09:30: the tips for last week, counted on Monday morning. */
const MONDAY = '2026-11-30T08:30:00Z'
const SCALE = 1.5
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 393, height: 852 }

const browser = await chromium.launch({
  args: ['--lang=en-GB', `--force-device-scale-factor=${SCALE}`],
  env: { ...process.env, LANG: 'en_GB.UTF-8', LC_ALL: 'en_GB.UTF-8', LANGUAGE: 'en_GB' },
})

const toast = (page, text) => page.getByRole('alert').filter({ hasText: text }).first().waitFor()

/** The demo's Julio shown as Sam on screen (his name and his avatar's letter), so his name isn't in the film. */
const RENAME = `(() => {
  const swap = n => {
    if (n.nodeType === 3) {
      if (n.nodeValue.includes('Julio')) n.nodeValue = n.nodeValue.split('Julio').join('Sam')
      if (n.nodeValue === 'J' && n.parentElement && n.parentElement.closest('.MuiAvatar-root')) n.nodeValue = 'S'
    } else n.childNodes.forEach(swap)
  }
  new MutationObserver(ms => ms.forEach(m => { if (m.type === 'characterData') swap(m.target); else m.addedNodes.forEach(swap) }))
    .observe(document, { childList: true, subtree: true, characterData: true })
  addEventListener('DOMContentLoaded', () => swap(document.documentElement))
})()`

/** Off camera, as the owner on Connections: the apps named connected ('Square', 'Google Drive'). */
async function connect(page, ...apps) {
  for (const app of apps) {
    await page.getByRole('button', { name: `Connect ${app}` }).first().click()
    await page.getByRole('article', { name: app }).filter({ hasText: 'Connected' }).first().waitFor()
  }
}

/** A desktop window signed in as the owner at `time`, the apps named connected off camera, then on `path`. */
async function desktop(time, path, apps) {
  const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: SCALE, locale: 'en-GB', timezoneId: 'Europe/Madrid', acceptDownloads: true })
  await prepare(ctx)
  await ctx.addInitScript(RENAME)
  const page = await openDemo(ctx, { time, path: '/connections' })
  await connect(page, ...apps)
  await go(page, path)
  return { ctx, page }
}

const SCENES = {
  /** Maria's phone: clocked in on Thursday morning; five hours on, clocked out, and the day's hours. */
  async phone() {
    const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, locale: 'en-GB', timezoneId: 'Europe/Madrid' })
    await prepare(ctx)
    await ctx.addInitScript(RENAME)
    const page = await openDemo(ctx, { email: 'maria@example.com', time: MORNING })
    const clock = page.getByRole('region', { name: 'Your clock' })
    await clock.waitFor()
    await page.waitForTimeout(2500)
    const r = new Recorder(page, 'hours-phone', OUT)
    await r.start()
    await r.pause(1500)
    await r.focus(clock, 'clock'); await r.pause(1400)
    await r.tap(clock.getByRole('button', { name: 'Clock in' }), { label: 'in', after: 200 })
    await toast(page, 'Clocked in')
    await r.pause(2600)
    // The end of her shift: the clock moved on five hours (a cut in the film).
    r.mark('cut', { label: 'later' })
    await page.clock.fastForward('05:06:00')
    await r.pause(1800)
    await r.focus(clock, 'shift'); await r.pause(1000)
    await r.tap(clock.getByRole('button', { name: 'Clock out' }), { label: 'out', after: 300 })
    const summary = page.getByRole('dialog', { name: 'Workday summary' }).or(page.getByRole('dialog').filter({ hasText: 'Workday summary' })).first()
    await summary.waitFor()
    await r.pause(600)
    await r.focus(summary.getByText('Paid hours'), 'summary'); await r.pause(3000)
    await r.stop()
    await ctx.close()
  },

  /** Sunday evening, the owner's Timecards: the week added up, a correction approved, the week approved and saved for payroll. */
  async hours() {
    const { ctx, page } = await desktop(SUNDAY, '/timecards', ['Google Drive'])
    // Saving opens the file in Drive in a new tab: closed, the film stays on the app.
    ctx.on('page', p => { if (p !== page) void p.close().catch(() => {}) })
    await page.getByRole('heading', { name: 'Timecards', level: 1 }).waitFor()
    await page.waitForTimeout(3500)
    await page.mouse.move(1180, 300)
    await page.waitForTimeout(800)
    const r = new Recorder(page, 'hours-hours', OUT)
    r.mouse = { x: 1180, y: 300 }
    await r.start()
    await r.pause(1400)
    await r.focus(page.getByText('Paid hours', { exact: true }), 'paid', { move: true }); await r.pause(2200)
    const requests = page.getByText('Correction requests').locator('xpath=ancestor::*[contains(@class,"MuiCard-root")][1]')
    await requests.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await r.pause(1200)
    await r.focus(requests.getByText(/Stayed 20 min/), 'request', { move: true }); await r.pause(1800)
    await r.click(requests.getByRole('button', { name: 'Approve' }), { label: 'approve', ms: 700, after: 200 })
    await page.getByText('Correction requests').waitFor({ state: 'detached' }).catch(() => {})
    await r.pause(1400)
    // Down the week: each person's days, the hours worked worked out.
    const maria = page.getByText(/^Maria$/).first().locator('xpath=ancestor::*[contains(@class,"MuiCard-root")][1]')
    await maria.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await r.pause(1600)
    await r.focus(maria, 'maria', { move: true }); await r.pause(1200)
    await r.focus(maria.getByText('Edited'), 'edited', { move: true }); await r.pause(1600)
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }))
    await r.pause(1300)
    await r.click(page.getByRole('button', { name: 'Approve week' }), { label: 'week', ms: 800, after: 300 })
    const confirm = page.getByRole('dialog')
    if (await confirm.isVisible().catch(() => false)) await r.click(confirm.getByRole('button', { name: /Approve/ }).last(), { label: 'confirm', ms: 600, after: 300 })
    await page.getByRole('alert').first().waitFor()
    await r.pause(1800)
    await r.click(page.getByRole('button', { name: 'Export' }), { label: 'export', ms: 700, after: 500 })
    await r.focus(page.getByRole('menu'), 'menu', { move: true }); await r.pause(900)
    await r.click(page.getByRole('menuitem', { name: /Save to Drive/ }), { label: 'save', ms: 700, after: 200 })
    await toast(page, 'Saved to Google Drive')
    await r.pause(2800)
    await r.stop()
    await ctx.close()
  },

  /** Monday morning, the owner's Tips: last week's card tips from Square, the jar counted, shared out by hours worked. */
  async tips() {
    const { ctx, page } = await desktop(MONDAY, '/tips', ['Square'])
    await page.getByRole('heading', { name: 'Tips', level: 1 }).waitFor()
    // Off camera: the demo's own tips for last week taken off (the film shares them out), and every day's tips counted.
    await page.getByRole('button', { name: /^Edit the tips for/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await page.getByRole('dialog').waitFor({ state: 'detached' })
    await page.getByLabel('Only tips from days above breakeven').click()
    await toast(page, 'every day')
    await page.waitForTimeout(4500)
    await page.mouse.move(1180, 300)
    await page.waitForTimeout(800)
    const r = new Recorder(page, 'hours-tips', OUT)
    r.mouse = { x: 1180, y: 300 }
    await r.start()
    await r.pause(1400)
    const square = page.getByRole('region', { name: 'Tips on Square' })
    await r.click(square.getByRole('button', { name: 'Last week' }), { label: 'week', ms: 800, after: 1000 })
    await r.focus(square.getByRole('table'), 'square', { move: true }); await r.pause(2400)
    await r.click(page.getByRole('button', { name: 'Share out tips' }), { label: 'share', ms: 800, after: 900 })
    const dialog = page.getByRole('dialog')
    await r.focus(dialog.getByLabel('First day'), 'period', { move: true }); await r.pause(1300)
    const cash = dialog.getByLabel('Cash')
    await r.click(cash, { label: 'cash', dx: 0.3, ms: 600, after: 200 })
    await cash.pressSequentially('64.80', { delay: 120 })
    await r.pause(800)
    await r.click(dialog.getByRole('button', { name: /^Use the till/ }), { label: 'card', ms: 700, after: 900 })
    const who = dialog.getByRole('table', { name: 'Who shares them' })
    await who.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await r.pause(900)
    await r.focus(who, 'split', { move: true }); await r.pause(2600)
    const status = dialog.getByLabel('Status')
    await status.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await r.pause(700)
    await r.click(status, { label: 'status', ms: 700, after: 500 })
    await r.click(page.getByRole('option', { name: 'Shared out' }), { label: 'shared', ms: 500, after: 600 })
    await r.click(dialog.getByRole('button', { name: 'Save' }), { label: 'save', ms: 700, after: 200 })
    await toast(page, 'Shared out')
    await dialog.waitFor({ state: 'detached' })
    await r.pause(1000)
    const list = page.getByRole('region', { name: 'Tips shared out' })
    await list.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await r.pause(1200)
    await r.focus(list.getByRole('row').nth(1), 'pool', { move: true }); await r.pause(3000)
    await r.stop()
    // The shares as the app worked them out, for the film's drawn phone (Maria's share) at the end.
    const row = (await list.getByRole('row').nth(1).innerText()).replace(/\s+/g, ' ')
    const share = name => row.match(new RegExp(`${name} (€[\\d.,]+)`))?.[1]
    const total = row.match(/€[\d.,]+/g)?.[2]
    writeFileSync(join(OUT, 'hours-shares.json'), `${JSON.stringify({ row, total, maria: share('Maria'), sam: share('Sam'), cleaner: share('Cleaner') }, null, 2)}\n`)
    console.log('tips:', row)
    await ctx.close()
  },
}

const wanted = process.argv.slice(2)
for (const [name, scene] of Object.entries(SCENES)) {
  if (wanted.length && !wanted.includes(name)) continue
  console.log(`▶ ${name}`)
  try { await scene() } catch (e) {
    // What the page looked like when it went wrong (VIDEO_DEBUG=folder).
    if (process.env.VIDEO_DEBUG) for (const c of browser.contexts()) for (const [i, p] of c.pages().entries()) await p.screenshot({ path: join(process.env.VIDEO_DEBUG, `hours-${name}-${i}.png`) }).catch(() => {})
    throw e
  }
}
await browser.close()
console.log(`Clips in ${OUT} (app: ${APP})`)
