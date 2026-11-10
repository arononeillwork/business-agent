// The business's own time zone for what the Worker does for it. The Worker serves every business at once,
// so it never sets one for itself (shared/time.ts's TZ stays Madrid's): an AI tool's run (worker/tools.ts
// runTool) happens inside its business's time zone instead, for that request only, and the dates and times
// it reads and writes are that business's (Dublin's for a business in Ireland), whatever else runs alongside.
import { AsyncLocalStorage } from 'node:async_hooks'
import { isTimeZone, zoneFromRequest } from '../shared/time'

const zone = new AsyncLocalStorage<string>()
zoneFromRequest(() => zone.getStore())

/** Run `f` in that time zone (an unknown one leaves the Worker's own). */
export const inTimeZone = <T>(tz: string | null | undefined, f: () => T): T => (isTimeZone(tz) ? zone.run(tz, f) : f())
