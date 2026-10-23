// Screens: TVs and tablets in the café that play a slideshow. Each screen has its own secret link
// (opened once in the screen's browser, no sign-in) and a list of slides: pictures, videos, YouTube,
// Vimeo or Instagram, web pages, and the digital menus from the Menu page. Settings say how long
// each slide shows, how it changes to the next, and the music. Shared by the app and the Worker.
import { msg } from './i18n'
import type { MenuDesign, MenuItem } from './menu'
import type { BrandColour } from './types'

export type SlideKind = 'image' | 'video' | 'youtube' | 'vimeo' | 'instagram' | 'web' | 'menu'
export const SLIDE_KINDS: { id: SlideKind; label: string }[] = [
  { id: 'image', label: msg('Picture') },
  { id: 'video', label: msg('Video') },
  { id: 'youtube', label: msg('YouTube') },
  { id: 'vimeo', label: msg('Vimeo') },
  { id: 'instagram', label: msg('Instagram post') },
  { id: 'web', label: msg('Web page') },
  { id: 'menu', label: msg('Digital menu') },
]
export const kindLabel = (k: SlideKind) => SLIDE_KINDS.find(x => x.id === k)?.label ?? msg('Web page')

export interface Slide {
  id: string
  kind: SlideKind
  /** Its address (every kind but a menu). */
  url: string | null
  /** The digital menu it shows (kind menu). */
  design_id: string | null
  /** A name for it in the list (the address's when empty). */
  title: string | null
  /** Seconds on screen; null: the screen's own. A video with none plays to its end. */
  seconds: number | null
  /** Loaded again each time it shows (a webcam picture, a live page, a feed). */
  live: boolean
  /** Off: kept in the list but skipped. */
  active: boolean
}

export type Transition = 'fade' | 'slide' | 'zoom' | 'none'
export const TRANSITIONS: { id: Transition; label: string }[] = [
  { id: 'fade', label: msg('Fade') },
  { id: 'slide', label: msg('Slide across') },
  { id: 'zoom', label: msg('Zoom') },
  { id: 'none', label: msg('Cut (no effect)') },
]
export type Fit = 'cover' | 'contain'

export interface Screen {
  id: string
  name: string
  /** The secret in the screen's link (/display/<token>). */
  token: string
  orientation: 'landscape' | 'portrait'
  /** How long each slide shows, unless it says otherwise. */
  seconds: number
  transition: Transition
  /** How long the change from one slide to the next takes. */
  transition_ms: number
  shuffle: boolean
  /** Pictures and videos fill the screen (cropped) or fit inside it (with borders). */
  fit: Fit
  /** Music while it plays: an MP3 or a radio stream, or a YouTube video or playlist. */
  music_url: string | null
  /** 0–100. */
  music_volume: number
  /** Videos play with their own sound (the music pauses for them). */
  video_sound: boolean
  show_clock: boolean
  /** A line that runs along the bottom (today's special, the Wi-Fi). */
  ticker: string | null
  slides: Slide[]
  /** Off: the screen shows a quiet holding page. */
  active: boolean
  /** When the screen last asked for its slides (it does every minute while it's on). */
  last_seen_at: string | null
  updated_at: string
}
export type ScreenInput = Omit<Screen, 'id' | 'token' | 'last_seen_at' | 'updated_at'> & { id?: string }

export const MAX_SLIDES = 100
export const SECONDS_CHOICES = [5, 8, 10, 15, 20, 30, 45, 60, 120]

export const newScreen = (name: string): ScreenInput => ({
  name, orientation: 'landscape', seconds: 10, transition: 'fade', transition_ms: 800, shuffle: false, fit: 'cover', music_url: null,
  music_volume: 40, video_sound: false, show_clock: false, ticker: null, slides: [], active: true,
})

const IMAGE = /\.(jpe?g|png|gif|webp|avif|svg|bmp)$/i
const VIDEO = /\.(mp4|webm|m4v|mov|ogv|ogg)$/i

