// Instagram mentions: someone tagged the business in a post, mentioned it in their story, or posted a
// reel or post with it as a collaborator (on the business's own grid, but listed by Instagram on its
// own). Every admin gets a notification (the bell and the Notifications page) with Repost and Ignore.
// Reposting puts the photo or video on the business's own story. Checked every 15 minutes; each
// mention is noticed once, and only the last 7 days' are told about (connecting doesn't dig up months
// of old tags). Collabs are all kept, however old, with how they did: they're the café's posts too.
// The people who post them are put on Sales reps & rewards, waiting for an owner's OK (putForward).
import type { SupabaseClient } from '@supabase/supabase-js'
import { businessIdOf, type Env } from './supabase'
import { reportError } from './errors'
import * as instagram from './providers/instagram'
import { facebookPages, graphVersion as graphVersionOf, instagramSession, metaAdsSession } from './connections'
import * as facebook from './providers/facebook'
import { syncRepFollowers } from './repPage'
import { refreshFollowerDays } from './socialAnalytics'
import { mediaStorage, storeMedia } from './media'
import { insightTotals, unixDay } from '../shared/socialAnalytics'
import {
  collabId, collabMentions, isRecent, mentionTitle, mentionsIn, peopleToPutForward, shortcodeOf, type CollabMedia, type Mention,
  type AccountFigures, type AccountWindow,
} from '../shared/mentions'
import type { InboxConversation, TaggedPost } from '../shared/messages'
import { addDays, today } from '../shared/time'
import { zoneOf } from './zone'

/**
 * Look for new mentions and tell every admin about each one. Returns how many were new.
 * A scheduled run may make only 50 outside requests (worker/schedule.ts), and this comes after the
 * minute's other jobs. So it goes cheapest and surest first: tags and collabs kept and their posters
 * put forward, the day's new followers kept, and only then the chats (story mentions), with only the
 * people who matter looked up (someone who mentioned the café in a story, or a rep): looking up all
 * 25 used the run up before anything was kept. What a look found is noted at its end
 * (provider_cache 'instagram:mentions-check'), so a look that didn't finish shows.
 */
export async function checkMentions(env: Env, db: SupabaseClient): Promise<number> {
  const { data: row } = await db.from('integrations').select('status, external').eq('provider', 'instagram').single()
  if (row?.status !== 'connected') return 0
  const ext = (row.external ?? {}) as InstagramExternal
  const cfg = await instagramSession(env, db)
  const business = businessIdOf(db)
  const self = ext.username ?? null

  // 1. Tags and collabs, their posters put forward as reps.
  const look = await lookForPosts(env, db, cfg, ext)

  // 2. Once a day: new followers, kept for What each post did (Analytics). Today where the business is
  //    (Dublin's day for a business in Ireland).
  if (ext.can_see_insights !== false) {
    const day = today(await zoneOf(db))
    await refreshFollowerDays(db, cfg, day).catch(e => reportError(env, 'instagram: keeping new followers', e, { business }))
    // One post about the café whose days are in: what the café's account did in them (Sales reps & rewards).
    await readPostWindow(db, cfg, day).catch(e => reportError(env, 'instagram: a post’s days', e, { business }))
  }
  // Noted before the chats too: a look that ran out of requests in them still shows what it found.
  let stories: Mention[] = []
  const note = (chats: number | null) => db.from('provider_cache').upsert({ key: 'instagram:mentions-check', fetched_at: new Date().toISOString(),
    data: { tagged: look.tagged, collabs: look.collabs, via: look.via, chats, new: look.added.length + (chats === null ? 0 : stories.length) } },
  { onConflict: 'business_id,key' })
  await note(null)

  // 3. Story mentions arrive as messages: the chats, last. Reps among these people get their followers
  //    as Instagram says now (Sales reps & rewards).
  const reps = new Set(((await db.from('sales_reps').select('instagram').not('instagram', 'is', null)).data ?? []).map(r => String(r.instagram)))
  const matters = (c: InboxConversation) => reps.has(c.with.username.toLowerCase()) || c.recent.some(m => m.kind === 'story_mention' && !m.fromMe)
  const chats = await instagram.conversations(cfg, { id: ext.user_id ?? '', username: ext.username }, matters)
    .catch(async e => { await reportError(env, 'instagram mentions: chats', e, { business }); return null })
  if (chats) {
    await syncRepFollowers(db, chats).catch(() => 0)
    stories = await keepMentions(db, mentionsIn(chats, []), [])
    await tellAdmins(db, stories)
    if (stories.length) await putForward(db, self, chats).catch(e => reportError(env, 'instagram: putting posters forward as reps', e, { business }))
    await note(chats.length)
  }
  return look.added.length + stories.length
}

