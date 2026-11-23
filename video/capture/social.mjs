// Records the app scenes of the "Instagram and TikTok never get posted" video ("Never short of a post.",
// video/src/social/): Easy Beans Coffee in the real app in demo mode. Julio, on his phone, picks up the owner's idea
// "The coffees we have now", adds the photo he took and hands it in; then the owner, at the computer (TikTok and
// Google Drive connected off camera, and Julio's hand-in made again off camera, as the demo starts afresh each time),
// makes the post from it in one press, adds a line to the caption and schedules it for six o'clock on Instagram,
// TikTok and the café's other accounts. The photo is drawn (./socialPhotos.mjs). Into video/public/clips (social-*.mp4 + .json).
//   npm run dev  (in the repo root, http://127.0.0.1:5173)
//   node video/capture/social.mjs [scene …]      (no scene: all of them)
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP, Recorder, go, openDemo, prepare } from './lib.mjs'
import { drawPhotos } from './socialPhotos.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'public', 'clips')
mkdirSync(OUT, { recursive: true })
/** Wednesday 9 December 2026, 09:55 in Madrid, as the other videos. */
const TIME = '2026-12-09T08:55:00Z'
const SCALE = 1.5
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 393, height: 852 }
const IDEA = 'Idea: The coffees we have now'

const browser = await chromium.launch({
  args: ['--lang=en-GB', `--force-device-scale-factor=${SCALE}`],
  env: { ...process.env, LANG: 'en_GB.UTF-8', LC_ALL: 'en_GB.UTF-8', LANGUAGE: 'en_GB' },
})
// The photo Julio takes: the three bags and a cup of each (drawn, kept with the stills).
const [PHOTO] = await drawPhotos(browser, join(HERE, '..', 'public', 'stills', 'social'))

const toast = (page, text) => page.getByRole('alert').filter({ hasText: text }).first().waitFor()

/** Adds the photo to an idea through the file picker its button opens. */
async function addPhoto(page, press) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), press()])
  await chooser.setFiles([PHOTO])
}

/** The demo's own banner, hidden once it's been used off camera (as lib.mjs hides it from the start elsewhere). */
const hideBanner = page => page.evaluate(() => {
  const hide = () => {
    const banner = document.querySelector('[aria-label="View as"]')?.closest('.MuiAlert-root')
    if (banner) banner.style.display = 'none'
    for (const b of document.querySelectorAll('button')) if (/Quick actions|Ask your agent/i.test(b.getAttribute('aria-label') || '')) b.style.visibility = 'hidden'
  }
  hide(); new MutationObserver(hide).observe(document, { childList: true, subtree: true })
})

/** Off camera, as the owner: TikTok and Google Drive connected (photos are kept there, and posts go out by themselves). */
async function connect(page) {
  const social = page.getByRole('region', { name: 'Social media' })
  await social.getByRole('button', { name: 'Connect TikTok' }).click()
  await social.getByRole('article', { name: 'TikTok' }).filter({ hasText: 'Connected' }).waitFor()
  const files = page.getByRole('region', { name: 'Files and storage' })
  await files.getByRole('button', { name: 'Connect Google Drive' }).click()
  await files.getByRole('article', { name: 'Google Drive' }).filter({ hasText: 'Connected' }).waitFor()
}

/** The demo's "View as": someone else on the team, without leaving the page. */
async function viewAs(page, who) {
  await page.getByLabel('View as').click()
  await page.getByRole('option', { name: new RegExp(who) }).click()
  await page.waitForTimeout(1000)
}

