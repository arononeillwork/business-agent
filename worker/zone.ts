// The business's own time zone for what the Worker does for it. The Worker serves every business at once,
// so it never sets one for itself (shared/time.ts's TZ stays Madrid's): an AI tool's run (worker/tools.ts
// runTool) and each business's turn in the scheduled jobs (worker/index.ts) happen inside its business's
// time zone instead, for that request only, and the dates and times they read and write are that business's
// (Dublin's for a business in Ireland), whatever else runs alongside. Routes that work out a day or a
// range for one business read its zone with zoneOf and pass it on.
import { AsyncLocalStorage } from 'node:async_hooks'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isTimeZone, zoneFromRequest } from '../shared/time'

const zone = new AsyncLocalStorage<string>()
zoneFromRequest(() => zone.getStore())

/** Run `f` in that time zone (an unknown one leaves the Worker's own). */
export const inTimeZone = <T>(tz: string | null | undefined, f: () => T): T => (isTimeZone(tz) ? zone.run(tz, f) : f())

/**
 * The business's time zone, as `db` reads it (a business's own client: businessDb, requestDb, or someone's
 * signed-in one); undefined when it can't be read, and the Worker's own is used.
 */
export async function zoneOf(db: SupabaseClient): Promise<string | undefined> {
  try {
    const { data } = await db.from('business').select('timezone').maybeSingle()
    const tz = (data as { timezone?: string | null } | null)?.timezone
    return isTimeZone(tz) ? tz : undefined
  } catch {
    return undefined
  }
}
