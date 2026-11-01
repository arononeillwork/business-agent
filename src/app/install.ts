// The app on a phone or tablet's Home Screen (a "progressive web app"): it opens full screen with its
// own icon, like any other app. Computers are never offered it. How it's added depends on the browser:
//   'prompt'  Chrome, Edge, Samsung Internet… on Android: the browser's own Install, in one tap
//   'ios'     iPhone and iPad (Safari, or Chrome, Edge, Firefox there): Share → Add to Home Screen
//   'menu'    Firefox on Android: its menu → Install
// The person's answer is kept on this device: "Not now" waits two weeks; a second "Not now", having
// seen the steps, or adding it, and the offer stops coming up by itself (it stays in the account menu).
import { useSyncExternalStore } from 'react'

export type InstallWay = 'prompt' | 'ios' | 'menu'

/** What the browser says about this device. */
export interface Device {
  ua: string
  platform: string
  touchPoints: number
  /** Chrome's own "this is a phone or tablet" (navigator.userAgentData.mobile). */
  mobile?: boolean
  /** A touch screen and no mouse: (hover: none) and (pointer: coarse). */
  touchOnly: boolean
  /** Opened from the Home Screen: already the app. */
  standalone: boolean
}

export function thisDevice(): Device {
  const nav = navigator as Navigator & { standalone?: boolean; userAgentData?: { mobile?: boolean } }
  const media = (q: string) => window.matchMedia?.(q).matches ?? false
  return {
    ua: nav.userAgent, platform: nav.platform, touchPoints: nav.maxTouchPoints ?? 0, mobile: nav.userAgentData?.mobile,
    touchOnly: media('(hover: none) and (pointer: coarse)'),
    standalone: nav.standalone === true || media('(display-mode: standalone)') || media('(display-mode: fullscreen)') || media('(display-mode: minimal-ui)'),
  }
}

/** An iPhone or iPad (an iPad says it's a Mac, but a Mac has no touch screen). */
export const isIos = (d: Pick<Device, 'ua' | 'platform' | 'touchPoints'>) =>
  /iPad|iPhone|iPod/.test(d.ua) || (d.platform === 'MacIntel' && d.touchPoints > 1)

/** A phone or tablet; never a computer, touch screen or not. */
export const phoneOrTablet = (d: Device) => isIos(d) || /Android|Mobile|Silk|Kindle/i.test(d.ua) || d.mobile === true || d.touchOnly

/** How this device can add the app, or null: a computer, already the app, or a browser that can't. */
export function installWay(d: Device, browserOffers: boolean): InstallWay | null {
  if (d.standalone || !phoneOrTablet(d)) return null
  if (browserOffers) return 'prompt'
  // Safari, Chrome, Edge and Firefox on an iPhone all can; an app's own browser (Instagram, Facebook, Google…) can't.
  if (isIos(d)) return /Safari\//.test(d.ua) && !/GSA\//.test(d.ua) ? 'ios' : null
  // Firefox has no Install for the page to start, but its menu has one.
  if (/Firefox\//.test(d.ua)) return 'menu'
  // Chrome and the others say when they can (below); until then it's on this phone already, or can't be.
  return null
}

/** The person's answer on this device. */
export interface Answer {
  /** Times they said "Not now". */
  declined?: number
  /** Not offered by itself before this (ms). */
  until?: number
  /** Added, or shown how: not offered by itself again. */
  done?: boolean
}

const WAIT = 14 * 24 * 3600_000
export const declineAnswer = (a: Answer, now: number): Answer => ({ ...a, declined: (a.declined ?? 0) + 1, until: now + WAIT })
/** Whether to bring the offer up by itself. */
export const shouldOffer = (a: Answer, now: number) => !a.done && (a.declined ?? 0) < 2 && (a.until ?? 0) <= now

const KEY = 'install-app'
const read = (): Answer => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Answer } catch { return {} } }
const keep = (a: Answer) => { try { localStorage.setItem(KEY, JSON.stringify(a)) } catch { /* storage unavailable */ } return a }

// Chrome's offer to install (beforeinstallprompt), held until the person taps Install.
interface BrowserOffer extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let offer: BrowserOffer | null = null
let steps = false

export interface InstallState { way: InstallWay | null; steps: boolean; answer: Answer }
const listeners = new Set<() => void>()
let state: InstallState = { way: null, steps: false, answer: {} }
function changed() {
  state = { way: installWay(thisDevice(), !!offer), steps, answer: read() }
  listeners.forEach(l => l())
}

// Listening from the start: Chrome can make its offer before anything is on screen.
if (typeof window !== 'undefined') {
  changed()
  window.addEventListener('beforeinstallprompt', e => {
    if (!phoneOrTablet(thisDevice())) return // a computer: the browser's own install button, as it is
    e.preventDefault() // the card below instead of Chrome's own bar
    offer = e as BrowserOffer
    changed()
  })
  window.addEventListener('appinstalled', () => { offer = null; keep({ ...read(), done: true }); changed() })
}

export const useInstall = () => useSyncExternalStore(
  l => { listeners.add(l); return () => { listeners.delete(l) } }, () => state, () => state)

/** Add the app: the browser's own Install where it has one, otherwise the steps. */
export async function install(): Promise<'accepted' | 'dismissed' | 'steps'> {
  const o = offer
  if (!o) { steps = true; changed(); return 'steps' }
  offer = null // each offer can be shown once; Chrome makes a new one on the next visit
  await o.prompt()
  const { outcome } = await o.userChoice
  keep(outcome === 'accepted' ? { ...read(), done: true } : declineAnswer(read(), Date.now()))
  changed()
  return outcome
}

export function notNow() { keep(declineAnswer(read(), Date.now())); changed() }

/** The steps were shown: they know how now. */
export function closeSteps() { steps = false; keep({ ...read(), done: true }); changed() }

/**
 * The service worker (public/push-sw.js) on phones and tablets: it opens pages straight from the site
 * (an offline page when there's no connection), which is what lets Android offer to install the app.
 */
export function startServiceWorker() {
  if (!('serviceWorker' in navigator) || !phoneOrTablet(thisDevice())) return
  navigator.serviceWorker.register('/push-sw.js', { scope: '/' }).catch(() => { /* not offered to install; the site works the same */ })
}
