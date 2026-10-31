// Sales reps' own pages and reach. A rep's link (/rep/<token>, no sign-in) asks here for what they've
// earned, their reach and crew, and sends what they shared and who they add to their crew; the
// token is the rep's secret (rep_links) and finds the café it's for. The SQL functions do the work
// (the rep_reach_and_crews migration): what's sent waits for an admin.
// Reach from Instagram: followers come with the people who've messaged the café (a story mention is
// a message), so a rep whose handle is in the latest chats has their followers kept up to date, and
// the team can look someone up by their handle when adding them.
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, businessDb, requestDb, serviceClient, userClient, type Env } from './supabase'
import * as instagram from './providers/instagram'
import { instagramSession } from './connections'
import { cleanInstagram, type CrewSuggestion, type SocialLookup } from '../shared/reps'
import type { InboxConversation } from '../shared/messages'

export const repPage = new Hono<{ Bindings: Env }>()

const GONE = 'This link has changed. Ask the café for your new one.'

/** The café a rep's link is for, or null. */
async function businessOfLink(env: Env, token: string): Promise<number | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null
  const { data } = await serviceClient(env).from('rep_links').select('business_id').eq('token', token).maybeSingle()
  return data ? (data.business_id as number) : null
}

/** The database's words, as someone on their page reads them. */
export function sayPlainly(message: string): string {
  if (/duplicate key.*instagram/i.test(message)) return 'Someone with that Instagram is in already.'
  if (/check constraint "sales_reps_(instagram|tiktok|youtube)_check"/i.test(message)) return 'That isn’t a handle: letters, numbers, dots and underscores.'
  if (/check constraint "sales_reps_\w+_followers_check"|sales_reps_community_check/i.test(message)) return 'Followers are a number from 0 up.'
  if (/check constraint "rep_rewards_proof_url_check"/i.test(message)) return 'The link has to start with https://'
  if (/check constraint|invalid input syntax/i.test(message)) return 'Something there isn’t right. Check it and send it again.'
  return message
}

repPage.get('/api/rep-page/:token', async c => {
  const token = c.req.param('token')
  const business = await businessOfLink(c.env, token)
  if (!business) return c.json({ error: GONE }, 404)
  const { data, error } = await businessDb(c.env, business).rpc('rep_page', { p_token: token })
  if (error) return c.json({ error: 'Your page couldn’t be loaded just now. Try again in a minute.' }, 503)
  if (!data) return c.json({ error: GONE }, 404)
  return c.json(data, 200, { 'cache-control': 'no-store' })
})

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : v === null || v === undefined || v === '' ? null : v)

repPage.post('/api/rep-page/:token/claim', async c => {
  const token = c.req.param('token')
  const business = await businessOfLink(c.env, token)
  if (!business) return c.json({ error: GONE }, 404)
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  if (typeof body.rule_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.rule_id)) return c.json({ error: 'Choose what you shared' }, 400)
  const day = typeof body.occurred_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.occurred_on) ? body.occurred_on : null
  const { data, error } = await businessDb(c.env, business).rpc('claim_reward', {
    p_token: token, p_rule_id: body.rule_id, p_note: text(body.note, 500), p_proof_url: text(body.proof_url, 1000), p_occurred_on: day })
  if (error) return c.json({ error: sayPlainly(error.message) }, 400)
  return c.json(data)
})

repPage.post('/api/rep-page/:token/crew', async c => {
  const token = c.req.param('token')
  const business = await businessOfLink(c.env, token)
  if (!business) return c.json({ error: GONE }, 404)
  const body = await c.req.json().catch(() => ({})) as Partial<Record<keyof CrewSuggestion, unknown>>
  const person = {
    name: text(body.name, 120), instagram: text(body.instagram, 60), tiktok: text(body.tiktok, 60), youtube: text(body.youtube, 60),
    facebook: text(body.facebook, 100), phone: text(body.phone, 40), note: text(body.note, 500),
    instagram_followers: count(body.instagram_followers), tiktok_followers: count(body.tiktok_followers),
    youtube_followers: count(body.youtube_followers), facebook_followers: count(body.facebook_followers), community: count(body.community),
  }
  const { data, error } = await businessDb(c.env, business).rpc('suggest_crew', { p_token: token, p_person: person })
  if (error) return c.json({ error: sayPlainly(error.message) }, 400)
  return c.json(data)
})

