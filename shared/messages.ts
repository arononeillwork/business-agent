// Messages page: one inbox for the business's direct messages. Instagram, Messenger with the
// Facebook connection, and WhatsApp; TikTok shows as "soon". What Instagram shares with other apps (and what it doesn't) is in
// docs/INTEGRATIONS.md: no Primary/General/Requests folders, the 20 latest messages of a chat, and
// replies within 24 hours of the customer's last message (up to 7 days as a personal, human-agent reply).
// WhatsApp can't be read back from Meta, so its chats are the ones the webhook saved (kept for the
// time chosen under Data retention); it allows free replies for 24 hours, with no human-agent extension.
import { msg } from './i18n'

export type MessagePlatform = 'instagram' | 'whatsapp' | 'messenger' | 'tiktok'

/** What a message is, as Instagram tells it (`location` and `other`, a kind the app can't show, come from WhatsApp). */
export type MessageKind = 'text' | 'image' | 'video' | 'audio' | 'file' | 'story_mention' | 'story_reply' | 'share' | 'location' | 'unsupported' | 'other'

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
  /** WhatsApp, the business's own messages: how far it got (and why it failed). */
  status?: 'sent' | 'delivered' | 'read' | 'failed'
  error?: string
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
  { key: 'all', label: msg('All') }, { key: 'needs_reply', label: msg('Needs reply') }, { key: 'mentions', label: msg('Mentions & tags') },
  { key: 'story_replies', label: msg('Story replies') }, { key: 'shares', label: msg('Shared posts') },
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
export function replyWindow(messages: InboxMessage[], now = Date.now(), platform: MessagePlatform = 'instagram'): ReplyWindow {
  const theirs = lastFromThem(messages)
  if (theirs !== undefined && now - theirs < REPLY_WINDOW_MS) return { mode: 'normal', until: new Date(theirs + REPLY_WINDOW_MS).toISOString() }
  // WhatsApp has no personal-reply extension: after 24 hours only approved templates can go.
  if (platform !== 'whatsapp' && theirs !== undefined && now - theirs < HUMAN_AGENT_WINDOW_MS) return { mode: 'human_agent', until: new Date(theirs + HUMAN_AGENT_WINDOW_MS).toISOString() }
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

/** Case-insensitive search across who the chat is with and its latest messages. Empty finds everything. */
export function matchesSearch(c: Pick<InboxConversation, 'with' | 'recent'>, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return c.with.username.toLowerCase().includes(q)
    || (c.with.name?.toLowerCase().includes(q) ?? false)
    || c.recent.some(m => m.text.toLowerCase().includes(q))
}

/** Fills {placeholders} in English: the default for `translate` (the page passes its t()). */
type Translate = (text: string, vars?: Record<string, string>) => string
const asIs: Translate = (text, vars) => text.replace(/\{(\w+)\}/g, (all, k: string) => vars?.[k] ?? all)

/** One line for the chat list and notifications (in English unless a `translate` is given). */
export function preview(m: InboxMessage | undefined, translate = asIs) {
  if (!m) return translate(msg('No messages yet'))
  const said = m.text.trim()
  const what: Record<MessageKind, string> = {
    text: said, image: translate(msg('Sent a photo')), video: translate(msg('Sent a video')),
    audio: translate(msg('Sent a voice message')), file: translate(msg('Sent a file')),
    story_mention: translate(msg('Mentioned you in their story')),
    story_reply: said ? translate(msg('Replied to your story: {text}'), { text: said }) : translate(msg('Replied to your story')),
    share: said ? translate(msg('Shared a post: {text}'), { text: said }) : translate(msg('Shared a post')),
    location: translate(msg('Sent a location')),
    unsupported: translate(msg('Sent a message Instagram doesn’t share with other apps')),
    other: translate(msg('Sent a message Business Agent can’t show')),
  }
  const line = what[m.kind] || said
  return m.fromMe ? translate(msg('You: {text}'), { text: line }) : line
}

/** How long saved WhatsApp chats are kept (Data retention on My account), in days. */
export const WHATSAPP_RETENTION_DAYS = [30, 90, 180, 365, 730] as const
export type WhatsAppRetention = typeof WHATSAPP_RETENTION_DAYS[number]
export const DEFAULT_WHATSAPP_RETENTION: WhatsAppRetention = 90
export const RETENTION_LABEL: Record<WhatsAppRetention, string> = {
  30: msg('1 month'), 90: msg('3 months'), 180: msg('6 months'), 365: msg('1 year'), 730: msg('2 years'),
}
export const isRetention = (days: unknown): days is WhatsAppRetention => (WHATSAPP_RETENTION_DAYS as readonly unknown[]).includes(days)
