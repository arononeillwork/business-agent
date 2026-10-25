import { describe, expect, it } from 'vitest'
import { addMetrics, allCampaigns, costPerResult, cpc, ctr, mergeDays, pacing, sumDays, totalsOf, utmLink, utmValue, type AdCampaign, type PlatformReport } from './ads'

const camp = (over: Partial<AdCampaign>): AdCampaign => ({ platform: 'meta_ads', id: '1', name: 'A', status: 'active', daily_budget: 5,
  spend: 0, impressions: 0, clicks: 0, results: 0, ...over })
const report = (platform: PlatformReport['platform'], days: PlatformReport['days'], campaigns: AdCampaign[] = []): PlatformReport => ({
  platform, account: { id: 'x', name: 'X', currency: 'EUR' }, can_manage: true, totals: sumDays(days), days, campaigns })

describe('Ad figures', () => {
  it('adds platforms up without floating-point crumbs', () => {
    expect(addMetrics({ spend: 0.1, impressions: 10, clicks: 1, results: 0.5 }, { spend: 0.2, impressions: 5, clicks: 2, results: 1 }))
      .toEqual({ spend: 0.3, impressions: 15, clicks: 3, results: 1.5 })
  })

  it('rates are null when there is nothing to divide by', () => {
    const none = { spend: 4, impressions: 0, clicks: 0, results: 0 }
    expect([ctr(none), cpc(none), costPerResult(none)]).toEqual([null, null, null])
    expect(ctr({ spend: 10, impressions: 200, clicks: 5, results: 2 })).toBe(0.025)
    expect(cpc({ spend: 10, impressions: 200, clicks: 5, results: 2 })).toBe(2)
    expect(costPerResult({ spend: 10, impressions: 200, clicks: 5, results: 2 })).toBe(5)
  })

  it('days: every date in the range, both platforms on the same day added up, gaps as zero', () => {
    const meta = report('meta_ads', [{ date: '2026-09-28', spend: 3, impressions: 100, clicks: 2, results: 1 }])
    const google = report('google_ads', [{ date: '2026-09-28', spend: 2, impressions: 50, clicks: 3, results: 0 }, { date: '2026-09-30', spend: 1, impressions: 10, clicks: 1, results: 0 }])
    const days = mergeDays([meta, google], '2026-09-28', '2026-09-30')
    expect(days.map(d => [d.date, d.spend])).toEqual([['2026-09-28', 5], ['2026-09-29', 0], ['2026-09-30', 1]])
    expect(totalsOf([meta, google])).toEqual({ spend: 6, impressions: 160, clicks: 6, results: 1 })
  })

  it('campaigns: running first, then by spend', () => {
    const list = allCampaigns([report('meta_ads', [], [camp({ id: 'p', status: 'paused', spend: 99 }), camp({ id: 'a', spend: 1 })]),
      report('google_ads', [], [camp({ platform: 'google_ads', id: 'g', spend: 20 }), camp({ platform: 'google_ads', id: 'o', status: 'other', spend: 500 })])])
    expect(list.map(c => c.id)).toEqual(['g', 'a', 'p', 'o'])
  })
})

describe('Monthly cap', () => {
  it('projects the month at this month’s daily average and warns at the chosen share', () => {
    const p = pacing(150, 400, '2026-09-15')
    expect(p.projected).toBe(300)
    expect(p.daysInMonth).toBe(30)
    expect(p.share).toBe(0.375)
    expect(p.warn).toBe(false)
    expect(pacing(330, 400, '2026-09-25').warn).toBe(true) // 82% spent
    expect(pacing(250, 400, '2026-09-15').warn).toBe(true) // on course for 500
    expect(pacing(450, 400, '2026-09-29').over).toBe(true)
  })

  it('without a cap there is nothing to warn about', () => {
    expect(pacing(1000, null, '2026-02-10')).toMatchObject({ share: null, warn: false, over: false, daysInMonth: 28, projected: 2800 })
  })
})

describe('UTM links', () => {
  it('adds source, medium, campaign and content, tidied for the reports', () => {
    expect(utmLink({ url: 'easybeanscoffee.com', source: 'Instagram', medium: 'Paid Social', campaign: 'Autumn menú!', content: '' }))
      .toBe('https://easybeanscoffee.com/?utm_source=instagram&utm_medium=paid-social&utm_campaign=autumn-menu')
    expect(utmValue('  Café  con leche ')).toBe('cafe-con-leche')
    expect(utmValue('paid_social')).toBe('paid_social')
  })

  it('keeps the address’s own query and #part, and replaces old utm values', () => {
    expect(utmLink({ url: 'https://www.easybeanscoffee.com/order?table=4&utm_source=old#menu', source: 'google', medium: 'cpc', campaign: 'brand', content: 'ad 1' }))
      .toBe('https://www.easybeanscoffee.com/order?table=4&utm_source=google&utm_medium=cpc&utm_campaign=brand&utm_content=ad-1#menu')
  })

  it('needs a web address and source, medium and campaign', () => {
    expect(utmLink({ url: 'not a site', source: 'a', medium: 'b', campaign: 'c' })).toBeNull()
    expect(utmLink({ url: 'ftp://x.com', source: 'a', medium: 'b', campaign: 'c' })).toBeNull()
    expect(utmLink({ url: 'x.com', source: '', medium: 'b', campaign: 'c' })).toBeNull()
  })
})
