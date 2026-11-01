// Analytics beyond the website, end to end through the Worker's route, against stand-ins for Supabase
// and Instagram, TikTok, LinkedIn and Facebook. What must never break:
//   - each platform's own figures for the period, asked for the right days, kept for a while
//   - a connection that wasn't allowed statistics says so (needs_scope), and keeps working for posting
//   - admins only, and only once the platform is connected
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { socialAnalytics } from './socialAnalytics'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import type { SocialReport } from '../shared/socialAnalytics'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', INSTAGRAM_APP_ID: 'ig-app', INSTAGRAM_APP_SECRET: 'ig-secret', META_APP_ID: 'meta-app', META_APP_SECRET: 'meta-secret',
  TIKTOK_CLIENT_KEY: 'tt-key', TIKTOK_CLIENT_SECRET: 'tt-secret', LINKEDIN_CLIENT_ID: 'li-id', LINKEDIN_CLIENT_SECRET: 'li-secret',
  // Sign-in asks for every platform's statistics (each developer app has them).
  STATS_SCOPES: 'all',
} as unknown as Env

type Handler = (url: URL, init: RequestInit) => Response | undefined
let db: FakeSupabase
let apis: FakeProviders
/** The statistics endpoints, answered here before the stand-ins see the request. */
let stats: Handler
const asked: string[] = []
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T10:00:00Z'))
  db = new FakeSupabase()
  apis = new FakeProviders()
  stats = () => undefined
  asked.length = 0
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const mine = stats(new URL(url), init)
    if (mine) { asked.push(url); return mine }
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const as = (who: 'admin' | 'staff') => ({ authorization: `Bearer ${who}-token`, 'content-type': 'application/json' })
const read = async (source: string, from = '2026-09-02', to = '2026-09-29', who: 'admin' | 'staff' = 'admin') =>
  socialAnalytics.request(`${APP}/api/analytics/${source}?from=${from}&to=${to}`, { headers: as(who) }, env, ctx())
const report = async (source: string, from?: string, to?: string) => {
  const res = await read(source, from, to)
  expect(res.status).toBe(200)
  return await res.json() as SocialReport
}
const metric = (r: SocialReport, id: string) => r.metrics.find(m => m.id === id)

async function connectOwn(provider: 'instagram' | 'tiktok' | 'linkedin' | 'facebook') {
  const start = await integrations.request(`${APP}/api/integrations/${provider}/start`, { method: 'POST', headers: as('admin'), body: '{}' }, env, ctx())
  const state = new URL((await start.json() as { url: string }).url).searchParams.get('state')!
  const res = await integrations.request(`${APP}/api/integrations/${provider}/callback?code=c&state=${encodeURIComponent(state)}`, {}, env, ctx())
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe(provider)
}

