// Days a business is closed besides its weekly hours: closures on its Calendar ("Closed for
// Christmas"), and the public holidays when it closes on them (Opening hours → closed on public
// holidays). Google Maps is sent these (worker/providers/google.ts) and the business's website reads
// them (shared/websiteDetails.ts), so both say the same.
import type { CalendarEvent } from './types'

/** A business event on the Calendar that closes it, by its title. */
export const CLOSURE_TITLE = /closed|cerrad|closure/i

/** The confirmed events from `fromDate` on that close the business. */
export function closingEvents(events: CalendarEvent[], fromDate: string, closedOnHolidays: boolean): CalendarEvent[] {
  return events.filter(e => e.confirmed && (e.ends_on ?? e.starts_on) >= fromDate &&
    (e.category === 'business' ? CLOSURE_TITLE.test(e.title)
      : closedOnHolidays && ['national', 'regional', 'local'].includes(e.category)))
}
