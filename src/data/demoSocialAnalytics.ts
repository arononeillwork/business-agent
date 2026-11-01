// Demo statistics for the Analytics page's social sources: Easy Beans' Instagram, TikTok, LinkedIn
// Page and Facebook Page since the café opened two months ago, growing week by week, Instagram and
// Facebook busier at weekends (brunch), LinkedIn on weekdays. They're made in each platform's own
// shape and go through the same steps as the real answers (shared/socialAnalytics.ts). Each day's
// figures are fixed by its date, so a page shows the same thing every time.
import { addDays } from '../../shared/time'
import {
  facebookReport, instagramReport, linkedinReport, msDay, noReport, tiktokReport,
  type FacebookStats, type InstagramStats, type LinkedInStats, type MetaInsight, type SocialReport, type SocialSource, type TikTokVideo,
} from '../../shared/socialAnalytics'

/** 0–1, the same for the same key; the next day's key gives quite another number (FNV-1a, then mixed). */
const seed = (key: string) => {
  let h = 2166136261
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const ageOf = (d: string, open: string) => Math.round((msDay(d) - msDay(open)) / 86_400_000)
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay()
const weekend = (d: string) => weekday(d) === 0 || weekday(d) === 6
/** Small at the opening, full size after two months. */
const growth = (age: number) => (age < 0 ? 0 : 0.45 + 0.55 * Math.min(1, age / 60))
const days = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out }

const CAPTIONS = [
  'Our autumn menu is here: pumpkin spice oat latte and ube cheesecake 🍂',
  'Saturday brunch is back: açaí bowls, eggs your way and the best flat white in San Pedro',
  'Meet our new single origin from Huila, Colombia: notes of red apple and panela',
  'Iced matcha season never ends on the Costa del Sol 🍵',
  'Behind the bar: how we pull a perfect espresso',
  'Fresh croissants out of the oven every morning at 8',
  'Thank you San Pedro for an amazing first month!',
  'Latte art Friday: vote for your favourite',
  'Our ube latte, now with oat milk at no extra charge 💜',
  'Weekend playlist + cinnamon rolls = the perfect Sunday',
]

const VIDEOS = [
  'POV: your first sip of our ube latte 💜',
  'Cold brew in 30 seconds (it takes 18 hours really)',
  'Rating every drink on our menu',
  'Latte art fails vs wins ☕',
  'A morning opening the café in San Pedro',
  'Iced matcha, but make it pretty 🍵',
  'What €5 gets you at Easy Beans',
  'Our barista tries the pumpkin spice latte for the first time',
  'Packing 40 brunch orders in 10 minutes',
  'How we steam oat milk for latte art',
  'The croissant pull 🥐',
  'Guess the coffee origin by taste',
]

function instagram(from: string, to: string, now: string, open: string): SocialReport {
  const day = (d: string) => {
    const age = ageOf(d, open), r = seed(`ig${d}`)
    const reach = d > now ? 0 : Math.round(420 * growth(age) * (weekend(d) ? 1.35 : 1) * (0.75 + 0.5 * r))
    return { reach, views: Math.round(reach * (2.3 + 0.6 * seed(`igv${d}`))), gained: d > now || age < 0 ? 0 : Math.round(14 * growth(age) * (0.6 + 0.8 * r)) }
  }
  const all = days(from, to).map(d => ({ date: d, ...day(d) }))
  const reach = all.reduce((n, d) => n + d.reach, 0)
  // Each a share of the day's reach, a little more or less from day to day.
  const share = (k: string, rate: number) => Math.round(all.reduce((n, d) => n + d.reach * rate * (0.6 + 0.8 * seed(`${k}${d.date}`)), 0))
  const totals = {
    reach, views: all.reduce((n, d) => n + d.views, 0), accounts_engaged: share('ae', 0.071), likes: share('lk', 0.092),
    comments: share('cm', 0.0061), saves: share('sv', 0.013), shares: share('sh', 0.008), profile_links_taps: share('lt', 0.021),
  }
  // Followers now, and those gained since: what Instagram keeps (the last 30 days).
  const followers = 1846
  const media: InstagramStats['media'] = days(from, to).filter(d => ageOf(d, open) >= 0 && ageOf(d, open) % 2 === 0 && d <= now).reverse().map((d, i) => {
    const r = seed(`igp${d}`), postReach = Math.round(900 * growth(ageOf(d, open)) * (0.6 + 0.9 * r))
    return {
      id: `ig-${d}`, caption: CAPTIONS[(ageOf(d, open) / 2) % CAPTIONS.length], permalink: `https://www.instagram.com/p/EB${d.replace(/-/g, '')}/`,
      timestamp: `${d}T09:${String(10 + i % 40).padStart(2, '0')}:00+0000`, media_type: r > 0.5 ? 'VIDEO' : 'IMAGE',
      like_count: Math.round(postReach * 0.11), comments_count: Math.round(postReach * 0.008),
      insights: { reach: postReach, likes: Math.round(postReach * 0.11), comments: Math.round(postReach * 0.008), saved: Math.round(postReach * 0.017),
        shares: Math.round(postReach * 0.01), views: Math.round(postReach * 2.1) },
    }
  })
  return instagramReport({
    username: 'easy.beans.coffee', followers, totals, media,
    reach_days: all.map(d => ({ date: d.date, value: d.reach })),
    follower_gain: from >= addDays(now, -30) ? all.reduce((n, d) => n + d.gained, 0) : null,
  }, from, to)
}

