// Ideas (To Do List → Ideas): reading the Ideas chat, the business's Instagram chat with itself, or with the
// one account the admins name (shared/instagramIdeas.ts says which, what counts as an idea and its note).
// Every 15 minutes, in a minute of its own (worker/schedule.ts), and when someone presses Check now on the page:
//   1. the business's latest chats (one request; nobody looked up), to find the Ideas chat and its 5
//      latest messages. Not among the latest 25: nothing new in it.
//   2. Only when all 5 are new (there may be more): the chat itself, its 20 latest (all Instagram shares).
//   3. Messages that came back empty (a chat read with its messages leaves out a shared post) read again
//      on their own, a few a run; any still empty are noted by their shape (shared/instagramIdeas.ts) and
//      not read again.
//   4. Each post, reel, photo or video in it kept once.
//   5. Pictures copied into the business's own storage, a couple a run (a scheduled run may make only 50
//      outside requests, the database's included): Instagram's links to a chat's pictures stop working
//      a few days after they're sent, so those not copied by then, or that failed 3 times, keep Instagram's link.
//   POST /api/ideas/instagram/check    the team: read the Ideas chat now; { added, chat }
//   GET  /api/ideas/instagram/status   the team: what the last read found (IdeasStatus)
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, businessDb, type Env } from './supabase'
import { signInCheck, signedInUser } from './signedIn'
import * as instagram from './providers/instagram'
import { instagramSession } from './connections'
import { INSTAGRAM_IDEAS_FOLDER, MediaError, mediaStorage, storeMedia } from './media'
import { ideaChatIn, ideasIn, isEmptyMessage, mediaOf, shapeOf, type FoundIdea, type IdeasCheck, type IdeasStatus } from '../shared/instagramIdeas'
import type { InboxMessage } from '../shared/messages'

/** Pictures copied a run: a scheduled run's, and the page's Check now. */
export const COPIES_A_RUN = 2
export const COPIES_ON_CHECK = 4
/** How long Instagram's links to a chat's pictures are tried, and how many times. */
export const COPY_FOR_MS = 3 * 86_400_000
export const COPY_TRIES = 3
/** The most copied at once: the file is held in memory (a Worker has 128 MB). Bigger videos keep Instagram's link. */
export const COPY_MAX_BYTES = 30 * 1024 * 1024
/** Empty messages read again on their own: a scheduled run's (up to two requests each), and Check now's. */
export const ALONE_A_RUN = 4
export const ALONE_ON_CHECK = 10
/** Where the last read is noted (IdeasStatus), and how many still-empty messages are remembered. */
const STATUS = 'instagram:ideas'
const UNREAD_KEPT = 10


/** Read the Ideas chat and keep what's new in it. `force`: read its 20 latest messages whatever the 5 latest say. */
export async function readIdeasChat(env: Env, db: SupabaseClient, origin: string, force = false): Promise<IdeasCheck> {
  const { data: row } = await db.from('integrations').select('status, external').eq('provider', 'instagram').maybeSingle()
  const ext = (row?.external ?? {}) as { user_id?: string; username?: string; can_message?: boolean }
  // Not connected, or connected without messages allowed: nothing to read (and nothing asked of Instagram).
  if (row?.status !== 'connected' || ext.can_message === false) return { chat: 'not_connected', added: 0, copied: 0 }
  const { data: set } = await db.from('settings').select('idea_chat').eq('id', 1).maybeSingle()
  const cfg = await instagramSession(env, db)
  const me: instagram.Me = { id: ext.user_id ?? '', username: ext.username }
  const chat = ideaChatIn(await instagram.conversations(cfg, me, () => false), set?.idea_chat as string | null | undefined, me)
  let added = 0
  let unread: NonNullable<IdeasStatus['unread']> | undefined
  if (chat) {
    let kept = await keptOf(db, chat.recent.map(m => m.id))
    let messages = chat.recent
    if (force || maybeMore(chat.recent, kept)) {
      messages = await instagram.chatMessages(cfg, me, chat.id)
      kept = await keptOf(db, messages.map(m => m.id))
    }
    const alone = await readEmptyAlone(db, cfg, me, messages, kept, force ? ALONE_ON_CHECK : ALONE_A_RUN)
    messages = alone.messages
    unread = alone.unread
    added = await keepIdeas(db, ideasIn(chat, messages, ext.username ?? null), kept)
  }
  const copied = await copyPictures(env, db, origin, force ? COPIES_ON_CHECK : COPIES_A_RUN)
  const result: IdeasCheck = { chat: chat ? 'read' : 'missing', added, copied }
  await db.from('provider_cache').upsert({ key: STATUS, fetched_at: new Date().toISOString(),
    data: { checked_at: new Date().toISOString(), chat: result.chat, ...(unread ? { unread } : {}) } satisfies IdeasStatus }, { onConflict: 'business_id,key' })
  return result
}