const SCENES = {
  /** Julio's phone: the ideas for posts; he takes the coffees one, adds his photo and hands it in. */
  async phone() {
    const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, locale: 'en-GB', timezoneId: 'Europe/Madrid' })
    await prepare(ctx, { banner: true })
    // Off camera: the owner connects Google Drive (where the team's photos are kept); then it's Julio's phone.
    const page = await openDemo(ctx, { time: TIME, path: '/connections' })
    await connect(page)
    await go(page, '/social')
    await page.getByRole('heading', { name: 'Social planner' }).waitFor()
    await viewAs(page, 'Julio')
    await hideBanner(page)
    await page.evaluate(() => scrollTo(0, 0))
    await page.waitForTimeout(2500)
    const r = new Recorder(page, 'social-phone', OUT)
    await r.start()
    await r.pause(1500)
    await r.focus(page.getByRole('heading', { name: 'Ideas for posts' }), 'ideas'); await r.pause(1200)
    const card = page.getByRole('article', { name: IDEA })
    await card.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await r.pause(1500)
    await r.focus(card, 'idea'); await r.pause(1800)
    await r.tap(card.getByRole('button', { name: 'I’ll make it' }), { label: 'take', after: 1200 })
    await addPhoto(page, () => r.tap(card.getByRole('button', { name: /^Add photos/ }), { label: 'add', after: 200 }))
    await card.getByRole('listitem').first().waitFor()
    await r.pause(1800)
    await r.focus(card.getByRole('list', { name: 'Photos and videos' }), 'photo'); await r.pause(1200)
    await r.tap(card.getByRole('button', { name: 'Hand it in' }), { label: 'handin', after: 200 })
    await toast(page, 'Handed in')
    await r.pause(1200)
    await r.focus(card, 'handed'); await r.pause(2200)
    await r.stop()
    await ctx.close()
  },

  /** The owner: the idea handed in, made into a post in one press, a line added, scheduled for six on every account. */
  async post() {
    const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: SCALE, locale: 'en-GB', timezoneId: 'Europe/Madrid' })
    await prepare(ctx, { banner: true })
    const page = await openDemo(ctx, { time: TIME, path: '/connections' })
    // Off camera: TikTok and Google Drive connected, and Julio's hand-in, as he made it on his phone.
    await connect(page)
    await go(page, '/social')
    await page.getByRole('heading', { name: 'Social planner' }).waitFor()
    await viewAs(page, 'Julio')
    const his = page.getByRole('article', { name: IDEA })
    await his.getByRole('button', { name: 'I’ll make it' }).click()
    await addPhoto(page, () => his.getByRole('button', { name: /^Add photos/ }).click())
    await his.getByRole('listitem').first().waitFor()
    await his.getByRole('button', { name: 'Hand it in' }).click()
    await toast(page, 'Handed in')
    await viewAs(page, 'Aron')
    await hideBanner(page)
    await page.waitForTimeout(4500)
    await page.mouse.move(1180, 300)
    await page.waitForTimeout(800)

    const r = new Recorder(page, 'social-post', OUT)
    r.mouse = { x: 1180, y: 300 }
    await r.start()
    await r.pause(1200)
    const card = page.getByRole('article', { name: IDEA })
    await r.focus(card, 'idea', { move: true }); await r.pause(2200)
    await r.click(card.getByRole('button', { name: 'Make a post' }), { label: 'make', ms: 700, after: 1000 })
    const dialog = page.getByRole('dialog')
    await r.focus(dialog.getByRole('img').first().or(dialog.getByText(/^Photo/).first()), 'photo', { move: true }); await r.pause(1400)
    const caption = dialog.locator('textarea').first()
    await r.click(caption, { label: 'caption', dx: 0.9, ms: 600, after: 300 })
    await page.keyboard.press('ControlOrMeta+End')
    await caption.pressSequentially(': Ethiopia, Brazil and a decaf Colombia. Which one’s yours? ☕', { delay: 45 })
    await r.pause(900)
    // Every account that takes a photo post is ticked already: Instagram and TikTok among them.
    await r.focus(dialog.getByText('Post to'), 'targets', { move: true }); await r.pause(1600)
    const content = dialog.locator('.MuiDialogContent-root')
    await content.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }))
    await r.pause(1200)
    await r.click(dialog.getByRole('radio', { name: 'Schedule' }), { label: 'schedule', ms: 700, after: 700 })
    await content.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }))
    await r.pause(900)
    const time = dialog.getByLabel(/^Time/)
    await r.click(time, { label: 'time', dx: 0.15, ms: 600, after: 300 })
    await time.fill('18:00'); await r.pause(1100)
    await r.focus(dialog.getByText('Post it automatically'), 'auto', { move: true }); await r.pause(1400)
    await r.click(dialog.getByRole('button', { name: 'Schedule' }), { label: 'save', ms: 700, after: 200 })
    await page.getByRole('dialog').waitFor({ state: 'detached' })
    await r.pause(1000)
    const post = page.getByRole('article', { name: /^Post: The coffees we have now/ })
    await post.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await r.pause(1400)
    await r.focus(post, 'post', { move: true }); await r.pause(2600)
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
    if (process.env.VIDEO_DEBUG) for (const c of browser.contexts()) for (const [i, p] of c.pages().entries()) await p.screenshot({ path: join(process.env.VIDEO_DEBUG, `social-${name}-${i}.png`) }).catch(() => {})
    throw e
  }
}
await browser.close()
console.log(`Clips in ${OUT} (app: ${APP})`)
