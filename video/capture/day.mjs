// Records the "after" half of the day-in-the-life video ("A day with Business Agent"): the real app in
// demo mode, Easy Beans on Wednesday 9 December 2026, from opening to closing, into
// video/public/clips/day-<scene>.mp4 (+ .json).
//   npm run dev  (in the repo root, http://127.0.0.1:5173)
//   node video/capture/day.mjs [scene …]      (no scene: all of them)
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Recorder, go, openDemo, prepare } from './lib.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'clips')
mkdirSync(OUT, { recursive: true })
const SCALE = 1.5
/** The times of day, in Madrid (UTC+1 in December). */
const AT = (hm) => `2026-12-09T${String(Number(hm.slice(0, 2)) - 1).padStart(2, '0')}:${hm.slice(3)}:00Z`

const browser = await chromium.launch({
  args: ['--lang=en-GB', `--force-device-scale-factor=${SCALE}`],
  env: { ...process.env, LANG: 'en_GB.UTF-8', LC_ALL: 'en_GB.UTF-8', LANGUAGE: 'en_GB' },
})
async function desktop() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE, locale: 'en-GB', timezoneId: 'Europe/Madrid' })
  await prepare(ctx)
  return ctx
}
async function phone() {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, locale: 'en-GB', timezoneId: 'Europe/Madrid' })
  await prepare(ctx)
  return ctx
}
const toast = (page, text) => page.getByRole('alert').filter({ hasText: text }).first().waitFor()
const closeToasts = async page => {
  for (const b of await page.getByRole('alert').getByRole('button', { name: 'Close' }).all()) await b.click().catch(() => {})
  await page.waitForTimeout(400)
}

/** The café's opening and closing checklists, as activities on the weekly routine (every day). */
const OPENING = [['07:00', 'Unlock, lights and terrace'], ['07:05', 'Coffee machine on, first shot dialled in'], ['07:10', 'Fridge temperatures'], ['07:15', 'Count the float']]
const CLOSING = [['15:00', 'Clean the machine and grinders'], ['15:10', 'Cash up'], ['15:15', 'Fridges checked, pastries logged'], ['15:20', 'Lock up']]

/** Off camera, as the owner did once when setting up: the checklists on the routine, every day. */
async function addRoutine(page, items) {
  // Clicked by script: on a phone the bottom menu sits over the dialog's buttons, and none of this is filmed.
  const press = l => l.evaluate(el => el.click())
  await go(page, '/calendar?tab=routine')
  await page.getByRole('button', { name: 'Add an activity' }).waitFor()
  for (const [time, name] of items) {
    await press(page.getByRole('button', { name: 'Add an activity' }))
    const d = page.getByRole('dialog', { name: 'Add an activity' })
    await d.getByLabel('Name').fill(name)
    for (const b of await d.getByRole('group', { name: 'Days' }).getByRole('button').all()) {
      if ((await b.getAttribute('aria-pressed')) !== 'true') await press(b)
    }
    await d.getByLabel('From (optional)').fill(time)
    await press(d.getByRole('button', { name: 'Add', exact: true }))
    await d.waitFor({ state: 'detached' })
  }
  await closeToasts(page)
}

