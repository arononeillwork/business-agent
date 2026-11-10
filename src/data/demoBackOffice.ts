// The demo's back-office acts and an owner's own data and account, as the hq_actions and close_account
// migrations and worker/hq.ts, worker/account.ts have them.
// - HQ (?hq): a few businesses on the service to make complimentary, end it, or give a longer trial; one
//   whose owner asked to close it. The café (no ?hq) isn't HQ: nothing to list, and the acts are refused.
// - Owners: the export is made here, from the demo's own data, into the same zip of CSV files; closing the
//   account stops the plan renewing, and keeping it starts it again.
// - HQ's errors (the app_errors migration): a few the app, the Worker and a scheduled job ran into.
import type { Api, BillingInfo, HqBusiness, HqClosure } from './api'
import type { HqError } from './api'
import type { Business, Profile, Shift } from '../../shared/types'
import { closesAt, canStillKeep } from '../../shared/accountClosing'
import { complimentaryBlock, isTrialExtension } from '../../shared/hqActions'
import type { HqFunnelRow } from '../../shared/hqFunnel'
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

type BackOfficeApi = Pick<Api, 'hqBusinesses' | 'hqSetComplimentary' | 'hqEndComplimentary' | 'hqExtendTrial' | 'hqClosures' | 'hqFunnel'
  | 'exportData' | 'closeAccount' | 'keepAccount'>
  & Pick<Api, 'hqErrors'>

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
    // Two that left, for the funnel's cancellations by month.
    row({ id: 7, name: 'Panadería Rosa', created_at: w.daysAgo(160), plan: 'starter', status: 'canceled', billing_interval: 'month', people: 3,
      set_up_at: w.daysAgo(158), last_sign_in: w.daysAgo(66) }),
    row({ id: 5, name: 'Bar El Puerto', created_at: w.daysAgo(260), plan: 'pro', status: 'canceled', billing_interval: 'month', people: 5,
      set_up_at: w.daysAgo(255), last_sign_in: w.daysAgo(121) }),
    row({ id: 1, name: w.business.name, created_at: w.daysAgo(400), is_hq: true, plan: 'business', status: 'comped', complimentary: 'founder',
      people: 3, set_up_at: w.daysAgo(399), last_sign_in: w.daysAgo(0) }),
  ]
  // The funnel (the hq_funnel migration): whether someone in each did something in its second week (null:
  // younger than two weeks), and when the two that left cancelled their subscriptions.
  const weekTwo: Record<number, boolean> = { 13: false, 9: true, 1: true, 7: true, 5: true }
  const ended: Record<number, string> = { 7: w.daysAgo(65), 5: w.daysAgo(120) }
  const closures: HqClosure[] = [{ id: 13, closing_requested_at: w.daysAgo(5), closes_at: closesAt(w.daysAgo(5)), requested_by: 'Juan Pérez' }]
  const needHq = () => { if (!w.hqAdmin()) throw new Error('Only The Business Agent HQ’s admins can do that') }
  // What went wrong lately: on a phone at Café Lola, in the Worker, and in the minute job for Peluquería Sol.
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
  const errors: HqError[] = [
    { fingerprint: '6f1c0a9e2b7d4c3e8a5f1b0d9c7e6a21', source: 'app', message: 'Cannot read properties of undefined (reading \'starts_at\')', times: 3,
      first_seen: hoursAgo(30), last_seen: hoursAgo(2), last_path: '/rota', business_id: 9,
      last_stack: 'TypeError: Cannot read properties of undefined (reading \'starts_at\')\n    at WeekRow (https://businesssagent.com/assets/RotaPage-C81kq2Lm-r2.js:1:20412)\n    at renderWithHooks (https://businesssagent.com/assets/index-Bf3x9QaL-r2.js:8:41233)',
      last_detail: { kind: 'render', build: 'index-Bf3x9QaL-r2', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1', version: 'a1b2c3d' } },
    { fingerprint: '0d4e7b19c2a64f58b3e9a7c1d5f2e830', source: 'cron: outbox', message: 'Instagram answered 500: An unexpected error has occurred. Please retry your request later.', times: 12,
      first_seen: hoursAgo(9), last_seen: hoursAgo(5), last_path: null, business_id: 14,
      last_stack: 'Error: Instagram answered 500: An unexpected error has occurred. Please retry your request later.\n    at publish (worker/providers/instagram.ts:212:11)',
      last_detail: { version: 'a1b2c3d' } },
    { fingerprint: '9a3b5c7d1e2f40618293a4b5c6d7e8f9', source: 'worker POST /api/hq/businesses/:id/extend-trial', message: 'Stripe didn’t answer in time', times: 1,
      first_seen: hoursAgo(50), last_seen: hoursAgo(50), last_path: '/api/hq/businesses/14/extend-trial', business_id: 1, last_stack: null,
      last_detail: { method: 'POST', route: '/api/hq/businesses/:id/extend-trial', version: '9f8e7d6' } },
  ]
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
    async hqErrors() { return w.hqAdmin() ? errors.map(e => ({ ...e, last_detail: { ...e.last_detail } })) : [] },
    async hqFunnel(): Promise<HqFunnelRow[]> {
      if (!w.hqAdmin()) return []
      return list.map(b => {
        const asked = closures.find(c => c.id === b.id)?.closing_requested_at
        const at = [b.status === 'canceled' ? ended[b.id] : undefined, asked].filter((d): d is string => !!d).sort()[0] ?? null
        const old = Date.now() - Date.parse(b.created_at) >= 14 * day
        return { id: b.id, active_week_two: old ? (weekTwo[b.id] ?? false) : null, cancelled: b.status === 'canceled' || !!asked, cancelled_at: at }
      })
    },
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
      if (asked && !canStillKeep(asked)) throw new Error('The account has closed. Write to thebusinesssagent@gmail.com about it.')
      Object.assign(w.business, { closing_requested_at: null, closing_requested_by: null })
      if (stoppedRenewal) w.billing.cancel_at_period_end = false
      stoppedRenewal = false
      return { renewalFailed: false }
    },
  }
}
