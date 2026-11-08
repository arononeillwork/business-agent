// The Business Agent's back-office acts (the Businesses page, HQ's admins only; the hq_actions migration
// and worker/hq.ts).
import { msg } from './i18n.ts'

/** How much longer HQ can make a business's free trial, in days, at a time. */
export const TRIAL_EXTENSIONS = [7, 14, 30] as const
export type TrialExtension = (typeof TRIAL_EXTENSIONS)[number]

export const isTrialExtension = (days: unknown): days is TrialExtension => TRIAL_EXTENSIONS.includes(days as TrialExtension)

/** Billing statuses of a Stripe subscription that is still running (charging, or about to). */
export const RUNNING = ['trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused']

/** Why a business can't be made complimentary now, or null when it can (public.hq_set_complimentary() says the same). */
export function complimentaryBlock(b: { status: string; is_hq?: boolean }): string | null {
  if (b.is_hq) return msg('The Business Agent HQ is complimentary already')
  if (RUNNING.includes(b.status)) return msg('It has a Stripe subscription running. Cancel it in Stripe first, so its card isn’t charged, then make it complimentary.')
  return null
}
