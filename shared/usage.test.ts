// User analytics' shared rules (shared/usage.ts): what the app may send, the device a browser is, and the
// totals the owners' page shows, worked out the same way public.usage_report() does.
import { describe, expect, it } from 'vitest'
import {
  MAX_PAGES, MAX_SECONDS, cleanUsageReport, deviceOf, pageReaders, pagesUsage, peopleUsage, usageRange, usageReportOf, usageTotals,
  type StoredPage, type UsageVisit,
} from './usage'

const VISIT = '6f1d3c2a-8b4e-4f7a-9c1d-2e3f4a5b6c7d'

describe('a report from the app', () => {
  it('keeps its visit and each page’s views and seconds, whole and within limits', () => {
    expect(cleanUsageReport({ visit: VISIT.toUpperCase(), installed: true, touch: true, pages: [
      { page: 'rules', views: 1, seconds: 42.6 }, { page: 'rota', views: 0, seconds: 99_999 }, { page: 'rules', views: 1, seconds: 10 },
    ] })).toEqual({ visit: VISIT, installed: true, touch: true, pages: [{ page: 'rules', views: 2, seconds: 53 }, { page: 'rota', views: 0, seconds: MAX_SECONDS }] })
  })

  it('leaves out what isn’t a page, pages with nothing in them, and pages past the limit', () => {
    const r = cleanUsageReport({ visit: VISIT, pages: [
      { page: '../admin', views: 1, seconds: 1 }, { page: 'Rules', views: 1, seconds: 1 }, { page: 'today', views: 0, seconds: 0 },
      { page: 'rota', views: -3, seconds: 'lots' }, null, 'rules',
      ...Array.from({ length: MAX_PAGES + 5 }, (_, i) => ({ page: `p${i}`, views: 1, seconds: 1 })),
    ] })
    expect(r?.installed).toBe(false)
    expect(r?.pages.map(p => p.page)).toEqual(Array.from({ length: MAX_PAGES - 6 }, (_, i) => `p${i}`))
  })

  it('isn’t one without a visit id and a list of pages', () => {
    expect(cleanUsageReport(null)).toBeNull()
    expect(cleanUsageReport({ visit: 'abc', pages: [] })).toBeNull()
    expect(cleanUsageReport({ visit: VISIT })).toBeNull()
    expect(cleanUsageReport({ visit: VISIT, pages: [] })).toEqual({ visit: VISIT, installed: false, touch: false, pages: [] })
  })
})

describe('the device, from the browser', () => {
  const cases: [string, boolean, ReturnType<typeof deviceOf>][] = [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1', true,
      { device: 'phone', os: 'iOS', browser: 'Safari' }],
    // The installed app on an iPhone: no "Safari" in it.
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', true,
      { device: 'phone', os: 'iOS', browser: 'Safari' }],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1', true,
      { device: 'phone', os: 'iOS', browser: 'Chrome' }],
    // An iPad says it's a Mac; its touch screen gives it away.
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15', true,
      { device: 'tablet', os: 'iPadOS', browser: 'Safari' }],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15', false,
      { device: 'computer', os: 'macOS', browser: 'Safari' }],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', true,
      { device: 'phone', os: 'Android', browser: 'Chrome' }],
    ['Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Safari/537.36', true,
      { device: 'tablet', os: 'Android', browser: 'Samsung Internet' }],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0', false,
      { device: 'computer', os: 'Windows', browser: 'Edge' }],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0', false, { device: 'computer', os: 'Linux', browser: 'Firefox' }],
    ['Mozilla/5.0 (X11; CrOS x86_64 16181.61.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', false,
      { device: 'computer', os: 'ChromeOS', browser: 'Chrome' }],
    ['', false, { device: 'computer', os: null, browser: null }],
  ]
  it.each(cases)('%s', (ua, touch, want) => expect(deviceOf(ua, touch)).toEqual(want))
})

