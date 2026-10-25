// Instagram mentions (someone tagged the business in a post, or mentioned it in their story), as
// the Worker notices them every 15 minutes and the demo shows them. See worker/mentions.ts.
import type { InboxConversation, TaggedPost } from './messages'

export interface Mention {
  id: string; kind: 'story' | 'post'; username: string | null; media_url: string | null
  permalink: string | null; caption: string | null; mentioned_at: string
}

const RECENT_MS = 7 * 86_400_000

/** The mentions in the latest chats (story mentions arrive as messages) and tagged posts, newest first. */
export function mentionsIn(chats: InboxConversation[], tagged: TaggedPost[], now = Date.now()): Mention[] {
  const stories: Mention[] = chats.flatMap(c => c.recent
    .filter(m => m.kind === 'story_mention' && !m.fromMe && m.mediaUrl)
    .map(m => ({ id: `story:${m.id}`, kind: 'story' as const, username: c.with.username || null, media_url: m.mediaUrl ?? null,
      permalink: null, caption: m.text || null, mentioned_at: m.at })))
  const posts: Mention[] = tagged.filter(p => p.mediaUrl).map(p => ({ id: `post:${p.id}`, kind: 'post' as const, username: p.username ?? null,
    media_url: p.mediaUrl ?? null, permalink: p.permalink, caption: p.caption ?? null, mentioned_at: p.at }))
  return [...stories, ...posts].filter(m => now - Date.parse(m.mentioned_at) < RECENT_MS)
    .sort((a, b) => b.mentioned_at.localeCompare(a.mentioned_at))
}

/** The bell's words for a mention. */
export const mentionTitle = (m: Pick<Mention, 'kind' | 'username'>) =>
  `${m.username ? `@${m.username}` : 'Someone'} ${m.kind === 'story' ? 'mentioned you in their story' : 'tagged you in a post'}`


/** A mention as the Notifications page shows it, with what was done about it. */
export interface InstagramMention extends Mention {
  status: 'new' | 'reposted' | 'ignored'
  reposted_url: string | null
  decided_at: string | null
}
