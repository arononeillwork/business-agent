// Every five minutes (.github/workflows/supabase-watchdog.yml): does Supabase answer? Its server
// sometimes freezes: sign-ins and the data API hang, and stay hung until the project is restarted
// (docs/supabase-freezes.md). When sign-in or the data API goes unanswered for five minutes in a
// row, this starts the Restart Supabase workflow, unless one started in the last half hour, and
// fails, so GitHub emails the owner. A stall that passes by itself within those minutes is left alone.
//   node scripts/ops/supabase-watchdog.mjs   (GH_TOKEN and GITHUB_REPOSITORY; WATCHDOG_MINUTES, default 5)
import { appendFileSync, readFileSync } from 'node:fs'
import { check, recentRestart, supabaseFrom } from './supabaseHealth.mjs'

const MINUTES = Number(process.env.WATCHDOG_MINUTES ?? 5)
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
const what = c => [c.auth && `sign-in ${c.auth}`, c.data && `data API ${c.data}`].filter(Boolean).join('; ')

const supabase = supabaseFrom(readFileSync('wrangler.jsonc', 'utf8'))
let last = await check(supabase)
if (last.ok) { console.log('Supabase answers.'); process.exit(0) }

// No answer: look again every minute. One good answer means it was a stall that passed.
console.log(`Supabase didn't answer (${what(last)}); looking again every minute for ${MINUTES} minutes.`)
for (let minute = 1; minute <= MINUTES; minute++) {
  await new Promise(r => setTimeout(r, 60_000))
  last = await check(supabase)
  if (last.ok) {
    summary(`Supabase stalled for about ${minute} minute${minute === 1 ? '' : 's'}, then answered again: left alone.`)
    process.exit(0)
  }
  console.log(`…still no answer after ${minute} minute${minute === 1 ? '' : 's'} (${what(last)})`)
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
