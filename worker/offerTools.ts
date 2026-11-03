// Offers & specials and the screens for AI assistants: the business's own latest posts on Instagram
// (or its Facebook Page) with the offer read from each caption, the screens, the offers, and saving
// one: typed in, or from a post ("put the special in my last Instagram post on the café TV"), its
// photo kept in the café's storage so it stays on the screens for as long as the offer runs. Each
// offer shows on the screens picked from the minute it starts to the minute it ends, and in "Offers
// on this screen" on the Screens page. Same rules as the app: admins (the offers and screens tables'
// row security); the posts are read live through the business's own connection.
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolContext, ToolDef } from './tools'
import { businessDb } from './supabase'
import { keepPostPhoto, latestPosts } from './offerPosts'
import { endFor, offerProblem, offerState, type Offer, type OfferInput } from '../shared/offers'
import { latestOfferPost, offerFromCaption, offerFromPost, postOfferEnd, type SourcePost } from '../shared/offerFromPost'
import type { Screen } from '../shared/screens'
import { formatLocal, zonedIso } from '../shared/time'

const tool = <S extends z.ZodType>(def: ToolDef<S>) => def as unknown as ToolDef

function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message)
  return res.data as NonNullable<T>
}

const OFFER_COLUMNS = 'id, title, details, price, was_price, image_url, starts_at, ends_at, screen_ids, screen_mode, seconds, post_id, active, updated_at, auto_for'
const LENGTHS = ['1h', '2h', '3h', 'today', '24h', '3d', '7d', 'weekend', 'month'] as const
const STATE_TEXT = { on: 'live now', coming: 'coming up', ended: 'ended', off: 'switched off' } as const

async function timeZone(sb: SupabaseClient) {
  return (check(await sb.from('business').select('timezone').single()) as { timezone: string }).timezone
}

/** The business's own database (posts are read with its connection, which only the server can open). */
async function serverDb({ sb, env }: ToolContext) {
  if (!env) throw new Error('Reading your posts needs the app’s server: use the API or the MCP connection')
  const { data } = await sb.rpc('current_business_id')
  if (!data) throw new Error('Only someone in a business can do that')
  return { env, db: businessDb(env, data as number) }
}

/** "2026-11-06 18:00" (the business's time), "2026-11-06" (the start or end of that day) or a full ISO time. */
function at(s: string, tz: string, endOfDay = false): string {
  const v = s.trim()
  const local = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?$/.exec(v)
  if (local) return zonedIso(local[1], local[2] ?? (endOfDay ? '23:59' : '00:00'), tz)
  const t = Date.parse(v)
  if (Number.isNaN(t)) throw new Error(`"${s}" isn’t a time: use "YYYY-MM-DD HH:mm" (the business’s time) or YYYY-MM-DD`)
  return new Date(t).toISOString()
}

/** Screens by name (or part of it) or id; "all": every screen that's on. */
function resolveScreens(screens: Pick<Screen, 'id' | 'name' | 'active'>[], asked: string[]): string[] {
  if (asked.some(a => a.trim().toLowerCase() === 'all')) return screens.filter(s => s.active).map(s => s.id)
  const names = screens.map(s => s.name).join(', ') || 'none yet (add one on the Screens page)'
  return asked.map(a => {
    const q = a.trim().toLowerCase()
    const exact = screens.filter(s => s.id === a || s.name.toLowerCase() === q)
    const hits = exact.length ? exact : screens.filter(s => s.name.toLowerCase().includes(q))
    if (hits.length === 1) return hits[0].id
    throw new Error(hits.length ? `"${a}" matches several screens: ${hits.map(s => s.name).join(', ')}` : `No screen called "${a}". Screens: ${names}`)
  })
}

const when = (o: Pick<Offer, 'starts_at' | 'ends_at'>, tz: string) =>
  `${formatLocal(o.starts_at, 'EEE d MMM HH:mm', tz)} – ${formatLocal(o.ends_at, 'EEE d MMM HH:mm', tz)}`

