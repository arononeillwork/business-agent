// Outside services' answers, kept a while in provider_cache (migration 63) so opening a page, coming
// back to it or a second person looking doesn't ask Square, Google or Meta again each time. How long
// each is kept is in shared/refresh.ts. Only answers are kept, never failures.
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The answer kept under `key` if it's under `minutes` old (or as long as `minutes(kept)` says, when
 * that depends on the answer), else `read()` asked again and kept. `fetched_at` is when the service
 * was last asked, for the pages' "Updated 5 min ago".
 */
export async function cached<T>(db: SupabaseClient, key: string, minutes: number | ((kept: T) => number | Promise<number>), read: () => Promise<T>):
  Promise<{ data: T; fetched_at: string }> {
  const { data: kept } = await db.from('provider_cache').select('data, fetched_at').eq('key', key).maybeSingle()
  if (kept) {
    const keep = typeof minutes === 'number' ? minutes : await minutes(kept.data as T)
    if (Date.now() - Date.parse(kept.fetched_at as string) < keep * 60_000) return { data: kept.data as T, fetched_at: kept.fetched_at as string }
  }
  const data = await read()
  const fetched_at = new Date().toISOString()
  // Not keeping it only means asking again next time.
  await db.from('provider_cache').upsert({ key, data, fetched_at }, { onConflict: 'business_id,key' })
  return { data, fetched_at }
}

/** Forget what's kept under keys starting with `prefix`, after a change made here (a campaign paused, points given). */
export async function forget(db: SupabaseClient, prefix: string) {
  await db.from('provider_cache').delete().like('key', `${prefix.replace(/[\\%_]/g, c => `\\${c}`)}%`)
}

/** The oldest of several `fetched_at`s: how up to date a page built from them is. */
export const oldest = (times: string[]) => (times.length ? times.reduce((a, b) => (a < b ? a : b)) : undefined)

/** Clear answers kept over two days (every night). */
export async function clearOldCache(db: SupabaseClient) {
  await db.from('provider_cache').delete().lt('fetched_at', new Date(Date.now() - 2 * 86_400_000).toISOString())
}
