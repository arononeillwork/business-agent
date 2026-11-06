// Post ideas (Social planner → Ideas): posts the business wants made, written down so anyone on the team
// can see what's needed and make it. "The coffees we have now: Puchero, Cocobrew and Santa Roaster's
// decaf Colombia", wanting photos or a video. Anyone on the team adds one, says they'll do it, adds the photos
// or video they took and hands it in; an admin makes the post from it on the planner (the idea keeps the
// post's id). The rules here are the database's too (the `post_ideas` migration).
import { msg } from './i18n'
import type { PostKind, PostMedia } from './types'

/** What the idea needs: photos, a video, or either. */
export type IdeaWants = 'photo' | 'video' | 'either'
/**
 * open: nobody's on it yet. doing: someone said they'll do it. ready: the photos or video are in, for an
 * admin to post. done: made into a post (or an admin marked it done).
 */
export type IdeaStatus = 'open' | 'doing' | 'ready' | 'done'

export interface PostIdea {
  id: string
  /** What the post is about: "The coffees we have now". */
  title: string
  /** What to show or say: "Puchero, Cocobrew and Santa Roaster's decaf Colombia". */
  details: string | null
  wants: IdeaWants
  status: IdeaStatus
  /** Who's making it. */
  taken_by: string | null
  /** The photos and videos made for it, in Business Agent/Social/Ideas. */
  media: PostMedia[]
  /** The post made from it (the Social planner). */
  post_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}
export type PostIdeaInput = Partial<Pick<PostIdea, 'title' | 'details' | 'wants' | 'status' | 'taken_by' | 'media' | 'post_id'>> & { id?: string }

/** The same limits as the database's. */
export const IDEA_LIMITS = { title: 120, details: 1000, media: 10 }

export const WANTS: { id: IdeaWants; label: string }[] = [
  { id: 'either', label: msg('Photos or a video') },
  { id: 'photo', label: msg('Photos') },
  { id: 'video', label: msg('A video') },
]
export const wantsLabel = (w: IdeaWants) => WANTS.find(x => x.id === w)!.label

export const IDEA_STATUS: Record<IdeaStatus, { label: string }> = {
  open: { label: msg('Up for grabs') },
  doing: { label: msg('Being made') },
  ready: { label: msg('Ready to post') },
  done: { label: msg('Done') },
}

/** What's wrong before it's saved (the database says the same), or null. */
export function ideaProblem(i: Pick<PostIdea, 'title' | 'details' | 'status' | 'media'>): string | null {
  if (!i.title.trim()) return msg('Say what the post is about')
  if (i.title.trim().length > IDEA_LIMITS.title) return msg('Keep the idea to 120 characters')
  if ((i.details ?? '').trim().length > IDEA_LIMITS.details) return msg('Keep the details to 1,000 characters')
  if (i.media.length > IDEA_LIMITS.media) return msg('An idea takes up to 10 photos and videos')
  if (i.media.some(m => m.type !== 'image' && m.type !== 'video')) return msg('Add photos or videos')
  if (i.status === 'ready' && !i.media.length) return msg('Add the photos or video first')
  return null
}

/** Ready ones first (an admin's next step), then the ones being made, then the ones up for grabs, newest first in each; done ones last, latest first. */
const RANK: Record<IdeaStatus, number> = { ready: 0, doing: 1, open: 2, done: 3 }
export const sortIdeas = (ideas: PostIdea[]) => [...ideas].sort((a, b) => RANK[a.status] - RANK[b.status]
  || (a.status === 'done' ? b.updated_at.localeCompare(a.updated_at) : b.created_at.localeCompare(a.created_at)) || a.id.localeCompare(b.id))

/**
 * The post an admin starts from an idea, in the Social planner's composer: several photos and videos make
 * a carousel (up to 10), one video a reel, one photo a post; the idea's title starts the caption (its
 * details are notes for whoever makes it, not for the networks).
 */
export function postFromIdea(i: Pick<PostIdea, 'title' | 'wants' | 'media'>): { kind: PostKind; media: PostMedia[]; caption: string } {
  const media = i.media.slice(0, 10)
  const kind: PostKind = media.length > 1 ? 'carousel' : media.length ? (media[0].type === 'video' ? 'reel' : 'post') : i.wants === 'video' ? 'reel' : 'post'
  return { kind, media, caption: i.title.trim() }
}
