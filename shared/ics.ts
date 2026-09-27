// iCalendar (RFC 5545) feeds: people subscribe once in Google / Apple / Outlook calendar and
// their shifts, time off and closures stay up to date there (the calendar app re-reads the URL).

export type IcsEvent =
  | { uid: string; title: string; start: string; end: string; location?: string; description?: string }   // timed, ISO UTC
  | { uid: string; title: string; day: string; lastDay?: string; description?: string }                   // all-day, YYYY-MM-DD

/** Text value escaping: backslash, semicolon, comma and newlines. */
export const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Lines longer than 75 octets are folded with CRLF + space (UTF-8 safe: never split a character). */
export function icsFold(line: string) {
  const bytes = new TextEncoder()
  if (bytes.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74 // continuation lines start with a space
    if (bytes.encode(cur + ch).length > limit) { out.push(cur); cur = '' }
    cur += ch
  }
  out.push(cur)
  return out.join('\r\n ')
}

const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d+/, '').replace(/Z?$/, 'Z')
const dayOf = (d: string) => d.replace(/-/g, '')
const nextDay = (d: string) => {
  const t = new Date(`${d}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + 1)
  return t.toISOString().slice(0, 10)
}

export function buildIcs(name: string, events: IcsEvent[], now = new Date().toISOString()) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Business Agent//Team app//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(name)}`, 'X-WR-TIMEZONE:Europe/Madrid', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ]
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp(now)}`)
    if ('start' in e) lines.push(`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`)
    else lines.push(`DTSTART;VALUE=DATE:${dayOf(e.day)}`, `DTEND;VALUE=DATE:${dayOf(nextDay(e.lastDay ?? e.day))}`, 'TRANSP:TRANSPARENT')
    lines.push(`SUMMARY:${icsEscape(e.title)}`)
    if ('location' in e && e.location) lines.push(`LOCATION:${icsEscape(e.location)}`)
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(icsFold).join('\r\n') + '\r\n'
}