function offerOut(o: Offer, screens: Pick<Screen, 'id' | 'name'>[], tz: string) {
  return {
    offer_id: o.id, title: o.title, price: o.price, was_price: o.was_price, details: o.details, picture: o.image_url,
    state: STATE_TEXT[offerState(o)], when: when(o, tz), starts_at: o.starts_at, ends_at: o.ends_at,
    shows_on: screens.filter(s => o.screen_ids.includes(s.id)).map(s => s.name),
    on_screen: o.screen_mode === 'only' ? 'on its own' : `in turn with the slides, ${o.seconds} s each time`,
    automatic: !!o.auto_for,
  }
}

function postOut(p: SourcePost, tz: string) {
  const idea = offerFromCaption(p.caption)
  return {
    post_id: p.id, posted: formatLocal(p.posted_at, 'EEE d MMM yyyy HH:mm', tz), caption: p.caption, photo: p.image_url, link: p.permalink, video: !!p.video,
    offer_found: idea.found,
    offer: idea.found ? { title: idea.title, price: idea.price, was_price: idea.was_price, details: idea.details, runs: idea.length } : null,
  }
}

export const OFFER_TOOLS: ToolDef[] = [
  tool({
    name: 'latest_social_posts',
    title: 'Latest posts on Instagram',
    description: 'Admins: the business’s own latest posts on Instagram (or on its Facebook Page while Instagram isn’t connected), newest first: when, the caption, the photo, the link, and the offer read from each caption (its name, price, usual price, details, and how long it runs: today, weekend, week or month). latest_offer_post is the newest one with an offer or special in it. To put it on Offers & specials and the screens, use save_offer with from_post (its post_id, or "latest").',
    admin: true,
    readOnly: true,
    input: z.object({ limit: z.number().int().min(1).max(25).default(6) }),
    async run(ctx, { limit }) {
      const { env, db } = await serverDb(ctx)
      const [read, tz] = await Promise.all([latestPosts(env, db, limit), timeZone(ctx.sb)])
      const latest = latestOfferPost(read.posts)
      return {
        source: read.source, account: read.account, posts: read.posts.map(p => postOut(p, tz)), latest_offer_post: latest?.id ?? null,
        ...(read.source === 'facebook' ? { note: 'Instagram isn’t connected, so these are the Facebook Page’s posts. Connect Instagram on the Connections page to read it.' } : {}),
      }
    },
  }),
  tool({
    name: 'list_screens',
    title: 'Screens',
    description: 'Admins: the business’s screens (TVs and tablets playing a slideshow, on the Screens page): each one’s name, whether it’s on, landscape or portrait, how many slides it plays, when it last checked in, and the offers on it now or coming up. Use the names with save_offer.',
    admin: true,
    readOnly: true,
    input: z.object({}),
    async run({ sb }) {
      const [screens, status, offers, tz] = await Promise.all([
        sb.from('screens').select('id, name, active, orientation, slides').order('name').then(r => check(r) as Pick<Screen, 'id' | 'name' | 'active' | 'orientation' | 'slides'>[]),
        sb.from('screen_status').select('screen_id, last_seen_at').then(r => check(r) as { screen_id: string; last_seen_at: string }[]),
        sb.from('offers').select(OFFER_COLUMNS).gt('ends_at', new Date().toISOString()).then(r => check(r) as Offer[]),
        timeZone(sb),
      ])
      return {
        screens: screens.map(s => {
          const seen = status.find(x => x.screen_id === s.id)?.last_seen_at ?? null
          return {
            screen_id: s.id, name: s.name, on: s.active, orientation: s.orientation, slides: s.slides.filter(x => x.active !== false).length,
            last_seen: seen ? formatLocal(seen, 'EEE d MMM HH:mm', tz) : 'never opened',
            offers: offers.filter(o => o.active && o.screen_ids.includes(s.id)).map(o => `${o.title} (${STATE_TEXT[offerState(o)]}, ${when(o, tz)})`),
          }
        }),
      }
    },
  }),
  tool({
    name: 'list_offers',
    title: 'Offers & specials',
    description: 'Admins: the offers and specials on Offers & specials (Marketing): live now, coming up and switched off (and those ended in the last two weeks with include_ended), each with its price and usual price, when it runs, and the screens it shows on.',
    admin: true,
    readOnly: true,
    input: z.object({ include_ended: z.boolean().default(false) }),
    async run({ sb }, { include_ended }) {
      const since = new Date(Date.now() - (include_ended ? 14 * 86_400_000 : 0)).toISOString()
      const [offers, screens, tz] = await Promise.all([
        sb.from('offers').select(OFFER_COLUMNS).gt('ends_at', since).order('starts_at').then(r => check(r) as Offer[]),
        sb.from('screens').select('id, name').then(r => check(r) as Pick<Screen, 'id' | 'name'>[]),
        timeZone(sb),
      ])
      return { offers: offers.map(o => offerOut(o, screens, tz)) }
    },
  }),
  tool({
    name: 'save_offer',
    title: 'Save an offer',
    description: `Admins: add an offer or special to Offers & specials, or change one (offer_id). It shows on the screens picked from the minute it starts to the minute it ends (in turn with each screen's slides, or on its own), and under "Offers on this screen" on the Screens page. from_post makes it from one of the business's own posts (a post_id from latest_social_posts, or "latest" for the newest with an offer): the caption fills in the name, price, usual price, details and how long it runs, unless given here, and the post's photo becomes its picture, copied to the café's storage. A new offer starts now and shows on every screen that's on unless starts and screens say otherwise; its length is a week unless ends, length or the post says. Prices are written as shown: "€3.50", "2 for 1", "20% off". Times: "YYYY-MM-DD HH:mm" in the business's time. Nothing is charged or changed on the till: the team rings it up at the offer price.`,
    admin: true,
    input: z.object({
      offer_id: z.string().uuid().optional().describe('Change this offer (from list_offers); only what is given changes'),
      from_post: z.string().min(1).max(100).optional().describe('A post_id from latest_social_posts, or "latest": the newest post with an offer'),
      title: z.string().min(1).max(80).optional(),
      details: z.string().max(300).nullable().optional(),
      price: z.string().max(40).nullable().optional().describe('As shown: "€3.50", "2 for 1", "20% off"'),
      was_price: z.string().max(40).nullable().optional().describe('What it usually costs, shown crossed out'),
      image_url: z.string().url().max(2000).nullable().optional().describe('Its picture (https://)'),
      starts: z.string().max(40).optional().describe('"YYYY-MM-DD HH:mm" (the business’s time); a new one starts now'),
      ends: z.string().max(40).optional().describe('"YYYY-MM-DD HH:mm"; or give length'),
      length: z.enum(LENGTHS).optional().describe('How long from when it starts: 1h, 2h, 3h, today (until 23:59), 24h, 3d, 7d, weekend (until Sunday 23:59), month'),
      screens: z.array(z.string().min(1).max(80)).max(50).optional().describe('Screen names or ids from list_screens, ["all"] for every screen that’s on, or [] for none'),
      screen_mode: z.enum(['turns', 'only']).optional().describe('turns: in turn with the screen’s slides (default); only: the screen shows just the offer until it ends'),
      seconds: z.number().int().min(3).max(3600).optional().describe('In turn: how long it shows each time round (15 by default)'),
      active: z.boolean().optional().describe('false: kept but on no screen'),
    }),
    async run(ctx, a) {
      const { sb } = ctx
      if (a.ends && a.length) throw new Error('Give ends or length, not both')
      const [tz, screens] = await Promise.all([timeZone(sb), sb.from('screens').select('id, name, active').order('name').then(r => check(r) as Pick<Screen, 'id' | 'name' | 'active'>[])])
      const existing = a.offer_id ? check(await sb.from('offers').select(OFFER_COLUMNS).eq('id', a.offer_id).maybeSingle()) as Offer | null : null
      if (a.offer_id && !existing) throw new Error('No offer with that id: see list_offers')
      const screenIds = a.screens ? resolveScreens(screens, a.screens) : existing?.screen_ids ?? screens.filter(s => s.active).map(s => s.id)

      // The starting point: the offer as it is, one from a post, or a blank one from now.
      let base: OfferInput & { length?: string }
      let post: SourcePost | null = null
      let photoNote: string | null = null
      if (a.from_post) {
        const { env, db } = await serverDb(ctx)
        const read = await latestPosts(env, db, 25)
        post = a.from_post === 'latest' ? latestOfferPost(read.posts) : read.posts.find(p => p.id === a.from_post) ?? null
        if (!post) {
          throw new Error(a.from_post === 'latest'
            ? `None of the latest ${read.posts.length} posts on ${read.source === 'instagram' ? 'Instagram' : 'the Facebook Page'} has an offer in it: pick one with its post_id from latest_social_posts, or type the offer in`
            : 'That post isn’t among the latest 25: see latest_social_posts')
        }
        const made = offerFromPost(post, screenIds, tz)
        base = existing ? { ...existing, title: made.title, details: made.details, price: made.price, was_price: made.was_price, image_url: made.image_url } : made
        if (a.image_url === undefined && post.image_url && ctx.origin) {
          const kept = await keepPostPhoto(env, db, ctx.origin, post.image_url)
          base.image_url = kept.url
          if (!kept.kept) photoNote = 'The picture is Instagram’s own link, which runs out in a few days: connect Google Drive or OneDrive on the Connections page to keep photos, or change the picture on Offers & specials.'
        }
      } else if (existing) {
        base = existing
      } else {
        if (!a.title) throw new Error('Give the offer a title, or make it from_post')
        const starts = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString()
        base = { title: a.title, details: null, price: null, was_price: null, image_url: null, starts_at: starts, ends_at: postOfferEnd(starts, 'week', tz),
          screen_ids: screenIds, screen_mode: 'turns', seconds: 15, post_id: null, active: true }
      }

      const starts = a.starts ? at(a.starts, tz) : base.starts_at
      const ends = a.ends ? at(a.ends, tz, true)
        : a.length === 'weekend' || a.length === 'month' ? postOfferEnd(starts, a.length, tz)
        : a.length ? endFor(starts, a.length, tz)
        // Moved start, same length.
        : a.starts && existing ? new Date(Date.parse(starts) + Date.parse(existing.ends_at) - Date.parse(existing.starts_at)).toISOString()
        : a.starts ? new Date(Date.parse(starts) + Date.parse(base.ends_at) - Date.parse(base.starts_at)).toISOString()
        : base.ends_at
      const row: OfferInput = {
        title: a.title ?? base.title, details: a.details !== undefined ? a.details : base.details,
        price: a.price !== undefined ? a.price : base.price, was_price: a.was_price !== undefined ? a.was_price : base.was_price,
        image_url: a.image_url !== undefined ? a.image_url : base.image_url, starts_at: starts, ends_at: ends,
        screen_ids: screenIds, screen_mode: a.screen_mode ?? base.screen_mode, seconds: a.seconds ?? base.seconds,
        post_id: base.post_id ?? null, active: a.active ?? base.active,
      }
      const problem = offerProblem(row)
      if (problem) throw new Error(problem)
      const saved = existing
        ? check(await sb.from('offers').update(row).eq('id', existing.id).select(OFFER_COLUMNS).single()) as Offer
        : check(await sb.from('offers').insert(row).select(OFFER_COLUMNS).single()) as Offer
      const out = offerOut(saved, screens, tz)
      return {
        ok: true, offer: out,
        ...(post ? { from_post: { post_id: post.id, link: post.permalink, source: post.source } } : {}),
        note: [
          out.shows_on.length ? `On ${out.shows_on.join(', ')} ${out.state === 'live now' ? 'now' : `from ${formatLocal(saved.starts_at, 'EEE d MMM HH:mm', tz)}`} until ${formatLocal(saved.ends_at, 'EEE d MMM HH:mm', tz)}, then it comes off by itself.`
            : 'On no screen: pass screens to put it on one.',
          photoNote,
        ].filter(Boolean).join(' '),
      }
    },
  }),
]
