// The demo's back-office acts and an owner's own data and account, as the hq_actions and close_account
// migrations and worker/hq.ts, worker/account.ts have them.
// - HQ (?hq): a few businesses on the service to make complimentary, end it, or give a longer trial; one
//   whose owner asked to close it. The café (no ?hq) isn't HQ: nothing to list, and the acts are refused.
// - Owners: the export is made here, from the demo's own data, into the same zip of CSV files; closing the
//   account stops the plan renewing, and keeping it starts it again.
import type { Api, BillingInfo, HqBusiness, HqClosure } from './api'
import type { Business, Profile, Shift } from '../../shared/types'
import { closesAt, canStillKeep } from '../../shared/accountClosing'
import { complimentaryBlock, isTrialExtension } from '../../shared/hqActions'
import { exportFileName, exportReadme, toCsvFile, zipFiles } from '../../shared/dataExport'

interface Who {
  /** The sample business is The Business Agent HQ (?hq), and an admin of it is signed in. */
  hqAdmin: () => boolean
  isOwner: () => boolean
  me: () => string | null
  business: Business
  billing: BillingInfo
  team: () => Profile[]
  shifts: () => Shift[]
  timecards: () => Record<string, unknown>[]
  daysAgo: (d: number) => string
}

type BackOfficeApi = Pick<Api, 'hqBusinesses' | 'hqSetComplimentary' | 'hqEndComplimentary' | 'hqExtendTrial' | 'hqClosures'
  | 'exportData' | 'closeAccount' | 'keepAccount'>

