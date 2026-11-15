// User analytics (Settings → User analytics, shared/usage.ts): the app keeps the time each page is in use and
// sends it to The Business Agent for the owners. A page's time counts while it's on screen and someone touched,
// scrolled, typed or moved the mouse in the last 3 minutes (so a phone left on the counter doesn't count hours).
// A visit is this tab in use without a 30-minute break. What's built up goes about once a minute, a few seconds
// after the app opens (so a visit shows straight away), and as the app is hidden or closed. Only the page's
// name in the menu is sent ('rules'), never what's on it.
import { IDLE_MS, MAX_PAGES, MAX_SECONDS, MAX_VIEWS, VISIT_GAP_MS, type UsageReport } from '../../shared/usage'

/** Where this tab keeps its visit: its id, whose it is, and when it was last in use. */
export interface VisitStore {
  get(): { id: string; user: string; last: number } | null
  set(v: { id: string; user: string; last: number }): void
}

export interface TrackerOptions {
  user: string
  now: () => number
  send: (report: UsageReport) => Promise<void>
  newId: () => string
  store: VisitStore
  installed: boolean
  touch: boolean
}

/** The clock behind it all, without the browser (useUsage.ts gives it the page, the events and the timers). */
export function makeUsageTracker(o: TrackerOptions) {
  let page: string | null = null
  let visible = true
  let lastInput = o.now()
  /** Counting the page's time from here; null while it isn't counting (hidden, idle, no page). */
  let since: number | null = null
  const pending = new Map<string, { ms: number; views: number }>()

  const add = (p: string, ms: number, views: number) => {
    if (!pending.has(p) && pending.size >= MAX_PAGES * 2) return
    const x = pending.get(p) ?? { ms: 0, views: 0 }
    pending.set(p, { ms: Math.min(x.ms + ms, MAX_SECONDS * 1000), views: Math.min(x.views + views, MAX_VIEWS) })
  }
  const stop = (at: number) => {
    if (since !== null && page) add(page, Math.max(0, at - since), 0)
    since = null
  }
  /** Counting stopped 3 minutes after the last touch, scroll or key. */
  const settle = (t: number) => { if (since !== null && t - lastInput >= IDLE_MS) stop(lastInput + IDLE_MS) }
  const start = (t: number) => { if (page && visible && since === null && t - lastInput < IDLE_MS) since = t }

  /** This tab's visit: the same one while it's this person's and in use, a new one after a 30-minute break. */
  const visit = (t: number) => {
    const v = o.store.get()
    const id = v && v.user === o.user && t - v.last < VISIT_GAP_MS ? v.id : o.newId()
    o.store.set({ id, user: o.user, last: t })
    return id
  }

  /** Send what's built up (the counting page's time so far included). */
  const flush = () => {
    const t = o.now()
    settle(t)
    if (since !== null) { stop(t); start(t) }
    const pages: UsageReport['pages'] = []
    for (const [p, x] of pending) {
      if (pages.length >= MAX_PAGES) break
      const seconds = Math.floor(x.ms / 1000)
      if (!seconds && !x.views) continue
      pages.push({ page: p, views: x.views, seconds })
      // Part of a second waits for the next report.
      if (x.ms - seconds * 1000 > 0) pending.set(p, { ms: x.ms - seconds * 1000, views: 0 })
      else pending.delete(p)
    }
    if (!pages.length) return
    const report: UsageReport = { visit: visit(t), installed: o.installed, touch: o.touch, pages }
    // One that doesn't arrive goes with the next.
    o.send(report).catch(() => { for (const p of pages) add(p.page, p.seconds * 1000, p.views) })
  }

  return {
    /** The page on screen now (its menu key), or null for one that isn't counted. The same page again isn't opening it again. */
    show(next: string | null) {
      const t = o.now()
      settle(t)
      if (next !== page) {
        stop(t)
        page = next
        if (next) add(next, 0, 1)
      }
      lastInput = t
      start(t)
    },
    /** A touch, click, scroll, key or mouse move. */
    input() {
      const t = o.now()
      settle(t)
      lastInput = t
      start(t)
    },
    /** The app went out of sight (another app, another tab, the screen off) or is closing: send now. */
    hide() {
      const t = o.now()
      settle(t)
      stop(t)
      visible = false
      flush()
    },
    /** Back on screen. */
    reveal() {
      const t = o.now()
      visible = true
      lastInput = t
      start(t)
    },
    flush,
  }
}

/** A new visit's id (an older iPhone has no crypto.randomUUID). */
export function newVisitId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
