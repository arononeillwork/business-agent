// Social planner rules, shared by the app (composer, demo) and mirrored by the database trigger
// (migration 39): what each kind of post holds, where it can go, and what posting it needs.
import type { PostKind, PostMedia, PostMusic, SocialNetwork, SocialPost } from './types'
import { addDays } from './time'
import { msg } from './i18n'

export interface KindInfo {
  kind: PostKind
  /** One and many: "Post"/"Posts", "Reel"/"Reels"… */
  label: string
  plural: string
  /** One line for the composer. */
  hint: string
  /** The folder its photos and videos go in (Business Agent/Social/<folder>). */
  folder: 'Posts' | 'Carousels' | 'Reels' | 'Stories'
  accepts: PostMedia['type'][]
  min: number
  max: number
  networks: SocialNetwork[]
}

export const KINDS: KindInfo[] = [
  { kind: 'post', label: msg('Post'), plural: msg('Posts'), hint: msg('One photo in your feed. Facebook, LinkedIn and Google Maps can also take text only.'),
    folder: 'Posts', accepts: ['image'], min: 0, max: 1, networks: ['instagram', 'facebook', 'tiktok', 'google', 'linkedin'] },
  { kind: 'carousel', label: msg('Carousel'), plural: msg('Carousels'), hint: msg('2 to 10 photos or videos people swipe through. Instagram crops them all to the first one’s shape.'),
    folder: 'Carousels', accepts: ['image', 'video'], min: 2, max: 10, networks: ['instagram'] },
  { kind: 'reel', label: msg('Reel'), plural: msg('Reels'), hint: msg('One video, 3 seconds to 15 minutes. Upright (9:16) looks best.'),
    folder: 'Reels', accepts: ['video'], min: 1, max: 1, networks: ['instagram'] },
  { kind: 'story', label: msg('Story'), plural: msg('Stories'), hint: msg('One photo or video (up to 60 seconds), shown for 24 hours. Stickers and links are added in the Instagram app.'),
    folder: 'Stories', accepts: ['image', 'video'], min: 1, max: 1, networks: ['instagram'] },
]
export const kindInfo = (k: PostKind) => KINDS.find(x => x.kind === k)!

/** Videos larger than this can't be sent through the app (the Worker's upload limit). */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024

/** Photos, videos, both, or neither: for the Photos / Videos filter. */
export function mediaOf(p: Pick<SocialPost, 'media'>): 'image' | 'video' | 'mixed' | 'none' {
  const types = new Set(p.media.map(m => m.type))
  return types.size === 0 ? 'none' : types.size > 1 ? 'mixed' : [...types][0]
}

export type MediaFilter = 'all' | 'image' | 'video'
export const matchesMedia = (p: Pick<SocialPost, 'media'>, f: MediaFilter) => {
  if (f === 'all') return true
  const m = mediaOf(p)
  return m === f || m === 'mixed'
}

/** "<Plural> go to Instagram only for now", as whole sentences so each can be translated. */
const INSTAGRAM_ONLY: Record<PostKind, string> = {
  post: msg('Posts go to Instagram only for now'), carousel: msg('Carousels go to Instagram only for now'),
  reel: msg('Reels go to Instagram only for now'), story: msg('Stories go to Instagram only for now'),
}

/**
 * What stops this post being saved as asked, in plain words (null: fine). The same rules as the
 * database's; checked in the app first so the composer can say so before anything is sent.
 */
export function postProblem(p: Pick<SocialPost, 'kind' | 'caption' | 'media' | 'targets' | 'auto'> & { status: 'draft' | 'scheduled'; music?: PostMusic | null }): string | null {
  const info = kindInfo(p.kind)
  const n = p.media.length
  const videos = p.media.filter(m => m.type === 'video').length
  if (n > 10) return msg('A post can have up to 10 photos or videos')
  if (p.kind === 'post' && videos > 0) return msg('Videos go out as reels: choose Reel')
  if (p.kind === 'post' && n > 1) return msg('A post has one photo. Choose Carousel for more')
  // Photos make a reel once music goes in (the composer checks it as the video it will be).
  if (p.kind === 'reel' && n > 0 && !videos && p.music?.mode !== 'mixed') return msg('Photos make a reel with music: choose the music')
  if (p.kind === 'reel' && (n > 1 || videos !== n)) return msg('A reel is one video')
  if (p.kind === 'story' && n > 1) return msg('A story is one photo or video')
  const other = p.targets.find(t => !info.networks.includes(t))
  if (other) return INSTAGRAM_ONLY[p.kind]
  // Music (migration 62): mixed into stories and reels; Instagram's own songs only on reminders.
  const music = p.music ?? null
  if (music?.mode === 'mixed' && p.kind !== 'story' && p.kind !== 'reel') return msg('Music goes into stories and reels. Choose Story or Reel.')
  if (music?.mode === 'mixed' && !music.url) return msg('Choose a track for the music')
  if (music?.mode === 'in_instagram' && !(music.song.trim().length >= 1 && music.song.trim().length <= 120)) return msg('Write the song to add in Instagram')
  if (p.status !== 'scheduled') return null
  if (music?.mode === 'in_instagram' && p.auto) return msg('Songs from Instagram’s library are added in the Instagram app: choose Remind me')
  if (music?.mode === 'mixed' && (n !== 1 || p.media[0].url !== music.rendered_url)) return msg('The music isn’t in the file yet. Save it again to add it.')
  if (!p.targets.length) return msg('Pick at least one network')
  // Posting by itself: the networks need the photos and videos (a reminder doesn't).
  if (p.auto && p.kind === 'carousel' && n < 2) return msg('A carousel needs at least 2 photos or videos')
  if (p.auto && p.kind === 'reel' && n < 1) return msg('Add the reel’s video')
  if (p.auto && p.kind === 'story' && n < 1) return msg('Add the story’s photo or video')
  if (!p.caption.trim() && !n) return p.kind === 'story' ? msg('Add the photo or video for the story') : msg('Write a caption or add a photo')
  if (!p.auto) return null
  if (!n && (p.targets.includes('instagram') || p.targets.includes('tiktok'))) return msg('Instagram and TikTok posts need a photo')
  if (p.targets.includes('tiktok') && p.media.some(m => m.type !== 'image' || !/\.jpe?g(\?|$)/i.test(m.url))) return msg('TikTok only takes JPEG photos')
  if (p.targets.includes('google') && p.caption.length > 1500) return msg('Google Maps posts are limited to 1500 characters')
  return null
}

/** Instagram feed photos must be between 4:5 (upright) and 1.91:1 (wide): the crop that fits. */
export function feedCrop(width: number, height: number): { width: number; height: number } {
  const ratio = width / height
  if (ratio < 4 / 5) return { width, height: Math.round(width * 5 / 4) }
  if (ratio > 1.91) return { width: Math.round(height * 1.91), height }
  return { width, height }
}

/** A month as calendar weeks (Monday first), each day a YYYY-MM-DD; days outside the month included. */
export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`
  const dow = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7
  let d = addDays(first, -dow)
  const weeks: string[][] = []
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)))
    d = addDays(d, 7)
  } while (d.slice(0, 7) === month)
  return weeks
}

/** The month before or after (YYYY-MM). */
export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}