export function demoBackOfficeApi(w: Who): BackOfficeApi {
  const day = 86_400_000
  const row = (b: Partial<HqBusiness> & Pick<HqBusiness, 'id' | 'name'>): HqBusiness => ({
    created_at: w.daysAgo(30), is_hq: false, plan: 'free', status: 'none', billing_interval: null, trial_ends_at: null, complimentary: null,
    people: 1, set_up_at: null, last_sign_in: null, ...b })
  const list: HqBusiness[] = [
    row({ id: 14, name: 'Peluquería Sol', created_at: w.daysAgo(12), plan: 'business', status: 'trialing', billing_interval: 'month',
      trial_ends_at: new Date(Date.now() + 48 * day).toISOString(), people: 4, set_up_at: w.daysAgo(11), last_sign_in: w.daysAgo(1) }),
    row({ id: 13, name: 'La Taberna de Juan', created_at: w.daysAgo(40), people: 2, set_up_at: w.daysAgo(39), last_sign_in: w.daysAgo(6) }),
    row({ id: 11, name: 'Bar Bea', created_at: w.daysAgo(6), people: 2, set_up_at: w.daysAgo(4), last_sign_in: w.daysAgo(2) }),
    row({ id: 9, name: 'Café Lola', created_at: w.daysAgo(85), plan: 'pro', status: 'active', billing_interval: 'month', people: 6,
      set_up_at: w.daysAgo(80), last_sign_in: w.daysAgo(0) }),
    row({ id: 1, name: w.business.name, created_at: w.daysAgo(400), is_hq: true, plan: 'business', status: 'comped', complimentary: 'founder',
      people: 3, set_up_at: w.daysAgo(399), last_sign_in: w.daysAgo(0) }),
  ]
  const closures: HqClosure[] = [{ id: 13, closing_requested_at: w.daysAgo(5), closes_at: closesAt(w.daysAgo(5)), requested_by: 'Juan Pérez' }]
  const needHq = () => { if (!w.hqAdmin()) throw new Error('Only The Business Agent HQ’s admins can do that') }
  const find = (id: number) => {
    const b = list.find(x => x.id === id)
    if (!b) throw new Error('No such business')
    return b
  }
  const needOwner = () => { if (!w.isOwner()) throw new Error('Only an owner can do that') }
  /** Whether closing stopped the plan renewing (so keeping the account starts it again). */
  let stoppedRenewal = false

  return {
    async hqBusinesses() { return w.hqAdmin() ? list.map(b => ({ ...b })) : [] },
    async hqClosures() { return w.hqAdmin() ? closures.map(c => ({ ...c })) : [] },
    async hqSetComplimentary(id, kind, note) {
      needHq()
      const b = find(id)
      const why = complimentaryBlock(b)
      if (why) throw new Error(why)
      if (!note.trim()) throw new Error('Add a note saying who it’s for')
      Object.assign(b, { plan: 'business', status: 'comped', complimentary: kind, billing_interval: null, trial_ends_at: null })
    },
    async hqEndComplimentary(id) {
      needHq()
      const b = find(id)
      if (b.is_hq) throw new Error('The Business Agent HQ stays complimentary')
      if (b.status !== 'comped') throw new Error('It isn’t complimentary')
      Object.assign(b, { plan: 'free', status: 'none', complimentary: null })
    },
    async hqExtendTrial(id, days) {
      needHq()
      if (!isTrialExtension(days)) throw new Error('A trial can be extended by 7, 14 or 30 days')
      const b = find(id)
      if (b.status !== 'trialing' || !b.trial_ends_at) throw new Error('It isn’t on a free trial')
      b.trial_ends_at = new Date(Math.max(Date.parse(b.trial_ends_at), Date.now()) + days * day).toISOString()
      return b.trial_ends_at
    },

    async exportData() {
      needOwner()
      const now = new Date()
      const tables: [string, readonly string[], Record<string, unknown>[]][] = [
        ['business', Object.keys(w.business), [w.business as unknown as Record<string, unknown>]],
        ['profiles', ['id', 'full_name', 'email', 'role', 'can_see_pay', 'active', 'phone', 'colour'], w.team().map(p => ({ ...p }))],
        ['shifts', ['id', 'profile_id', 'position_id', 'starts_at', 'ends_at', 'break_minutes', 'note', 'status'], w.shifts().map(s => ({ ...s }))],
        ['time_entries', ['id', 'profile_id', 'position_id', 'shift_id', 'clock_in', 'clock_out', 'source', 'flags', 'note', 'approved_at'], w.timecards()],
        ['billing', ['plan', 'status', 'interval', 'trial_ends_at', 'current_period_end', 'complimentary'], [{ ...w.billing }]],
      ]
      const enc = new TextEncoder()
      const used = tables.filter(([, , rows]) => rows.length)
      const zip = await zipFiles([
        { name: 'README.txt', data: enc.encode(exportReadme(w.business.name, now, used.map(([name, , rows]) => ({ name, rows: rows.length })))) },
        ...used.map(([name, columns, rows]) => ({ name: `${name}.csv`, data: enc.encode(toCsvFile(columns, rows)) })),
      ], now)
      return { filename: exportFileName(w.business.name, now), blob: new Blob([zip as BlobPart], { type: 'application/zip' }) }
    },
    async closeAccount() {
      needOwner()
      if (w.business.is_hq) throw new Error('The Business Agent HQ can\'t be closed from the app')
      if (!w.business.closing_requested_at) {
        Object.assign(w.business, { closing_requested_at: new Date().toISOString(), closing_requested_by: w.me() })
        stoppedRenewal = w.billing.has_customer && ['active', 'trialing'].includes(w.billing.status) && !w.billing.cancel_at_period_end
        if (stoppedRenewal) w.billing.cancel_at_period_end = true
      }
      return closesAt(w.business.closing_requested_at!)
    },
    async keepAccount() {
      needOwner()
      const asked = w.business.closing_requested_at
      if (asked && !canStillKeep(asked)) throw new Error('The account has closed. Write to support@businesssagent.com about it.')
      Object.assign(w.business, { closing_requested_at: null, closing_requested_by: null })
      if (stoppedRenewal) w.billing.cancel_at_period_end = false
      stoppedRenewal = false
      return { renewalFailed: false }
    },
  }
}