/** A YouTube video's id, from any of its addresses (watch, youtu.be, shorts, live, embed). */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^(www|m|music)\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
    if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null
    if (u.searchParams.get('v')) return u.searchParams.get('v')
    const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{6,})/)
    return m?.[1] ?? null
  } catch { return null }
}
/** A YouTube playlist's id (?list=…). */
export function youtubeList(url: string): string | null {
  try {
    const u = new URL(url)
    return /(^|\.)youtube\.com$/.test(u.hostname) ? u.searchParams.get('list') : null
  } catch { return null }
}
export function vimeoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (!/(^|\.)vimeo\.com$/.test(u.hostname)) return null
    return u.pathname.match(/\/(\d{5,})(?:\/|$)/)?.[1] ?? null
  } catch { return null }
}
/** An Instagram post or reel's code (instagram.com/p/<code>, /reel/<code>). */
export function instagramCode(url: string): string | null {
  try {
    const u = new URL(url)
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null
    return u.pathname.match(/^\/(?:[\w.]+\/)?(?:p|reel|tv)\/([\w-]+)/)?.[1] ?? null
  } catch { return null }
}

/** What an address is, from its look: a picture, a video, YouTube, Vimeo, Instagram, or else a web page. */
export function kindOf(url: string): Exclude<SlideKind, 'menu'> {
  if (youtubeId(url) || youtubeList(url)) return 'youtube'
  if (vimeoId(url)) return 'vimeo'
  if (instagramCode(url)) return 'instagram'
  let path = url
  try { path = new URL(url).pathname } catch { /* typed without https:// */ }
  if (IMAGE.test(path)) return 'image'
  if (VIDEO.test(path)) return 'video'
  return 'web'
}

/** An address as typed ("www.x.es/menu", " https://… ") → https://… (null: none). */
export function cleanUrl(typed: string | null | undefined): string | null {
  const w = (typed ?? '').trim()
  if (!w) return null
  return /^https?:\/\//i.test(w) ? w : `https://${w.replace(/^\/+/, '')}`
}

/** A slide that can't be shown as it is: why (null: fine). */
export function slideProblem(s: Pick<Slide, 'kind' | 'url' | 'design_id' | 'seconds'>): string | null {
  if (s.kind === 'menu') return s.design_id ? null : msg('Pick the digital menu to show')
  if (!s.url) return msg('Paste the address of the picture, video or page')
  // A drawn picture (the demo's own) is let through here; the database takes https only, and says so.
  const drawn = s.kind === 'image' && s.url.startsWith('data:image/')
  if (!drawn && !/^https:\/\/[^\s/]+\.[^\s]+$/i.test(s.url)) return msg('The address should start with https:// (screens can’t show plain http pages)')
  if (s.seconds !== null && !(s.seconds >= 3 && s.seconds <= 3600)) return msg('Show each slide for between 3 seconds and an hour')
  return null
}

export function screenProblem(s: Pick<ScreenInput, 'name' | 'seconds' | 'transition_ms' | 'music_url' | 'music_volume' | 'ticker' | 'slides'>): string | null {
  if (!s.name.trim()) return msg('Give the screen a name')
  if (!(s.seconds >= 3 && s.seconds <= 3600)) return msg('Show each slide for between 3 seconds and an hour')
  if (!(s.transition_ms >= 0 && s.transition_ms <= 5000)) return msg('The change between slides can take up to 5 seconds')
  if (s.music_url && !/^https:\/\/\S+$/i.test(s.music_url)) return msg('The music’s address should start with https://')
  if (!(s.music_volume >= 0 && s.music_volume <= 100)) return msg('Set the volume between 0 and 100')
  if ((s.ticker ?? '').length > 280) return msg('Keep the running line under 280 characters')
  if (s.slides.length > MAX_SLIDES) return msg('A screen can have up to 100 slides')
  for (const sl of s.slides) { const p = slideProblem(sl); if (p) return p }
  return null
}

/**
 * The address a slide plays from: YouTube and Vimeo as players that start by themselves, without
 * controls, muted unless the screen plays videos' sound (browsers only start a muted video by
 * itself), and looping; Instagram as its embed. Live pictures and pages get a fresh address each
 * time (?t=…), so the browser fetches them again.
 */