/** What the last read of the Ideas chat found (the page, and what was left empty before). */
export async function ideasStatus(db: SupabaseClient): Promise<IdeasStatus> {
  const { data } = await db.from('provider_cache').select('data').eq('key', STATUS).maybeSingle()
  return (data?.data ?? {}) as IdeasStatus
}

/**
 * The chat's messages with the empty ones (not kept, not tried before) read again on their own, the newest
 * `max`. Returns them, and the ones still empty (with those from before), newest first.
 */
async function readEmptyAlone(db: SupabaseClient, cfg: instagram.InstagramConfig, me: instagram.Me, messages: InboxMessage[], kept: Set<string>, max: number) {
  const empty = messages.filter(m => isEmptyMessage(m) && !kept.has(m.id))
  if (!empty.length) return { messages, unread: undefined }
  const before = (await ideasStatus(db)).unread ?? []
  const tried = new Set(before.map(u => u.id))
  const now = [...empty].filter(m => !tried.has(m.id)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, max)
  const read = new Map<string, InboxMessage>()
  const still: NonNullable<IdeasStatus['unread']> = []
  for (const m of now) {
    const alone = await readAlone(cfg, me, m)
    if (alone.message) read.set(m.id, alone.message)
    else still.push({ id: m.id, at: m.at, shape: alone.shape })
  }
  const unread = [...still, ...before.filter(u => !read.has(u.id))].sort((a, b) => b.at.localeCompare(a.at)).slice(0, UNREAD_KEPT)
  return { messages: messages.map(m => read.get(m.id) ?? m), unread }
}

/**
 * One message read on its own: Instagram's own choice of fields, then the parts of shares and attachments by
 * name. Its post's address and picture are looked for wherever Instagram put them. Still empty: null, and
 * what came back by its shape (field names and hosts only).
 */
async function readAlone(cfg: instagram.InstagramConfig, me: instagram.Me, m: InboxMessage): Promise<{ message: InboxMessage | null; shape: string[] }> {
  const shape: string[] = []
  for (const named of [false, true]) {
    const how = named ? 'named' : 'plain'
    let raw: Awaited<ReturnType<typeof instagram.messageById>>
    try {
      raw = await instagram.messageById(cfg, m.id, named)
    } catch (e) {
      shape.push(`${how}: refused (${(e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 160)})`)
      continue
    }
    const read = instagram.toInboxMessage(raw, me)
    if (!isEmptyMessage(read)) return { message: read, shape: [] }
    const found = mediaOf(raw)
    if (found.media || found.permalink) {
      return { message: { ...read, kind: found.video ? 'video' : 'share', link: found.permalink ?? undefined, mediaUrl: found.media ?? undefined }, shape: [] }
    }
    shape.push(...shapeOf(raw).map(f => `${how}: ${f}`))
  }
  return { message: null, shape: shape.slice(0, 60) }
}

/** Which of these messages are kept as ideas already. */
async function keptOf(db: SupabaseClient, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const { data, error } = await db.from('instagram_ideas').select('message_id').in('message_id', ids)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map(r => String(r.message_id)))
}

/**
 * Whether the chat may have more new messages than the 5 the chats list gives: all 5 of them are new
 * (none is an idea kept already), and they're from the last day (an old chat isn't read again and again).
 */
export function maybeMore(recent: InboxMessage[], kept: Set<string>, now = Date.now()) {
  if (recent.length < 5 || recent.some(m => kept.has(m.id))) return false
  const oldest = recent.reduce((a, m) => (m.at < a ? m.at : a), recent[0].at)
  return now - new Date(oldest).getTime() < 86_400_000
}

