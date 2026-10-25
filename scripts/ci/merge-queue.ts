// The merge queue (.github/workflows/merge-queue.yml): lands ready pull requests on main a few at a
// time, so sessions working in parallel never merge by hand or wait on each other.
//   prepare: main plus every ready pull request, oldest first, merged into one candidate on the
//            merge-queue branch. Conflicts where both sides only added things are settled
//            (resolve-conflicts.ts); new migrations whose number is taken get the next free one.
//   finish:  after the whole CI on the candidate. Green: main moves to it, so the pull requests show
//            as merged, and Deploy skips the tests it just passed. Red: each pull request is tried
//            on its own next, and one that fails alone is told so.
// Comments on a pull request carry a hidden marker with the commit (and main) they're about: a new
// push, or a new main for a conflict, tries again, and nothing is said twice.
//   node --experimental-strip-types scripts/ci/merge-queue.ts prepare|finish
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolveConflicts } from './resolve-conflicts.ts'
import { parseMigration, renumber, renumberReferences, type Rename } from './migrations.ts'

const REPO = process.env.GITHUB_REPOSITORY ?? ''
const API = process.env.GITHUB_API_URL ?? 'https://api.github.com'
const RUN = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID}`
const HAS_QUEUE_TOKEN = process.env.HAS_QUEUE_TOKEN === 'true'
const BOT = 'github-actions[bot]'
const HOLD = 'queue:hold'
const MAX_BATCH = 8
const MIGRATIONS = 'supabase/migrations'

interface Pull { number: number; title: string; draft: boolean; head: { sha: string; ref: string; repo: { full_name: string } | null }; labels: { name: string }[] }
interface Landed { number: number; title: string; head: string; branch: string; settled: string[]; renames: Rename[] }
type Kind = 'conflict' | 'failed' | 'batch-failed' | 'blocked'

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).trim()
const tryGit = (...args: string[]) => { try { git(...args); return true } catch { return false } }
const lines = (s: string) => s.split('\n').filter(Boolean)

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}/repos/${REPO}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
  })
  if (!res.ok) throw new Error(`GitHub ${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}
