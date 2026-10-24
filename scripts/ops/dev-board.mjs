// Works out where every feature branch is (in development, waiting to be merged, deploying, or
// live and checked) and saves it as one JSON row, ops.dev_board, in the Supabase project. The
// owner's feature board reads that row through the Supabase connector.
// GitHub Actions: .github/workflows/dev-board.yml. Needs a clone with every branch (fetch-depth 0),
// SUPABASE_ACCESS_TOKEN and GITHUB_TOKEN. DRY_RUN=1 prints the board instead of saving it.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const REF = process.env.SUPABASE_PROJECT_REF ?? 'lhakrmmoxaareykglmtx'
const REPO = process.env.GITHUB_REPOSITORY ?? 'arononeillwork/business-agent'
const LIVE = process.env.LIVE_BRANCH ?? 'claude/easy-beans-architecture-plan-dknqka'
const SITE = process.env.SITE_URL ?? 'https://business-agent.arononeillwork.workers.dev'
const TRUNKS = ['main', LIVE]
const DAY = 86_400_000

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const lines = out => out ? out.split('\n') : []
// False for "not an ancestor" and for a commit this clone doesn't have.
const contains = (tip, sha) => {
  try { execFileSync('git', ['merge-base', '--is-ancestor', sha, tip], { stdio: 'ignore' }); return true } catch { return false }
}
const gh = async path => {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      ...(process.env.GITHUB_TOKEN && { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }),
    },
  })
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}
const commit = sha => {
  const [date, subject, session] = git('show', '-s', '--format=%cI%x00%s%x00%(trailers:key=Claude-Session,valueonly,separator=%x2C)', sha).split('\0')
  return { sha, date: new Date(date).toISOString(), subject, session: session.match(/session_\w+/)?.[0] ?? null }
}
// "Merge the refresh fix into the live branch" → "Refresh fix"
const fromMerge = subject => subject.match(/^Merge (?:the )?(.+?) into the live branch$/)?.[1].replace(/^./, c => c.toUpperCase()) ?? subject

const live = `origin/${LIVE}`
const firstParents = lines(git('rev-list', '--first-parent', '--reverse', live))
const onFirstParent = new Set(firstParents)

// Deploy runs on the live branch, newest first, each with its tests, deploy and live checks.
const groupState = jobs => {
  if (!jobs.length || jobs.every(j => j.status === 'queued' || j.status === 'waiting' || j.status === 'pending')) return 'waiting'
  if (jobs.some(j => j.status !== 'completed')) return 'running'
  if (jobs.some(j => j.conclusion === 'failure' || j.conclusion === 'timed_out')) return 'failed'
  if (jobs.some(j => j.conclusion === 'cancelled')) return 'cancelled'
  if (jobs.every(j => j.conclusion === 'skipped')) return 'skipped'
  return 'passed'
}
const { workflow_runs: deployRuns } = await gh(`/actions/workflows/deploy.yml/runs?branch=${encodeURIComponent(LIVE)}&per_page=20`)
const deploys = await Promise.all(deployRuns.map(async (run, i) => {
  // Jobs only for the newest few; older runs are long finished and their conclusion is enough.
  const jobs = i < 8 ? (await gh(`/actions/runs/${run.id}/jobs?per_page=100`)).jobs : null
  const pick = test => jobs ? groupState(jobs.filter(j => test(j.name))) : null
  const finished = run.status === 'completed'
  return {
    id: run.id, number: run.run_number, attempt: run.run_attempt, url: run.html_url,
    sha: run.head_sha, subject: run.head_commit?.message.split('\n')[0] ?? '',
    createdAt: run.created_at, updatedAt: run.updated_at,
    status: run.status, conclusion: run.conclusion,
    tests: pick(n => n.startsWith('test /')) ?? (finished ? (run.conclusion === 'success' ? 'passed' : 'unknown') : 'running'),
    deploy: pick(n => n === 'deploy') ?? (finished && run.conclusion === 'success' ? 'passed' : 'unknown'),
    live: pick(n => n.startsWith('live /')) ?? (finished && run.conclusion === 'success' ? 'passed' : 'unknown'),
  }
}))

