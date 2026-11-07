// The demo's back-office acts, as the hq_actions migration and worker/hq.ts have them. HQ (?hq): a few
// businesses on the service to make complimentary, end it, or give a longer trial. The café (no ?hq) isn't
// HQ: nothing to list, and the acts are refused.
import type { Api, HqBusiness } from './api'
import type { Business } from '../../shared/types'
import { complimentaryBlock, isTrialExtension } from '../../shared/hqActions'

interface Who {
  /** The sample business is The Business Agent HQ (?hq), and an admin of it is signed in. */
  hqAdmin: () => boolean
  business: Business
  daysAgo: (d: number) => string
}

type BackOfficeApi = Pick<Api, 'hqBusinesses' | 'hqSetComplimentary' | 'hqEndComplimentary' | 'hqExtendTrial'>

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
  const needHq = () => { if (!w.hqAdmin()) throw new Error('Only The Business Agent HQ’s admins can do that') }
  const find = (id: number) => {
    const b = list.find(x => x.id === id)
    if (!b) throw new Error('No such business')
    return b
  }

  return {
    async hqBusinesses() { return w.hqAdmin() ? list.map(b => ({ ...b })) : [] },
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
  }
}
