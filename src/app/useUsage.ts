// The app's side of User analytics (src/app/usage.ts keeps the time): AppShell tells it the page on screen; it
// listens for touches, scrolls, keys and the app going out of sight, and sends what's built up through the API.
import { useEffect, useRef } from 'react'
import { useApp } from './AppContext'
import { makeUsageTracker, newVisitId, type VisitStore } from './usage'
import { SEND_EVERY_MS } from '../../shared/usage'

const KEY = 'ba-usage-visit'
const tabStore: VisitStore = {
  get() {
    try {
      const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { id?: unknown; user?: unknown; last?: unknown } | null
      return v && typeof v.id === 'string' && typeof v.user === 'string' && typeof v.last === 'number' ? { id: v.id, user: v.user, last: v.last } : null
    } catch { return null }
  },
  set(v) { try { sessionStorage.setItem(KEY, JSON.stringify(v)) } catch { /* storage unavailable: a new visit each report */ } },
}

const installed = () => {
  try { return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true } catch { return false }
}

const INPUTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'mousemove'] as const

/** This person's tracker: the same one if the app's frame is drawn again (so the page on screen isn't counted as opened twice). */
let kept: { api: unknown; user: string; tracker: ReturnType<typeof makeUsageTracker> } | null = null
function trackerFor(api: ReturnType<typeof useApp>['api'], user: string) {
  if (kept?.api !== api || kept.user !== user) {
    kept = { api, user, tracker: makeUsageTracker({
      user, now: () => Date.now(), send: r => api.recordUsage(r), newId: newVisitId, store: tabStore,
      installed: installed(), touch: navigator.maxTouchPoints > 0,
    }) }
  }
  return kept.tracker
}

/** Keep the time spent on `page` (the menu's key for the page on screen; null: not counted). AppShell, once. */
export function useUsage(page: string | null) {
  const { api, me } = useApp()
  const user = me?.id
  const tracker = useRef<ReturnType<typeof makeUsageTracker> | null>(null)
  useEffect(() => {
    if (!user) return
    const t = trackerFor(api, user)
    tracker.current = t
    // A tab opened out of sight counts nothing until it's looked at.
    if (document.visibilityState === 'hidden') t.hide()
    else t.reveal()
    const onInput = () => t.input()
    const onVisibility = () => (document.visibilityState === 'hidden' ? t.hide() : t.reveal())
    const onHide = () => t.hide()
    for (const e of INPUTS) document.addEventListener(e, onInput, { capture: true, passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onHide)
    const first = setTimeout(() => t.flush(), 3000)
    const every = setInterval(() => t.flush(), SEND_EVERY_MS)
    return () => {
      clearTimeout(first)
      clearInterval(every)
      for (const e of INPUTS) document.removeEventListener(e, onInput, { capture: true })
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onHide)
      // Signed out, or the frame went: what's built up goes now, and nothing counts until it's back.
      t.hide()
      tracker.current = null
    }
  }, [api, user])
  useEffect(() => { tracker.current?.show(page) }, [page, api, user])
}
