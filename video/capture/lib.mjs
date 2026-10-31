// Recording the real app for the video: Chrome's own screencast (every frame it paints, as JPEG,
// with its timestamp) turned into a constant-30fps MP4 by ffmpeg, a cursor drawn into the page,
// and a log of where each click landed (for the camera's zooms in Remotion).
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const APP = process.env.APP_URL ?? 'http://127.0.0.1:5173'
export const FPS = 30

/** A cursor (macOS-style arrow) and a soft ring on each press, so the recording shows where you click. */
const CURSOR = `(() => {
  if (window.__baCursor) return; window.__baCursor = true
  const ready = () => {
    const c = document.createElement('div')
    c.id = '__ba_cursor'
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M5 3 L5 22 L10 17.5 L13.5 25 L16.8 23.6 L13.4 16.2 L20 16.2 Z" fill="#1f1a17" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', width: '28px', height: '28px', pointerEvents: 'none', zIndex: 2147483647,
      transform: 'translate(-200px,-200px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.25))', transition: 'opacity .2s' })
    document.documentElement.appendChild(c)
    let x = -200, y = -200
    addEventListener('mousemove', e => { x = e.clientX; y = e.clientY; c.style.transform = 'translate(' + (x - 5) + 'px,' + (y - 3) + 'px)' }, true)
    addEventListener('mousedown', () => {
      const r = document.createElement('div')
      Object.assign(r.style, { position: 'fixed', left: (x - 22) + 'px', top: (y - 22) + 'px', width: '44px', height: '44px', borderRadius: '50%',
        background: 'rgba(247,155,164,.35)', border: '2px solid rgba(168,90,104,.55)', pointerEvents: 'none', zIndex: 2147483646,
        transform: 'scale(.3)', opacity: '1', transition: 'transform .45s cubic-bezier(.2,.8,.2,1), opacity .5s ease-out' })
      document.documentElement.appendChild(r)
      requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transform = 'scale(1.25)'; r.style.opacity = '0' }))
      setTimeout(() => r.remove(), 700)
      c.style.scale = '0.86'; setTimeout(() => { c.style.scale = '1' }, 140)
    }, true)
    // A touch screen: a finger's dot instead of the arrow.
    if (matchMedia('(pointer: coarse)').matches) {
      c.innerHTML = ''; Object.assign(c.style, { width: '46px', height: '46px', borderRadius: '50%', background: 'rgba(43,37,34,.18)',
        border: '2px solid rgba(255,255,255,.85)', filter: 'none', opacity: '0' })
      addEventListener('mousemove', () => { c.style.transform = 'translate(' + (x - 23) + 'px,' + (y - 23) + 'px)' }, true)
      addEventListener('mousedown', () => { c.style.opacity = '1' }, true)
      addEventListener('mouseup', () => { setTimeout(() => { c.style.opacity = '0' }, 250) }, true)
    }
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', ready); else ready()
})()`

/** The demo's own banner ("Demo · sample data…") isn't part of the product: hidden while recording. */
const NO_DEMO_BANNER = `(() => {
  const hide = () => {
    const sel = document.querySelector('[aria-label="View as"]')
    const banner = sel && sel.closest('.MuiAlert-root')
    if (banner && banner.style.display !== 'none') banner.style.display = 'none'
    for (const b of document.querySelectorAll('button')) if (/Quick actions|Ask your agent/i.test(b.getAttribute('aria-label') || '')) b.style.visibility = 'hidden'
  }
  new MutationObserver(hide).observe(document, { childList: true, subtree: true })
  addEventListener('DOMContentLoaded', hide)
})()`

export async function prepare(context, { banner = false } = {}) {
  await context.addInitScript(CURSOR)
  if (!banner) await context.addInitScript(NO_DEMO_BANNER)
}

/** Sign in to the demo as one of its people, at a fixed time (Madrid). */
export async function openDemo(context, { email = 'aron@example.com', time, path = '/' } = {}) {
  const page = await context.newPage()
  if (time) await page.clock.install({ time: new Date(time) })
  await page.goto(`${APP}${path}${path.includes('?') ? '&' : '?'}demo`)
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('heading', { name: 'Sign in' }).waitFor({ state: 'detached' })
  await page.waitForTimeout(600)
  return page
}

