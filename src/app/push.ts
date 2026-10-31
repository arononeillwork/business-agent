// Push notifications on this device: whether it can have them, turning them on (the browser asks
// the person, registers /push-sw.js and subscribes with the app's key) and off.
import type { Api } from '../data/api'

export type PushState =
  | 'unsupported'     // this browser can't (an old one, or private browsing)
  | 'install-first'   // an iPhone or iPad: only once the app is on the Home Screen
  | 'blocked'         // the person said no; only the browser's site settings can undo it
  | 'off' | 'on'

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** This device's subscription, if it has one (without asking the person anything). */
async function current() {
  const reg = await navigator.serviceWorker.getRegistration('/push-sw.js')
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIos() && !standalone() ? 'install-first' : 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return Notification.permission === 'granted' && (await current()) ? 'on' : 'off'
}

/** "iPhone · Safari", "Mac · Chrome": to tell this person's devices apart. */
export function deviceName() {
  const ua = navigator.userAgent
  const what = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (isIos() && /Macintosh/.test(ua)) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  return [what, standalone() ? 'App' : browser].filter(Boolean).join(' · ') || 'This device'
}

const keyBytes = (b64: string) => {
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

/** Ask the person, then subscribe this device and save it. Throws with what to tell them. */
export async function turnOnPush(api: Api, messages: { blocked: string; notReady: string }) {
  const key = await api.pushKey()
  if (!key) throw new Error(messages.notReady)
  if (await Notification.requestPermission() !== 'granted') throw new Error(messages.blocked)
  const reg = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  // One made with another key (the app's key changed) can't be used: start again.
  const same = sub?.options.applicationServerKey &&
    btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))) === btoa(String.fromCharCode(...keyBytes(key)))
  if (sub && !same) { await sub.unsubscribe(); sub = null }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) })
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  await api.savePushDevice({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device: deviceName() })
  return json.endpoint
}

/** Stop this device getting them, and forget it. */
export async function turnOffPush(api: Api) {
  const sub = await current()
  if (!sub) return
  await api.removePushDevice(sub.endpoint)
  await sub.unsubscribe()
}

/** This device's endpoint (to mark it in the list), or null. */
export async function thisDevice() {
  return supported() ? (await current())?.endpoint ?? null : null
}
