// Ireland's grants (grantCatalogueIreland.ts): the rules that check each one against the answers, and
// the questions that decide them, as grants.ts does for Spain's. The LEO's own rules come first: tax
// clearance from Revenue, the number of employees, how long it's been trading, and its start-up and
// expansion grants not going to local services (its national criteria leave out domestically focused
// retail, personal, professional and construction services, and projects that displace others, which
// LEOs apply to cafés, restaurants and pubs). Types only from grants.ts, which brings these in.
import { msg } from './i18n'
import type { Business } from './types'
import type { Answer, Condition, GrantProfile, Question, Rule, RuleResult, Text } from './grants'

const C = (label: string, state: Condition['state'], note?: Text | string | null): Condition =>
  ({ label, state, ...(note ? { note: typeof note === 'string' ? { text: note } : note } : {}) })
const yn = (v: Answer) => (v === 'yes' ? 'pass' : v === 'no' ? 'fail' : 'unknown')
const pad = (n: number) => String(n).padStart(2, '0')
/** The first day of the month `n` months after year y, month m. */
const addM = (y: number, m: number, n: number) => {
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`
}
/** Whole months from when it started trading to `today` (negative: not yet); null when not known. */
const monthsTrading = (p: GrantProfile, today: string) =>
  p.startY && p.startM ? Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - (p.startY * 12 + p.startM) : null
/** A café, restaurant, pub, shop: the local services the LEO's start-up and expansion grants leave out. */
const localService = (p: GrantProfile) => p.sector === 'hospitality' || p.sector === 'retail'

const NEED_START = msg('Add when the business started trading to check.')
const taxClearance = (p: GrantProfile) => C(msg('Tax clearance from Revenue'), p.debts === 'no' ? 'pass' : p.debts === 'yes' ? 'fail' : 'unknown',
  p.debts === 'yes' ? msg('Tax owed blocks tax clearance. A payment arrangement with Revenue can sort this out.') : null)
const upTo = (p: GrantProfile, n: number, label: string) => C(label, p.employees == null ? 'unknown' : p.employees <= n ? 'pass' : 'fail')
const over30k = (p: GrantProfile) => C(msg('Turnover over €30,000 a year'),
  p.ieTurnover === 'unsure' ? 'unknown' : p.ieTurnover === 'under30k' ? 'fail' : 'pass')

/** Six months' trading, which most LEO supports ask for: once it's known and short of that, the grant is for later. */
function sixMonths(p: GrantProfile, today: string, r: RuleResult): Condition {
  const label = msg('Trading for 6 months or more')
  const months = monthsTrading(p, today)
  if (months == null) return C(label, 'unknown', NEED_START)
  if (months >= 6) return C(label, 'pass')
  const from = addM(p.startY!, p.startM!, 6)
  r.timing = 'next'
  r.whenNote = { text: msg('You can apply once the business has traded for 6 months, from around {date}.'), vars: { date: from } }
  return C(label, 'unknown', { text: msg('From around {date}.'), vars: { date: from } })
}

/** Sells beyond its local area (the LEO's start-up and expansion grants). */
const tradesWider = (p: GrantProfile) => {
  const label = msg('Makes products, or sells services, beyond the local area')
  if (localService(p)) {
    return C(label, 'fail', msg('Cafés, restaurants, shops and other local services usually can’t get the LEO’s start-up and expansion grants: its rules leave out businesses that sell locally and would take trade from others nearby. Its vouchers, training, mentoring and green supports are open to them. A separate business making food for shops elsewhere can be different: ask your LEO.'))
  }
  return C(label, yn(p.ieTrades), p.ieTrades === 'no' ? msg('These grants are for businesses that can sell beyond their area and grow.') : null)
}
const tenOrFewer = (p: GrantProfile) => C(msg('10 employees or fewer'), p.employees == null ? 'unknown' : p.employees <= 10 ? 'pass' : 'unknown',
  p.employees != null && p.employees > 10 ? msg('More than 10 only in some cases: ask your LEO.') : null)

export const IE_RULES: Record<string, Rule> = {
  ie_grow_digital(p, _g, today) {
    const r: RuleResult = { conds: [] }
    r.conds.push(upTo(p, 50, msg('Up to 50 employees')), sixMonths(p, today, r),
      C(msg('Done the LEO’s Digital for Business review in the last two years'), p.ieDigitalReport === 'yes' ? 'pass' : 'unknown',
        p.ieDigitalReport === 'yes' ? null : msg('Book it with your LEO first: the voucher pays for what its report recommends.')),
      taxClearance(p))
    return r
  },

  ie_priming(p, _g, today) {
    const months = monthsTrading(p, today)
    const label = msg('In the first 18 months of trading')
    return { conds: [tradesWider(p), tenOrFewer(p),
      months == null ? C(label, 'unknown', NEED_START) : months <= 18 ? C(label, 'pass')
        : C(label, 'fail', msg('After 18 months, the Business Expansion Grant is the one.')),
      taxClearance(p)] }
  },

  ie_expansion(p, _g, today) {
    const months = monthsTrading(p, today)
    const label = msg('Trading for more than 18 months')
    return { conds: [tradesWider(p), tenOrFewer(p),
      months == null ? C(label, 'unknown', NEED_START) : months > 18 ? C(label, 'pass')
        : C(label, 'fail', msg('In the first 18 months, the Priming Grant is the one.')),
      taxClearance(p)] }
  },

  // Lean for Business is for every sector (localenterprise.ie's Lean pages): no sector or turnover test.
  ie_lean(p, _g, today) {
    const r: RuleResult = { conds: [] }
    r.conds.push(upTo(p, 50, msg('Up to 50 employees')), sixMonths(p, today, r), taxClearance(p))
    return r
  },

  ie_mentoring: () => ({ conds: [C(msg('A new or established business in the LEO’s area'), 'pass')] }),

  ie_start_your_own_business(p, _g, today) {
    const months = monthsTrading(p, today)
    const label = msg('Starting out, or started in the last two years')
    if (months == null) return { conds: [C(label, 'unknown', NEED_START)] }
    return { conds: [months <= 24 ? C(label, 'pass') : C(label, 'fail', msg('It’s for new businesses: the LEO’s other training is for established ones.'))] }
  },

  ie_green_for_business(p, _g, today) {
    const r: RuleResult = { conds: [] }
    r.conds.push(upTo(p, 50, msg('Up to 50 employees')), over30k(p), sixMonths(p, today, r), taxClearance(p))
    return r
  },

  ie_energy_efficiency(p, _g, today) {
    const r: RuleResult = { conds: [] }
    r.conds.push(upTo(p, 50, msg('Up to 50 employees')), sixMonths(p, today, r),
      C(msg('A Green for Business or GreenStart report, or an SEAI energy audit'), p.ieGreenReport === 'yes' ? 'pass' : 'unknown',
        p.ieGreenReport === 'yes' ? null : msg('Get one first: Green for Business is free from your LEO.')),
      C(msg('Premises that pay commercial rates'), yn(p.ieRates), p.ieRates === 'no' ? msg('Unless the business is approved under Fáilte Ireland’s quality framework.') : null),
      taxClearance(p))
    return r
  },

  ie_microfinance: p => ({ conds: [
    C(msg('Fewer than 10 full-time employees'), p.employees == null ? 'unknown' : p.employees < 10 ? 'pass' : 'fail'),
    C(msg('Turnover under €2 million'), p.ieTurnover === 'unsure' ? 'unknown' : p.ieTurnover === 'over2m' ? 'fail' : 'pass'),
    C(msg('Finds it hard to get a loan from a bank'), 'unknown', msg('Microfinance Ireland lends where banks won’t, and may ask for proof.')),
  ] }),

  ie_enterprise_ireland: p => ({ conds: [
    C(msg('Sells, or plans to sell, outside Ireland'), localService(p) ? 'fail' : yn(p.ieExports),
      localService(p) ? msg('Enterprise Ireland works with businesses that sell internationally; the LEO is there for local ones.') : null),
    C(msg('Usually 10 employees or more'), p.employees == null ? 'unknown' : p.employees >= 10 ? 'pass' : 'unknown',
      p.employees != null && p.employees < 10 ? msg('With fewer than 10, start with your LEO, which passes businesses on as they grow.') : null),
  ] }),

  ie_seai_energy_audit: p => ({ conds: [
    C(msg('Spends €10,000 or more a year on energy'), yn(p.ieEnergySpend),
      p.ieEnergySpend === 'no' ? msg('For a smaller energy bill, the LEO’s Green for Business is free.') : null),
    // A business that isn't industry, with under 250 employees, is far below 2.8 GWh (about €500,000 of energy a year).
    C(msg('Uses less than 2.8 GWh of energy a year'), p.employees == null || p.employees >= 250 || p.sector == null || p.sector === 'industry' ? 'unknown' : 'pass',
      p.sector === 'industry' || (p.employees ?? 0) >= 250 ? msg('Above that, the law asks the business for its own energy audit, and the voucher can’t pay for it: check your bills.') : null),
    taxClearance(p),
  ] }),

  ie_seai_solar: p => ({ conds: [
    C(msg('Solar panels could go on the building'), yn(p.ieSolar)),
    C(msg('The work hasn’t started yet'), 'unknown', msg('The grant has to be approved before the installation.')),
  ] }),
}

const YES_NO = [{ value: 'yes', label: msg('Yes') }, { value: 'no', label: msg('No') }, { value: 'unsure', label: msg('Not sure') }]

/** About the business: mostly known already (Business page, Team). */
export const IE_BUSINESS_QUESTIONS: Question[] = [
  { key: 'entity', label: msg('Business type'), kind: 'choice', unknown: null, rules: '*',
    options: [{ value: 'autonomo', label: msg('Sole trader') }, { value: 'sl', label: msg('Limited company') }, { value: 'other', label: msg('Partnership or other') }] },
  { key: 'sector', label: msg('What kind of business?'), kind: 'choice', unknown: null, rules: '*',
    options: [{ value: 'hospitality', label: msg('Bar, café, restaurant or hotel') }, { value: 'retail', label: msg('Shop') }, { value: 'services', label: msg('Services') },
      { value: 'industry', label: msg('Industry or manufacturing') }, { value: 'other', label: msg('Other') }] },
  { key: 'startY', label: msg('When did the business start trading?'), hint: msg('When it registered with Revenue, or opened its doors.'), kind: 'month', unknown: null, rules: '*' },
  { key: 'employees', label: msg('Number of employees'), hint: msg('Not counting owners. Part-time staff count as one each.'), kind: 'number', unknown: null, rules: '*' },
]

/** Asked only while they can still change a grant's result. */
export const IE_QUESTIONS: Question[] = [
  { key: 'debts', label: msg('Does the business owe Revenue any tax it isn’t paying off?'), hint: msg('Most grants need tax clearance from Revenue, so this comes first.'),
    kind: 'choice', unknown: 'unsure', rules: '*', options: [{ value: 'no', label: msg('No') }, { value: 'yes', label: msg('Yes') }, { value: 'unsure', label: msg('Not sure') }] },
  { key: 'ieTrades', label: msg('Do you make products, or sell services, beyond your local area?'),
    hint: msg('To shops elsewhere, online across Ireland, or to customers abroad.'), kind: 'choice', unknown: 'unsure', rules: ['ie_priming', 'ie_expansion'], options: YES_NO },
  { key: 'ieExports', label: msg('Do you sell outside Ireland, or plan to?'), kind: 'choice', unknown: 'unsure', rules: ['ie_enterprise_ireland'], options: YES_NO },
  { key: 'ieTurnover', label: msg('Turnover last year, excluding VAT'), kind: 'choice', unknown: 'unsure', rules: ['ie_green_for_business', 'ie_microfinance'],
    options: [{ value: 'under30k', label: msg('Under €30,000') }, { value: 'to2m', label: msg('€30,000 to €2 million') }, { value: 'over2m', label: msg('Over €2 million') },
      { value: 'unsure', label: msg('Not sure') }] },
  { key: 'ieDigitalReport', label: msg('Have you done the LEO’s Digital for Business review in the last two years?'), kind: 'choice', unknown: 'unsure',
    rules: ['ie_grow_digital'], options: YES_NO },
  { key: 'ieGreenReport', label: msg('Have you had a Green for Business or GreenStart report, or an SEAI energy audit?'), kind: 'choice', unknown: 'unsure',
    rules: ['ie_energy_efficiency'], options: YES_NO },
  { key: 'ieRates', label: msg('Does the business pay commercial rates on its premises?'), kind: 'choice', unknown: 'unsure', rules: ['ie_energy_efficiency'], options: YES_NO },
  { key: 'ieEnergySpend', label: msg('Does the business spend €10,000 or more a year on energy?'), hint: msg('Electricity, heating and other fuels at the premises together, not counting transport.'),
    kind: 'choice', unknown: 'unsure', rules: ['ie_seai_energy_audit'], options: YES_NO },
  { key: 'ieSolar', label: msg('Could solar panels go on your building?'), hint: msg('On a roof you own, or one your landlord agrees to.'),
    kind: 'choice', unknown: 'unsure', rules: ['ie_seai_solar'], options: YES_NO },
]

/** What the app knows already, for an Irish business: what it does, from its description, and the employees. */
export function irishKnownAnswers(business: Pick<Business, 'business_type'>, employees: number | null): Partial<GrantProfile> {
  const out: Partial<GrantProfile> = {}
  const type = business.business_type ?? ''
  if (/caf[eé]|coffee|bar\b|pub\b|restaurant|hotel|bakery|deli\b/i.test(type)) out.sector = 'hospitality'
  else if (/salon|beauty|real estate|estate agen/i.test(type)) out.sector = 'services'
  if (employees != null) out.employees = employees
  return out
}
