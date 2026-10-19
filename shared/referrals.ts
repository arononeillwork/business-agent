// Referrals: a business shares its link to Business Agent. When a business it referred finishes
// set-up, both get a month free, stacking up to 12 for the referrer, credited on the Stripe bill
// (worker/billing.ts).

/** The most free months one business can bank from referrals. */
export const MAX_FREE_MONTHS = 12

export interface Referral { id: string; business_name: string; joined_at: string; set_up_at: string | null }

export interface ReferralState {
  code: string
  /** Every time the link was opened. */
  opens: number
  referrals: Referral[]
}

export type ReferralStage = 'joined' | 'set_up'
export const stageOf = (r: Referral): ReferralStage => (r.set_up_at ? 'set_up' : 'joined')

/** Free months banked: one per referred business that finished set-up, up to the cap. */
export const freeMonths = (referrals: Referral[]) => Math.min(MAX_FREE_MONTHS, referrals.filter(r => r.set_up_at).length)

/** The link to share (the sign-up page, with the code). */
export const referralLink = (origin: string, code: string) => `${origin}/?ref=${encodeURIComponent(code)}`

/** A code from a link: letters and digits only, upper case (anything else isn't a code). */
export function cleanCode(raw: string | null | undefined) {
  const c = (raw ?? '').trim().toUpperCase()
  return /^[A-Z0-9]{4,16}$/.test(c) ? c : null
}

const DAY = 86_400_000
/** Monday 00:00 UTC of the week a date falls in. */
const weekStart = (t: number) => { const d = new Date(t); const dow = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAY }

export interface ReferralWeek { week: string; joined: number; setUp: number; months: number }

/**
 * Week by week since the first referral (at least `minWeeks`, ending this week): how many
 * businesses had joined and finished set-up by then, and the free months banked (capped).
 */
export function progression(referrals: Referral[], now = Date.now(), minWeeks = 8): ReferralWeek[] {
  const end = weekStart(now)
  const first = Math.min(end - (minWeeks - 1) * 7 * DAY, ...referrals.map(r => weekStart(Date.parse(r.joined_at))))
  const weeks: ReferralWeek[] = []
  for (let w = first; w <= end; w += 7 * DAY) {
    const by = w + 7 * DAY
    const joined = referrals.filter(r => Date.parse(r.joined_at) < by).length
    const setUp = referrals.filter(r => r.set_up_at && Date.parse(r.set_up_at) < by).length
    weeks.push({ week: new Date(w).toISOString().slice(0, 10), joined, setUp, months: Math.min(MAX_FREE_MONTHS, setUp) })
  }
  return weeks
}