/** Every admin hears about each new mention (the bell), unless the café switched that off. */
async function tellAdmins(db: SupabaseClient, added: Mention[]) {
  if (!added.length) return
  const [{ data: set }, { data: admins }] = await Promise.all([
    db.from('settings').select('alert_instagram_mentions').eq('id', 1).single(),
    db.from('profiles').select('id').eq('role', 'admin').eq('active', true),
  ])
  if (set?.alert_instagram_mentions === false || !admins?.length) return
  await db.from('notifications').insert(added.flatMap(m => admins.map(a => ({
    profile_id: a.id, title: mentionTitle(m), body: m.caption ? String(m.caption).slice(0, 140) : null,
    link: '/notifications', kind: 'instagram_mention', data: { mention: m.id },
  }))))
}

/**
 * The tags and collab reels: new ones kept and told about, every collab's figures brought up to date, and
 * their posters put forward as reps. Tagged posts need "Manage comments"; collabs come from readCollabs.
 */
export async function lookForPosts(env: Env, db: SupabaseClient, cfg: instagram.InstagramConfig, ext: InstagramExternal) {
  const business = businessIdOf(db)
  const [tagged, found] = await Promise.all([
    instagram.tagged(cfg).catch(() => [] as TaggedPost[]),
    readCollabs(env, db, cfg, ext),
  ])
  const collabs = found.media ?? []
  if (ext.can_list_collabs !== found.instagram || (ext.collabs_via ?? null) !== found.via) {
    await db.from('integrations').update({ external: { ...ext, can_list_collabs: found.instagram, collabs_via: found.via } }).eq('provider', 'instagram')
  }
  const added = await keepMentions(db, mentionsIn([], tagged), collabMentions(collabs))
  await tellAdmins(db, added)
  await putForward(db, ext.username ?? null).catch(e => reportError(env, 'instagram: putting posters forward as reps', e, { business }))
  return { added, tagged: tagged.length, collabs: found.media ? collabs.length : null, via: found.via }
}

/** How long a look at the tags and collabs counts for, when Sales reps & rewards opens. */
const LOOK_FRESH_MS = 5 * 60_000

/**
 * When an admin opens Sales reps & rewards: a look at the tags and collab reels, unless one was made in
 * the last few minutes, so a reel posted since the last scheduled look is there already (that look
 * shares its run's requests with every other job; this one has its own).
 */
export async function lookIfDue(env: Env, db: SupabaseClient, now = Date.now()): Promise<void> {
  const [{ data: row }, { data: last }] = await Promise.all([
    db.from('integrations').select('status, external').eq('provider', 'instagram').maybeSingle(),
    db.from('provider_cache').select('fetched_at').eq('key', 'instagram:posts-look').maybeSingle(),
  ])
  if (row?.status !== 'connected') return
  if (last?.fetched_at && now - Date.parse(String(last.fetched_at)) < LOOK_FRESH_MS) return
  await db.from('provider_cache').upsert({ key: 'instagram:posts-look', fetched_at: new Date(now).toISOString(), data: {} }, { onConflict: 'business_id,key' })
  const cfg = await instagramSession(env, db)
  await lookForPosts(env, db, cfg, (row.external ?? {}) as InstagramExternal)
}

type InstagramExternal = {
  user_id?: string; username?: string; can_see_insights?: boolean
  /** False once Instagram Login has said it doesn't list collabs (it doesn't: collaborative_media is Facebook Login's). */
  can_list_collabs?: boolean
  /** Where the collabs come from: Instagram itself, or the Facebook Page's connection (null: neither can). */
  collabs_via?: 'instagram' | 'facebook' | null
}

/** How long it stands that no way through Facebook reads the café's Instagram, before every way is tried again. */
const ASK_LINK_AGAIN_MS = 6 * 3_600_000

/** What the Facebook connection keeps about reading the café's Instagram through it. */
type FacebookInstagram = {
  instagram?: boolean
  /** The café's Instagram account as Facebook knows it (null: no way read it), and when every way was last tried. */
  instagram_id?: string | null; instagram_asked_at?: string
  /** The way that reads it: a Page's sign-in (which Page), or the person's own Meta Ads sign-in. */
  instagram_via?: 'page' | 'ads'; instagram_page?: string | null
  /** What Meta said to each way, when none read it (for HQ, and to tell the owner what to change). */
  instagram_why?: string | null
}
type Way = { id: string; token: string; via: 'page' | 'ads'; page: string | null }

/**
 * The posts and reels the café's Instagram is an accepted collaborator on (a customer's collab reel),
 * and where they came from. Instagram Login doesn't list them: once it has said so it isn't asked again,
 * until Instagram is connected again (which starts the connection's notes afresh). Facebook Login does,
 * once the Facebook connection was allowed instagram_basic: through the Page the café's Instagram is
 * linked to, or (when a business portfolio holds the Page, and Meta wants business_management or
 * ads_read for it) through the Meta Ads sign-in. The way that works is kept on the Facebook connection
 * and used from then on; when none does, every way is tried again some hours later, and what Meta said
 * to each is kept (instagram_why) and goes to HQ. media null: none can, and Analytics says so.
 */