describe('Instagram', () => {
  const ALL = 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights'
  const instagramStats: Handler = url => {
    if (url.host !== 'graph.instagram.com') return undefined
    if (url.pathname.endsWith('/me/insights')) {
      const metrics = url.searchParams.get('metric')!.split(',')
      if (url.searchParams.get('metric_type') === 'total_value') return json({ data: metrics.map((name, i) => ({ name, period: 'day', total_value: { value: (i + 1) * 100 } })) })
      const day = (d: string, value: number) => ({ value, end_time: `${d}T07:00:00+0000` })
      // Meta stamps each day with when it ended: 3 September's figure is "the 2nd".
      return json({ data: [{ name: metrics[0], period: 'day', values: [day('2026-09-03', 40), day('2026-09-04', 60)] }] })
    }
    if (url.pathname.endsWith('/m1/insights')) return json({ data: [{ name: 'reach', values: [{ value: 512 }] }, { name: 'likes', values: [{ value: 33 }] }, { name: 'saved', values: [{ value: 7 }] }] })
    return undefined
  }

  it('the account’s figures for the period, 30 days at a time, kept for a while', async () => {
    apis.instagram.permissions = ALL
    await connectOwn('instagram')
    stats = instagramStats
    const r = await report('instagram')
    expect(r).toMatchObject({ source: 'instagram', access: 'ok', account: '@easy.beans.coffee', profile_url: 'https://www.instagram.com/easy.beans.coffee/' })
    expect(metric(r, 'followers')).toMatchObject({ kind: 'now', value: 1284, change: 100 }) // follower_count's two days, 40 + 60
    expect(metric(r, 'reach')).toMatchObject({ kind: 'period', value: 100 })
    expect(metric(r, 'views')).toMatchObject({ value: 200 })
    expect(r.chart!.days).toHaveLength(28)
    expect(r.chart!.days.slice(0, 2)).toEqual([{ date: '2026-09-02', value: 40 }, { date: '2026-09-03', value: 60 }])
    expect(r.posts).toEqual([expect.objectContaining({ id: 'm1', url: 'https://instagram.com/p/1', reach: 512, likes: 33, saves: 7, comments: null })])
    const totals = new URL(asked.find(u => u.includes('metric_type=total_value'))!)
    expect(totals.searchParams.get('since')).toBe(String(Date.parse('2026-09-02T00:00:00Z') / 1000))
    expect(totals.searchParams.get('until')).toBe(String(Date.parse('2026-09-30T00:00:00Z') / 1000))
    expect(r.fetched_at).toBeTruthy()
    // Asked again within the hours it's kept: not read from Instagram again.
    const before = asked.length
    await report('instagram')
    expect(asked.length).toBe(before)
  })

  it('three months are read 30 days at a time and added up; new followers only within the last 30 days', async () => {
    apis.instagram.permissions = ALL
    await connectOwn('instagram')
    stats = instagramStats
    const r = await report('instagram', '2026-07-01', '2026-09-29')
    expect(asked.filter(u => u.includes('metric_type=total_value'))).toHaveLength(4) // 91 days: 30 + 30 + 30 + 1
    expect(metric(r, 'reach')!.value).toBe(400)
    expect(metric(r, 'followers')!.change).toBeNull()
    expect(asked.some(u => u.includes('follower_count'))).toBe(false)
  })

  it('connected without statistics: says so without asking Instagram, and posting still works', async () => {
    apis.instagram.permissions = 'instagram_business_basic,instagram_business_content_publish'
    await connectOwn('instagram')
    stats = instagramStats
    const r = await report('instagram')
    expect(r).toMatchObject({ access: 'needs_scope', metrics: [], account: '@easy.beans.coffee' })
    expect(asked).toEqual([])
  })

  it('Instagram refusing statistics (a connection from before they were asked for): needs_scope, the connection stays connected', async () => {
    apis.instagram.permissions = ALL
    await connectOwn('instagram')
    stats = url => (url.pathname.endsWith('/insights') ? json({ error: { message: '(#10) Application does not have permission for this action', code: 10 } }, 400) : undefined)
    expect((await report('instagram')).access).toBe('needs_scope')
    expect(db.integration('instagram').status).toBe('connected')
  })

  it('access that has run out turns the connection red, with why', async () => {
    apis.instagram.permissions = ALL
    await connectOwn('instagram')
    apis.instagram.revoked = true
    stats = url => (url.pathname.endsWith('/insights') ? json({ error: { message: 'Error validating access token: Session has expired.', code: 190 } }, 400) : undefined)
    const res = await read('instagram')
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toMatch(/access was removed or has expired/)
    expect(db.integration('instagram').status).toBe('error')
  })
})

