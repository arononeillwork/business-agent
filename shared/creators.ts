// Who posts about the café (Sales reps & rewards → Posts about us): everyone whose reels, posts and
// stories about the café the Instagram check found or an admin added by its link, ranked by what
// their posts did: the new followers the café gained in their days (the day each went out and the two
// after: shared/postImpact.ts), then views, then likes. Each with their posts, newest first.
import type { PostImpact } from './postImpact'

export interface Creator {
  /** Their Instagram, without the @. */
  username: string
  /** Their posts, reels and stories about the café, newest first. */
  posts: PostImpact[]
  reels: number
  views: number
  likes: number
  comments: number
  /** New followers in their posts' days, added up (null: not known for any of them). */
  gained: number | null
  /** Of those, more than usual (null: not known). */
  extra: number | null
  /** Their latest post about the café. */
  last_at: string
}

const add = (xs: (number | null)[]) => xs.reduce<number>((n, x) => n + (x ?? 0), 0)

/** Everyone who posted about the café, best first. The café's own posts aren't on it. */
export function creatorBoard(impacts: PostImpact[]): Creator[] {
  const by = new Map<string, PostImpact[]>()
  for (const p of impacts) {
    const who = p.by === 'you' ? null : p.username?.toLowerCase()
    if (!who) continue
    by.set(who, [...(by.get(who) ?? []), p])
  }
  return [...by].map(([username, list]) => {
    const posts = [...list].sort((a, b) => b.at.localeCompare(a.at))
    const known = posts.filter(p => p.gained !== null)
    const compared = known.filter(p => p.usual !== null)
    return {
      username, posts, reels: posts.filter(p => p.video).length,
      views: add(posts.map(p => p.views)), likes: add(posts.map(p => p.likes)), comments: add(posts.map(p => p.comments)),
      gained: known.length ? add(known.map(p => p.gained)) : null,
      extra: compared.length ? add(compared.map(p => Math.max(0, p.gained! - p.usual!))) : null,
      last_at: posts[0].at,
    }
  }).sort((a, b) => (b.gained ?? -1) - (a.gained ?? -1) || b.views - a.views || b.likes - a.likes || b.posts.length - a.posts.length
    || b.last_at.localeCompare(a.last_at))
}