const post = (path: string, body: unknown) => api(path, { method: 'POST', body: JSON.stringify(body) })
const output = (key: string, value: string) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
const summary = (text: string) => { console.log(text); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n') }
const dispatch = (workflow: string) => post(`/actions/workflows/${workflow}/dispatches`, { ref: 'main' })

const marker = (kind: Kind, head: string, main?: string) => `<!-- merge-queue:${kind} head=${head}${main ? ` main=${main}` : ''} -->`

/** What the queue already said on this pull request (its own comments only). */
async function said(pr: number): Promise<string[]> {
  const comments = await api(`/issues/${pr}/comments?per_page=100`) as { body: string; user: { login: string } | null }[]
  return comments.filter(c => c.user?.login === BOT).map(c => c.body)
}
const has = (bodies: string[], kind: Kind, head: string, main?: string) => bodies.some(b => b.includes(marker(kind, head, main)))
const say = (pr: number, text: string, kind?: Kind, head?: string, main?: string) =>
  post(`/issues/${pr}/comments`, { body: kind && head ? `${text}\n\n${marker(kind, head, main)}` : text })

interface CheckRun { name: string; status: string; conclusion: string | null; started_at: string }

/** The pull request's own CI on its latest commit: everything finished and nothing red. Per check,
 *  the latest run that wasn't skipped counts (a re-run replaces a failure; the pull_request copy of
 *  CI skips itself for branches here). */
export function checksState(runs: CheckRun[]): 'green' | 'waiting' | 'red' {
  const latest = new Map<string, CheckRun>()
  for (const r of runs) {
    if (r.conclusion === 'skipped') continue
    const seen = latest.get(r.name)
    if (!seen || r.started_at > seen.started_at) latest.set(r.name, r)
  }
  const counted = [...latest.values()]
  if (!counted.length || counted.some(r => r.status !== 'completed')) return 'waiting'
  return counted.every(r => r.conclusion === 'success' || r.conclusion === 'neutral') ? 'green' : 'red'
}
const ownChecks = async (sha: string) =>
  checksState((await api(`/commits/${sha}/check-runs?filter=all&per_page=100`) as { check_runs: CheckRun[] }).check_runs)

const migrationsAt = (rev: string) => { try { return lines(git('ls-tree', '--name-only', `${rev}:${MIGRATIONS}`)) } catch { return [] } }
const showAt = (rev: string, file: string) => { try { return git('show', `${rev}:${file}`) } catch { return '' } }
const isText = (file: string) => existsSync(file) && !readFileSync(file).subarray(0, 8000).includes(0)

/** Merges one pull request into the candidate (HEAD). Null when it can't go in this round. */
async function add(pr: Pull, main: string, bodies: string[], state: { deferred: boolean }): Promise<Landed | null> {
  const head = pr.head.sha
  if (!tryGit('fetch', '-q', 'origin', head)) return null
  const before = git('rev-parse', 'HEAD')
  const changed = lines(git('diff', '--name-only', `${main}...${head}`))
  const block = async (text: string) => { if (!has(bodies, 'blocked', head)) await say(pr.number, text, 'blocked', head); return null }

  if (!HAS_QUEUE_TOKEN && changed.some(f => f.startsWith('.github/workflows/'))) {
    return block('This pull request changes a workflow, and GitHub only lets the merge queue push those with the `QUEUE_TOKEN` '
      + 'secret (see the top of `.github/workflows/merge-queue.yml`). Add the secret, or merge this one by hand.')
  }
  // Production has every migration on main already, and matches them by name: a changed one, or a
  // second one with a name that's taken, would never run there.
  const base = git('merge-base', main, head)
  // Without rename pairing: one moved in from supabase/pending is an addition; one renamed or moved
  // away is a deletion (production would run it again under its new name).
  const edited = lines(git('diff', '--name-only', '--no-renames', '--diff-filter=MD', base, head, '--', MIGRATIONS))
  const onMain = migrationsAt(main)
  const names = new Set(onMain.map(f => parseMigration(f)?.name))
  const twice = lines(git('diff', '--name-only', '--no-renames', '--diff-filter=A', base, head, '--', MIGRATIONS))
    .map(f => parseMigration(f.slice(MIGRATIONS.length + 1))).filter(m => m && names.has(m.name)).map(m => m!.file)
  if (edited.length || twice.length) {
    return block([
      ...edited.map(f => `\`${f}\` is already applied in production, so changing it here changes nothing there. Put the change in a new migration instead.`),
      ...twice.map(f => `\`${f}\`: a migration with this name is already on main (and in production). Drop this one, or give it a new name if it's different.`),
    ].join('\n\n'))
  }

  const title = `Merge #${pr.number}: ${pr.title}`
  const settled: string[] = []
  if (!tryGit('merge', '--no-ff', '--no-edit', '-m', title, head)) {
    const stuck: string[] = []
    for (const f of lines(git('diff', '--name-only', '--diff-filter=U'))) {
      const stages = new Set(lines(git('ls-files', '-u', '--', f)).map(l => l.split(/\s+/)[2]))
      let text: string | null = null
      if (stages.size === 3) {
        git('checkout', '--conflict=diff3', '--', f)
        text = resolveConflicts(readFileSync(f, 'utf8'), { wordsToo: !/\.(md|txt)$/i.test(f) })
      }
      if (text === null) { stuck.push(f); continue }
      writeFileSync(f, text)
      git('add', '--', f)
      settled.push(f)
    }
    if (stuck.length) {
      git('merge', '--abort')
      // Against another pull request in this round, not main: it gets its turn once that one lands.
      if (before !== main) { state.deferred = true; return null }
      if (!has(bodies, 'conflict', head, main)) {
        await say(pr.number, `This pull request conflicts with main in a way the merge queue can't settle by itself:\n\n`
          + stuck.map(f => `- \`${f}\``).join('\n') + `\n\nMerge \`origin/main\` into the branch, resolve these, and push: the queue picks it up again.`
          + (settled.length ? ` (It could settle ${settled.map(f => `\`${f}\``).join(', ')} itself.)` : ''), 'conflict', head, main)
      }
      return null
    }
    git('commit', '-q', '-m', `${title}\n\nConflicts settled by the merge queue (both sides kept): ${settled.join(', ')}`)
  }
  if (git('rev-parse', 'HEAD') === before) return null // nothing new in it

  const had = migrationsAt(before)
  const renames = renumber(had, migrationsAt('HEAD').filter(f => !had.includes(f)))
  if (renames.length) {
    for (const r of renames) git('mv', `${MIGRATIONS}/${r.from}`, `${MIGRATIONS}/${r.to}`)
    // "migration 66" in what this pull request wrote follows its migration to the new number.
    for (const f of lines(git('diff', '--name-only', before, 'HEAD'))) {
      if (!isText(f)) continue
      const old = new Set(showAt(before, f).split('\n'))
      const text = readFileSync(f, 'utf8')
      const next = text.split('\n').map(l => (old.has(l) ? l : renumberReferences(l, renames))).join('\n')
      if (next !== text) { writeFileSync(f, next); git('add', '--', f) }
    }
    git('commit', '-q', '--amend', '-m', `${git('log', '-1', '--format=%B')}\n\nMigrations renumbered by the merge queue: `
      + renames.map(r => `${r.from} → ${r.to}`).join(', '))
  }
  return { number: pr.number, title: pr.title, head, branch: pr.head.ref, settled, renames }
}

async function prepare() {
  const main = git('rev-parse', 'origin/main')
  const pulls = (await api('/pulls?state=open&base=main&sort=created&direction=asc&per_page=100') as Pull[])
    .filter(p => !p.draft && p.head.repo?.full_name === REPO && !p.labels.some(l => l.name === HOLD))
  const ready: { pr: Pull; bodies: string[]; solo: boolean }[] = []
  for (const pr of pulls) {
    const bodies = await said(pr.number), head = pr.head.sha
    if (has(bodies, 'failed', head) || has(bodies, 'blocked', head) || has(bodies, 'conflict', head, main)) continue
    if (await ownChecks(head) !== 'green') continue // its own CI comes back here when it finishes
    ready.push({ pr, bodies, solo: has(bodies, 'batch-failed', head) })
  }
  // After a round failed with several, one at a time until each has had its turn alone.
  const solo = ready.find(r => r.solo)
  const round = solo ? [solo] : ready.slice(0, MAX_BATCH)
  const state = { deferred: ready.length > round.length }

  git('config', 'user.name', BOT)
  git('config', 'user.email', '41898283+github-actions[bot]@users.noreply.github.com')
  git('checkout', '-q', '-B', 'merge-queue', main)
  const landed: Landed[] = []
  for (const r of round) {
    const l = await add(r.pr, main, r.bodies, state)
    if (l) landed.push(l)
  }
  output('more', String(state.deferred))
  if (!landed.length) {
    summary(ready.length ? 'Nothing could go in this round.' : 'No pull request is ready (open, not a draft, its own CI green).')
    output('sha', '')
    return
  }
  if (!tryGit('push', '-q', '--force', 'origin', 'HEAD:refs/heads/merge-queue')) {
    throw new Error("Couldn't push the candidate to the merge-queue branch. If main or a pull request changed a workflow, "
      + 'GitHub only allows that with the QUEUE_TOKEN secret (see the top of .github/workflows/merge-queue.yml).')
  }
  const sha = git('rev-parse', 'HEAD')
  output('sha', sha)
  output('prs', JSON.stringify(landed))
  summary(`### Testing main + ${landed.map(l => `#${l.number}`).join(', ')} (\`${sha.slice(0, 7)}\`)\n`
    + landed.map(l => `- #${l.number} ${l.title}`
      + (l.settled.length ? `; conflicts settled in ${l.settled.join(', ')}` : '')
      + (l.renames.length ? `; migrations renumbered: ${l.renames.map(r => `${r.from} → ${r.to}`).join(', ')}` : '')).join('\n'))
}

async function finish() {
  const sha = process.env.SHA ?? '', landed = JSON.parse(process.env.PRS || '[]') as Landed[]
  let again = process.env.MORE === 'true'
  if (process.env.RESULT === 'success') {
    await post(`/statuses/${sha}`, { state: 'success', context: 'merge-queue', description: 'Every test passed in the merge queue', target_url: RUN })
    git('fetch', '-q', 'origin', sha)
    if (!tryGit('push', '-q', 'origin', `${sha}:refs/heads/main`)) {
      summary('main moved while the tests ran: trying again on the new main.')
      await dispatch('merge-queue.yml')
      return
    }
    summary(`Landed on main: ${landed.map(l => `#${l.number}`).join(', ')} (\`${sha.slice(0, 7)}\`).`)
    for (const l of landed) {
      const others = landed.filter(o => o !== l).map(o => `#${o.number}`)
      await say(l.number, `Landed on main in ${sha.slice(0, 7)}${others.length ? ` together with ${others.join(', ')}` : ''}, after every test passed `
        + `([run](${RUN})). Deploy starts now.`
        + (l.settled.length ? `\n\nConflicts settled by keeping both sides: ${l.settled.map(f => `\`${f}\``).join(', ')}.` : '')
        + (l.renames.length ? `\n\nMigrations renumbered: ${l.renames.map(r => `\`${r.from}\` → \`${r.to}\``).join(', ')}.` : ''))
      // GitHub marks it merged once it sees its commits on main; the branch goes after that.
      for (let i = 0; i < 10; i++) {
        const pr = await api(`/pulls/${l.number}`) as { merged: boolean; head: { sha: string } }
        if (pr.merged && pr.head.sha === l.head) {
          await api(`/git/refs/heads/${l.branch.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' }).catch(() => {})
          break
        }
        if (pr.head.sha !== l.head) break // pushed to since: stays open for the queue's next round
        await new Promise(r => setTimeout(r, 3000))
      }
    }
    // Pushed with the workflow's own token, the push doesn't start Deploy by itself.
    if (!HAS_QUEUE_TOKEN) await dispatch('deploy.yml')
  } else if (process.env.RESULT === 'failure') {
    if (landed.length > 1) {
      for (const l of landed) {
        await say(l.number, `The tests failed on main with ${landed.map(o => `#${o.number}`).join(', ')} together ([run](${RUN})). `
          + 'Each is tried on its own next, to find which one it is.', 'batch-failed', l.head)
      }
      again = true
    } else if (landed.length === 1) {
      await say(landed[0].number, `The tests failed on main with this pull request ([run](${RUN})), so it didn't land. `
        + 'Fix it on the branch and push: the queue tries again with the new commit.', 'failed', landed[0].head)
    }
  }
  if (again) await dispatch('merge-queue.yml')
}

if (process.argv[1]?.endsWith('merge-queue.ts')) {
  const step = process.argv[2]
  if (step === 'prepare') await prepare()
  else if (step === 'finish') await finish()
  else { console.error('usage: merge-queue.ts prepare|finish'); process.exit(2) }
}
