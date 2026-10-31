// Applies the migrations in supabase/migrations that the live database doesn't have yet, oldest
// first, before the deploy puts out the Worker that needs them. Production records each migration
// by name (its version is the time it was applied), so files are matched by the name after the
// number: one the merge queue renumbered isn't run twice. Needs SUPABASE_ACCESS_TOKEN.
// A migration too big for one request (one carrying a file) has its file staged in parts first
// (scripts/ops/bigMigration.mjs).
//   node scripts/ops/migrate.mjs [--dry-run]
import { readdirSync, readFileSync } from 'node:fs'
import { STAGING_SETUP, clearSql, partSql, stageLongLiterals } from './bigMigration.mjs'

const REF = process.env.SUPABASE_PROJECT_REF ?? 'lhakrmmoxaareykglmtx'
// More than this many at once means the database and the files don't line up: stop, don't guess.
const MAX = Number(process.env.MIGRATE_MAX ?? 15)
const dryRun = process.argv.includes('--dry-run')
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) { console.log('::error::SUPABASE_ACCESS_TOKEN is not set'); process.exit(1) }
const api = (path, init = {}) => fetch(`https://api.supabase.com/v1/projects/${REF}/database${path}`, {
  ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
})

const res = await api('/migrations')
if (!res.ok) { console.log(`::error::Couldn't read the database's migrations: ${res.status} ${await res.text()}`); process.exit(1) }
const body = await res.json()
const applied = new Set((Array.isArray(body) ? body : body.migrations ?? []).map(m => m.name))
const dir = 'supabase/migrations'
const files = readdirSync(dir).filter(f => /^\d{14}_.+\.sql$/.test(f)).sort()
const pending = files.filter(f => !applied.has(f.slice(15, -4)))

if (!applied.size && files.length) {
  console.log('::error::The database lists no migrations at all; not applying every file to it.'); process.exit(1)
}
if (pending.length > MAX) {
  console.log(`::error::${pending.length} migrations look new, which means the database and supabase/migrations don't line up `
    + `(first: ${pending[0]}). Check by hand; MIGRATE_MAX raises the limit.`)
  process.exit(1)
}
if (!pending.length) { console.log('Database migrations: none new.'); process.exit(0) }

/** Runs SQL that isn't a migration (staging a big one's parts); stops the deploy if it fails. */
async function run(f, what, query) {
  const r = await api('/query', { method: 'POST', body: JSON.stringify({ query }) })
  if (!r.ok) { console.log(`::error::${f}: ${what} failed, so nothing was deployed: ${r.status} ${await r.text()}`); process.exit(1) }
}

for (const f of pending) {
  const name = f.slice(15, -4)
  const { sql, parts } = stageLongLiterals(f, readFileSync(`${dir}/${f}`, 'utf8'))
  if (dryRun) { console.log(`Would apply ${f}${parts.length ? ` (its file sent first, in ${parts.length} parts)` : ''}`); continue }
  if (parts.length) {
    await run(f, 'getting ready to stage its file', `${STAGING_SETUP}\n${clearSql(f)}`)
    for (const p of parts) await run(f, `staging part ${p.part + 1} of its file`, partSql(p))
  }
  const r = await api('/migrations', { method: 'POST', body: JSON.stringify({ name, query: sql }) })
  if (!r.ok) { console.log(`::error::${f} failed, so nothing was deployed: ${r.status} ${await r.text()}`); process.exit(1) }
  if (parts.length) await run(f, 'clearing its staged file', clearSql(f))
  console.log(`Applied ${f}${parts.length ? ` (its file sent first, in ${parts.length} parts)` : ''}`)
}
console.log(`Database migrations: ${pending.length} ${dryRun ? 'would be applied' : 'applied'}.`)
