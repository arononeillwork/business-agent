// After Restart Supabase brings the database back (.github/workflows/restart-supabase.yml): a deploy
// of main's latest commit that failed in the last three hours, which is what a frozen database does
// to the deploy's database step and its live checks, has its failed jobs run again.
//   node scripts/ops/rerun-deploy.mjs   (GH_TOKEN and GITHUB_REPOSITORY)
import { appendFileSync, readFileSync } from 'node:fs'
import { check, deployToRerun, supabaseFrom } from './supabaseHealth.mjs'

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
  return res.status === 204 || res.status === 201 ? null : res.json()
}

// Supabase calls itself healthy a little before its data API answers again: wait for both answers.
const supabase = supabaseFrom(readFileSync('wrangler.jsonc', 'utf8'))
for (let i = 0; ; i++) {
  const c = await check(supabase)
  if (c.ok) break
  if (i === 12) { summary(`::warning::Supabase still isn't answering (${c.auth ?? ''} ${c.data ?? ''}), so no deploy is run again.`); process.exit(0) }
  await new Promise(r => setTimeout(r, 15_000))
}

const { sha: mainSha } = await gh('/commits/main')
const { workflow_runs: [latest] } = await gh('/actions/workflows/deploy.yml/runs?branch=main&per_page=1')
const { run, why } = deployToRerun(latest, mainSha)
if (!run) { summary(`No deploy to run again: ${why}.`); process.exit(0) }
await gh(`/actions/runs/${run.id}/rerun-failed-jobs`, { method: 'POST' })
summary(`Deploy ${run.html_url} is running its failed jobs again (${why}).`)
