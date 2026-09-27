// Refreshes the TheSportsDB competitions (boxing, friendlies, cups, La Liga 2) from GitHub's
// servers. TheSportsDB's free key often refuses Cloudflare's shared addresses (429), so the
// Worker can't always reach it; GitHub's runners can. Same parser and storage as the Worker.
// Env: SUPABASE_SERVICE_ROLE_KEY (from service-key.mjs). Run: npx tsx scripts/ops/sports-sync.ts
import { createClient } from '@supabase/supabase-js'
import { refreshCompetition } from '../../worker/sports'
import type { SportsCompetition } from '../../shared/sports'

const url = process.env.SUPABASE_URL ?? 'https://lhakrmmoxaareykglmtx.supabase.co'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) { console.log('No service key; skipping the sports sync.'); process.exit(0) }
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const { data, error } = await db.from('sports_competitions').select('*').eq('followed', true).eq('source', 'thesportsdb').order('sort')
if (error) throw new Error(error.message)
let failed = 0
for (const c of (data ?? []) as SportsCompetition[]) {
  try {
    console.log(`${c.name}: ${await refreshCompetition(db, c)} events`)
  } catch (e) {
    failed++
    console.log(`${c.name}: failed (${e instanceof Error ? e.message : String(e)})`)
  }
}
console.log(`Sports sync done: ${(data ?? []).length - failed} of ${(data ?? []).length} competitions updated.`)
