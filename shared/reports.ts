// Dashboards → Reports: pick reports (takings and breakeven, the team's hours, what's low, waste,
// what was freshly made, the jobs…) for a period, pick who gets them (people on the team, the
// business's contacts, any email address), and send them as one email each from the business's
// connected Gmail or Outlook (worker/reports.ts). The page writes the figures out from what the
// person can see; this is the list of reports, the choice kept in their preferences, the email's
// wording and what's checked before sending.
import { msg } from './i18n'
import { DASH_PERIODS, type DashPeriod, type WidgetNeeds } from './dashboards'

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

/** What the person last sent, kept in their preferences: the reports, the period, and who to (team ids, contact ids, addresses). */
export interface SavedReports { kinds: ReportKind[]; period: DashPeriod; team: string[]; contacts: string[]; emails: string[] }
export const DEFAULT_REPORTS: SavedReports = { kinds: ['takings', 'stock', 'jobs'], period: 'week', team: [], contacts: [], emails: [] }

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** The saved choice, whatever is in the preferences (an older or hand-edited one falls back to the defaults). */
export function readReports(raw: unknown): SavedReports {
  if (!raw || typeof raw !== 'object') return DEFAULT_REPORTS
  const r = raw as Record<string, unknown>
  const kinds = strings(r.kinds).filter(isKind)
  const period = DASH_PERIODS.some(p => p.id === r.period) ? r.period as DashPeriod : DEFAULT_REPORTS.period
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
