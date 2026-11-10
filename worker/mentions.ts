// Instagram mentions: someone tagged the business in a post, mentioned it in their story, or posted a
// reel or post with it as a collaborator (on the business's own grid, but listed by Instagram on its
// own). Every admin gets a notification (the bell and the Notifications page) with Repost and Ignore.
// Reposting puts the photo or video on the business's own story. Checked every 15 minutes; each
// mention is noticed once, and only the last 7 days' are told about (connecting doesn't dig up months
// of old tags). Collabs are all kept, however old, with how they did: they're the café's posts too.
// The people who post them are put on Sales reps & rewards, waiting for an owner's OK (putForward).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from './supabase'
import * as instagram from './providers/instagram'
import { instagramSession } from './connections'
import { syncRepFollowers } from './repPage'
import { refreshFollowerDays } from './socialAnalytics'
import { mediaStorage, storeMedia } from './media'
import {
  collabId, collabMentions, isRecent, mentionTitle, mentionsIn, peopleToPutForward, shortcodeOf, type CollabMedia, type Mention,
} from '../shared/mentions'
import type { InboxConversation, TaggedPost } from '../shared/messages'

/** Look for new mentions and tell every admin about each one. Returns how many were new. */
export async function checkMentions(env: Env, db: SupabaseClient): Promise<number> {
  const [{ data: row }, { data: set }] = await Promise.all([
    db.from('integrations').select('status, external').eq('provider', 'instagram').single(),
    db.from('settings').select('alert_instagram_mentions').eq('id', 1).single(),
  ])
  if (row?.status !== 'connected') return 0
  const ext = (row.external ?? {}) as { user_id?: string; username?: string; can_see_insights?: boolean }
  const cfg = await instagramSession(env, db)
  // Tagged posts need "Manage comments"; without it, story mentions still come through. Collabs are
  // asked for on their own: an account Instagram won't list them for still has the rest.
  const [chats, tagged, collabs] = await Promise.all([
    instagram.conversations(cfg, { id: ext.user_id ?? '', username: ext.username }),
    instagram.tagged(cfg).catch(() => [] as TaggedPost[]),
    instagram.collabs(cfg).catch(() => [] as CollabMedia[]),
  ])
  // Reps among these people: their followers as Instagram says now (Sales reps & rewards).
  await syncRepFollowers(db, chats).catch(() => 0)
  const added = await keepMentions(db, mentionsIn(chats, tagged), collabMentions(collabs, chats))
  if (added.length && set?.alert_instagram_mentions !== false) {
    const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin').eq('active', true)
    if (admins?.length) {
      await db.from('notifications').insert(added.flatMap(m => admins.map(a => ({
        profile_id: a.id, title: mentionTitle(m), body: m.caption ? String(m.caption).slice(0, 140) : null,
        link: '/notifications', kind: 'instagram_mention', data: { mention: m.id },
      }))))
    }
  }
  await putForward(db, ext.username ?? null, chats).catch(e => console.error('putting posters forward as reps failed', e))
  // Once a day: new followers, kept for What each post did (Analytics).
  if (ext.can_see_insights !== false) await refreshFollowerDays(db, cfg).catch(e => console.error('keeping new followers failed', e))
  return added.length
}

/**
 * Keep new tags and story mentions, and every collab with its latest figures. A tagged post that's
 * also a collab (or was added by its link) is kept once, as the collab. Returns the ones to tell the
 * admins about: new, and from the last week.
 */
export async function keepMentions(db: SupabaseClient, found: Mention[], collabs: Mention[]): Promise<Mention[]> {
  const asCollab = (m: Mention) => { const code = m.kind === 'post' ? shortcodeOf(m.permalink) : null; return code ? collabId(code) : null }
  const ids = [...new Set([...collabs.map(m => m.id), ...found.map(asCollab).filter((x): x is string => !!x)])]
  const { data: had, error: readError } = ids.length ? await db.from('instagram_mentions').select('id').in('id', ids) : { data: [], error: null }
  if (readError) throw new Error(readError.message)
  const kept = new Set([...(had ?? []).map(r => r.id as string), ...collabs.map(m => m.id)])
  const plain = found.filter(m => { const id = asCollab(m); return !id || !kept.has(id) })
  const fresh: Mention[] = []
  if (plain.length) {
    const { data, error } = await db.from('instagram_mentions').upsert(plain, { onConflict: 'business_id,id', ignoreDuplicates: true }).select('id')
    if (error) throw new Error(error.message)
    const added = new Set((data ?? []).map(r => r.id as string))
    fresh.push(...plain.filter(m => added.has(m.id)))
  }
  if (collabs.length) {
    // Figures change, and Instagram's picture links run out: each look brings them up to date (what
    // was done about it, and who added it, stay).
    const { error } = await db.from('instagram_mentions').upsert(collabs, { onConflict: 'business_id,id' })
    if (error) throw new Error(error.message)
    const before = new Set((had ?? []).map(r => r.id as string))
    fresh.push(...collabs.filter(m => !before.has(m.id) && isRecent(m)))
  }
  return fresh.sort((a, b) => b.mentioned_at.localeCompare(a.mentioned_at))
}

