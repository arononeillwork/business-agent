// Instagram mentions (someone tagged the business in a post, mentioned it in their story, or posted a
// reel or post with it as a collaborator), as the Worker notices them every 15 minutes and the demo
// shows them. See worker/mentions.ts.
import type { InboxConversation, TaggedPost } from './messages'

export type MentionKind = 'story' | 'post' | 'collab'

export interface Mention {
  id: string; kind: MentionKind; username: string | null; media_url: string | null
  permalink: string | null; caption: string | null; mentioned_at: string
  /** A reel or video (a collab says; tags and stories don't). */
  video?: boolean
  /** How it did, as far as Instagram shares with the café (collabs only). */
  likes?: number | null
  comments?: number | null
  views?: number | null
  shares?: number | null
  saves?: number | null
  /** When Instagram last gave the figures. */
  figures_at?: string | null
  /** The poster's followers, when Instagram says (people who've messaged the café). */
  followers?: number | null
  /** What the café's own account did in the post's days, against the week before (the post_account_window migration). */
  account_window?: AccountWindow | null
}

/** The café account's figures in a post's three days, and the usual for three days (null: Instagram didn't give it). */
export interface AccountFigures { reach: number | null; views: number | null; engaged: number | null; link_taps: number | null; profile_visits: number | null }
export interface AccountWindow extends AccountFigures { usual: AccountFigures }

const RECENT_MS = 7 * 86_400_000

/** What Instagram's chats tell about someone, by their username. */
const peopleIn = (chats: InboxConversation[]) =>
  new Map(chats.filter(c => c.with.username).map(c => [c.with.username.toLowerCase(), c.with]))

