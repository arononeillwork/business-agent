// Messages page: one inbox for the business's direct messages. Instagram for now; WhatsApp, Messenger
// and TikTok show as "soon". What Instagram shares with other apps (and what it doesn't) is in
// docs/INTEGRATIONS.md: no Primary/General/Requests folders, the 20 latest messages of a chat, and
// replies only within 24 hours of the customer's last message.

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
  with: { id: string; username: string; name?: string }
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

/** The customer wrote last: nobody has answered yet. */
export const needsReply = (c: Pick<InboxConversation, 'recent'>) => !!c.recent[0] && !c.recent[0].fromMe

/** Until when the business can still reply (null: the customer hasn't written, or it's too late). */
export function replyUntil(messages: InboxMessage[], now = Date.now()): string | null {
  const theirs = messages.filter(m => !m.fromMe).map(m => Date.parse(m.at)).sort((a, b) => b - a)[0]
  if (theirs === undefined || now - theirs >= REPLY_WINDOW_MS) return null
  return new Date(theirs + REPLY_WINDOW_MS).toISOString()
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
