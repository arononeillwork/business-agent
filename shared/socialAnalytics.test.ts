import { describe, expect, it } from 'vitest'
import {
  chunks, dayOfEndTime, facebookReport, fillDays, insightTotals, instagramReport, isoOf, linkedinDays, noReport, statsRefused, tiktokReport,
} from './socialAnalytics'

describe('social analytics: dates', () => {
  it('splits a period into runs of at most 30 days (Instagram’s limit)', () => {
    expect(chunks('2026-09-02', '2026-09-29', 30)).toEqual([{ from: '2026-09-02', to: '2026-09-29' }])
    expect(chunks('2026-07-01', '2026-09-28', 30)).toEqual([
      { from: '2026-07-01', to: '2026-07-30' }, { from: '2026-07-31', to: '2026-08-29' }, { from: '2026-08-30', to: '2026-09-28' }])
  })

  it('a Meta daily value is for the day before its stamp; times become plain ISO', () => {
    expect(dayOfEndTime('2026-09-02T07:00:00+0000')).toBe('2026-09-01')
    expect(isoOf('2026-09-28T09:10:00+0000')).toBe('2026-09-28T09:10:00.000Z')
    expect(isoOf('2026-09-28T11:10:00+02:00')).toBe('2026-09-28T09:10:00.000Z')
  })

  it('every day of the period, with nothing as 0', () => {
    expect(fillDays([{ date: '2026-09-02', value: 5 }, { date: '2026-09-02', value: 1 }], '2026-09-01', '2026-09-03'))
      .toEqual([{ date: '2026-09-01', value: 0 }, { date: '2026-09-02', value: 6 }, { date: '2026-09-03', value: 0 }])
  })

  it('LinkedIn’s day-by-day range runs to the start of the day after the last', () => {
    expect(linkedinDays('2026-09-01', '2026-09-02')).toBe(`(timeRange:(start:${Date.parse('2026-09-01T00:00:00Z')},end:${Date.parse('2026-09-03T00:00:00Z')}),timeGranularityType:DAY)`)
  })
})

describe('social analytics: each platform’s answers', () => {
  it('Meta insights: the total when Meta gives one, else the days added up', () => {
    expect(insightTotals([
      { name: 'reach', total_value: { value: 812 } },
      { name: 'views', values: [{ value: 10, end_time: 'x' }, { value: 5, end_time: 'y' }] },
    ])).toEqual({ reach: 812, views: 15 })
  })

  it('Instagram: only the period’s posts, best reach first, likes from the post when insights have none', () => {
    const r = instagramReport({
      username: 'easy.beans.coffee', followers: 1846, totals: { reach: 9000 }, reach_days: [], follower_gain: null,
      media: [
        { id: 'a', timestamp: '2026-09-10T09:00:00+0000', caption: 'Brunch\n is back', like_count: 12, insights: { reach: 300 } },
        { id: 'b', timestamp: '2026-09-12T09:00:00+0000', like_count: 40, insights: { reach: 900, likes: 41 } },
        { id: 'c', timestamp: '2026-08-01T09:00:00+0000', insights: { reach: 5000 } },
      ],
    }, '2026-09-01', '2026-09-28')
    expect(r.posts.map(p => [p.id, p.likes])).toEqual([['b', 41], ['a', 12]])
    expect(r.posts[1].caption).toBe('Brunch is back')
    // A metric Instagram didn't give is unknown, not zero.
    expect(r.metrics.find(m => m.id === 'views')!.value).toBeNull()
    expect(r.chart!.days).toHaveLength(28)
  })

  it('TikTok: the figures of the videos posted in the period', () => {
    const at = (d: string) => Date.parse(`${d}T17:00:00Z`) / 1000
    const r = tiktokReport({ follower_count: 640, likes_count: 9800 }, [
      { id: '1', create_time: at('2026-09-20'), view_count: 1000, like_count: 70, comment_count: 4, share_count: 6 },
      { id: '2', create_time: at('2026-09-05'), view_count: 3000, like_count: 200, comment_count: 9, share_count: 12 },
      { id: '3', create_time: at('2026-08-20'), view_count: 9000 },
    ], 'easybeanscoffee', '2026-09-01', '2026-09-28')
    expect(Object.fromEntries(r.metrics.map(m => [m.id, m.value]))).toMatchObject({ followers: 640, total_likes: 9800, videos: 2, views: 4000, views_per_video: 2000,
      likes: 270, comments: 13, shares: 18 })
    expect(r.posts.map(p => p.id)).toEqual(['2', '1'])
    expect(r.posts[1].url).toBe('https://www.tiktok.com/@easybeanscoffee/video/1')
  })

  it('Facebook: reactions, comments and shares from the period’s posts', () => {
    const r = facebookReport({ page: { id: 'p', name: 'Easy Beans', followers: 531 }, insights: [], posts: [
      { id: 'p_1', created_time: '2026-09-12T10:00:00+0000', reactions: { summary: { total_count: 20 } }, comments: { summary: { total_count: 3 } } },
    ] }, '2026-09-01', '2026-09-28')
    expect(r.metrics.filter(m => ['likes', 'comments', 'shares'].includes(m.id)).map(m => m.value)).toEqual([20, 3, 0])
    expect(r.chart).toBeNull()
    expect(r.profile_url).toBe('https://www.facebook.com/p')
  })

  it('no figures, and why', () => {
    expect(noReport('linkedin', '2026-09-01', '2026-09-28', 'needs_page', 'Aron')).toMatchObject({ access: 'needs_page', account: 'Aron', metrics: [], posts: [] })
  })
})

describe('social analytics: statistics not allowed vs a broken connection', () => {
  it('tells a refused permission from access that was removed', () => {
    expect(statsRefused('instagram', '(#10) Application does not have permission for this action')).toBe(true)
    expect(statsRefused('instagram', 'Error validating access token: Session has expired.')).toBe(false)
    expect(statsRefused('facebook', 'Facebook: (#200) Requires read_insights permission')).toBe(true)
    expect(statsRefused('tiktok', 'TikTok: scope_not_authorized: The user did not authorize the scope required')).toBe(true)
    expect(statsRefused('tiktok', 'TikTok: access_token_invalid: The access token is invalid')).toBe(false)
    expect(statsRefused('linkedin', 'LinkedIn: Not enough permissions to access: organizationalEntityShareStatistics')).toBe(true)
    expect(statsRefused('linkedin', 'invalid_grant: LinkedIn: The token used in the request has been revoked')).toBe(false)
  })
})