describe('TikTok', () => {
  const video = (id: string, day: string, views: number) => ({ id, title: `Video ${id}`, create_time: Date.parse(`${day}T17:00:00Z`) / 1000, share_url: `https://www.tiktok.com/@easybeanscoffee/video/${id}`,
    view_count: views, like_count: views / 10, comment_count: 2, share_count: 1 })

  it('followers and likes now, and the videos posted in the period, paging back to its start', async () => {
    apis.tiktok.scope = 'user.info.basic,video.publish,user.info.stats,video.list'
    await connectOwn('tiktok')
    expect(db.integration('tiktok').external).toMatchObject({ stats: true })
    const pages = [
      { videos: [video('3', '2026-09-28', 3000), video('2', '2026-09-10', 1000)], cursor: 111, has_more: true },
      { videos: [video('1', '2026-08-20', 9000)], cursor: 0, has_more: true },
    ]
    stats = (url, init) => {
      if (url.host !== 'open.tiktokapis.com') return undefined
      if (url.pathname === '/v2/user/info/' && url.searchParams.get('fields')!.includes('follower_count')) {
        return json({ data: { user: { follower_count: 642, likes_count: 9870, video_count: 3 } }, error: { code: 'ok' } })
      }
      if (url.pathname === '/v2/video/list/') {
        const { cursor } = JSON.parse(String(init.body)) as { cursor?: number }
        return json({ data: pages[cursor === 111 ? 1 : 0], error: { code: 'ok' } })
      }
      return undefined
    }
    const r = await report('tiktok')
    expect(r).toMatchObject({ access: 'ok', account: '@easybeanscoffee', note: 'tiktok_videos' })
    expect(metric(r, 'followers')).toMatchObject({ kind: 'now', value: 642 })
    expect(metric(r, 'total_likes')!.value).toBe(9870)
    expect(metric(r, 'videos')!.value).toBe(2)
    expect(metric(r, 'views')!.value).toBe(4000)
    expect(metric(r, 'views_per_video')!.value).toBe(2000)
    expect(r.posts.map(p => p.id)).toEqual(['3', '2'])
    // The second page reached back past the start of the period, so no third was asked for.
    expect(asked.filter(u => u.includes('/video/list/'))).toHaveLength(2)
  })

  it('connected without statistics allowed: needs_scope', async () => {
    await connectOwn('tiktok') // user.info.basic and video.publish only
    expect((await report('tiktok')).access).toBe('needs_scope')
  })

  it('TikTok refusing the scope: needs_scope, still connected for posting', async () => {
    apis.tiktok.scope = 'user.info.basic,video.publish,user.info.stats,video.list'
    await connectOwn('tiktok')
    stats = url => (url.host === 'open.tiktokapis.com' && url.pathname !== '/v2/oauth/token/'
      && (url.pathname === '/v2/video/list/' || url.searchParams.get('fields')?.includes('follower_count'))
      ? json({ data: {}, error: { code: 'scope_not_authorized', message: 'The user did not authorize the scope required for completing this request.' } }, 401) : undefined)
    expect((await report('tiktok')).access).toBe('needs_scope')
    expect(db.integration('tiktok').status).toBe('connected')
  })
})

describe('LinkedIn', () => {
  const day = (d: string) => ({ start: Date.parse(`${d}T00:00:00Z`), end: Date.parse(`${d}T00:00:00Z`) + 86_400_000 })
  const linkedinStats: Handler = url => {
    if (url.host !== 'api.linkedin.com') return undefined
    if (url.pathname.startsWith('/rest/networkSizes/')) return json({ firstDegreeSize: 214 })
    if (url.pathname === '/rest/organizationalEntityFollowerStatistics') {
      return json({ elements: [{ timeRange: day('2026-09-10'), followerGains: { organicFollowerGain: 3, paidFollowerGain: 1 } }] })
    }
    if (url.pathname === '/rest/organizationalEntityShareStatistics') {
      return json({ elements: [
        { timeRange: day('2026-09-10'), totalShareStatistics: { impressionCount: 300, clickCount: 9, likeCount: 6, commentCount: 2, shareCount: 1 } },
        { timeRange: day('2026-09-11'), totalShareStatistics: { impressionCount: 100, clickCount: 1, likeCount: 1, commentCount: 0, shareCount: 0 } },
      ] })
    }
    return undefined
  }
  const connectPage = async () => {
    await connectOwn('linkedin')
    expect((await integrations.request(`${APP}/api/integrations/linkedin/page`, { method: 'POST', headers: as('admin'), body: JSON.stringify({ page_id: '101' }) }, env, ctx())).status).toBe(200)
  }

  it('the Page’s followers, and its posts’ impressions, clicks and engagement day by day', async () => {
    apis.linkedin.scope = 'openid,profile,w_member_social,r_organization_admin,w_organization_social,rw_organization_admin'
    await connectPage()
    stats = linkedinStats
    const r = await report('linkedin')
    expect(r).toMatchObject({ access: 'ok', account: 'Easy Beans Coffee', profile_url: 'https://www.linkedin.com/company/101/' })
    expect(metric(r, 'followers')).toMatchObject({ value: 214, change: 4 })
    expect(metric(r, 'impressions')!.value).toBe(400)
    expect(metric(r, 'clicks')!.value).toBe(10)
    expect(metric(r, 'engagement')).toMatchObject({ percent: true, value: (10 + 7 + 2 + 1) / 400 })
    expect(r.chart!.days.find(d => d.date === '2026-09-10')!.value).toBe(300)
    const shares = asked.find(u => u.includes('ShareStatistics'))!
    expect(shares).toContain('organizationalEntity=urn%3Ali%3Aorganization%3A101')
    expect(shares).toContain(`timeIntervals=(timeRange:(start:${Date.parse('2026-09-02T00:00:00Z')},end:${Date.parse('2026-09-30T00:00:00Z')}),timeGranularityType:DAY)`)
    // Followers gained: LinkedIn has them up to two days ago.
    expect(asked.find(u => u.includes('FollowerStatistics'))).toContain(`end:${Date.parse('2026-09-29T00:00:00Z')}`)
  })

  it('without Community Management reporting: needs_scope, and posting to the Page still works', async () => {
    apis.linkedin.scope = 'openid,profile,w_member_social,r_organization_admin,w_organization_social,rw_organization_admin'
    await connectPage()
    stats = url => (url.host === 'api.linkedin.com' && url.pathname !== '/v2/userinfo' && !url.pathname.startsWith('/rest/organizations')
      ? json({ status: 403, serviceErrorCode: 100, code: 'ACCESS_DENIED', message: 'Not enough permissions to access: organizationalEntityShareStatistics' }, 403) : undefined)
    expect((await report('linkedin')).access).toBe('needs_scope')
    expect(db.integration('linkedin').status).toBe('connected')
  })

  it('posting as the person (no Page): needs_page', async () => {
    apis.linkedin.orgs = []
    await connectOwn('linkedin')
    expect((await report('linkedin')).access).toBe('needs_page')
  })
})

