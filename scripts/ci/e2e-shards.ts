// The browser tests split over several machines by time (.github/workflows/ci.yml).
// Playwright's own --shard gives each machine the same number of tests, and they aren't the same
// length: in a full run the last machine finished minutes after the first. Here each machine gets a
// run of neighbouring tests, as with --shard (so each one opens only a few pages' code), cut where
// their times add up to about the same. The times are the last full run's in the merge queue
// (saved by merge-queue.yml); a test without one yet counts as a typical test.
//   plan <grep> <timings.json>   → for $GITHUB_OUTPUT: how many machines, and the times they share
//   run <shard> <total> <grep>   → runs this machine's tests (E2E_TIMINGS: plan's times), then
//                                  writes their times to playwright-report/timings.json
// <grep> is select-e2e.ts's answer: "all", or a --grep pattern.
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { dirname, join, relative } from 'node:path'

/** Most machines one run takes. Every session's CI shares the account's 20 jobs at a time. */
export const MAX_SHARDS = 8
/** About how many seconds of tests each machine gets in a run of selected tests. */
export const SHARD_SECONDS = 150
/** Machines for selected tests while no times are saved yet. */
export const FALLBACK_SHARDS = 3
/** A test's seconds when no test has a time yet. */
const DEFAULT_SECONDS = 8

const SPEC = 'e2e/demo.spec.ts'
const REPORT = 'playwright-report/results.json'
export const TIMINGS_OUT = 'playwright-report/timings.json'

/** Seconds per test, by testName (saved) or by testId (handed to the machines, much shorter). */
export type Timings = Record<string, number>

export const testName = (project: string, file: string, titles: string[]) => [project, file, ...titles].join(' › ')
export const testId = (name: string) => createHash('sha1').update(name).digest('hex').slice(0, 12)

/** How many machines: all of them for every test; for selected tests, enough for SHARD_SECONDS each. */
export function shardCount(timings: Timings, grep: string, workers: number): number {
  if (grep === 'all') return MAX_SHARDS
  const names = Object.keys(timings)
  if (!names.length) return FALLBACK_SHARDS
  // As Playwright matches --grep: case-insensitive, on the project, file and titles joined by spaces.
  const re = new RegExp(grep, 'i')
  const seconds = names.filter(n => re.test(n.split(' › ').join(' '))).reduce((sum, n) => sum + timings[n], 0)
  return Math.min(MAX_SHARDS, Math.max(1, Math.ceil(seconds / workers / SHARD_SECONDS)))
}

/** The saved times keyed by testId and rounded, small enough for a job output and an env variable. */
export const compact = (timings: Timings): Timings =>
  Object.fromEntries(Object.entries(timings).map(([name, s]) => [testId(name), Math.round(s * 10) / 10]))

/** A test's estimated seconds from compact times: a test without a time counts as the median test. */
export function estimator(timings: Timings): (name: string) => number {
  const known = Object.values(timings).sort((a, b) => a - b)
  const typical = known.length ? known[Math.floor(known.length / 2)] : DEFAULT_SECONDS
  return name => timings[testId(name)] ?? typical
}

interface JsonResult { duration: number }
interface JsonTest { projectName: string; status: string; results: JsonResult[] }
interface JsonSpec { title: string; file: string; line: number; column: number; tests: JsonTest[] }
interface JsonSuite { title: string; specs: JsonSpec[]; suites?: JsonSuite[] }
export interface JsonReport { config: { rootDir: string; projects: { name: string }[] }; suites: JsonSuite[] }

export interface Listed { name: string; location: string; test: JsonTest }

/** Every test in a Playwright JSON report (from --list or a run), in the order Playwright runs them:
 *  project by project, then down each file. location is file:line:column from cwd, as the CLI takes it. */
export function listTests(report: JsonReport, cwd: string): Listed[] {
  const found: (Listed & { project: number; file: string; line: number; column: number })[] = []
  const projects = report.config.projects.map(p => p.name)
  const walk = (suite: JsonSuite, titles: string[]) => {
    for (const spec of suite.specs) {
      const file = relative(cwd, join(report.config.rootDir, spec.file)).split('\\').join('/')
      for (const test of spec.tests) found.push({
        name: testName(test.projectName, spec.file, [...titles, spec.title]),
        location: `${file}:${spec.line}:${spec.column}`, test,
        project: projects.indexOf(test.projectName), file, line: spec.line, column: spec.column,
      })
    }
    for (const s of suite.suites ?? []) walk(s, [...titles, s.title])
  }
  for (const file of report.suites) walk(file, [])
  found.sort((a, b) => a.project - b.project || a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)
  return found.map(({ name, location, test }) => ({ name, location, test }))
}

