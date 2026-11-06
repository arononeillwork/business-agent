// Always watching (.github/workflows/supabase-watchdog.yml): does Supabase answer? Its server
// sometimes freezes: sign-ins and the data API hang, and stay hung until the project is restarted
// (docs/supabase-freezes.md). Each run looks once a minute for WATCH_MINUTES, then the workflow starts
// the next run. When sign-in or the data API goes unanswered for five minutes in a row, this starts the
// Restart Supabase workflow, unless one started in the last half hour, and fails, so GitHub emails the
// owner. A stall that passes by itself within those minutes is noted and left alone.
//   node scripts/ops/supabase-watchdog.mjs   (GH_TOKEN and GITHUB_REPOSITORY; WATCHDOG_MINUTES, default 5;
//   WATCH_MINUTES, default 0: one look)
import { appendFileSync, readFileSync } from 'node:fs'
import { check, recentRestart, supabaseFrom, watch, whatFailed as what } from './supabaseHealth.mjs'

const MINUTES = Number(process.env.WATCHDOG_MINUTES ?? 5)
const WATCH = Number(process.env.WATCH_MINUTES ?? 0)
const REPO = process.env.GITHUB_REPOSITORY
const summary = line => {
  console.log(line)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`)
}
const gh = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init, headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub ${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

const supabase = supabaseFrom(readFileSync('wrangler.jsonc', 'utf8'))
const { frozen, last, stalls } = await watch({
  look: () => check(supabase), wait: ms => new Promise(r => setTimeout(r, ms)), minutes: WATCH, confirm: MINUTES, note: console.log,
})
for (const minutes of stalls) summary(`Supabase stalled for about ${minutes} minute${minutes === 1 ? '' : 's'}, then answered again: left alone.`)
if (!frozen) {
  console.log(!WATCH ? 'Supabase answers.' : `Watched Supabase for ${WATCH} minutes${stalls.length ? '' : ': it answered every time'}.`)
  process.exit(0)
}

const { workflow_runs: restarts } = await gh('/actions/workflows/restart-supabase.yml/runs?per_page=5')
const recent = recentRestart(restarts)
if (recent) {
  summary(`::error::Supabase hasn't answered for ${MINUTES} minutes (${what(last)}), and a restart already started at `
    + `${recent.created_at} (${recent.html_url}), so this one doesn't start another. Check the Supabase dashboard.`)
  process.exit(1)
}
await gh('/actions/workflows/restart-supabase.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) })
summary(`::error::Supabase stopped answering for ${MINUTES} minutes (${what(last)}), so the Restart Supabase workflow `
  + `has started. It brings the database back and re-runs a deploy the freeze stopped.`)
process.exit(1)