export async function readCollabs(env: Env, db: SupabaseClient, cfg: instagram.InstagramConfig, ext: InstagramExternal, now = Date.now()):
  Promise<{ media: CollabMedia[] | null; via: 'instagram' | 'facebook' | null; instagram: boolean }> {
  const business = businessIdOf(db)
  let fromInstagram = ext.can_list_collabs !== false
  if (fromInstagram && ext.collabs_via !== 'facebook') {
    try {
      return { media: await instagram.collabs(cfg), via: 'instagram', instagram: true }
    } catch (e) {
      fromInstagram = false
      if (ext.can_list_collabs !== false) await reportError(env, 'instagram collabs', e, { business })
    }
  }
  const none = { media: null, via: null, instagram: fromInstagram }
  const { data: fb } = await db.from('integrations').select('status, external').eq('provider', 'facebook').maybeSingle()
  const fx = (fb?.external ?? {}) as FacebookInstagram
  if (fb?.status !== 'connected' || fx.instagram !== true) return none
  if (fx.instagram_id === null && fx.instagram_asked_at && now - Date.parse(fx.instagram_asked_at) < ASK_LINK_AGAIN_MS) return none
  const keep = (patch: FacebookInstagram) => db.from('integrations').update({ external: { ...fx, ...patch } }).eq('provider', 'facebook')
  try {
    if (fx.instagram_id) {
      // The way that worked before.
      const token = fx.instagram_via === 'ads' ? (await metaAdsSession(env, db)).token
        : await facebookPages(env, db).then(p => p.pages[fx.instagram_page ?? p.chosen ?? ''] ?? Promise.reject(new Error('That Facebook Page is no longer connected')))
      return { media: await facebook.collabs({ graphVersion: graphVersionOf(env), pageId: fx.instagram_page ?? '', token }, fx.instagram_id), via: 'facebook', instagram: fromInstagram }
    }
    const found = await findInstagramThroughFacebook(env, db, { id: ext.user_id ?? null, username: ext.username ?? null })
    const asked = new Date(now).toISOString()
    if (found.way) {
      await keep({ instagram_id: found.way.id, instagram_via: found.way.via, instagram_page: found.way.page, instagram_asked_at: asked, instagram_why: null })
      return { media: found.media, via: 'facebook', instagram: fromInstagram }
    }
    const why = found.why.join(' | ').slice(0, 1500)
    await keep({ instagram_id: null, instagram_asked_at: asked, instagram_why: why })
    await reportError(env, 'instagram collabs through Facebook', new Error(`No way through Facebook reads the café’s Instagram: ${why}`), { business })
    return none
  } catch (e) {
    await reportError(env, 'instagram collabs through Facebook', e, { business })
    return none
  }
}

/**
 * Every way Meta may let the café's Instagram (Instagram Login's account) be read through Facebook,
 * until one reads its collabs: each Page the person manages (the chosen one first), asked which
 * Instagram is linked to it; the café's own account through the chosen Page; and the person's Meta Ads
 * sign-in (business_management, ads_read), on its own account and on the accounts of their Pages and
 * business portfolios. What Meta said to each that didn't, in `why`.
 */