// Julio read the staff rules on his phone over two visits; Ana opened them once on the computer; Bea used the app
// but never opened them; Carl didn't use it at all.
const at = (h: number) => new Date(Date.UTC(2026, 10, 10, h)).toISOString()
const visit = (id: string, who: string, h: number, extra: Partial<UsageVisit> = {}): Omit<UsageVisit, 'pages'> => ({
  id, profile_id: who, started_at: at(h), last_seen_at: at(h + 1), device: 'phone', os: 'iOS', browser: 'Safari', installed: true,
  city: 'Marbella', region: 'Andalusia', country: 'ES', seconds: 0, ...extra,
})
const page = (visit_id: string, name: string, seconds: number, h: number, views = 1): StoredPage => ({ visit_id, page: name, views, seconds, first_at: at(h), last_at: at(h) })
const visits = [
  visit('v1', 'julio', 8, { seconds: 200 }),
  visit('v2', 'julio', 12, { seconds: 100, city: 'San Pedro de Alcántara' }),
  visit('v3', 'ana', 9, { device: 'computer', os: 'Windows', browser: 'Edge', installed: false, seconds: 40, country: null, city: null, region: null }),
  visit('v4', 'bea', 10, { seconds: 300 }),
  // Before the period.
  visit('v0', 'carl', -48, { seconds: 999 }),
]
const pages = [
  page('v1', 'rules', 150, 8), page('v1', 'rota', 50, 8),
  page('v2', 'rules', 100, 12),
  page('v3', 'rules', 40, 9, 2),
  page('v4', 'rota', 300, 10),
  page('v0', 'rules', 999, -48),
]
const team = ['julio', 'ana', 'bea', 'carl'].map(id => ({ id, full_name: id[0].toUpperCase() + id.slice(1), colour: '#000000', role: 'employee' }))
const data = usageReportOf(visits, pages, at(0), at(24), team)

describe('what owners see', () => {
  it('totals the period’s visits, as usage_report() does', () => {
    expect(data.total_visits).toBe(4)
    expect(data.visits.map(v => v.id)).toEqual(['v2', 'v4', 'v3', 'v1'])
    expect(data.visits[3].pages).toEqual([{ page: 'rules', views: 1, seconds: 150 }, { page: 'rota', views: 1, seconds: 50 }])
    expect(data.people.find(p => p.profile_id === 'julio')).toEqual({ profile_id: 'julio', visits: 2, seconds: 300, first_at: at(8), last_at: at(13) })
    expect(data.places.filter(p => p.profile_id === 'ana')).toEqual([])
    expect(data.names.map(n => n.full_name)).toEqual(['Julio', 'Ana', 'Bea'])
    expect(usageTotals(data)).toEqual({ people: 3, visits: 4, seconds: 640, topPage: 'rota' })
  })

  it('lists each person with their devices, places and pages, the latest first', () => {
    const people = peopleUsage(data)
    expect(people.map(p => p.profile_id)).toEqual(['julio', 'bea', 'ana'])
    expect(people[0].devices).toEqual([{ profile_id: 'julio', device: 'phone', os: 'iOS', browser: 'Safari', installed: true, visits: 2, last_at: at(13) }])
    expect(people[0].places.map(p => p.city)).toEqual(['San Pedro de Alcántara', 'Marbella'])
    expect(people[0].pages.map(p => [p.page, p.seconds, p.views])).toEqual([['rules', 250, 2], ['rota', 50, 1]])
  })

  it('adds who signed in in the period with no visits recorded yet, and each one’s last sign-in', () => {
    const who = (id: string) => ({ full_name: id, colour: '#000000', role: 'employee' })
    const signIns = [
      { profile_id: 'julio', last_sign_in_at: at(14), provider: 'google', ...who('Julio') },
      // Signed in, nothing recorded yet (Supabase was down, or the app was only just opened).
      { profile_id: 'carl', last_sign_in_at: at(20), provider: 'google', ...who('Carl') },
      // Before the period: not counted as using it in it.
      { profile_id: 'dan', last_sign_in_at: at(-30), provider: 'email', ...who('Dan') },
    ]
    const people = peopleUsage(data, signIns, at(0))
    expect(people.map(p => p.profile_id)).toEqual(['carl', 'julio', 'bea', 'ana'])
    expect(people[0]).toMatchObject({ visits: 0, seconds: 0, last_at: at(20), pages: [], devices: [], signIn: { provider: 'google' } })
    // Julio's sign-in came after his last visit: it's when he last used it.
    expect(people[1]).toMatchObject({ visits: 2, last_at: at(14), signIn: { last_sign_in_at: at(14) } })
    expect(people[2].signIn).toBeNull()
  })

  it('ranks the pages by time, with how many opened each and the average', () => {
    expect(pagesUsage(data)).toEqual([
      { page: 'rota', people: 2, views: 2, seconds: 350, average: 175, last_at: at(10) },
      { page: 'rules', people: 2, views: 4, seconds: 290, average: 145, last_at: at(12) },
    ])
  })

  it('says how long each person read the staff rules, and who on the team never opened them', () => {
    const { readers, notOpened } = pageReaders(data, 'rules', ['ana', 'bea', 'carl', 'julio'])
    expect(readers.map(r => [r.profile_id, r.seconds, r.views])).toEqual([['julio', 250, 2], ['ana', 40, 2]])
    expect(notOpened).toEqual(['bea', 'carl'])
  })

  it('covers the last days asked for, up to now', () => {
    const now = Date.UTC(2026, 10, 15, 12)
    expect(usageRange('7', now)).toEqual({ from: new Date(Date.UTC(2026, 10, 8, 12)).toISOString(), to: new Date(now + 60_000).toISOString() })
  })
})
