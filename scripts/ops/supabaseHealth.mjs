// What the Supabase watchdog and the Restart Supabase workflow decide, kept apart from their
// network calls so the rules are tested (supabaseHealth.test.ts). See docs/supabase-freezes.md.

/** The Supabase address and publishable key the Worker uses, from wrangler.jsonc (public by design). */
export function supabaseFrom(wrangler) {
  const url = wrangler.match(/"SUPABASE_URL":\s*"([^"]+)"/)?.[1]
  const key = wrangler.match(/"SUPABASE_PUBLISHABLE_KEY":\s*"([^"]+)"/)?.[1]
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY not found in wrangler.jsonc')
  return { url, key }
}

/**
 * One look at the two parts that freeze: sign-in (auth) and the data API (a function call, so it
 * reaches Postgres). Each is null when it answered, or says what went wrong. Only no answer or a
 * server error counts: a 4xx means Supabase is up and answering, so it never leads to a restart.
 */
export async function check({ url, key }, fetchImpl = fetch, timeoutMs = 20_000) {
  const probe = async (path, init = {}) => {
    try {
      const res = await fetchImpl(`${url}${path}`, {
        ...init, headers: { apikey: key, 'content-type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
      })
      return res.status >= 500 ? `answered ${res.status}` : null
    } catch (e) {
      return e?.name === 'TimeoutError' || e?.name === 'AbortError' ? `no answer in ${timeoutMs / 1000}s` : `unreachable (${e?.message ?? e})`
    }
  }
  const [auth, data] = await Promise.all([
    probe('/auth/v1/health'),
    probe('/rest/v1/rpc/current_business_id', { method: 'POST', body: '{}' }),
  ])
  return { ok: !auth && !data, auth, data }
}

/** A Restart Supabase run that's still going, or started within the last half hour: don't start another. */
export function recentRestart(runs, now = Date.now(), withinMs = 30 * 60_000) {
  return runs.find(r => r.status !== 'completed' || now - Date.parse(r.created_at) < withinMs) ?? null
}

/**
 * After a restart: the newest deploy goes again if it's for main as it is now, failed (its database
 * step or its live checks, which a frozen database stops), finished in the last three hours, and
 * hasn't already been tried several times. Otherwise null, and the reason.
 */
export function deployToRerun(run, mainSha, now = Date.now()) {
  if (!run) return { run: null, why: 'no deploy yet' }
  if (run.head_sha !== mainSha) return { run: null, why: `the newest deploy (${run.head_sha.slice(0, 7)}) isn't main's latest commit` }
  if (run.status !== 'completed') return { run: null, why: 'the newest deploy is still going' }
  if (run.conclusion !== 'failure') return { run: null, why: `the newest deploy ${run.conclusion === 'success' ? 'passed' : `ended ${run.conclusion}`}` }
  if (now - Date.parse(run.updated_at) > 3 * 3600_000) return { run: null, why: 'the failed deploy is over three hours old' }
  if (run.run_attempt >= 4) return { run: null, why: 'the failed deploy has been tried four times already' }
  return { run, why: 'it failed in the last three hours, which a frozen database does' }
}
