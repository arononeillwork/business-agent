// Ideas (To Do List → Ideas): posts and reels the team wants to remember, from one Instagram chat, the
// Ideas chat. Instagram doesn't let apps read an account's saved posts, nor group chats, so the Ideas chat
// is the business's chat with itself (Instagram's "message yourself", which Meta shares with apps as self
// messaging), pinned at the top of its messages; or, if the admins name one (settings.idea_chat), its chat
// with another account, the owner's own say. Sharing a post into it (the paper plane, from either side)
// keeps it as an idea. What's written in the chat just before or after it, by the same side, is its note.
// The `instagram_ideas` migration keeps them; worker/instagramIdeas.ts reads the chat every 15 minutes.
import type { InboxConversation, InboxMessage } from './messages'
import { msg } from './i18n'

export type IdeaKind = 'post' | 'reel' | 'photo' | 'video'

export interface InstagramIdea {
  id: string
  message_id: string
  kind: IdeaKind
  /** Who sent it into the chat: the other account, or the business's own. */
  username: string
  media_url: string | null
  media_type: 'image' | 'video' | null
  /** media_url is a copy in the business's own storage, not Instagram's link (which runs out after a few days). */
  media_kept: boolean
  /** Where to open it on Instagram, when Instagram says. */
  permalink: string | null
  note: string | null
  shared_at: string
  hidden: boolean
  created_at: string
}

/**
 * What reading the Ideas chat found (Check now, and the Worker every 15 minutes). `not_connected`: Instagram
 * isn't, or not with messages allowed; `missing`: not among the business's latest chats (nothing new in it, or
 * nothing sent in it yet); `read`: read, `added` ideas new, `copied` pictures copied into storage.
 */
export interface IdeasCheck { chat: 'not_connected' | 'missing' | 'read'; added: number; copied: number }

/** An idea as found in the chat, before it's kept. */
export type FoundIdea = Pick<InstagramIdea, 'message_id' | 'kind' | 'username' | 'media_url' | 'permalink' | 'note' | 'shared_at'>

export const IDEA_KINDS: Record<IdeaKind, string> = { post: msg('Post'), reel: msg('Reel'), photo: msg('Photo'), video: msg('Video') }

/** How close in time a message has to be to a post to be its note. */
export const NOTE_WINDOW_MS = 5 * 60_000
export const MAX_NOTE = 2200

const PERMALINK = /^https:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reels?|tv)\/[\w-]+/i

/** An Instagram post or reel's own address, when that's what the link is (Instagram sometimes gives only its picture). */
export function permalinkOf(link: string | undefined): string | null {
  const m = link ? PERMALINK.exec(link) : null
  return m ? m[0] + '/' : null
}

const isIdea = (m: InboxMessage) =>
  (m.kind === 'share' || m.kind === 'image' || m.kind === 'video') && !!(m.mediaUrl || m.link)

function kindOf(m: InboxMessage, permalink: string | null): IdeaKind {
  if (m.kind === 'image') return 'photo'
  if (m.kind === 'video') return 'video'
  return permalink && /\/(reels?|tv)\//i.test(permalink) ? 'reel' : 'post'
}

/**
 * The ideas in the Ideas chat's messages (any order), oldest first. `self` is the business's own
 * username: what it sent into the chat is under its name. A text message sent within NOTE_WINDOW_MS of
 * a post by the same side is the post's note: the post before it if there is one that close, else the one after.
 */
