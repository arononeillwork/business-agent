// The time the app keeps for User analytics (src/app/usage.ts): a page's time counts while it's on screen and in
// use, stops 3 minutes after the last touch, scroll or key, and stops when the app goes out of sight; a visit
// carries on until a 30-minute break, and is the person's own; what isn't sent goes with the next report.
import { beforeEach, describe, expect, it } from 'vitest'
import { makeUsageTracker, newVisitId, type VisitStore } from './usage'
import type { UsageReport } from '../../shared/usage'

const MIN = 60_000
let clock: number
let sent: UsageReport[]
let fail: boolean
let ids: number
let kept: ReturnType<VisitStore['get']>
const store: VisitStore = { get: () => kept, set: v => { kept = v } }

const tracker = (user = 'julio') => makeUsageTracker({
  user, now: () => clock, newId: () => `visit-${++ids}`, store, installed: true, touch: true,
  send: async r => { if (fail) throw new Error('offline'); sent.push(r) },
})
const pages = (i = sent.length - 1) => sent[i].pages

beforeEach(() => {
  clock = Date.UTC(2026, 10, 15, 9)
  sent = []
  fail = false
  ids = 0
  kept = null
})

describe('a page’s time', () => {
  it('counts while it’s on screen, in whole seconds, the rest going with the next report', () => {
    const t = tracker()
    t.show('rules')
    clock += 42_500
    t.flush()
    expect(sent).toEqual([{ visit: 'visit-1', installed: true, touch: true, pages: [{ page: 'rules', views: 1, seconds: 42 }] }])
    clock += 30_500
    t.show('rota')
    clock += 5_000
    t.flush()
    expect(pages()).toEqual([{ page: 'rules', views: 0, seconds: 31 }, { page: 'rota', views: 1, seconds: 5 }])
  })

  it('stops 3 minutes after the last touch, scroll or key, and starts again with the next', () => {
    const t = tracker()
    t.show('rules')
    clock += 2 * MIN
    t.input()
    // Reading on without touching it: 3 more minutes count, then nothing.
    clock += 20 * MIN
    t.flush()
    expect(pages()).toEqual([{ page: 'rules', views: 1, seconds: 5 * 60 }])
    t.input()
    clock += 10_000
    t.flush()
    expect(pages()).toEqual([{ page: 'rules', views: 0, seconds: 10 }])
  })

  it('stops when the app goes out of sight, sending what it has, and starts again when it’s back', () => {
    const t = tracker()
    t.show('rules')
    clock += 30_000
    t.hide()
    expect(pages()).toEqual([{ page: 'rules', views: 1, seconds: 30 }])
    clock += 10 * MIN
    t.flush()
    expect(sent).toHaveLength(1)
    t.reveal()
    clock += 15_000
    t.flush()
    expect(pages()).toEqual([{ page: 'rules', views: 0, seconds: 15 }])
  })

  it('counts each time a page is opened, and nothing for no page', () => {
    const t = tracker()
    t.show('rules')
    t.show('rota')
    t.show('rules')
    t.show(null)
    clock += 5 * MIN
    t.flush()
    expect(pages()).toEqual([{ page: 'rules', views: 2, seconds: 0 }, { page: 'rota', views: 1, seconds: 0 }])
    clock += MIN
    t.flush()
    expect(sent).toHaveLength(1)
  })

  it('doesn’t count the same page shown again as opened again (the app’s frame drawn again)', () => {
    const t = tracker()
    t.show('rules')
    t.hide()
    t.reveal()
    t.show('rules')
    clock += 10_000
    t.flush()
    expect(sent.flatMap(r => r.pages)).toEqual([{ page: 'rules', views: 1, seconds: 0 }, { page: 'rules', views: 0, seconds: 10 }])
  })

  it('sends again what didn’t arrive', async () => {
    const t = tracker()
    t.show('rules')
    clock += 20_000
    fail = true
    t.flush()
    await new Promise(r => setTimeout(r, 0))
    fail = false
    clock += 10_000
    t.flush()
    expect(sent).toEqual([expect.objectContaining({ pages: [{ page: 'rules', views: 1, seconds: 30 }] })])
  })
})

describe('a visit', () => {
  it('carries on until a 30-minute break', () => {
    const t = tracker()
    t.show('today')
    clock += 10_000
    t.flush()
    clock += 29 * MIN
    t.input()
    clock += 10_000
    t.flush()
    clock += 31 * MIN
    t.input()
    clock += 10_000
    t.flush()
    expect(sent.map(r => r.visit)).toEqual(['visit-1', 'visit-1', 'visit-2'])
  })

  it('is the person’s own: someone else signing in on the tab starts their own', () => {
    const a = tracker('julio')
    a.show('today')
    clock += 10_000
    a.hide()
    const b = tracker('ana')
    b.show('today')
    clock += 10_000
    b.hide()
    expect(sent.map(r => r.visit)).toEqual(['visit-1', 'visit-2'])
  })
})

it('makes visit ids that are uuids', () => {
  expect(newVisitId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})
