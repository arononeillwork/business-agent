// Dashboards → Reports: pick reports (takings and breakeven, the team's hours, what's low, waste,
// what was freshly made, the jobs…) for a period, pick who gets them (people on the team, the
// business's contacts, any email address), and send them as one email each from the business's
// connected Gmail or Outlook (worker/reports.ts). The page writes the figures out from what the
// person can see; this is the list of reports, the choice kept in their preferences, the email's
// wording and what's checked before sending.
import { msg } from './i18n'
import { dashRange, type DashPeriod, type DashRange, type WidgetNeeds } from './dashboards'
import { addDays, localDate, weekStart, zonedIso } from './time'

export type ReportKind = 'takings' | 'best_sellers' | 'team' | 'stock' | 'waste' | 'fresh' | 'jobs'

export interface ReportInfo { kind: ReportKind; label: string; hint: string; needs: WidgetNeeds[] }

/** The reports, in the order they go in the email. `needs` as the dashboard widgets' (takings need a till and pay access). */
export const REPORTS: ReportInfo[] = [
  { kind: 'takings', label: msg('Takings and breakeven'), hint: msg('What came in against the period before, and against what it cost to run'), needs: ['sales'] },
  { kind: 'best_sellers', label: msg('Best sellers'), hint: msg('What sold most (Square)'), needs: ['sales'] },
  { kind: 'team', label: msg('Team hours'), hint: msg('Hours worked by each person, from the timecards, and what they cost'), needs: ['admin'] },
  { kind: 'stock', label: msg('Low on stock'), hint: msg('What to order, and from whom'), needs: ['team'] },
  { kind: 'waste', label: msg('Waste'), hint: msg('What was thrown away'), needs: ['team'] },
  { kind: 'fresh', label: msg('Freshly made'), hint: msg('What was made, sold out and thrown away'), needs: ['team'] },
  { kind: 'jobs', label: msg('Jobs to do'), hint: msg('What’s still to do, and what got done'), needs: ['team'] },
]
export const reportInfo = (k: ReportKind) => REPORTS.find(r => r.kind === k)!
const isKind = (k: unknown): k is ReportKind => REPORTS.some(r => r.kind === k)

/** At most this many people per send. */
export const MAX_RECIPIENTS = 20
export const MAX_REPORT_LENGTH = 50_000

/**
 * The periods a report covers: the dashboards' (today so far, this week, this month, the last 30 days) and,
 * for a report sent at the start of the next one, yesterday, last week and last month, whole.
 */
export type ReportPeriod = DashPeriod | 'yesterday' | 'last_week' | 'last_month'
export const REPORT_PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: 'today', label: msg('Today') }, { id: 'yesterday', label: msg('Yesterday') }, { id: 'week', label: msg('This week') },
  { id: 'last_week', label: msg('Last week') }, { id: 'month', label: msg('This month') }, { id: 'last_month', label: msg('Last month') },
  { id: '30', label: msg('Last 30 days') },
]
const isPeriod = (p: unknown): p is ReportPeriod => REPORT_PERIODS.some(x => x.id === p)

/** The dates a period covers on `day`, and the ones it's compared with (the same length before; yesterday: the same day a week before). */
export function reportRange(p: ReportPeriod, day: string): DashRange {
  if (p === 'yesterday') { const d = addDays(day, -1); return { from: d, to: d, prevFrom: addDays(d, -7), prevTo: addDays(d, -7) } }
  if (p === 'last_week') { const m = addDays(weekStart(day), -7); return { from: m, to: addDays(m, 6), prevFrom: addDays(m, -7), prevTo: addDays(m, -1) } }
  if (p === 'last_month') {
    const first = `${addDays(`${day.slice(0, 8)}01`, -1).slice(0, 8)}01`
    const last = addDays(`${day.slice(0, 8)}01`, -1)
    const prevFirst = `${addDays(first, -1).slice(0, 8)}01`
    return { from: first, to: last, prevFrom: prevFirst, prevTo: addDays(first, -1) }
  }
  return dashRange(p, day)
}