/** The mentions in the latest chats (story mentions arrive as messages) and tagged posts, newest first. */
export function mentionsIn(chats: InboxConversation[], tagged: TaggedPost[], now = Date.now()): Mention[] {
  const people = peopleIn(chats)
  const followers = (username: string | null | undefined) => (username ? people.get(username.toLowerCase())?.followers ?? null : null)
  const stories: Mention[] = chats.flatMap(c => c.recent
    .filter(m => m.kind === 'story_mention' && !m.fromMe && m.mediaUrl)
    .map(m => ({ id: `story:${m.id}`, kind: 'story' as const, username: c.with.username || null, media_url: m.mediaUrl ?? null,
      permalink: null, caption: m.text || null, mentioned_at: m.at, followers: c.with.followers ?? null })))
  const posts: Mention[] = tagged.filter(p => p.mediaUrl).map(p => ({ id: `post:${p.id}`, kind: 'post' as const, username: p.username ?? null,
    media_url: p.mediaUrl ?? null, permalink: p.permalink, caption: p.caption ?? null, mentioned_at: p.at, followers: followers(p.username),
    // A reel's link says so (the tags list doesn't give its kind).
    video: /instagram\.com\/(?:[\w.]+\/)?(?:reels?|tv)\//i.test(p.permalink ?? '') }))
  return [...stories, ...posts].filter(m => now - Date.parse(m.mentioned_at) < RECENT_MS)
    .sort((a, b) => b.mentioned_at.localeCompare(a.mentioned_at))
}

/** A post or reel the café is an accepted collaborator on, as Instagram's collaborative_media lists it. */
export interface CollabMedia {
  id: string; username?: string; caption?: string; media_type?: string; media_product_type?: string; permalink?: string; timestamp: string
  thumbnail_url?: string; media_url?: string; like_count?: number; comments_count?: number
  total_like_count?: number; total_comments_count?: number; total_views_count?: number; shares_count?: number; saved_count?: number
}

/** A post's short code from its link ("https://www.instagram.com/reel/DfjbumRCHYO/" → "DfjbumRCHYO"), or null. */
export function shortcodeOf(link: string | null | undefined): string | null {
  const m = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]{5,40})/i.exec((link ?? '').trim())
  return m ? m[1] : null
}

/** A collab's id: by its short code, so one added by its link and the same one from Instagram are one. */
export const collabId = (shortcode: string) => `collab:${shortcode}`

const count = (...xs: (number | undefined)[]) => { const x = xs.find(v => typeof v === 'number' && Number.isFinite(v)); return x === undefined ? null : Math.max(0, Math.round(x)) }

/** Collabs as mentions, every one Instagram lists however old: they're on the café's own grid. */
export function collabMentions(media: CollabMedia[], chats: InboxConversation[] = [], now = new Date().toISOString()): Mention[] {
  const people = peopleIn(chats)
  return media.map(m => {
    const code = shortcodeOf(m.permalink)
    const video = m.media_type === 'VIDEO' || m.media_product_type === 'REELS'
    return {
      id: code ? collabId(code) : `collab:${m.id}`, kind: 'collab' as const, username: m.username?.toLowerCase() ?? null,
      media_url: m.thumbnail_url ?? (video ? null : m.media_url ?? null), permalink: m.permalink ?? null, caption: m.caption?.trim() || null,
      mentioned_at: m.timestamp, video,
      likes: count(m.total_like_count, m.like_count), comments: count(m.total_comments_count, m.comments_count), views: count(m.total_views_count),
      shares: count(m.shares_count), saves: count(m.saved_count), figures_at: now,
      followers: m.username ? people.get(m.username.toLowerCase())?.followers ?? null : null,
    }
  }).sort((a, b) => b.mentioned_at.localeCompare(a.mentioned_at))
}

/** Was it posted in the last week? Older ones are kept without telling anyone (connecting doesn't dig up months of old tags). */
export const isRecent = (m: Pick<Mention, 'mentioned_at'>, now = Date.now()) => now - Date.parse(m.mentioned_at) < RECENT_MS

/** The bell's words for a mention. */
export const mentionTitle = (m: Pick<Mention, 'kind' | 'username'> & { video?: boolean }) =>
  `${m.username ? `@${m.username}` : 'Someone'} ${m.kind === 'story' ? 'mentioned you in their story'
    : m.kind === 'collab' ? (m.video ? 'posted a reel with you' : 'posted with you') : 'tagged you in a post'}`

/** A mention as the Notifications page shows it, with what was done about it. */
export interface InstagramMention extends Mention {
  status: 'new' | 'reposted' | 'ignored'
  reposted_url: string | null
  decided_at: string | null
  /** An admin added it by its link (null: Instagram listed it). */
  added_by?: string | null
}

// ---- The people who post about the café, put forward as reps -------------------------------------

/** Someone with this many followers who mentions the café in a story is put forward as a rep (the "Rising voice" step). */
export const STORY_REP_FOLLOWERS = 1_000

/** Someone to put on Sales reps & rewards, waiting for an owner's OK, and the post that brought them. */
export interface FoundPerson { username: string; mention_id: string; followers: number | null; name: string | null; picture: string | null }

/**
 * Who among the posters of these mentions (not looked at yet) to put forward as reps: anyone who posts
 * a post or reel with the café (a collab or a tag), and anyone with 1,000 followers or more who
 * mentions it in a story. Not the café itself, nor anyone in `known` (already a rep, or put forward
 * before by an earlier post: an owner who said no isn't asked again). One each, for their latest post.
 */
export function peopleToPutForward(mentions: Pick<Mention, 'id' | 'kind' | 'username' | 'mentioned_at' | 'followers'>[], known: Set<string>,
  self: string | null, chats: InboxConversation[] = []): FoundPerson[] {
  const people = peopleIn(chats)
  const out = new Map<string, FoundPerson>()
  for (const m of [...mentions].sort((a, b) => b.mentioned_at.localeCompare(a.mentioned_at))) {
    const username = m.username?.trim().replace(/^@/, '').toLowerCase()
    if (!username || !/^[a-z0-9._]{1,30}$/.test(username) || username === self?.toLowerCase() || known.has(username) || out.has(username)) continue
    const who = people.get(username)
    const followers = m.followers ?? who?.followers ?? null
    if (m.kind === 'story' && (followers ?? 0) < STORY_REP_FOLLOWERS) continue
    out.set(username, { username, mention_id: m.id, followers, name: who?.name?.trim() || null,
      picture: who?.picture?.startsWith('https://') ? who.picture : null })
  }
  return [...out.values()]
}
