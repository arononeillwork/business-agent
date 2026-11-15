import { describe, expect, it } from 'vitest'
import {
  FALLBACK_SHARDS, MAX_SHARDS, SHARD_SECONDS, compact, estimator, listTests, shardCount, splitByTime, testId, testName,
  timingsFromReport, type JsonReport, type Listed,
} from './e2e-shards'

const name = (title: string, project = 'desktop') => testName(project, 'demo.spec.ts', [title])
const listed = (location: string, title: string): Listed =>
  ({ name: name(title), location, test: { projectName: 'desktop', status: 'expected', results: [] } })

describe('how many machines the browser tests take', () => {
  const timings = { [name('clock in and out › admin clocks in on time')]: 600, [name('rota › add a shift')]: 300, [name('rota › employees')]: 300 }

  it('every machine for every test', () => {
    expect(shardCount({}, 'all', 2)).toBe(MAX_SHARDS)
    expect(shardCount(timings, 'all', 2)).toBe(MAX_SHARDS)
  })

  it('for selected tests, enough for their time as Playwright picks them', () => {
    // The rota's 600 s on 2 workers is 300 s of machine time.
    expect(shardCount(timings, 'rota', 2)).toBe(Math.ceil(300 / SHARD_SECONDS))
    expect(shardCount(timings, 'ROTA', 2)).toBe(Math.ceil(300 / SHARD_SECONDS))
    expect(shardCount(timings, 'desktop demo.spec.ts rota add', 2)).toBe(Math.ceil(150 / SHARD_SECONDS))
    expect(shardCount(timings, 'calendar', 2)).toBe(1)
    expect(shardCount({ [name('slow')]: 100_000 }, 'slow', 2)).toBe(MAX_SHARDS)
  })

  it('as before while no times are saved', () => {
    expect(shardCount({}, 'rota', 2)).toBe(FALLBACK_SHARDS)
  })
})

describe('the times the machines share', () => {
  it('are keyed short and rounded', () => {
    const c = compact({ [name('a')]: 12.345 })
    expect(c).toEqual({ [testId(name('a'))]: 12.3 })
    expect(Object.keys(c)[0]).toHaveLength(12)
  })

  it('a test without a time counts as the median one', () => {
    const seconds = estimator(compact({ [name('a')]: 2, [name('b')]: 10, [name('c')]: 30 }))
    expect(seconds(name('a'))).toBe(2)
    expect(seconds(name('new'))).toBe(10)
    expect(estimator({})(name('new'))).toBeGreaterThan(0)
  })
})

describe('which tests each machine runs', () => {
  const tests = Array.from({ length: 40 }, (_, i) => listed(`e2e/demo.spec.ts:${10 + i}:3`, `test ${i}`))
  const all = (shards: string[][]) => shards.flat()

  it('every test on exactly one machine, in order', () => {
    const shards = splitByTime(tests, () => 5, 6)
    expect(all(shards)).toEqual(tests.map(t => t.location))
    expect(shards).toHaveLength(6)
  })

  it('the same time on each, however long the tests are', () => {
    // The first ten take 10 times as long as the rest: by count, the first machine would get all of them.
    const seconds = (n: string) => (Number(n.match(/test (\d+)/)![1]) < 10 ? 50 : 5)
    const shards = splitByTime(tests, seconds, 4)
    const time = shards.map(s => s.reduce((sum, loc) => sum + seconds(tests.find(t => t.location === loc)!.name), 0))
    const ideal = time.reduce((a, b) => a + b, 0) / 4
    for (const t of time) expect(Math.abs(t - ideal)).toBeLessThanOrEqual(50)
    expect(all(shards)).toEqual(tests.map(t => t.location))
  })

  it('tests made in a loop at one location go together', () => {
    const loop = ['a', 'b', 'c', 'd'].map(t => listed('e2e/demo.spec.ts:5:3', t))
    const shards = splitByTime([...loop, ...tests.slice(0, 4)], () => 5, 4)
    expect(shards.filter(s => s.includes('e2e/demo.spec.ts:5:3'))).toHaveLength(1)
    expect(all(shards).filter(l => l === 'e2e/demo.spec.ts:5:3')).toHaveLength(1)
  })

  it('more machines than tests leaves some with nothing to run', () => {
    const shards = splitByTime(tests.slice(0, 2), () => 5, 5)
    expect(all(shards)).toHaveLength(2)
    expect(splitByTime([], () => 5, 3)).toEqual([[], [], []])
  })
})

describe('reading Playwright\'s JSON report', () => {
  const report: JsonReport = {
    config: { rootDir: '/repo/e2e', projects: [{ name: 'desktop' }, { name: 'phone' }] },
    suites: [{
      title: 'demo.spec.ts',
      specs: [
        { title: 'on the phone @phone', file: 'demo.spec.ts', line: 3, column: 1,
          tests: [{ projectName: 'phone', status: 'expected', results: [{ duration: 4321 }] }] },
        { title: 'opens at sign-in', file: 'demo.spec.ts', line: 20, column: 1,
          tests: [{ projectName: 'desktop', status: 'flaky', results: [{ duration: 30_000 }, { duration: 9000 }] }] },
      ],
      suites: [{
        title: 'rota',
        specs: [
          { title: 'add a shift', file: 'demo.spec.ts', line: 10, column: 3,
            tests: [{ projectName: 'desktop', status: 'unexpected', results: [{ duration: 1000 }] }] },
          { title: 'not yet', file: 'demo.spec.ts', line: 14, column: 3,
            tests: [{ projectName: 'desktop', status: 'skipped', results: [] }] },
        ],
      }],
    }],
  }

  it('lists tests as Playwright runs them: project by project, down the file', () => {
    expect(listTests(report, '/repo').map(t => [t.name, t.location])).toEqual([
      ['desktop › demo.spec.ts › rota › add a shift', 'e2e/demo.spec.ts:10:3'],
      ['desktop › demo.spec.ts › rota › not yet', 'e2e/demo.spec.ts:14:3'],
      ['desktop › demo.spec.ts › opens at sign-in', 'e2e/demo.spec.ts:20:1'],
      ['phone › demo.spec.ts › on the phone @phone', 'e2e/demo.spec.ts:3:1'],
    ])
  })

  it('keeps the time of each pass (the retry\'s, for a flaky one), skips as nothing, and no failures', () => {
    expect(timingsFromReport(report, '/repo')).toEqual({
      'desktop › demo.spec.ts › opens at sign-in': 9,
      'desktop › demo.spec.ts › rota › not yet': 0,
      'phone › demo.spec.ts › on the phone @phone': 4.3,
    })
  })
})