export function playUrl(s: Pick<Slide, 'kind' | 'url' | 'live'>, opts: { sound?: boolean; now?: number } = {}): string | null {
  if (!s.url) return null
  const mute = opts.sound ? 0 : 1
  if (s.kind === 'youtube') {
    const id = youtubeId(s.url), list = youtubeList(s.url)
    const q = `autoplay=1&mute=${mute}&controls=0&playsinline=1&rel=0&modestbranding=1&loop=1`
    // A single video loops only when it's its own playlist.
    if (id) return `https://www.youtube-nocookie.com/embed/${id}?${q}&${list ? `list=${list}` : `playlist=${id}`}`
    if (list) return `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&${q}`
    return null
  }
  if (s.kind === 'vimeo') {
    const id = vimeoId(s.url)
    return id ? `https://player.vimeo.com/video/${id}?autoplay=1&muted=${mute}&loop=1&background=${opts.sound ? 0 : 1}` : null
  }
  if (s.kind === 'instagram') {
    const code = instagramCode(s.url)
    return code ? `https://www.instagram.com/p/${code}/embed` : null
  }
  if (s.live && (s.kind === 'image' || s.kind === 'web')) return `${s.url}${s.url.includes('?') ? '&' : '?'}t=${opts.now ?? Date.now()}`
  return s.url
}

/** How long a slide stays: its own seconds, else the screen's; a video without its own plays to its end (null). */
export function slideSeconds(s: Pick<Slide, 'kind' | 'seconds'>, screen: Pick<Screen, 'seconds'>): number | null {
  if (s.seconds) return s.seconds
  return s.kind === 'video' ? null : screen.seconds
}

/** The slides that play, in order: the switched-on ones, shuffled when the screen says (`random`: 0 ≤ n < 1). */
export function playOrder<T extends Pick<Slide, 'active'>>(slides: T[], shuffle: boolean, random: () => number = Math.random): T[] {
  const on = slides.filter(s => s.active)
  if (!shuffle) return on
  const out = [...on]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** How long one go round the slides takes, in seconds (videos playing to their end count as the screen's seconds). */
export const loopSeconds = (s: Pick<Screen, 'seconds' | 'slides'>) =>
  s.slides.filter(x => x.active).reduce((sum, x) => sum + (slideSeconds(x, s) ?? s.seconds), 0)

/** The screen asks for its slides every minute while it's on: seen in the last 3 minutes means it's on now. */
export const ONLINE_MINUTES = 3
export const isOnline = (lastSeen: string | null, now = Date.now()) => !!lastSeen && now - Date.parse(lastSeen) < ONLINE_MINUTES * 60_000

/** Music from YouTube plays in a hidden player; anything else (MP3, AAC, a radio stream) in the browser's own. */
export const musicKind = (url: string): 'youtube' | 'audio' => (youtubeId(url) || youtubeList(url) ? 'youtube' : 'audio')

/** YouTube music as a hidden player that starts by itself and loops (a video, or a playlist). */
export function musicEmbedUrl(url: string): string | null {
  const id = youtubeId(url), list = youtubeList(url)
  const q = 'autoplay=1&loop=1&controls=0&playsinline=1'
  if (id) return `https://www.youtube-nocookie.com/embed/${id}?${q}&${list ? `list=${list}` : `playlist=${id}`}`
  return list ? `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&${q}` : null
}

/** What the screen's link loads (no sign-in): its settings, slides, and the menus it shows with their items. */
export interface DisplayFeed {
  screen: Omit<Screen, 'token' | 'last_seen_at'>
  /** The business's name, and its brand (Brand page) for the menus: logo, fonts and colours. */
  business: { name: string; logo: string | null; heading_font?: string; body_font?: string; colours?: BrandColour[] }
  /** The digital menus on its slides, by design id. */
  menus: Record<string, { design: Omit<MenuDesign, 'images'> & { image_url: string | null }; items: MenuItem[] }>
}