/** The tests' locations for each machine: neighbouring tests, cut where the times add up evenly.
 *  Tests at one location (made in a loop) stay together, as the location picks all of them. */
export function splitByTime(tests: Listed[], seconds: (name: string) => number, total: number): string[][] {
  const groups = new Map<string, number>()
  for (const t of tests) groups.set(t.location, (groups.get(t.location) ?? 0) + seconds(t.name))
  const sum = [...groups.values()].reduce((a, b) => a + b, 0)
  const shards: string[][] = Array.from({ length: total }, () => [])
  let done = 0
  for (const [location, s] of groups) {
    // Each location goes to the machine whose share of the time its middle falls in.
    shards[Math.min(total - 1, Math.floor(((done + s / 2) / sum) * total))].push(location)
    done += s
  }
  return shards
}

/** The seconds each test took in a run, to be saved for the next one. Only passes count (and skips, as
 *  nothing): a failure's time says little about the next run's. */
export function timingsFromReport(report: JsonReport, cwd: string): Timings {
  const out: Timings = {}
  for (const { name, test } of listTests(report, cwd)) {
    const last = test.results.at(-1)
    if ((test.status === 'expected' || test.status === 'flaky') && last) out[name] = Math.round(last.duration / 100) / 10
    else if (test.status === 'skipped') out[name] = 0
  }
  return out
}

function parseTimings(text: string | undefined, where: string): Timings {
  if (!text) return {}
  try {
    return JSON.parse(text) as Timings
  } catch {
    console.error(`${where} isn't JSON: splitting the tests evenly by count instead.`)
    return {}
  }
}

function list(args: string[]): JsonReport {
  const env = { ...process.env }
  delete env.PLAYWRIGHT_JSON_OUTPUT_FILE
  const out = execFileSync('npx', ['playwright', 'test', ...args, '--list', '--reporter=json', '--pass-with-no-tests'],
    { encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] })
  return JSON.parse(out) as JsonReport
}

function plan(grep: string, file: string) {
  const timings = existsSync(file) ? parseTimings(readFileSync(file, 'utf8'), file) : {}
  const total = shardCount(timings, grep, Math.max(1, Math.floor(availableParallelism() / 2)))
  console.log(`total=${total}`)
  console.log(`shards=${JSON.stringify(Array.from({ length: total }, (_, i) => i + 1))}`)
  console.log(`timings=${JSON.stringify(compact(timings))}`)
  console.error(`Browser tests on ${total} machines; times for ${Object.keys(timings).length} tests from the last full run.`)
}

function run(shard: number, total: number, grep: string): number {
  if (!(shard >= 1 && shard <= total)) throw new Error(`No shard ${shard} of ${total}`)
  const cwd = process.cwd()
  const pick = grep === 'all' ? [] : ['--grep', grep]
  const seconds = estimator(parseTimings(process.env.E2E_TIMINGS, 'E2E_TIMINGS'))
  const tests = listTests(list([SPEC, ...pick]), cwd)
  const mine = splitByTime(tests, seconds, total)[shard - 1]
  const expected = tests.filter(t => mine.includes(t.location))
  const estimate = Math.round(expected.reduce((sum, t) => sum + seconds(t.name), 0))
  console.log(`Shard ${shard} of ${total}: ${expected.length} of ${tests.length} tests, about ${estimate}s of test time.`)
  if (!mine.length) return 0

  // The locations must pick exactly this machine's share: a test left out would never run anywhere.
  const picked = listTests(list([...mine, ...pick]), cwd).map(t => t.name).sort()
  const want = expected.map(t => t.name).sort()
  if (picked.length !== want.length || picked.some((n, i) => n !== want[i])) {
    console.error('These locations pick other tests than this shard\'s share:')
    for (const n of picked.filter(n => !want.includes(n))) console.error(`  extra: ${n}`)
    for (const n of want.filter(n => !picked.includes(n))) console.error(`  missing: ${n}`)
    return 1
  }

  mkdirSync(dirname(REPORT), { recursive: true })
  const result = spawnSync('npx', ['playwright', 'test', ...mine, ...pick, '--reporter=list,json'],
    { stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: REPORT } })
  if (existsSync(REPORT)) {
    const report = JSON.parse(readFileSync(REPORT, 'utf8')) as JsonReport
    writeFileSync(TIMINGS_OUT, JSON.stringify(timingsFromReport(report, cwd)))
  }
  return result.status ?? 1
}

if (process.argv[1]?.endsWith('e2e-shards.ts')) {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'plan') plan(args[0] ?? 'all', args[1] ?? '')
  else if (command === 'run') process.exit(run(Number(args[0]), Number(args[1]), args[2] ?? 'all'))
  else {
    console.error('Usage: e2e-shards.ts plan <grep> <timings.json> | run <shard> <total> <grep>')
    process.exit(2)
  }
}
