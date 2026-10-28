// Refreshes the TheSportsDB competitions (boxing, friendlies, cups, La Liga 2) from GitHub's
// servers. TheSportsDB's free key often refuses Cloudflare's shared addresses (429), so the
// Worker can't always reach it; GitHub's runners can. Same parser and storage as the Worker.
// Env: SUPABASE_SERVICE_ROLE_KEY (from service-key.mjs). Run: npx tsx scripts/ops/sports-sync.ts
import { businessDb, businessIds, type Env } from '../../worker/supabase'
import { configureTheSportsDb, refreshCompetition, sportsEnabled, syncCrests } from '../../worker/sports'
import type { SportsCompetition } from '../../shared/sports'

const url = process.env.SUPABASE_URL ?? 'https://lhakrmmoxaareykglmtx.supabase.co'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) { console.log('No service key; skipping the sports sync.'); process.exit(0) }
// TheSportsDB's shared free key refuses quick callers, so go slowly and wait out refusals.
configureTheSportsDb({ gapMs: 6000, retries: 4, backoffMs: 20_000 })
const env = { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } as Env

// Each business that has Sports switched on, with its own competitions.
for (const id of await businessIds(env)) {
  const db = businessDb(env, id)
  if (!await sportsEnabled(db)) { console.log(`Business ${id}: Sports is switched off on the Sports page; skipped.`); continue }

  const { data, error } = await db.from('sports_competitions').select('*').eq('followed', true).eq('source', 'thesportsdb').order('sort')
  if (error) throw new Error(error.message)
  let failed = 0
  for (const c of (data ?? []) as SportsCompetition[]) {
    try {
      console.log(`Business ${id}, ${c.name}: ${await refreshCompetition(db, c)} events`)
    } catch (e) {
      failed++
      console.log(`Business ${id}, ${c.name}: failed (${e instanceof Error ? e.message : String(e)})`)
    }
  }
  console.log(`Business ${id}: sports sync done, ${(data ?? []).length - failed} of ${(data ?? []).length} competitions updated.`)

  // Crests for teams whose fixtures came without one (national flags, then TheSportsDB).
  try {
    const crests = await syncCrests(db, 120) // GitHub has time: about 6 s a search, well inside the job limit
    console.log(`Business ${id}, team crests: ${crests.found} found, ${crests.missing} still missing (${crests.searched} name searches).`)
  } catch (e) {
    console.log(`Business ${id}, team crests: failed (${e instanceof Error ? e.message : String(e)})`)
  }
}