/** Keep the ideas not kept yet; returns how many. A read at the same moment can't keep one twice. */
export async function keepIdeas(db: SupabaseClient, found: FoundIdea[], kept?: Set<string>): Promise<number> {
  const had = kept ?? new Set()
  const unseen = found.filter(f => !had.has(f.message_id))
  // The 20 latest messages may hold ideas kept on an earlier read that the 5 latest didn't show.
  const already = await keptOf(db, unseen.filter(f => !kept || !kept.has(f.message_id)).map(f => f.message_id))
  const fresh = unseen.filter(f => !already.has(f.message_id))
  if (!fresh.length) return 0
  const { error } = await db.from('instagram_ideas')
    .upsert(fresh.map(f => ({ ...f, media_type: guessType(f.media_url), media_kept: false, media_tries: 0, hidden: false })),
      { onConflict: 'business_id,message_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  return fresh.length
}

/** A video by its address (.mp4, .mov), else a picture; copying it says for sure. */
const guessType = (url: string | null) => (!url ? null : /\.(mp4|mov)(\?|$)/i.test(url) ? 'video' : 'image')

/** Copy a few ideas' pictures (or videos) from Instagram into the business's storage. Returns how many. */
export async function copyPictures(env: Env, db: SupabaseClient, origin: string, max: number): Promise<number> {
  const since = new Date(Date.now() - COPY_FOR_MS).toISOString()
  const { data } = await db.from('instagram_ideas').select('id, media_url, media_tries')
    .eq('media_kept', false).eq('hidden', false).lt('media_tries', COPY_TRIES).gte('shared_at', since).not('media_url', 'is', null)
    .order('shared_at', { ascending: false }).limit(max)
  // No storage connected: Instagram's links are kept as they are (the page says to connect Drive or OneDrive).
  if (!data?.length || !(await mediaStorage(env, db))) return 0
  let copied = 0
  for (const idea of data) {
    try {
      const { url, type } = await copyOne(env, db, origin, String(idea.media_url))
      await db.from('instagram_ideas').update({ media_url: url, media_type: type, media_kept: true }).eq('id', idea.id)
      copied++
    } catch (e) {
      // A file storage won't take (too big, a kind it doesn't keep) isn't tried again; anything else is, a few times.
      const tries = e instanceof MediaError ? COPY_TRIES : Number(idea.media_tries ?? 0) + 1
      await db.from('instagram_ideas').update({ media_tries: tries }).eq('id', idea.id)
    }
  }
  return copied
}

async function copyOne(env: Env, db: SupabaseClient, origin: string, from: string) {
  const res = await fetch(from)
  if (!res.ok) throw new Error(`Instagram’s picture couldn’t be read (${res.status})`)
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const size = Number(res.headers.get('content-length') ?? '') || null
  // A video of unknown size, or anything too big, isn't read into memory to copy it.
  if ((size ?? (type.startsWith('video/') ? Infinity : 0)) > COPY_MAX_BYTES) {
    await res.body?.cancel()
    throw new MediaError('Too big to copy')
  }
  const bytes = await res.arrayBuffer()
  if (bytes.byteLength > COPY_MAX_BYTES) throw new MediaError('Too big to copy')
  const stored = await storeMedia(env, db, origin, { type, size: bytes.byteLength, body: bytes, folder: INSTAGRAM_IDEAS_FOLDER })
  return { url: stored.url, type: stored.type === 'video' ? 'video' as const : 'image' as const }
}

// ---- Check now (the Ideas page) ------------------------------------------------------------------

export const ideas = new Hono<{ Bindings: Env }>()

/** The signed-in person's business, when they're on its team. */
async function teamBusiness(env: Env, header: string | undefined): Promise<number | 'signed_out' | null> {
  const token = bearer(header)
  if (!token) return 'signed_out'
  const [{ data: user }, { data: staff }, { data: businessId }] = await Promise.all([signedInUser(env, token), signInCheck(env, token, 'is_staff'), signInCheck(env, token, 'current_business_id')])
  return user.user && staff && businessId ? businessId as number : null
}

ideas.get('/api/ideas/instagram/status', async c => {
  const business = await teamBusiness(c.env, c.req.header('authorization'))
  if (business === 'signed_out') return c.json({ error: 'Not signed in' }, 401)
  if (!business) return c.json({ error: 'Only the team sees the Ideas chat' }, 403)
  return c.json(await ideasStatus(businessDb(c.env, business)))
})

ideas.post('/api/ideas/instagram/check', async c => {
  const business = await teamBusiness(c.env, c.req.header('authorization'))
  if (business === 'signed_out') return c.json({ error: 'Not signed in' }, 401)
  if (!business) return c.json({ error: 'Only the team checks the Ideas chat' }, 403)
  try {
    return c.json(await readIdeasChat(c.env, businessDb(c.env, business), new URL(c.req.url).origin, true))
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
