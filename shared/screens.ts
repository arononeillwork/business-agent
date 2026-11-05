// Screens: TVs and tablets in the café that play a slideshow. Each screen has its own secret link
// (opened once in the screen's browser, no sign-in) and a list of slides: pictures, videos, YouTube,
// Vimeo or Instagram, web pages, and the digital menus from the Menu page. Settings say how long
// each slide shows, how it changes to the next, and the music. Shared by the app and the Worker.
import { msg } from './i18n'
import type { MenuDesign, MenuItem } from './menu'
import type { MenuAllergens } from './allergens'
import type { BrandColour } from './types'
import type { Offer, ScreenOffer } from './offers'

export type SlideKind = 'image' | 'video' | 'youtube' | 'vimeo' | 'instagram' | 'web' | 'menu' | 'offers'
export const SLIDE_KINDS: { id: SlideKind; label: string }[] = [
  { id: 'image', label: msg('Picture') },
  { id: 'video', label: msg('Video') },
  { id: 'youtube', label: msg('YouTube') },
  { id: 'vimeo', label: msg('Vimeo') },
  { id: 'instagram', label: msg('Instagram post') },
  { id: 'web', label: msg('Web page') },
  { id: 'menu', label: msg('Digital menu') },
  { id: 'offers', label: msg('Live offers’ pictures') },
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
  /**
   * Its Spanish version, if it has one: the same kind of slide at another address (a poster in
   * Spanish, the menu page in Spanish), or another digital menu. The English version is url /
   * design_id. Slides from before there were versions have neither (and show as they are).
   */
  url_es?: string | null
  design_id_es?: string | null
  /** Which versions show: English first, then Spanish. Missing: shown (a version with nothing to show is skipped). */
  show_en?: boolean
  show_es?: boolean
}

/** The two versions a slide can have, in the order they show. */
export type SlideLang = 'en' | 'es'
export const SLIDE_LANGS: { id: SlideLang; label: string; short: string }[] = [
  { id: 'en', label: msg('English'), short: 'EN' },
  { id: 'es', label: msg('Spanish'), short: 'ES' },
]

/** A slide's version in one language, as it plays: its own id and address. */
export type PlayedSlide = Slide & { lang: SlideLang; slide_id: string }

/** Whether the slide has something to show in that language. */
export function hasVersion(s: Pick<Slide, 'kind' | 'url' | 'design_id' | 'url_es' | 'design_id_es'>, lang: SlideLang): boolean {
  // The live offers' pictures are the offers' own: one version.
  if (s.kind === 'offers') return lang === 'en'
  if (s.kind === 'menu') return !!(lang === 'en' ? s.design_id : s.design_id_es)
  return !!(lang === 'en' ? s.url : s.url_es)
}

/** Whether that version is switched on (it shows if it also has something to show). */
export const versionOn = (s: Pick<Slide, 'show_en' | 'show_es'>, lang: SlideLang) => (lang === 'en' ? s.show_en : s.show_es) !== false

/** The versions of a slide that play, English then Spanish: each switched on and with something to show. */
export function slideVersions(s: Slide): PlayedSlide[] {
  return SLIDE_LANGS.filter(l => versionOn(s, l.id) && hasVersion(s, l.id)).map(({ id: lang }) => ({
    ...s, lang, slide_id: s.id, id: `${s.id}:${lang}`,
    url: lang === 'en' ? s.url : s.url_es ?? null,
    design_id: lang === 'en' ? s.design_id : s.design_id_es ?? null,
  }))
}

export type Transition = 'fade' | 'slide' | 'zoom' | 'none'
export const TRANSITIONS: { id: Transition; label: string }[] = [
  { id: 'fade', label: msg('Fade') },
  { id: 'slide', label: msg('Slide across') },
  { id: 'zoom', label: msg('Zoom') },
  { id: 'none', label: msg('Cut (no effect)') },
]
export type Fit = 'cover' | 'contain'
/** A screen (a TV or tablet: menus, pictures, videos, pages, music) or a picture slideshow (pictures and the live offers' pictures, kept simple). */
export type ScreenKind = 'screen' | 'slideshow'

