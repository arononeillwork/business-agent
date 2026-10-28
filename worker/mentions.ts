// Instagram mentions: someone tagged the business in a post, or mentioned it in their story. Every
// admin gets a notification (the bell and the Notifications page) with Repost and Ignore. Reposting
// puts the photo or video on the business's own story. Checked every 15 minutes; each mention is
// noticed once, and the last 7 days only (connecting doesn't dig up months of old tags).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from './supabase'
import * as instagram from './providers/instagram'
import { instagramSession } from './connections'
import { mediaStorage, storeMedia } from './media'
import { mentionTitle, mentionsIn } from '../shared/mentions'
import type { TaggedPost } from '../shared/messages'

/** Look for new mentions and tell every admin about each one. Returns how many were new. */
export async function checkMentions(env: Env, db: SupabaseClient): Promise<number> {
  const [{ data: row }, { data: set }] = await Promise.all([
    db.from('integrations').select('status, external').eq('provider', 'instagram').single(),
    db.from('settings').select('alert_instagram_mentions').eq('id', 1).single(),
  ])
  if (row?.status !== 'connected' || set?.alert_instagram_mentions === false) return 0
  const ext = (row.external ?? {}) as { user_id?: string; username?: string }
  const cfg = await instagramSession(env, db)
  // Tagged posts need "Manage comments"; without it, story mentions still come through.
  const [chats, tagged] = await Promise.all([
    instagram.conversations(cfg, { id: ext.user_id ?? '', username: ext.username }),
    instagram.tagged(cfg).catch(() => [] as TaggedPost[]),
  ])
  const found = mentionsIn(chats, tagged)
  if (!found.length) return 0
  const { data: added, error } = await db.from('instagram_mentions').upsert(found, { onConflict: 'business_id,id', ignoreDuplicates: true }).select('id, kind, username, caption')
  if (error) throw new Error(error.message)
  if (!added?.length) return 0
  const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin').eq('active', true)
  if (admins?.length) {
    await db.from('notifications').insert(added.flatMap(m => admins.map(a => ({
      profile_id: a.id, title: mentionTitle(m), body: m.caption ? String(m.caption).slice(0, 140) : null,
      link: '/notifications', kind: 'instagram_mention', data: { mention: m.id },
    }))))
  }
  return added.length
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
