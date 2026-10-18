// Messages page: one inbox for the business's direct messages. Instagram for now; WhatsApp, Messenger
// and TikTok show as "soon". What Instagram shares with other apps (and what it doesn't) is in
// docs/INTEGRATIONS.md: no Primary/General/Requests folders, the 20 latest messages of a chat, and
// replies within 24 hours of the customer's last message (up to 7 days as a personal, human-agent reply).

export type MessagePlatform = 'instagram' | 'whatsapp' | 'messenger' | 'tiktok'

/** What a message is, as Instagram tells it. */
export type MessageKind = 'text' | 'image' | 'video' | 'audio' | 'file' | 'story_mention' | 'story_reply' | 'share' | 'unsupported'

export interface InboxMessage {
  id: string
  at: string
  /** Sent by the business (from here or from the Instagram app). */
  fromMe: boolean
  text: string
  kind: MessageKind
  /** Photo, video, voice note or file; the story or post for mentions, story replies and shares. */
  mediaUrl?: string
  /** Where to open it (a shared post or reel). */
  link?: string
  reactions?: string[]
}

export interface InboxConversation {
  id: string
  platform: MessagePlatform
  /** Who the chat is with; `picture` is their profile photo (Instagram's link expires after a few days). */
  with: { id: string; username: string; name?: string; picture?: string }
  updatedAt: string
  /** The latest few messages, newest first (enough for the list and its filters). */
  recent: InboxMessage[]
}

/** A post the business is tagged in (Instagram "Tagged"). */
export interface TaggedPost { id: string; username?: string; caption?: string; mediaUrl?: string; permalink: string; at: string }

export interface InboxState {
  conversations: InboxConversation[]
  /** null when Instagram wouldn't list tagged posts; `taggedNote` says why. */
  tagged: TaggedPost[] | null
  taggedNote?: string
}

export interface InboxThread { conversation: InboxConversation; messages: InboxMessage[] }

export type InboxFilter = 'all' | 'needs_reply' | 'mentions' | 'story_replies' | 'shares'
export const INBOX_FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'needs_reply', label: 'Needs reply' }, { key: 'mentions', label: 'Mentions & tags' },
  { key: 'story_replies', label: 'Story replies' }, { key: 'shares', label: 'Shared posts' },
]

/** Instagram lets a business reply for 24 hours after the customer's last message. */
export const REPLY_WINDOW_MS = 24 * 3_600_000
/** After that, a person (not an automation) can still reply for 7 days with Instagram's human agent tag. */
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 3_600_000

/** The customer wrote last: nobody has answered yet. */
export const needsReply = (c: Pick<InboxConversation, 'recent'>) => !!c.recent[0] && !c.recent[0].fromMe

const lastFromThem = (messages: InboxMessage[]) => messages.filter(m => !m.fromMe).map(m => Date.parse(m.at)).sort((a, b) => b - a)[0]

/** Until when the business can still reply normally (null: the customer hasn't written, or 24 hours have passed). */
export function replyUntil(messages: InboxMessage[], now = Date.now()): string | null {
  const theirs = lastFromThem(messages)
  if (theirs === undefined || now - theirs >= REPLY_WINDOW_MS) return null
  return new Date(theirs + REPLY_WINDOW_MS).toISOString()
}

/**
 * How a reply can go now: `normal` within 24 hours of the customer's last message, `human_agent`
 * (a personal reply with Instagram's human agent tag) up to 7 days, then `closed` (and closed when
 * the customer hasn't written at all). `until` is when the current way ends.
 */
export type ReplyWindow = { mode: 'normal' | 'human_agent'; until: string } | { mode: 'closed'; until: null }
export function replyWindow(messages: InboxMessage[], now = Date.now()): ReplyWindow {
  const theirs = lastFromThem(messages)
  if (theirs !== undefined && now - theirs < REPLY_WINDOW_MS) return { mode: 'normal', until: new Date(theirs + REPLY_WINDOW_MS).toISOString() }
  if (theirs !== undefined && now - theirs < HUMAN_AGENT_WINDOW_MS) return { mode: 'human_agent', until: new Date(theirs + HUMAN_AGENT_WINDOW_MS).toISOString() }
  return { mode: 'closed', until: null }
}

/** Initials for a person without a profile photo: two from their name, else the first letter of the username. */
export function initials(p: { username: string; name?: string }) {
  const words = (p.name ?? '').trim().split(/\s+/).filter(w => /^\p{L}/u.test(w))
  if (words.length) return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
  return (p.username.match(/\p{L}|\d/u)?.[0] ?? '?').toUpperCase()
}

export function matchesFilter(c: InboxConversation, f: InboxFilter) {
  const has = (k: MessageKind) => c.recent.some(m => !m.fromMe && m.kind === k)
  if (f === 'needs_reply') return needsReply(c)
  if (f === 'mentions') return has('story_mention')
  if (f === 'story_replies') return has('story_reply')
  if (f === 'shares') return has('share')
  return true
}

/** One line for the chat list and notifications. */
export function preview(m: InboxMessage | undefined) {
  if (!m) return 'No messages yet'
  const said = m.text.trim()
  const what: Record<MessageKind, string> = {
    text: said, image: 'Sent a photo', video: 'Sent a video', audio: 'Sent a voice message', file: 'Sent a file',
    story_mention: 'Mentioned you in their story', story_reply: `Replied to your story${said ? `: ${said}` : ''}`,
    share: `Shared a post${said ? `: ${said}` : ''}`, unsupported: 'Sent a message Instagram doesn’t share with other apps',
  }
  return `${m.fromMe ? 'You: ' : ''}${what[m.kind] || said}`
}
