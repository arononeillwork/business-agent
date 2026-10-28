// Another business's referral code, kept from its link (/?ref=CODE, the landing page) until the new
// business is created (NewBusinessPage), which makes it that business's referral.
import { cleanCode } from '../../shared/referrals'

const KEY = 'ba-referral'

export function keepReferral(code: string) {
  try { localStorage.setItem(KEY, code) } catch { /* storage unavailable: no referral */ }
}

export function keptReferral() {
  try { return cleanCode(localStorage.getItem(KEY)) } catch { return null }
}

export function forgetReferral() {
  try { localStorage.removeItem(KEY) } catch { /* storage unavailable */ }
}