function tiktok(from: string, to: string, now: string, open: string, username: string): SocialReport {
  // A video every four days since the opening, a few of them taking off.
  const videos: TikTokVideo[] = days(open, now).filter(d => ageOf(d, open) % 4 === 1).reverse().map(d => {
    const r = seed(`tt${d}`), views = Math.round(1500 * growth(ageOf(d, open)) * (0.3 + 2.6 * r * r))
    return {
      id: `73${d.replace(/-/g, '')}0042`, title: VIDEOS[((ageOf(d, open) - 1) / 4) % VIDEOS.length], create_time: msDay(d) / 1000 + 17 * 3600,
      view_count: views, like_count: Math.round(views * 0.072), comment_count: Math.round(views * 0.0041), share_count: Math.round(views * 0.0063),
    }
  })
  const likes = 9870
  return tiktokReport({ display_name: 'Easy Beans Coffee', follower_count: 642, following_count: 88, likes_count: likes, video_count: videos.length }, videos, username, from, to)
}

function linkedin(from: string, to: string, now: string, open: string, page: { id: string; name: string }): SocialReport {
  const range = (d: string) => ({ start: msDay(d), end: msDay(addDays(d, 1)) })
  const shares: LinkedInStats['shares'] = days(from, to).filter(d => d <= now).map(d => {
    const r = seed(`li${d}`), impressions = Math.round(70 * growth(ageOf(d, open)) * (weekend(d) ? 0.55 : 1.3) * (0.5 + r))
    // A few a day at most: rounded up or down by chance, so they add up right over a period.
    const some = (rate: number, k: string) => Math.floor(impressions * rate + seed(`${k}${d}`))
    return { timeRange: range(d), totalShareStatistics: { impressionCount: impressions, clickCount: some(0.034, 'lic'), likeCount: some(0.026, 'lil'),
      commentCount: some(0.0045, 'lim'), shareCount: some(0.003, 'lis') } }
  })
  // LinkedIn has follower gains up to two days ago.
  const follower_gains: LinkedInStats['follower_gains'] = days(from, to).filter(d => d <= addDays(now, -2)).map(d => {
    const r = seed(`lif${d}`)
    return { timeRange: range(d), followerGains: { organicFollowerGain: ageOf(d, open) < 0 ? 0 : r < 0.4 ? 1 : r < 0.5 ? 2 : r > 0.97 ? -1 : 0, paidFollowerGain: 0 } }
  })
  return linkedinReport({ page, followers: 214, follower_gains, shares }, from, to)
}

function facebook(from: string, to: string, now: string, open: string): SocialReport {
  const series = (name: string, value: (d: string) => number): MetaInsight =>
    ({ name, values: days(from, to).filter(d => d <= now).map(d => ({ value: value(d), end_time: `${addDays(d, 1)}T07:00:00+0000` })) })
  const views = (d: string) => Math.round(160 * growth(ageOf(d, open)) * (weekend(d) ? 1.4 : 1) * (0.7 + 0.6 * seed(`fb${d}`)))
  const posts: FacebookStats['posts'] = days(from, to).filter(d => ageOf(d, open) >= 0 && ageOf(d, open) % 3 === 0 && d <= now).reverse().map(d => {
    const r = seed(`fbp${d}`)
    return { id: `5310_${d.replace(/-/g, '')}`, message: CAPTIONS[(ageOf(d, open) / 3 + 5) % CAPTIONS.length], created_time: `${d}T10:00:00+0000`,
      permalink_url: `https://www.facebook.com/easybeanscoffee/posts/${d.replace(/-/g, '')}`,
      reactions: { summary: { total_count: Math.round(38 * growth(ageOf(d, open)) * (0.5 + r)) } }, comments: { summary: { total_count: Math.round(5 * r) } }, shares: { count: Math.round(3 * r) } }
  })
  return facebookReport({
    page: { id: 'page-1', name: 'Easy Beans Coffee', link: 'https://www.facebook.com/easybeanscoffee', followers: 531 },
    insights: [
      series('page_media_view', views),
      series('page_total_media_view_unique', d => Math.round(views(d) * 0.62)),
      series('page_post_engagements', d => Math.round(views(d) * 0.051)),
      series('page_views_total', d => Math.round(views(d) * 0.043)),
      series('page_daily_follows_unique', d => (ageOf(d, open) < 0 ? 0 : Math.round(4 * growth(ageOf(d, open)) * seed(`fbf${d}`)))),
    ],
    posts,
  }, from, to)
}

/** One social source's figures in the demo, as the Worker would answer for the connection `row`. */
export function demoSocialReport(source: SocialSource, from: string, to: string, now: string,
  row: { account_label: string | null; external: { page_id?: string; page_name?: string } }): SocialReport {
  const open = addDays(now, -60)
  if (source === 'instagram') return instagram(from, to, now, open)
  if (source === 'tiktok') return tiktok(from, to, now, open, (row.account_label ?? '@easybeanscoffee').replace(/^@/, ''))
  if (source === 'facebook') return facebook(from, to, now, open)
  // LinkedIn posting as the person: no Page, so no statistics.
  if (!row.external.page_id || row.external.page_id === 'me') return noReport('linkedin', from, to, 'needs_page', row.account_label)
  return linkedin(from, to, now, open, { id: row.external.page_id, name: row.external.page_name ?? row.account_label ?? 'Easy Beans Coffee' })
}