// ---- Reach from Instagram ----------------------------------------------------------------------------

const NOT_SHARED = 'Instagram only shares followers for people who’ve messaged the café or mentioned it in a story. Ask them to send the café a message, or type the number from their profile.'

/** What Instagram says about a handle: their followers, name and photo, if they're in the café's latest chats. */
export async function lookupInstagram(env: Env, db: SupabaseClient, handle: string): Promise<SocialLookup> {
  const { data: row } = await db.from('integrations').select('status, external').eq('provider', 'instagram').maybeSingle()
  if (row?.status !== 'connected') return { found: false, reason: 'Connect the café’s Instagram (Connections) to look people up there.' }
  const ext = (row.external ?? {}) as { user_id?: string; username?: string }
  const chats = await instagram.conversations(await instagramSession(env, db), { id: ext.user_id ?? '', username: ext.username })
  const chat = chats.find(c => c.with.username?.toLowerCase() === handle)
  if (!chat || chat.with.followers === undefined) return { found: false, reason: NOT_SHARED }
  return { found: true, followers: chat.with.followers, ...(chat.with.name ? { name: chat.with.name } : {}), ...(chat.with.picture ? { picture: chat.with.picture } : {}) }
}

repPage.post('/api/reps/instagram', async c => {
  const auth = bearer(c.req.header('authorization'))
  const { data: staff } = auth ? await userClient(c.env, auth, 'app').rpc('is_staff') : { data: false }
  if (staff !== true) return c.json({ error: 'Only the team can look people up' }, 403)
  const body = await c.req.json().catch(() => ({})) as { handle?: unknown }
  const handle = cleanInstagram(typeof body.handle === 'string' ? body.handle : '')
  if (!handle) return c.json({ error: 'That isn’t an Instagram handle' }, 400)
  try {
    return c.json(await lookupInstagram(c.env, await requestDb(c), handle))
  } catch (e) {
    return c.json({ found: false, reason: e instanceof Error ? e.message : String(e) } satisfies SocialLookup)
  }
})

/**
 * Reps whose Instagram is among the latest chats: their followers as Instagram says now (and a photo
 * when they have none). Small changes are left alone, so a rep isn't rewritten every few minutes.
 * Returns how many changed.
 */
export async function syncRepFollowers(db: SupabaseClient, chats: InboxConversation[]): Promise<number> {
  const seen = new Map(chats.filter(c => c.with.username && typeof c.with.followers === 'number').map(c => [c.with.username.toLowerCase(), c.with]))
  if (!seen.size) return 0
  const { data: reps, error } = await db.from('sales_reps').select('id, instagram, instagram_followers, picture_url').in('instagram', [...seen.keys()])
  if (error) throw new Error(error.message)
  let changed = 0
  for (const r of (reps ?? []) as { id: string; instagram: string; instagram_followers: number | null; picture_url: string | null }[]) {
    const who = seen.get(r.instagram)!
    const followers = who.followers!
    const before = r.instagram_followers
    const moved = before === null || Math.abs(followers - before) >= Math.max(10, before * 0.01)
    const photo = !r.picture_url && who.picture?.startsWith('https://') ? who.picture : null
    if (!moved && !photo) continue
    const { error: e } = await db.from('sales_reps').update({ instagram_followers: followers, followers_checked_at: new Date().toISOString(), ...(photo ? { picture_url: photo } : {}) }).eq('id', r.id)
    if (!e) changed++
  }
  return changed
}
