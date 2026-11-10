// What each post did for the café's Instagram (Analytics → What each post did): the café's own posts and
// the ones about it (a customer's collab reel, a tag, a story mention), each with how it did as far as
// Instagram shares, and the new followers the café gained the day it went out and the two days after,
// against what three days usually bring. Instagram keeps new followers day by day for 30 days only;
// the Worker keeps them (social_follower_days), so posts further back still show theirs.
import { addDays } from './time'
import type { AccountWindow, Mention } from './mentions'
import type { SocialDay, SocialPost } from './socialAnalytics'

/** Who posted it: the café, a customer with the café as collaborator, a customer tagging it, or in their story. */
export type PostBy = 'you' | 'collab' | 'tagged' | 'story'

export interface PostImpact {
  id: string
  by: PostBy
  /** The poster's @ (null for the café's own). */
  username: string | null
  url: string | null
  caption: string
  /** When it went out. */
  at: string
  thumbnail: string | null
  video: boolean
  views: number | null
  reach: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  /** People who followed the café from it, as Instagram counts them (its own photo posts only). */
  follows: number | null
  /** A post about the café: what the café's own account did in its days, against the usual (null: not read yet). */
  account?: AccountWindow | null
  /** New followers the day it went out and the days after (IMPACT_DAYS in all). Null: not known that far back. */
  gained: number | null
  /** What those days usually bring: a usual day of the week before (the middle one, so another post's jump doesn't count), for as many days. Null: no week before to go by. */
  usual: number | null
  /** How many of the days are in so far (fewer than IMPACT_DAYS for a post from the last day or two). */
  days: number
  /**
   * A post about the café (someone else's) went out within those days too: the followers are theirs
   * together. The café's own posts aren't counted: it posts most days, so they're in the usual already.
   */
  shared: boolean
  /** Too soon to tell: Instagram hasn't counted the day it went out yet. */
  soon: boolean
  /** Added by its link (it can be taken off again). */
  added: boolean
}

/** The day a post went out and the two after. */
export const IMPACT_DAYS = 3
/** The days before a post that say what's usual. */
export const BASELINE_DAYS = 7

type Figures = Omit<PostImpact, 'gained' | 'usual' | 'days' | 'shared' | 'soon'>

/** The café's own post, from the Analytics report. */
export const ownPost = (p: SocialPost): Figures => ({
  id: p.id, by: 'you', username: null, url: p.url, caption: p.caption, at: p.at, thumbnail: p.thumbnail, video: !!p.video,
  views: p.views ?? null, reach: p.reach ?? null, likes: p.likes ?? null, comments: p.comments ?? null, shares: p.shares ?? null,
  saves: p.saves ?? null, follows: p.follows ?? null, added: false,
})

const BY: Record<Mention['kind'], PostBy> = { collab: 'collab', post: 'tagged', story: 'story' }

/** A post about the café (a collab, a tag, a story mention), as kept from Instagram. */
export const postAbout = (m: Mention & { added_by?: string | null }): Figures => ({
  id: m.id, by: BY[m.kind], username: m.username, url: m.permalink, caption: m.caption ?? '', at: m.mentioned_at, thumbnail: m.media_url,
  video: !!m.video, views: m.views ?? null, reach: null, likes: m.likes ?? null, comments: m.comments ?? null, shares: m.shares ?? null,
  saves: m.saves ?? null, follows: null, added: !!m.added_by, account: m.account_window ?? null,
})

/** New followers each day, as far as known: what's kept, with what Instagram says now over it. */
export function followerDays(kept: SocialDay[], fresh: SocialDay[] | null | undefined): Map<string, number> {
  const out = new Map(kept.map(d => [d.date, d.value]))
  for (const d of fresh ?? []) out.set(d.date, d.value)
  return out
}

/**
 * Each post with the followers gained the day it went out and the days after, against a usual day
 * of the week before (newest first). A post whose days aren't all in yet counts the ones that are, and its usual
 * is for as many days. The latest day known is `last` (Instagram's new followers are a day or two late).
 */
export function postImpacts(posts: Figures[], days: Map<string, number>, last: string | null = null): PostImpact[] {
  const known = [...days.keys()].sort()
  const latest = last ?? known[known.length - 1] ?? null
  const dayOf = (p: Figures) => p.at.slice(0, 10)
  return posts.map(p => {
    const start = dayOf(p)
    const window = Array.from({ length: IMPACT_DAYS }, (_, i) => addDays(start, i)).filter(d => latest !== null && d <= latest)
    const inWindow = window.filter(d => days.has(d))
    const gained = inWindow.length && inWindow.length === window.length ? inWindow.reduce((n, d) => n + days.get(d)!, 0) : null
    const before = Array.from({ length: BASELINE_DAYS }, (_, i) => addDays(start, -(i + 1))).filter(d => days.has(d)).map(d => days.get(d)!)
    const usual = gained !== null && before.length >= 3 ? Math.round(median(before) * window.length) : null
    const shared = posts.some(o => o !== p && o.by !== 'you' && Math.abs(Date.parse(`${dayOf(o)}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) < IMPACT_DAYS * 86_400_000)
    return { ...p, gained, usual, days: gained === null ? 0 : window.length, shared, soon: latest === null ? false : start > latest }
  }).sort((a, b) => b.at.localeCompare(a.at))
}

/** The middle of some numbers (the two middle ones' average for an even count). */
function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b), mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** More followers than usual: the gain over the usual (0 when it wasn't more), or null when either isn't known. */
export const extraFollowers = (p: Pick<PostImpact, 'gained' | 'usual'>) =>
  p.gained === null || p.usual === null ? null : Math.max(0, p.gained - p.usual)