async function findInstagramThroughFacebook(env: Env, db: SupabaseClient, own: { id: string | null; username: string | null }):
  Promise<{ way: Way | null; media: CollabMedia[] | null; why: string[] }> {
  const why: string[] = []
  const said = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Facebook: /, '').slice(0, 200)
  const graphVersion = graphVersionOf(env)
  const isOurs = (a: { id: string; username?: string }) => !own.id || a.id === own.id || (!!own.username && a.username?.toLowerCase() === own.username.toLowerCase())
  const tried = new Set<string>()
  const attempt = async (way: Way, label: string) => {
    const key = `${way.via}:${way.page}:${way.id}`
    if (tried.has(key)) return null
    tried.add(key)
    try { return await facebook.collabs({ graphVersion, pageId: way.page ?? '', token: way.token }, way.id) } catch (e) { why.push(`${label}: ${said(e)}`); return null }
  }
  // 1. The Pages.
  const fb = await facebookPages(env, db)
  const order = [...(fb.chosen ? [fb.chosen] : []), ...Object.keys(fb.pages).filter(id => id !== fb.chosen)]
  for (const pageId of order) {
    const token = fb.pages[pageId]
    try {
      const ig = await facebook.linkedInstagram({ graphVersion, pageId, token })
      if (!ig) { why.push(`Page ${fb.nameOf(pageId)}: no Instagram linked to it`); continue }
      if (!isOurs(ig)) { why.push(`Page ${fb.nameOf(pageId)}: linked to @${ig.username ?? ig.id}`); continue }
      const way: Way = { id: ig.id, token, via: 'page', page: pageId }
      const media = await attempt(way, `Page ${fb.nameOf(pageId)}, its Instagram`)
      if (media) return { way, media, why }
    } catch (e) { why.push(`Page ${fb.nameOf(pageId)}: ${said(e)}`) }
  }
  // 2. The café's own Instagram, through the chosen Page.
  if (own.id && fb.chosen) {
    const way: Way = { id: own.id, token: fb.pages[fb.chosen], via: 'page', page: fb.chosen }
    const media = await attempt(way, `Page ${fb.nameOf(fb.chosen)}, the café’s Instagram`)
    if (media) return { way, media, why }
  }
  // 3. The Meta Ads sign-in: what Meta wants when a business portfolio holds the Page.
  const ads = await metaAdsSession(env, db).catch(e => { why.push(`Meta Ads: ${said(e)}`); return null })
  if (ads) {
    if (own.id) {
      const way: Way = { id: own.id, token: ads.token, via: 'ads', page: null }
      const media = await attempt(way, 'Meta Ads sign-in, the café’s Instagram')
      if (media) return { way, media, why }
    }
    const seen = await facebook.personsInstagram(graphVersion, ads.token).catch(e => ({ accounts: [], refused: [said(e)] }))
    why.push(...seen.refused.map(r => `Meta Ads sign-in, ${r}`))
    for (const ig of seen.accounts.filter(isOurs)) {
      const way: Way = { id: ig.id, token: ads.token, via: 'ads', page: null }
      const media = await attempt(way, `Meta Ads sign-in, @${ig.username ?? ig.id}`)
      if (media) return { way, media, why }
    }
    if (!seen.accounts.some(isOurs)) why.push('Meta Ads sign-in: the café’s Instagram isn’t among its accounts')
  }
  return { way: null, media: null, why }
}

/** The café account's figures asked for a post's days (profile_views isn't given for every account: asked again without it). */
const WINDOW_METRICS = ['reach', 'views', 'accounts_engaged', 'profile_links_taps', 'profile_views']

/** The café account's figures over from–to (inclusive), each null when Instagram didn't give it. */
async function accountFigures(cfg: instagram.InstagramConfig, from: string, to: string): Promise<AccountFigures> {
  const span = [unixDay(from), unixDay(addDays(to, 1))] as const
  const data = await instagram.accountInsights(cfg, WINDOW_METRICS, ...span)
    .catch(e => (/profile_views|metric/i.test(String(e)) ? instagram.accountInsights(cfg, WINDOW_METRICS.filter(m => m !== 'profile_views'), ...span) : Promise.reject(e)))
  const t = insightTotals(data)
  const n = (k: string) => (k in t ? Math.round(t[k]) : null)
  return { reach: n('reach'), views: n('views'), engaged: n('accounts_engaged'), link_taps: n('profile_links_taps'), profile_visits: n('profile_views') }
}

/**
 * One post about the café a look, newest first, whose days are in (the day it went out and the two
 * after; Instagram is a day or two late) and that's of the last 90 days: what the café's own account
 * did in those days, and a usual three days (the week before's, for three). Kept on the post, read once.
 * Returns whether one was read.
 */
export async function readPostWindow(db: SupabaseClient, cfg: instagram.InstagramConfig, day: string): Promise<boolean> {
  const { data, error } = await db.from('instagram_mentions').select('id, mentioned_at').is('window_read_at', null)
    .lt('mentioned_at', `${addDays(day, -3)}T00:00:00Z`).gte('mentioned_at', `${addDays(day, -90)}T00:00:00Z`)
    .order('mentioned_at', { ascending: false }).limit(1)
  if (error) throw new Error(error.message)
  const post = data?.[0] as { id: string; mentioned_at: string } | undefined
  if (!post) return false
  const day0 = String(post.mentioned_at).slice(0, 10)
  const at = new Date().toISOString()
  try {
    const [during, before] = await Promise.all([accountFigures(cfg, day0, addDays(day0, 2)), accountFigures(cfg, addDays(day0, -7), addDays(day0, -1))])
    const three = (n: number | null) => (n === null ? null : Math.round(n / 7 * 3))
    const usual: AccountFigures = { reach: three(before.reach), views: three(before.views), engaged: three(before.engaged),
      link_taps: three(before.link_taps), profile_visits: three(before.profile_visits) }
    await db.from('instagram_mentions').update({ account_window: { ...during, usual } satisfies AccountWindow, window_read_at: at }).eq('id', post.id)
    return true
  } catch (e) {
    // Read once all the same (not asked again every look), and the failure goes where HQ sees it.
    await db.from('instagram_mentions').update({ window_read_at: at }).eq('id', post.id)
    throw e
  }
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