/** The most people put forward in one look (the rest wait for the next): each may take a request of its own. */
const PUT_FORWARD_AT_ONCE = 5

/**
 * The people who posted about the café (mentions not looked at yet), on Sales reps & rewards as
 * customers waiting for an owner's OK, with the post that brought them (peopleToPutForward says who).
 * The owners are told by the database. Each mention is looked at once. Returns how many were added.
 */
export async function putForward(db: SupabaseClient, self: string | null, chats: InboxConversation[] = []): Promise<number> {
  const { data: waiting, error } = await db.from('instagram_mentions').select('id, kind, username, mentioned_at, followers')
    .is('rep_checked_at', null).not('username', 'is', null).order('mentioned_at', { ascending: false }).limit(50)
  if (error) throw new Error(error.message)
  if (!waiting?.length) return 0
  const rows = waiting as Pick<Mention, 'id' | 'kind' | 'username' | 'mentioned_at' | 'followers'>[]
  const handles = [...new Set(rows.map(m => m.username!.toLowerCase()))]
  const [{ data: reps, error: e1 }, { data: before, error: e2 }] = await Promise.all([
    db.from('sales_reps').select('instagram').in('instagram', handles),
    db.from('instagram_mentions').select('username').in('username', handles).eq('put_forward', true),
  ])
  if (e1 || e2) throw new Error((e1 ?? e2)!.message)
  const known = new Set([...(reps ?? []).map(r => String(r.instagram)), ...(before ?? []).map(m => String(m.username).toLowerCase())])
  const people = peopleToPutForward(rows, known, self, chats)
  const now = new Date().toISOString()
  const brought: string[] = []
  const add = async (p: (typeof people)[number]) => {
    const { error: e } = await db.from('sales_reps').insert({
      name: (p.name ?? `@${p.username}`).slice(0, 120), kind: 'customer', instagram: p.username, approved: false, found_mention_id: p.mention_id,
      instagram_followers: p.followers, followers_checked_at: p.followers === null ? null : now, picture_url: p.picture,
    })
    if (!e) brought.push(p.mention_id)
    else if (!/duplicate key/i.test(e.message)) console.error('putting forward', p.username, e.message)
  }
  for (const p of people.slice(0, PUT_FORWARD_AT_ONCE)) await add(p)
  // Those over the limit wait for the next look; everything else has been looked at.
  const later = new Set(people.slice(PUT_FORWARD_AT_ONCE).map(p => p.username))
  const looked = rows.filter(m => !later.has(m.username!.toLowerCase())).map(m => m.id)
  if (looked.length) await db.from('instagram_mentions').update({ rep_checked_at: now }).in('id', looked)
  if (brought.length) await db.from('instagram_mentions').update({ put_forward: true }).in('id', brought)
  return brought.length
}

/**
 * Put a mention's photo or video on the business's own story. Instagram fetches the file from an
 * address, so it's copied to the business's storage first when there is some (Instagram's own
 * links run out); otherwise Instagram is given its own link.
 */
export async function repostMention(env: Env, db: SupabaseClient, origin: string, id: string, by: string) {
  const { data: m } = await db.from('instagram_mentions').select('*').eq('id', id).single()
  if (!m) throw new Error('That mention has gone')
  if (m.status === 'reposted') return m.reposted_url as string | null
  if (!m.media_url) throw new Error('Instagram didn’t share this one’s photo or video, so it can’t be reposted')
  const res = await fetch(m.media_url)
  if (!res.ok) throw new Error('Instagram’s copy of this photo or video has expired. Open it on Instagram to share it from there.')
  const type = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg'
  const kind: 'image' | 'video' = type.startsWith('video/') ? 'video' : 'image'
  let url = m.media_url as string
  if (await mediaStorage(env, db)) {
    const bytes = await res.arrayBuffer()
    url = (await storeMedia(env, db, origin, { type: kind === 'video' ? 'video/mp4' : 'image/jpeg', size: bytes.byteLength, body: bytes, folder: 'Stories' })).url
  }
  const posted = await instagram.publish(await instagramSession(env, db), { kind: 'story', media: [{ url, type: kind }], caption: '' })
  await decide(db, id, 'reposted', by, posted)
  return posted
}

/** Record what was done (Repost or Ignore), and mark every admin's notification about it as read. */
export async function decide(db: SupabaseClient, id: string, status: 'reposted' | 'ignored', by: string, url: string | null = null) {
  const now = new Date().toISOString()
  await db.from('instagram_mentions').update({ status, reposted_url: url, decided_by: by, decided_at: now }).eq('id', id)
  await db.from('notifications').update({ read_at: now }).eq('kind', 'instagram_mention').eq('data->>mention', id).is('read_at', null)
}
