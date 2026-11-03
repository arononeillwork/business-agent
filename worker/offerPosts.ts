// The business's own latest posts, for an offer from the special in one of them (Offers & specials →
// From Instagram, and the AI connector's latest_social_posts and save_offer). Read live from
// Instagram each time; while Instagram isn't connected, from the Facebook Page, where the same posts
// usually go too. Nothing is stored but the photo of the post an offer is made from: Instagram's and
// Facebook's links to it run out after a few days, so it's copied to the café's storage (Drive,
// OneDrive or R2) to stay on the screens for as long as the offer runs.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from './supabase'
import * as instagram from './providers/instagram'
import * as facebook from './providers/facebook'
import { facebookSession, instagramSession } from './connections'
import { mediaStorage, storeMedia } from './media'
import type { SourcePost } from '../shared/offerFromPost'

export interface LatestPosts {
  source: 'instagram' | 'facebook'
  /** "@easy.beans.coffee", or the Page's name. */
  account: string | null
  posts: SourcePost[]
}

const connected = async (db: SupabaseClient, provider: string) => {
  const { data } = await db.from('integrations').select('status, account_label, external').eq('provider', provider).maybeSingle()
  return data?.status === 'connected' ? data as { account_label: string | null; external: { username?: string } | null } : null
}

/** The latest posts (up to `limit`, newest first) from Instagram, else the Facebook Page. */
export async function latestPosts(env: Env, db: SupabaseClient, limit = 12): Promise<LatestPosts> {
  const ig = await connected(db, 'instagram')
  if (ig) {
    const media = await instagram.recentMedia(await instagramSession(env, db), limit)
    const username = ig.external?.username ?? ig.account_label
    return {
      source: 'instagram', account: username ? `@${username.replace(/^@/, '')}` : null,
      posts: media.map(m => ({
        id: m.id, source: 'instagram', caption: m.caption ?? null, permalink: m.permalink ?? null, posted_at: new Date(m.timestamp).toISOString(),
        video: m.media_type === 'VIDEO', image_url: (m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url ?? m.thumbnail_url) ?? null,
      })),
    }
  }
  const fb = await connected(db, 'facebook')
  if (fb) {
    const until = Math.floor(Date.now() / 1000)
    const posts = await facebook.pagePosts(await facebookSession(env, db), until - 90 * 86_400, until)
    return {
      source: 'facebook', account: fb.account_label,
      posts: posts.slice(0, limit).map(p => ({
        id: p.id, source: 'facebook', caption: p.message ?? null, image_url: p.full_picture ?? null, permalink: p.permalink_url ?? null,
        posted_at: new Date(p.created_time).toISOString(),
      })),
    }
  }
  throw new Error('Connect Instagram (or the Facebook Page) on the Connections page to bring in your posts')
}

// Only photos from Instagram's and Facebook's own servers are copied (not any address someone passes).
const SOCIAL_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net|fbsbx\.com)$/i
const KEEP_TYPES: Record<string, string> = { 'image/jpeg': 'Posts', 'image/png': 'Menu', 'image/webp': 'Menu' }

/**
 * A post's photo to keep on an offer: copied to the café's storage when there is some (its own
 * lasting address); otherwise Instagram's or Facebook's link as it is, which runs out in a few days.
 * Any other address is kept as given.
 */
export async function keepPostPhoto(env: Env, db: SupabaseClient, origin: string, url: string): Promise<{ url: string; kept: boolean }> {
  let host: string
  try { host = new URL(url).hostname } catch { throw new Error('That isn’t a photo’s address') }
  if (!/^https:\/\//i.test(url)) throw new Error('The photo’s address should start with https://')
  if (!SOCIAL_HOST.test(host) || !await mediaStorage(env, db)) return { url, kept: false }
  const res = await fetch(url)
  if (!res.ok) throw new Error('Instagram’s copy of this photo has run out. Open the post again to bring it in.')
  const type = res.headers.get('content-type')?.split(';')[0].trim() ?? ''
  const folder = KEEP_TYPES[type]
  if (!folder) return { url, kept: false }
  const body = await res.arrayBuffer()
  return { url: (await storeMedia(env, db, origin, { type, size: body.byteLength, body, folder })).url, kept: true }
}