/** What the person last sent, kept in their preferences: the reports, the period, and who to (team ids, contact ids, addresses). */
export interface SavedReports { kinds: ReportKind[]; period: ReportPeriod; team: string[]; contacts: string[]; emails: string[] }
export const DEFAULT_REPORTS: SavedReports = { kinds: ['takings', 'stock', 'jobs'], period: 'week', team: [], contacts: [], emails: [] }

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** The saved choice, whatever is in the preferences (an older or hand-edited one falls back to the defaults). */
export function readReports(raw: unknown): SavedReports {
  if (!raw || typeof raw !== 'object') return DEFAULT_REPORTS
  const r = raw as Record<string, unknown>
  const kinds = strings(r.kinds).filter(isKind)
  const period = isPeriod(r.period) ? r.period : DEFAULT_REPORTS.period
  return { kinds: Array.isArray(r.kinds) ? kinds : DEFAULT_REPORTS.kinds, period, team: strings(r.team), contacts: strings(r.contacts),
    emails: strings(r.emails).filter(isEmail) }
}

export const isEmail = (s: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(s)

/** Addresses typed or pasted (with commas, spaces or new lines between them), each once, lower case; and what isn't one. */
export function parseEmails(text: string): { emails: string[]; bad: string[] } {
  const parts = text.split(/[\s,;]+/).map(x => x.trim().replace(/^<|>$/g, '')).filter(Boolean)
  const emails = [...new Set(parts.filter(isEmail).map(x => x.toLowerCase()))]
  return { emails, bad: parts.filter(x => !isEmail(x)) }
}

/** One report's part of the email: its heading and its lines. */
export interface ReportSection { title: string; lines: string[] }

/**
 * The email: "Easy Beans Coffee: this week's report (28 Sep – 4 Oct)", then each report under its heading
 * in capitals, its lines as bullets, and who sent it.
 */
export function reportEmail(o: { business: string; period: string; dates: string; sections: ReportSection[]; from: string; subject: string; heading: string; footer: string }) {
  const body = o.sections.map(s => [s.title.toUpperCase(), ...s.lines.map(l => `• ${l}`)].join('\n')).join('\n\n')
  return { subject: o.subject, text: [o.heading, '', body, '', '—', o.footer].join('\n') }
}

/** What's sent to the Worker. */
export interface ReportSend { to: string[]; subject: string; text: string }
export interface ReportSent { sent: string[]; failed: { to: string; error: string }[] }

/** What stops a report going (null: fine). The Worker checks the same. */
export function reportSendProblem(s: Partial<ReportSend>): string | null {
  const to = Array.isArray(s.to) ? s.to : []
  if (!to.length) return msg('Pick who gets it')
  if (to.length > MAX_RECIPIENTS) return msg('Send it to 20 people at most at a time')
  if (to.some(x => typeof x !== 'string' || !isEmail(x.trim()))) return msg('One of the addresses isn’t an email address')
  if (typeof s.subject !== 'string' || !s.subject.trim() || s.subject.length > 200) return msg('The report needs a subject')
  if (typeof s.text !== 'string' || !s.text.trim()) return msg('Pick at least one report')
  if (s.text.length > MAX_REPORT_LENGTH) return msg('The report is too long to email')
  return null
}

// ---------------------------------------------------------------------------------------------
// Sending on a schedule (the `report_schedules` migration; the Worker sends what's due each minute)
// ---------------------------------------------------------------------------------------------

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly'
export interface ReportSchedule {
  id: string
  /** What it's called on the page: "Monday takings for the owners". */
  name: string
  kinds: ReportKind[]
  period: ReportPeriod
  /** Who gets it: people on the team, the business's contacts (by id, so a changed address is used), any address. */
  team: string[]
  contacts: string[]
  emails: string[]
  /** Every day; on the days of the week picked (1 Monday … 7 Sunday); or on a day of the month (1–28). */
  frequency: ScheduleFrequency
  weekdays: number[]
  month_day: number | null
  /** The business's time it goes at ("08:00"). */
  send_at: string
  /** The language it's written in: whoever set it up's. */
  language: 'en' | 'es'
  active: boolean
  last_sent_at: string | null
  last_error: string | null
  /** When it was last changed by someone (it never sends for a time before that), and by whom: its figures are what they can see. */
  updated_at: string
  updated_by: string | null
}
export type ReportScheduleInput = Omit<ReportSchedule, 'id' | 'last_sent_at' | 'last_error' | 'updated_at' | 'updated_by'> & { id?: string }

export const WEEKDAYS: { day: number; label: string; short: string }[] = [
  { day: 1, label: msg('Monday'), short: msg('Mon') }, { day: 2, label: msg('Tuesday'), short: msg('Tue') }, { day: 3, label: msg('Wednesday'), short: msg('Wed') },
  { day: 4, label: msg('Thursday'), short: msg('Thu') }, { day: 5, label: msg('Friday'), short: msg('Fri') }, { day: 6, label: msg('Saturday'), short: msg('Sat') },
  { day: 7, label: msg('Sunday'), short: msg('Sun') },
]

/** A new schedule: last week's takings, stock and jobs, every Monday at 08:00. */
export const newSchedule = (language: 'en' | 'es' = 'en'): ReportScheduleInput => ({
  name: '', kinds: ['takings', 'stock', 'jobs'], period: 'last_week', team: [], contacts: [], emails: [], frequency: 'weekly', weekdays: [1], month_day: 1,
  send_at: '08:00', language, active: true,
})

/** What stops a schedule being saved (null: fine). The database checks the same. */
export function scheduleProblem(s: Pick<ReportScheduleInput, 'name' | 'kinds' | 'team' | 'contacts' | 'emails' | 'frequency' | 'weekdays' | 'month_day' | 'send_at'>): string | null {
  if (!s.name.trim()) return msg('Give the schedule a name')
  if (s.name.trim().length > 60) return msg('Keep the name under 60 characters')
  if (!s.kinds.length) return msg('Pick at least one report')
  const people = s.team.length + s.contacts.length + s.emails.length
  if (!people) return msg('Pick who gets it')
  if (people > MAX_RECIPIENTS) return msg('Send it to 20 people at most at a time')
  if (s.emails.some(e => !isEmail(e))) return msg('One of the addresses isn’t an email address')
  if (s.frequency === 'weekly' && !s.weekdays.length) return msg('Pick the days it goes')
  if (s.frequency === 'monthly' && !(s.month_day !== null && Number.isInteger(s.month_day) && s.month_day >= 1 && s.month_day <= 28)) return msg('Pick a day of the month from 1 to 28')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.send_at)) return msg('Pick the time it goes')
  return null
}

