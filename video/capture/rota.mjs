// Records the app scenes of the shared rota video ("One rota. Everyone on the same page.", video/src/rota/): Easy
// Beans Coffee in the real app in demo mode. The owner adds Sam a Saturday shift, once; on Maria's phone the same
// rota, Sam's new shift on it, and she takes Sunday's open shift with a tap; back at the computer it's all there,
// then the rota on WhatsApp: each person's own shifts ("Send on WhatsApp"), and the whole week to the team's group
// ("Share to a WhatsApp group", WhatsApp's share link, caught here and its message kept for the film's drawn group in
// rota-group.json). As the demo starts afresh each time, the earlier changes are made again off camera, with the
// demo's "View as". The demo's Julio is shown as Sam throughout (his name kept out of the film). Into
// video/public/clips (rota-*.mp4 + .json).
//   npm run dev  (in the repo root, http://127.0.0.1:5173)
//   node video/capture/rota.mjs [scene …]      (no scene: all of them)
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP, Recorder, go, openDemo, prepare } from './lib.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'clips')
mkdirSync(OUT, { recursive: true })
/** Wednesday 9 December 2026, 09:55 in Madrid, as the other videos. */
const TIME = '2026-12-09T08:55:00Z'
const SCALE = 1.5
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 393, height: 852 }
const CELL = 'Add a shift for Julio on Saturday 12'

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

/** The demo's own banner, hidden once it's been used off camera (as lib.mjs hides it from the start elsewhere). */
const hideBanner = page => page.evaluate(() => {
  const hide = () => {
    const banner = document.querySelector('[aria-label="View as"]')?.closest('.MuiAlert-root')
    if (banner) banner.style.display = 'none'
    for (const b of document.querySelectorAll('button')) if (/Quick actions|Ask your agent/i.test(b.getAttribute('aria-label') || '')) b.style.visibility = 'hidden'
  }
  hide(); new MutationObserver(hide).observe(document, { childList: true, subtree: true })
})

/** The demo's "View as": someone else on the team, without leaving the page. */
async function viewAs(page, who) {
  await page.getByLabel('View as').click()
  await page.getByRole('option', { name: new RegExp(who) }).click()
  await page.waitForTimeout(1000)
}