export function ideasIn(chat: Pick<InboxConversation, 'with'>, messages: InboxMessage[], self: string | null): FoundIdea[] {
  const sorted = [...messages].sort((a, b) => a.at.localeCompare(b.at))
  const who = (m: InboxMessage) => (m.fromMe ? self || 'you' : chat.with.username)
  const found = new Map<string, FoundIdea & { notes: string[] }>()
  for (const m of sorted) {
    if (!isIdea(m)) continue
    const permalink = permalinkOf(m.link)
    // Without a picture of its own, a shared post's link is its picture (when it isn't the post's address).
    const media = m.mediaUrl ?? (m.link && !permalink && /^https:\/\//i.test(m.link) ? m.link : undefined)
    const text = m.text.trim()
    found.set(m.id, { message_id: m.id, kind: kindOf(m, permalink), username: who(m), media_url: media ?? null, permalink,
      note: null, shared_at: m.at, notes: text ? [text] : [] })
  }
  const ideas = [...found.values()]
  const ms = (at: string) => new Date(at).getTime()
  for (const m of sorted) {
    const text = m.kind === 'text' ? m.text.trim() : ''
    if (!text) continue
    const mine = ideas.filter(i => i.username === who(m))
    const before = mine.filter(i => i.shared_at <= m.at && ms(m.at) - ms(i.shared_at) <= NOTE_WINDOW_MS).pop()
    const after = mine.find(i => i.shared_at > m.at && ms(i.shared_at) - ms(m.at) <= NOTE_WINDOW_MS)
    const idea = before ?? after
    if (idea) idea.notes.push(text)
  }
  return ideas.map(({ notes, ...i }) => ({ ...i, note: notes.length ? notes.join('\n').slice(0, MAX_NOTE) : null }))
}

/** The business's own Instagram account, as its chats know it. */
export interface IdeasSelf { id?: string; username?: string | null }

/**
 * The Ideas chat among the business's chats (none when it isn't there): the one with the account an admin
 * chose (`chosen`), else the business's chat with itself: the one whose other side is the business's own account.
 */
export function ideaChatIn<C extends Pick<InboxConversation, 'with'>>(chats: C[], chosen: string | null | undefined, self: IdeasSelf): C | undefined {
  const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
  if (chosen) return chats.find(c => same(c.with.username, chosen))
  return chats.find(c => (!!self.id && c.with.id === self.id) || same(c.with.username, self.username))
}

// ---- Messages Instagram leaves empty --------------------------------------------------------------
// A chat read with its messages gives a shared post with nothing in it: no link, no picture. Such a
// message is read again on its own (worker/instagramIdeas.ts), and what comes back is searched for the
// post's address and its picture wherever Instagram put them. What still has neither is noted by its
// shape only (field names and the hosts of addresses, nothing written in it), so it can be seen what
// Instagram shares.

/** A message the chat's read gave nothing usable for: no words, and no picture or link. */
export const isEmptyMessage = (m: InboxMessage) =>
  !m.text.trim() && !m.mediaUrl && !m.link && m.kind !== 'story_mention' && m.kind !== 'story_reply'

/** Every https address in what Instagram said, with where it was (`shares.data.0.link`); never the people's. */
function addresses(raw: unknown, path = ''): { path: string; url: string }[] {
  if (typeof raw === 'string') return /^https:\/\//i.test(raw) ? [{ path, url: raw }] : []
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw as Record<string, unknown>)
    .filter(([k]) => !(path === '' && (k === 'from' || k === 'to')))
    .flatMap(([k, v]) => addresses(v, path ? `${path}.${k}` : k))
}

/** The post's own address and its picture (or video) in what Instagram said about a message, wherever they are. */
export function mediaOf(raw: unknown): { permalink: string | null; media: string | null; video: boolean } {
  const found = addresses(raw)
  const permalink = found.map(a => permalinkOf(a.url)).find(Boolean) ?? null
  const isVideo = (a: { path: string; url: string }) => /video/i.test(a.path) || /\.(mp4|mov)(\?|$)/i.test(a.url)
  // A picture before a video (a reel's cover shows on the card), and never a page on instagram.com itself.
  const page = (url: string) => { try { return /^(www\.)?instagram\.com$/i.test(new URL(url).host) } catch { return true } }
  const media = found.filter(a => !page(a.url))
  const pick = media.find(a => !isVideo(a)) ?? media[0]
  return { permalink, media: pick?.url ?? null, video: !!pick && isVideo(pick) }
}

/** What Instagram said about a message, by its shape: each field's name, and for an address its host. Nothing written in it. */
export function shapeOf(raw: unknown, path = ''): string[] {
  if (raw === null || raw === undefined) return []
  if (typeof raw !== 'object') {
    const host = typeof raw === 'string' && /^https?:\/\//i.test(raw) ? ` → ${new URL(raw).host}` : ''
    return [`${path}${host}`]
  }
  const entries = Object.entries(raw as Record<string, unknown>)
  if (!entries.length) return [`${path} (empty)`]
  return entries.flatMap(([k, v]) => shapeOf(v, path ? `${path}.${k}` : k)).slice(0, 40)
}

/** What the last read of the Ideas chat found, for the page: when, and the messages Instagram left empty. */
export interface IdeasStatus {
  checked_at?: string
  chat?: IdeasCheck['chat']
  /** Messages read on their own and still empty: when they were sent, and what Instagram gave (its shape). */
  unread?: { id: string; at: string; shape: string[] }[]
}