/** 1 Monday … 7 Sunday. */
const isoWeekday = (date: string) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1

/** Does it go on that date (YYYY-MM-DD)? */
export function sendsOn(s: Pick<ReportSchedule, 'frequency' | 'weekdays' | 'month_day'>, date: string) {
  if (s.frequency === 'daily') return true
  if (s.frequency === 'weekly') return s.weekdays.includes(isoWeekday(date))
  return Number(date.slice(8, 10)) === s.month_day
}

/** At most this late, a send that was missed (the Worker down, say) still goes; later than that, it waits for the next. */
export const LATE_BY_MS = 6 * 3_600_000

/**
 * The time it's due now (ISO), or null: switched on, the latest time it was meant to go at or before now,
 * not sent for that time yet, not set up (or changed) after it, and no more than six hours ago.
 */
export function dueNow(s: Pick<ReportSchedule, 'active' | 'frequency' | 'weekdays' | 'month_day' | 'send_at' | 'last_sent_at' | 'updated_at'>, now: number, tz: string): string | null {
  if (!s.active) return null
  const today = localDate(new Date(now), tz)
  for (let i = 0; i <= 1; i++) {
    const day = addDays(today, -i)
    if (!sendsOn(s, day)) continue
    const at = zonedIso(day, s.send_at, tz)
    const ms = Date.parse(at)
    if (ms > now) continue
    if (now - ms > LATE_BY_MS || ms <= Date.parse(s.updated_at)) return null
    if (s.last_sent_at && Date.parse(s.last_sent_at) >= ms) return null
    return new Date(ms).toISOString()
  }
  return null
}

/** When it goes next (ISO), after now; null: switched off. */
export function nextSend(s: Pick<ReportSchedule, 'active' | 'frequency' | 'weekdays' | 'month_day' | 'send_at'>, now: number, tz: string): string | null {
  if (!s.active) return null
  const today = localDate(new Date(now), tz)
  for (let i = 0; i <= 62; i++) {
    const day = addDays(today, i)
    if (!sendsOn(s, day)) continue
    const at = zonedIso(day, s.send_at, tz)
    if (Date.parse(at) > now) return new Date(Date.parse(at)).toISOString()
  }
  return null
}