// What the site says it's running is the truth about what's live; the newest deploy that went
// through is the fallback.
const health = await fetch(`${SITE}/api/health`, { signal: AbortSignal.timeout(10_000) }).then(r => r.json()).catch(() => null)
const liveSha = health?.commit && health.commit !== 'dev' ? health.commit : deploys.find(d => d.deploy === 'passed')?.sha ?? null
const liveRun = deploys.find(d => d.sha === liveSha) ?? null
// The daily or hand-started live tests also vouch for whatever was live when they started.
const { workflow_runs: liveTestRuns } = await gh('/actions/workflows/live-e2e.yml/runs?per_page=10').catch(() => ({ workflow_runs: [] }))
const deployedAt = health?.deployed_at ?? liveRun?.updatedAt ?? null
const liveCheckedLater = liveTestRuns.find(r => r.conclusion === 'success' && deployedAt && Date.parse(r.run_started_at) > Date.parse(deployedAt))
const liveVerified = liveRun?.live === 'passed' || !!liveCheckedLater
const oldestRunAt = deploys.at(-1)?.createdAt ?? null

const deployState = (head, mergedAt) => {
  if (liveSha && contains(liveSha, head)) {
    if (liveVerified || deploys.some(d => d.deploy === 'passed' && d.live === 'passed' && contains(d.sha, head))) return 'verified'
    if (oldestRunAt && Date.parse(mergedAt) < Date.parse(oldestRunAt)) return 'verified'
    return liveRun && (liveRun.live === 'running' || liveRun.live === 'waiting') ? 'checking' : 'checks_failed'
  }
  const run = deploys[0]
  if (!run || !contains(run.sha, head)) return 'queued'
  if (run.tests === 'failed') return 'tests_failed'
  if (run.deploy === 'failed') return 'deploy_failed'
  if (run.status === 'completed') return run.deploy === 'passed' ? 'checking' : 'cancelled'
  if (run.tests === 'waiting') return 'queued'
  return run.tests === 'running' ? 'testing' : 'deploying'
}

// CI on each branch's latest commit, and open pull requests.
const { workflow_runs: ciRuns } = await gh('/actions/workflows/ci.yml/runs?per_page=100')
const ciBySha = new Map()
for (const r of ciRuns) if (!ciBySha.has(r.head_sha)) ciBySha.set(r.head_sha, r)
const ciState = r => !r ? 'none' : r.status !== 'completed' ? 'running' : r.conclusion === 'success' ? 'passed' : r.conclusion === 'failure' || r.conclusion === 'timed_out' ? 'failed' : r.conclusion
const pulls = await gh('/pulls?state=open&per_page=100')
const prByBranch = new Map(pulls.filter(p => p.head.repo?.full_name === REPO).map(p => [p.head.ref, p]))