export interface Screen {
  id: string
  name: string
  kind: ScreenKind
  /** The secret in the screen's link (/display/<token>). */
  token: string
  /** Its link name, for its short link (/display-menu/<slug>, /slideshow/<slug>); empty: made from its name when saved. */
  slug: string
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

export const newScreen = (name: string, kind: ScreenKind = 'screen'): ScreenInput => ({
  name, kind, slug: '', orientation: 'landscape', seconds: kind === 'slideshow' ? 8 : 10, transition: 'fade', transition_ms: 800, shuffle: false,
  fit: kind === 'slideshow' ? 'contain' : 'cover', music_url: null, music_volume: 40, video_sound: false, show_clock: false, ticker: null,
  // A picture slideshow starts with the live offers' pictures, so it has something to show straight away.
  slides: kind === 'slideshow' ? [offersSlide()] : [], active: true,
})

/** The slide that plays the picture of each offer that's on now (Offers & specials). */
export const offersSlide = (id: string = crypto.randomUUID()): Slide =>
  ({ id, kind: 'offers', url: null, design_id: null, title: null, seconds: null, live: false, active: true })

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
export function kindOf(url: string): Exclude<SlideKind, 'menu' | 'offers'> {
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

/** A slide that can't be shown as it is: why (null: fine). It needs at least one version; each it has is checked. */
export function slideProblem(s: Pick<Slide, 'kind' | 'url' | 'design_id' | 'seconds' | 'url_es' | 'design_id_es'>): string | null {
  if (s.kind === 'offers') {
    // Nothing to fill in: the offers bring their pictures.
  } else if (s.kind === 'menu') {
    if (!s.design_id && !s.design_id_es) return msg('Pick the digital menu to show')
  } else {
    if (!s.url && !s.url_es) return msg('Paste the address of the picture, video or page')
    for (const url of [s.url, s.url_es]) {
      if (!url) continue
      // A drawn picture or one picked from the device (the demo's own) is let through here; the database takes https only, and says so.
      const drawn = s.kind === 'image' && /^(data:image\/|blob:)/.test(url)
      if (!drawn && !/^https:\/\/[^\s/]+\.[^\s]+$/i.test(url)) return msg('The address should start with https:// (screens can’t show plain http pages)')
    }
  }
  if (s.seconds !== null && !(s.seconds >= 3 && s.seconds <= 3600)) return msg('Show each slide for between 3 seconds and an hour')
  return null
}

export function screenProblem(s: Pick<ScreenInput, 'name' | 'seconds' | 'transition_ms' | 'music_url' | 'music_volume' | 'ticker' | 'slides'> & { slug?: string }): string | null {
  if (!s.name.trim()) return msg('Give the screen a name')
  if (s.slug && !LINK_NAME.test(s.slug)) return msg('A link name is up to 40 small letters, numbers and dashes, starting with a letter')
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

/** What plays, in order: the switched-on slides (shuffled when the screen says), each in its versions, English then Spanish. */
export const playedSlides = (slides: Slide[], shuffle: boolean, random: () => number = Math.random): PlayedSlide[] =>
  playOrder(slides, shuffle, random).flatMap(slideVersions)

/** How long one go round the slides takes, in seconds (each version counts; videos playing to their end count as the screen's seconds). */
export const loopSeconds = (s: Pick<Screen, 'seconds' | 'slides'>) =>
  playedSlides(s.slides, false).reduce((sum, x) => sum + (slideSeconds(x, s) ?? s.seconds), 0)

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
  /** The menu's sections in order (Settings: menu_sections). */
  sections: string[]
  /** The business's name, and its brand (Brand page) for the menus: logo, fonts and colours. */
  business: { name: string; logo: string | null; heading_font?: string; body_font?: string; colours?: BrandColour[] }
  /** The digital menus on its slides, by design id. */
  menus: Record<string, { design: Omit<MenuDesign, 'images'> & { image_url: string | null }; items: MenuItem[] }>
  /** What goes into each menu item and its ingredients' allergens (as the Allergens page has them, without the ingredients' names), for its allergens and diets. */
  allergens?: MenuAllergens | null
  /** The offers on its screen that haven't ended (Offers & specials): each shows from its start to its end, by the screen's clock. */
  offers?: ScreenOffer[]
  /** With a live offers' pictures slide: the other offers with a picture that haven't ended, each shown as its picture while it's on. */
  offer_pictures?: OfferPicture[]
}

/** An offer's picture for the live offers' pictures slide. */
export type OfferPicture = Pick<Offer, 'id' | 'title' | 'starts_at' | 'ends_at'> & { image_url: string }

/**
 * What plays with the live offers' pictures: each offers slide becomes the picture of each offer on
 * now, for the slide's own time (else the screen's), in the order they started; none on now, it's
 * skipped.
 */
export function withOfferPictures(slides: PlayedSlide[], pictures: OfferPicture[], now = Date.now()): PlayedSlide[] {
  const live = pictures.filter(p => Date.parse(p.starts_at) <= now && now < Date.parse(p.ends_at))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
  return slides.flatMap(s => (s.kind !== 'offers' ? [s] : live.map(p => ({
    ...s, kind: 'image' as const, id: `${s.id}:${p.id}`, url: p.image_url, title: p.title, live: false,
  }))))
}

// Short links ---------------------------------------------------------------------------------

/**
 * The business whose short links need no number: Easy Beans, business 1, whose TV opened
 * …/display-menu before there were screens. Its first screen also opens at the bare /display-menu.
 */
export const HOME_BUSINESS = 1
/** A link name: small letters, numbers and dashes, starting with a letter (a number in a link is a business's). */
export const LINK_NAME = /^[a-z]([a-z0-9-]{0,38}[a-z0-9])?$/
/** What a short link starts with, for each kind. */
export const LINK_PREFIX: Record<ScreenKind, string> = { screen: '/display-menu', slideshow: '/slideshow' }

/** A link name from what's typed or a name, as the database makes it: "Café TV" → "cafe-tv". */
export function linkName(typed: string): string {
  const s = typed.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return (/^[a-z]/.test(s) ? s : s ? `screen-${s}` : '').slice(0, 40).replace(/-+$/, '')
}

/**
 * A screen's short link (the path): /display-menu/cafe-tv, or /slideshow/offers; for another business
 * /display-menu/2/bar-tv. `main`: the business's first screen, which also opens at /display-menu
 * (/display-menu/2 for business 2).
 */
export function shortLinkPath(s: Pick<Screen, 'slug' | 'kind'>, business: number | undefined, main = false): string {
  const own = !business || business === HOME_BUSINESS ? '' : `/${business}`
  if (main && s.kind === 'screen') return `${LINK_PREFIX.screen}${own}`
  return `${LINK_PREFIX[s.kind]}${own}/${s.slug}`
}

/**
 * Which screen a short link is for: its business, and its link name; without one, the business's
 * first screen (or first slideshow, for /slideshow). Null: not a short link.
 */
export function parseShortLink(path: string): { business: number; name: string | null; kind: ScreenKind } | null {
  const m = path.match(/^\/(display-menu|slideshow)(?:\/([1-9]\d{0,8}))?(?:\/([a-z0-9-]{1,40}))?\/?$/)
  if (!m) return null
  if (m[3] && !LINK_NAME.test(m[3])) return null
  return { business: m[2] ? Number(m[2]) : HOME_BUSINESS, name: m[3] ?? null, kind: m[1] === 'slideshow' ? 'slideshow' : 'screen' }
}

/** Whether a page's path is a screen's short link (no sign-in). */
export const isShortLink = (path: string) => /^\/(display-menu|slideshow)(\/|$)/.test(path)
