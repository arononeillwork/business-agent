// The business's latest social posts a website shows, read from the app (GET
// /api/site/<business>/posts, worker/site.ts): its Instagram, connected on Connections (or its Facebook
// Page while Instagram isn't), so the website needs no Instagram token of its own and a business
// reconnecting Instagram does it once, here. The app asks Instagram at most every 15 minutes for each
// business, however often websites ask.
//
// A contract with websites outside the app, like the menu (shared/websiteFeed.ts): fields are added,
// never renamed or removed, and `version` changes if one ever must. docs/WEBSITE.md says how to use it.
import type { SourcePost } from './offerFromPost'

export interface SitePostsFeed {
  version: 1
  business: { id: number; name: string }
  /** Where the posts come from: Instagram, else the Facebook Page; null: neither is connected. */
  source: 'instagram' | 'facebook' | null
  /** The account: its handle without the @ (Instagram) or the Page's name, and its address. */
  account: { handle: string; url: string | null } | null
  /** Newest first, each with a picture (a video's cover) and its own link. */
  posts: SitePost[]
  /** When Instagram (or Facebook) was last asked; null: not connected. */
  fetched_at: string | null
  generated_at: string
}

export interface SitePost {
  id: string
  /** The post itself on Instagram or Facebook. */
  permalink: string
  /** Instagram's (or Facebook's) own address for the picture: it runs out after a few days, so read the feed again rather than keep it. */
  image_url: string
  caption: string | null
  posted_at: string
  video: boolean
}

/** Posts in one answer. */
export const SITE_POSTS = 12
/** How long the app keeps the posts it read before asking Instagram again, in minutes. */
export const SITE_POSTS_MINUTES = 15

const https = (v: string | null | undefined) => (v && /^https:\/\//i.test(v) ? v : null)

export interface PostsInput {
  business: { id: number; name: string }
  read: { source: 'instagram' | 'facebook'; account: string | null; posts: SourcePost[] } | null
  fetchedAt: string | null
  now?: Date
}

/** The posts feed for a website: only posts with a picture and a link, newest first. */
export function sitePosts(input: PostsInput): SitePostsFeed {
  const read = input.read
  const name = read?.account?.trim().replace(/^@+/, '') || null
  const account = !read || !name ? null
    : read.source === 'instagram' ? { handle: name, url: `https://www.instagram.com/${encodeURIComponent(name)}` } : { handle: name, url: null }
  return {
    version: 1,
    business: input.business,
    source: read?.source ?? null,
    account,
    posts: (read?.posts ?? [])
      .flatMap((p): SitePost[] => {
        const permalink = https(p.permalink), image = https(p.image_url)
        return permalink && image ? [{ id: p.id, permalink, image_url: image, caption: p.caption?.trim() || null, posted_at: p.posted_at, video: p.video === true }] : []
      })
      .sort((a, z) => z.posted_at.localeCompare(a.posted_at))
      .slice(0, SITE_POSTS),
    fetched_at: read ? input.fetchedAt : null,
    generated_at: (input.now ?? new Date()).toISOString(),
  }
}