const branches = []
for (const line of lines(git('for-each-ref', 'refs/remotes/origin', '--format=%(refname:lstrip=3)%09%(objectname)'))) {
  const [name, head] = line.split('\t')
  if (!name || name === 'HEAD' || TRUNKS.includes(name)) continue
  const tip = commit(head)
  const b = { name, head, headDate: tip.date, headSubject: tip.subject, session: tip.session, url: `https://github.com/${REPO}/tree/${name}` }

  if (contains(live, head)) {
    // Merged: the first commit on the live branch's own line that includes it is where it came in.
    const after = new Set(lines(git('rev-list', '--ancestry-path', `${head}..${live}`)))
    const at = onFirstParent.has(head) ? head : firstParents.find(c => after.has(c))
    const merge = commit(at)
    b.merged = { sha: at, at: merge.date, subject: merge.subject }
    // What it brought in: its commits that the live branch didn't have just before.
    let own = []
    try { own = lines(git('rev-list', '--reverse', '--no-merges', head, `^${at}^1`)) } catch {}
    b.commits = own.slice(-6).reverse().map(sha => commit(sha).subject)
    b.title = fromMerge(merge.subject) !== merge.subject || !own.length ? fromMerge(merge.subject) : commit(own[0]).subject
    b.deploy = deployState(head, merge.date)
    b.stage = b.deploy === 'verified' ? 'deployed' : 'deploying'
  } else if (contains('origin/main', head)) {
    // Tooling that lives on main (like this board): nothing to deploy.
    const merge = commit(head)
    b.merged = { sha: head, at: merge.date, subject: merge.subject, into: 'main' }
    b.title = merge.subject
    b.deploy = 'not_deployed'
    b.stage = 'deployed'
  } else {
    const own = lines(git('rev-list', '--reverse', '--no-merges', head, `^${live}`, '^origin/main'))
    b.ahead = own.length
    b.commits = own.slice(-6).reverse().map(sha => commit(sha).subject)
    b.title = own.length ? commit(own[0]).subject : tip.subject
    let ci = ciBySha.get(head)
    if (!ci) ci = (await gh(`/actions/workflows/ci.yml/runs?head_sha=${head}&per_page=1`)).workflow_runs[0]
    b.ci = { state: ciState(ci), url: ci?.html_url ?? null }
    const pr = prByBranch.get(name)
    if (pr) b.pr = { number: pr.number, title: pr.title, draft: pr.draft, url: pr.html_url }
    b.stale = Date.now() - Date.parse(tip.date) > 7 * DAY
    b.stage = pr && !pr.draft ? 'review' : 'dev'
  }
  branches.push(b)
}

const board = {
  generatedAt: new Date().toISOString(),
  repo: REPO, liveBranch: LIVE, site: SITE,
  trigger: process.env.GITHUB_EVENT_NAME
    ? { event: process.env.GITHUB_EVENT_NAME, url: `https://github.com/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID}` }
    : { event: 'manual' },
  live: { sha: liveSha, deployedAt, verified: liveVerified, run: liveRun?.url ?? null, subject: liveSha && onFirstParent.has(liveSha) ? commit(liveSha).subject : null },
  deploys: deploys.slice(0, 8),
  branches: branches.sort((a, b) => (b.merged?.at ?? b.headDate).localeCompare(a.merged?.at ?? a.headDate)),
}

const counts = Object.fromEntries(['dev', 'review', 'deploying', 'deployed'].map(s => [s, branches.filter(b => b.stage === s).length]))
console.log(`Board: ${counts.dev} in development, ${counts.review} in review, ${counts.deploying} deploying, ${counts.deployed} deployed. Live: ${liveSha?.slice(0, 7) ?? 'unknown'}${liveVerified ? ' (checked)' : ''}`)
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '| Stage | Branch | Feature |', '|---|---|---|',
    ...branches.filter(b => b.stage !== 'deployed' || Date.now() - Date.parse(b.merged.at) < 7 * DAY)
      .map(b => `| ${b.stage}${b.deploy && b.deploy !== 'verified' ? ` (${b.deploy})` : ''} | \`${b.name}\` | ${b.title.replace(/\|/g, '\\|')} |`),
    '',
  ].join('\n'))
}

if (process.env.DRY_RUN) {
  console.log(JSON.stringify(board, null, 2))
  process.exit(0)
}

const json = JSON.stringify(board)
let tag
do tag = `board_${Math.random().toString(36).slice(2, 10)}`; while (json.includes(`$${tag}$`))
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    query: `create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;
create table if not exists ops.dev_board (id int primary key, data jsonb not null, updated_at timestamptz not null default now());
alter table ops.dev_board enable row level security;
comment on table ops.dev_board is 'Feature board for the owner''s dashboard, written by .github/workflows/dev-board.yml. Not part of the app.';
insert into ops.dev_board (id, data, updated_at) values (1, $${tag}$${json}$${tag}$::jsonb, now())
  on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;`,
  }),
})
if (!res.ok) { console.log(`::error::Saving the board failed: ${res.status} ${await res.text()}`); process.exit(1) }
console.log('Saved to ops.dev_board.')