const SCENES = {
  /** 07:00, on the phone: the opening checklist ticked off, then the café's music on. */
  async open() {
    const ctx = await phone()
    const page = await openDemo(ctx, { time: AT('06:58') })
    await addRoutine(page, [...OPENING, ...CLOSING])
    await go(page, '/')
    await page.getByRole('heading', { name: 'Hola, Aron' }).waitFor()
    const card = page.getByRole('region', { name: 'Today’s routine' })
    await card.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, -90))
    await page.waitForTimeout(1200)
    const r = new Recorder(page, 'day-open', OUT)
    await r.start()
    await r.pause(900)
    for (const [, name] of OPENING) {
      await r.tap(card.getByRole('checkbox', { name: `Done: ${name}` }), { label: `tick-${name}`, after: 700 })
    }
    await r.pause(600)
    const play = page.getByRole('button', { name: 'Play', exact: true }).last()
    await play.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await r.pause(1300)
    await r.tap(play, { label: 'play', after: 200 })
    await toast(page, 'Playing the café playlist')
    await r.pause(1800)
    await r.stop()
    await ctx.close()
  },

  /** 09:00: every message in one inbox; Lucía's question answered. */
  async messages() {
    const ctx = await desktop()
    const page = await openDemo(ctx, { time: AT('09:05'), path: '/messages' })
    await page.getByRole('heading', { name: 'Messages' }).waitFor()
    await page.mouse.move(900, 300)
    await page.waitForTimeout(1200)
    const r = new Recorder(page, 'day-messages', OUT)
    r.mouse = { x: 900, y: 300 }
    await r.start()
    await r.pause(900)
    await r.click(page.getByText('Do you have oat milk', { exact: false }).first(), { label: 'lucia', ms: 800, after: 900 })
    await r.type(page.getByLabel('Reply'), 'Yes! Oat, almond or coconut, at no extra charge 🌱', { label: 'reply', delay: 45 })
    await r.pause(300)
    await r.click(page.getByRole('button', { name: 'Send' }), { label: 'send', after: 1500 })
    await r.stop()
    await ctx.close()
  },

  /** 10:30: what's low, the order to each supplier written already; sent on WhatsApp. */
  async order() {
    const ctx = await desktop()
    const page = await openDemo(ctx, { time: AT('10:30'), path: '/stock' })
    await page.getByRole('heading', { name: 'Current stock' }).waitFor()
    // WhatsApp opens in a new tab: closed again at once, the recording stays on the order list.
    ctx.on('page', p => { if (p !== page) void p.close().catch(() => {}) })
    await page.mouse.move(1000, 300)
    await page.waitForTimeout(1000)
    const r = new Recorder(page, 'day-order', OUT)
    r.mouse = { x: 1000, y: 300 }
    await r.start()
    await r.pause(700)
    await r.click(page.getByRole('tab', { name: /Order list/ }), { label: 'order-list', ms: 800, after: 1300 })
    await r.focus(page.getByRole('table', { name: /Order for By Eric/ }), 'eric', { move: true })
    await r.pause(900)
    await r.click(page.getByRole('link', { name: 'WhatsApp' }).first(), { label: 'whatsapp', ms: 700, after: 1600 })
    await r.stop()
    await ctx.close()
  },

  /** 13:00: today's croissants on their last day, on offer by themselves (on the counter TV), and the rule that did it. */
  async offer() {
    const ctx = await desktop()
    const page = await openDemo(ctx, { time: AT('13:05'), path: '/offers' })
    await page.getByRole('heading', { name: 'Offers & specials' }).waitFor()
    await page.getByText('Automatic: last day').first().waitFor()
    await page.mouse.move(1000, 300)
    await page.waitForTimeout(1500)
    const r = new Recorder(page, 'day-offer', OUT)
    r.mouse = { x: 1000, y: 300 }
    await r.start()
    await r.pause(900)
    await r.focus(page.getByText('Automatic: last day').first(), 'automatic', { move: true })
    await r.pause(1400)
    await r.scrollBy(560, 1800)
    await r.pause(400)
    await r.focus(page.getByText('Today’s bakes').first(), 'rule', { move: true })
    await r.pause(1800)
    await r.stop()
    await ctx.close()
  },

  /** 12:00: the week's posts, already scheduled. */
  async social() {
    const ctx = await desktop()
    const page = await openDemo(ctx, { time: AT('12:00'), path: '/social' })
    await page.getByRole('heading', { name: 'Social planner' }).waitFor()
    await page.mouse.move(1100, 360)
    await page.waitForTimeout(1500)
    const r = new Recorder(page, 'day-social', OUT)
    r.mouse = { x: 1100, y: 360 }
    await r.start()
    await r.pause(1200)
    await r.glide(760, 560, 1200)
    await r.scrollBy(380, 2200)
    await r.pause(1600)
    await r.stop()
    await ctx.close()
  },

  /** 14:00: suppliers' invoices in from the mailbox, the last one marked paid; the Tax page, all filed, the next return in view. */
  async accounts() {
    const ctx = await desktop()
    const page = await openDemo(ctx, { time: AT('14:00'), path: '/connections' })
    // Off camera, as an organised owner has it: the mailbox and Drive connected, the older bills paid,
    // last quarter's returns filed.
    await page.getByRole('button', { name: 'Connect Gmail' }).click(); await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Connect Google Drive' }).click(); await page.waitForTimeout(500)
    await go(page, '/invoices')
    await page.getByRole('heading', { name: 'Invoices', exact: true }).first().waitFor({ timeout: 60000 })
    await page.getByRole('button', { name: 'Allow reading' }).click().catch(() => {})
    await page.waitForTimeout(800)
    const setStatus = async (row, label) => {
      await row.getByRole('combobox').first().click()
      await page.getByRole('option', { name: label, exact: true }).click()
      await page.waitForTimeout(500)
    }
    await setStatus(page.getByRole('row', { name: /Lácteos Costa del Sol/ }).first(), 'Paid')
    await setStatus(page.getByRole('row', { name: /By Eric/ }).first(), 'Paid')
    await closeToasts(page)
    await page.mouse.move(1000, 360)
    await page.waitForTimeout(1200)
    const r = new Recorder(page, 'day-invoices', OUT)
    r.mouse = { x: 1000, y: 360 }
    await r.start()
    await r.pause(1100)
    const last = page.getByRole('row', { name: /F2026-0131/ }).first()
    await r.click(last.getByRole('combobox').first(), { label: 'status', ms: 900, after: 700 })
    await r.click(page.getByRole('option', { name: 'Paid', exact: true }), { label: 'paid', ms: 500, after: 1600 })
    await r.stop()

    await go(page, '/tax')
    await page.getByRole('heading', { name: 'Tax', exact: true }).first().waitFor({ timeout: 60000 })
    for (const name of [/111.*Q3|Q3.*111/, /115.*Q3|Q3.*115/, /303.*Q3|Q3.*303/]) {
      const row = page.getByRole('row', { name }).first()
      if (await row.count()) await setStatus(row, 'Filed')
    }
    await closeToasts(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.mouse.move(r.mouse.x, r.mouse.y)
    await page.waitForTimeout(1200)
    const t = new Recorder(page, 'day-tax', OUT)
    t.mouse = r.mouse
    await t.start()
    await t.pause(900)
    await t.glide(560, 300, 1100)
    await t.pause(900)
    await t.scrollBy(300, 1800)
    await t.pause(1200)
    await t.stop()
    await ctx.close()
  },

  /** 14:30: the terrace licence runs out at the end of the month; renewed in one press. */
  async licence() {
    const ctx = await desktop()
    const page = await openDemo(ctx, { time: AT('14:30'), path: '/legal' })
    await page.getByRole('heading', { name: 'Legal & licences' }).waitFor()
    // Off camera: what had already run out in the sample data, renewed (an organised owner's licences).
    for (const name of [/extintores/i, /responsabilidad civil/i]) {
      const row = page.getByRole('row', { name }).first()
      if (await row.count()) { await row.getByRole('button', { name: /^Renewed/ }).click(); await page.waitForTimeout(500) }
    }
    await closeToasts(page)
    await page.mouse.move(1000, 300)
    await page.waitForTimeout(1500)
    const r = new Recorder(page, 'day-licence', OUT)
    r.mouse = { x: 1000, y: 300 }
    await r.start()
    await r.pause(900)
    const row = page.getByRole('row', { name: /terraza/i }).first()
    await r.focus(row, 'terrace', { move: true })
    await r.pause(1000)
    await r.click(row.getByRole('button', { name: /^Renewed/ }), { label: 'renew', ms: 700, after: 200 })
    await page.getByRole('alert').first().waitFor()
    await r.pause(1800)
    await r.stop()
    await ctx.close()
  },

  /** 15:00, on the phone: the closing checklist ticked off. */
  async close() {
    const ctx = await phone()
    const page = await openDemo(ctx, { time: AT('15:00') })
    await addRoutine(page, [...OPENING, ...CLOSING])
    await go(page, '/')
    await page.getByRole('heading', { name: 'Hola, Aron' }).waitFor()
    const card = page.getByRole('region', { name: 'Today’s routine' })
    // Off camera: the morning's already done.
    for (const [, name] of OPENING) { await card.getByRole('checkbox', { name: `Done: ${name}` }).evaluate(el => el.click()); await page.waitForTimeout(250) }
    await closeToasts(page)
    await card.getByRole('checkbox', { name: `Done: ${CLOSING[0][1]}` }).evaluate(el => el.scrollIntoView({ block: 'start' }))
    await page.evaluate(() => window.scrollBy(0, -330))
    await page.waitForTimeout(1200)
    const r = new Recorder(page, 'day-close', OUT)
    await r.start()
    await r.pause(900)
    for (const [, name] of CLOSING) {
      await r.tap(card.getByRole('checkbox', { name: `Done: ${name}` }), { label: `tick-${name}`, after: 700 })
    }
    await r.pause(1600)
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
console.log(`Clips in ${OUT}`)