describe('Facebook', () => {
  it('the Page’s views, reach and interactions day by day, and its posts', async () => {
    apis.facebook.granted.push('read_insights')
    await connectOwn('facebook')
    stats = url => {
      if (url.host !== 'graph.facebook.com' || !url.pathname.includes('page-1')) return undefined
      if (url.pathname.endsWith('/insights')) {
        const name = url.searchParams.get('metric')!
        if (name === 'page_views_total') return json({ error: { message: '(#100) The value must be a valid insights metric', code: 100 } }, 400)
        return json({ data: [{ name, period: 'day', values: [{ value: 10, end_time: '2026-09-03T07:00:00+0000' }, { value: 20, end_time: '2026-09-04T07:00:00+0000' }] }] })
      }
      if (url.pathname.endsWith('/posts')) {
        return json({ data: [{ id: 'page-1_9', message: 'Brunch is back', created_time: '2026-09-12T10:00:00+0000', permalink_url: 'https://www.facebook.com/1/posts/9',
          reactions: { summary: { total_count: 25 } }, comments: { summary: { total_count: 4 } }, shares: { count: 2 } }] })
      }
      if (url.searchParams.get('fields')?.includes('link')) return json({ id: 'page-1', name: 'Easy Beans Coffee', link: 'https://www.facebook.com/easybeans', followers_count: 812 })
      return undefined
    }
    const r = await report('facebook')
    expect(r).toMatchObject({ access: 'ok', account: 'Easy Beans Coffee', profile_url: 'https://www.facebook.com/easybeans' })
    expect(metric(r, 'followers')).toMatchObject({ value: 812, change: 30 })
    expect(metric(r, 'views')!.value).toBe(30)
    // One metric Meta no longer gives leaves the others showing.
    expect(metric(r, 'page_views')!.value).toBeNull()
    expect(metric(r, 'likes')!.value).toBe(25)
    expect(r.posts[0]).toMatchObject({ caption: 'Brunch is back', at: '2026-09-12T10:00:00.000Z', likes: 25, comments: 4, shares: 2 })
  })

  it('connected before statistics were asked for: needs_scope', async () => {
    await connectOwn('facebook')
    expect(db.integration('facebook').external).toMatchObject({ insights: false })
    expect((await report('facebook')).access).toBe('needs_scope')
  })

  it('while sign-in doesn’t ask for statistics yet (STATS_SCOPES leaves it out), reconnecting wouldn’t help: not_switched_on', async () => {
    await connectOwn('facebook')
    const e = env as { STATS_SCOPES?: string }
    e.STATS_SCOPES = 'instagram'
    try {
      expect((await report('facebook')).access).toBe('not_switched_on')
    } finally {
      e.STATS_SCOPES = 'all'
    }
  })
})

describe('who and when', () => {
  it('admins only, a connected platform only, and sensible dates', async () => {
    expect((await read('instagram', undefined, undefined, 'staff')).status).toBe(403)
    const res = await read('instagram')
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toBe('Connect Instagram on the Connections page to see its statistics')
    expect((await read('myspace')).status).toBe(404)
    expect((await read('instagram', '2026-09-29', '2026-09-02')).status).toBe(400)
    expect((await read('instagram', '2026-01-01', '2026-09-29')).status).toBe(400) // more than three months at once
  })
})