/** Client-side navigation (no reload: the demo's data lives in the page and a reload starts it again). */
export async function go(page, path) {
  await page.evaluate(p => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')) }, path)
  await page.waitForTimeout(500)
}

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** One recording: frames from Chrome as they're painted, the cursor's path and the clicks. */
export class Recorder {
  constructor(page, name, outDir) {
    this.page = page; this.name = name; this.outDir = outDir
    this.frames = []; this.events = []; this.mouse = { x: -100, y: -100 }
  }

  async start() {
    const vp = this.page.viewportSize()
    this.cdp = await this.page.context().newCDPSession(this.page)
    this.dpr = await this.page.evaluate(() => devicePixelRatio)
    this.cdp.on('Page.screencastFrame', async f => {
      this.frames.push({ t: f.metadata.timestamp, data: f.data })
      try { await this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }) } catch { /* closed */ }
    })
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: Math.round(vp.width * this.dpr), maxHeight: Math.round(vp.height * this.dpr), everyNthFrame: 1 })
    // Chrome only paints when something changes: a tiny invisible ticker keeps frames coming.
    await this.page.evaluate(() => {
      if (document.getElementById('__ba_tick')) return
      const d = document.createElement('div'); d.id = '__ba_tick'
      Object.assign(d.style, { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', opacity: '0.01', pointerEvents: 'none', zIndex: 2147483647 })
      document.documentElement.appendChild(d)
      let n = 0; const tick = () => { d.style.background = (n++ % 2) ? '#fff' : '#fefefe'; requestAnimationFrame(tick) }; tick()
    })
    await this.page.waitForTimeout(250)
    this.t0 = this.frames[0]?.t ?? Date.now() / 1000
    this.wall0 = Date.now()
  }

  /** Seconds since the recording started (by the screencast's clock). */
  now() { return (Date.now() - this.wall0) / 1000 }

  mark(type, extra = {}) { this.events.push({ t: +this.now().toFixed(3), type, ...extra }) }

  async pause(ms) { await this.page.waitForTimeout(ms) }

  /** Glide the cursor to a point over `ms`, eased like a hand. */
  async glide(x, y, ms = 700) {
    const from = { ...this.mouse }, steps = Math.max(8, Math.round(ms / 16))
    for (let i = 1; i <= steps; i++) {
      const k = ease(i / steps)
      await this.page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k)
      await this.page.waitForTimeout(ms / steps)
    }
    this.mouse = { x, y }
  }

  async boxOf(locator) {
    await locator.scrollIntoViewIfNeeded()
    const b = await locator.boundingBox()
    if (!b) throw new Error(`${this.name}: nothing to point at`)
    return b
  }

  /** Move to an element (its centre, or a point inside it) and click it, logging where. */
  async click(locator, { ms = 650, dx = 0.5, dy = 0.5, label, after = 350 } = {}) {
    const b = await this.boxOf(locator)
    const x = b.x + b.width * dx, y = b.y + b.height * dy
    await this.glide(x, y, ms)
    await this.page.waitForTimeout(120)
    this.mark('click', { x, y, box: b, label })
    await this.page.mouse.down(); await this.page.waitForTimeout(70); await this.page.mouse.up()
    await this.page.waitForTimeout(after)
  }

  /** Tap on a touch screen (the phone): the finger's dot shows where. */
  async tap(locator, { label, after = 400 } = {}) {
    const b = await this.boxOf(locator)
    const x = b.x + b.width / 2, y = b.y + b.height / 2
    await this.page.mouse.move(x, y); this.mouse = { x, y }
    this.mark('click', { x, y, box: b, label })
    await this.page.mouse.down(); await this.page.waitForTimeout(110); await this.page.mouse.up()
    await this.page.waitForTimeout(after)
  }

  async type(locator, text, { delay = 75, label } = {}) {
    await this.click(locator, { label })
    await locator.press('ControlOrMeta+a')
    await locator.pressSequentially(text, { delay })
  }

  /** Point the camera at an element without clicking (a label for Remotion). */
  async focus(locator, label, { move = false } = {}) {
    const b = await this.boxOf(locator)
    if (move) await this.glide(b.x + b.width / 2, b.y + b.height / 2, 600)
    this.mark('focus', { box: b, label })
  }

  async scrollBy(dy, ms = 900) {
    const steps = Math.round(ms / 16)
    let done = 0
    for (let i = 1; i <= steps; i++) {
      const target = Math.round(dy * ease(i / steps))
      await this.page.mouse.wheel(0, target - done); done = target
      await this.page.waitForTimeout(ms / steps)
    }
  }

  /** Stop and write <name>.mp4 (30fps, the frames held for as long as Chrome showed them) and <name>.json. */
  async stop() {
    await this.page.waitForTimeout(300)
    await this.cdp.send('Page.stopScreencast')
    await this.page.evaluate(() => document.getElementById('__ba_tick')?.remove())
    const dir = join(this.outDir, `${this.name}.frames`)
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
    const frames = this.frames
    const t0 = frames[0].t
    let list = ''
    frames.forEach((f, i) => {
      const file = `${String(i).padStart(5, '0')}.jpg`
      writeFileSync(join(dir, file), Buffer.from(f.data, 'base64'))
      const next = frames[i + 1]?.t ?? f.t + 0.5
      list += `file '${file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`
    })
    list += `file '${String(frames.length - 1).padStart(5, '0')}.jpg'\n`
    writeFileSync(join(dir, 'list.txt'), list)
    const out = join(this.outDir, `${this.name}.mp4`)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'),
      '-vf', `fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-movflags', '+faststart', out])
    const duration = frames[frames.length - 1].t - t0 + 0.5
    const vp = this.page.viewportSize()
    // Event times are by the wall clock from start(); the screencast's first frame came ~0.25s before.
    const offset = (this.wall0 / 1000) - t0
    const meta = { name: this.name, fps: FPS, duration: +duration.toFixed(3), viewport: vp, dpr: this.dpr, frames: frames.length,
      events: this.events.map(e => ({ ...e, t: +(e.t + offset).toFixed(3) })) }
    writeFileSync(join(this.outDir, `${this.name}.json`), JSON.stringify(meta, null, 2))
    rmSync(dir, { recursive: true, force: true })
    console.log(`${this.name}: ${frames.length} frames over ${duration.toFixed(1)}s (${(frames.length / duration).toFixed(1)} fps) → ${out}`)
    return meta
  }
}