/** Off camera, as the owner: Sam's Saturday shift, 09:00 to 14:00 (as the first recording adds it on camera). */
async function addSaturday(page) {
  await page.getByRole('button', { name: 'Add shift' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Team member').click()
  await page.getByRole('option', { name: /^(Julio|Sam)$/ }).click()
  await dialog.getByLabel('Date').fill('2026-12-12')
  await dialog.getByLabel('Start').fill('09:00')
  await dialog.getByLabel('End').fill('14:00')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** A desktop window signed in as the owner on the rota; `banner` keeps the demo's "View as" for changes off camera. */
async function desktop(banner = false) {
  const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: SCALE, locale: 'en-GB', timezoneId: 'Europe/Madrid' })
  await prepare(ctx, { banner })
  await ctx.addInitScript(RENAME)
  const page = await openDemo(ctx, { time: TIME, path: '/rota' })
  await page.getByRole('heading', { name: 'Rota', level: 1 }).waitFor()
  return { ctx, page }
}

const SCENES = {
  /** The owner: the week's rota, and Sam's Saturday added once, straight in his row. */
  async change() {
    const { ctx, page } = await desktop()
    await page.mouse.move(1180, 300)
    await page.waitForTimeout(1500)
    const r = new Recorder(page, 'rota-change', OUT)
    r.mouse = { x: 1180, y: 300 }
    await r.start()
    await r.pause(1400)
    await r.focus(page.getByText('Scheduled', { exact: true }), 'week', { move: true }); await r.pause(1600)
    const cell = page.getByLabel(CELL)
    await r.focus(cell, 'cell', { move: true }); await r.pause(900)
    await r.click(cell, { label: 'add', ms: 500, after: 900 })
    const dialog = page.getByRole('dialog')
    await r.focus(dialog.getByLabel('Team member'), 'who', { move: true }); await r.pause(1200)
    const start = dialog.getByLabel('Start')
    await r.click(start, { label: 'start', dx: 0.2, ms: 600, after: 200 })
    await start.fill('09:00'); await r.pause(700)
    const end = dialog.getByLabel('End')
    await r.click(end, { label: 'end', dx: 0.2, ms: 600, after: 200 })
    await end.fill('14:00'); await r.pause(900)
    await r.click(dialog.getByRole('button', { name: 'Save' }), { label: 'save', ms: 700, after: 200 })
    await dialog.waitFor({ state: 'detached' })
    await r.pause(900)
    await r.focus(page.getByText('Sam', { exact: true }).first(), 'julio', { move: true }); await r.pause(2600)
    await r.stop()
    await ctx.close()
  },

  /** Maria's phone: the same rota, Sam's new Saturday on it; Sunday's open shift, taken with a tap. */
  async phone() {
    const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, locale: 'en-GB', timezoneId: 'Europe/Madrid' })
    await prepare(ctx, { banner: true })
    await ctx.addInitScript(RENAME)
    const page = await openDemo(ctx, { time: TIME, path: '/rota' })
    await page.getByRole('heading', { name: 'Rota', level: 1 }).waitFor()
    await addSaturday(page)
    await viewAs(page, 'Maria')
    await hideBanner(page)
    await page.evaluate(() => scrollTo(0, 0))
    await page.waitForTimeout(2500)
    const r = new Recorder(page, 'rota-phone', OUT)
    await r.start()
    await r.pause(1500)
    const sat = page.getByText('Sat 12', { exact: true })
    await r.tap(sat, { label: 'sat', after: 900 })
    await sat.evaluate(el => el.closest('.MuiCard-root, section, div')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    await r.pause(1200)
    await r.focus(page.getByText('Sam', { exact: true }).first(), 'julio'); await r.pause(2200)
    const sun = page.getByText('Sun 13', { exact: true })
    await r.tap(sun, { label: 'sun', after: 1200 })
    const open = page.getByRole('button').filter({ hasText: 'Tap to take' }).first()
    await open.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await r.pause(1200)
    await r.focus(open, 'open'); await r.pause(1400)
    await r.tap(open, { label: 'take', after: 200 })
    await toast(page, 'Shift is yours')
    await r.pause(2400)
    await r.stop()
    await ctx.close()
  },

  /** Back at the computer, all of it on the rota; then each person's shifts on WhatsApp, and the week to the team's group. */
  async whatsapp() {
    const { ctx, page } = await desktop(true)
    // WhatsApp's share link: caught, its message kept, and closed (the film draws the group it goes to).
    let shared = null
    await ctx.route('https://wa.me/**', route => { shared = new URL(route.request().url()).searchParams.get('text'); return route.fulfill({ contentType: 'text/html', body: 'WhatsApp' }) })
    ctx.on('page', p => { if (p !== page) void p.waitForLoadState().then(() => p.close()).catch(() => {}) })
    await addSaturday(page)
    await viewAs(page, 'Maria')
    await page.getByRole('button').filter({ hasText: '09:00–16:00' }).first().click()
    await toast(page, 'Shift is yours')
    await viewAs(page, 'Aron')
    await hideBanner(page)
    await page.waitForTimeout(4500)
    await page.mouse.move(1180, 300)
    await page.waitForTimeout(800)
    const r = new Recorder(page, 'rota-whatsapp', OUT)
    r.mouse = { x: 1180, y: 300 }
    await r.start()
    await r.pause(1400)
    await r.focus(page.getByLabel(CELL).or(page.getByRole('button').filter({ hasText: '09:00–16:00' })).first(), 'weekend', { move: true }); await r.pause(2000)
    await r.click(page.getByRole('button', { name: 'Send on WhatsApp' }), { label: 'send', ms: 800, after: 200 })
    await toast(page, 'Rota sent on WhatsApp')
    await r.pause(2200)
    await r.click(page.getByRole('button', { name: 'Share to a WhatsApp group' }), { label: 'share', ms: 800, after: 200 })
    await toast(page, 'WhatsApp is open')
    await r.pause(2600)
    await r.stop()
    if (!shared) throw new Error('No message went to WhatsApp')
    // The message for the film's drawn group, the address of the café's app in it rather than this computer's, and Sam.
    writeFileSync(join(OUT, 'rota-group.json'), `${JSON.stringify({ text: shared.replace(APP, 'https://businesssagent.com').split('Julio').join('Sam') }, null, 2)}\n`)
    await ctx.close()
  },
}

const wanted = process.argv.slice(2)
for (const [name, scene] of Object.entries(SCENES)) {
  if (wanted.length && !wanted.includes(name)) continue
  console.log(`▶ ${name}`)
  try { await scene() } catch (e) {
    // What the page looked like when it went wrong (VIDEO_DEBUG=folder).
    if (process.env.VIDEO_DEBUG) for (const c of browser.contexts()) for (const [i, p] of c.pages().entries()) await p.screenshot({ path: join(process.env.VIDEO_DEBUG, `rota-${name}-${i}.png`) }).catch(() => {})
    throw e
  }
}
await browser.close()
console.log(`Clips in ${OUT} (app: ${APP})`)
