// Grants: which of the verified grants (grantCatalogue.ts) a business can get, from a few answers.
// The rules are Solicita's (grant-finder: site/index.html, RULES), as pure functions: each grant's
// conditions come out as pass, fail or unknown, and evaluate() turns them into one status. The
// official call always decides; this says what can be checked from the answers, and nothing more.
// Dates are ISO strings ('2026-10-20'), compared as text, and `today` is always passed in.
import { msg } from './i18n'
import { checkTaxId } from './taxId'
import type { Business } from './types'
import { GRANTS } from './grantCatalogue'

export { GRANTS, DOCUMENTS } from './grantCatalogue'

export type Answer = 'yes' | 'no' | 'unsure'

/** What the rules need to know. Unknown answers stay 'unsure' (or null): the grant shows "Confirm first". */
export interface GrantProfile {
  entity: 'autonomo' | 'sl' | 'other' | null
  sector: 'hospitality' | 'retail' | 'services' | 'industry' | 'other' | null
  province: 'malaga' | 'andalucia' | 'outside' | null
  town: 'small' | 'mid' | 'large' | 'unsure'
  /** When the business started trading (its IAE registration). */
  startY: number | null
  startM: number | null
  /** Not counting owners. */
  employees: number | null
  /** Unpaid debts with Hacienda or Social Security ('no' is what grants need). */
  debts: Answer
  /** When the owner registered as autónomo: a month and year, not yet, or not sure. */
  alta: 'date' | 'notyet' | 'unsure'
  altaY: number | null
  altaM: number | null
  tarifaPlana: Answer
  empadronado: Answer
  /** The oldest partner's age, for a company. */
  age: number | null
  gender: 'f' | 'm' | 'na'
  education: Answer
  turnover: Answer
  hiring: Answer
  candidate: 'youth' | '45plus' | 'other' | 'unsure'
  replaceEquip: Answer
  rta: Answer
}

export const BLANK_PROFILE: GrantProfile = {
  entity: null, sector: null, province: null, town: 'unsure', startY: null, startM: null, employees: null, debts: 'unsure',
  alta: 'unsure', altaY: null, altaM: null, tarifaPlana: 'unsure', empadronado: 'unsure', age: null, gender: 'na',
  education: 'unsure', turnover: 'unsure', hiring: 'unsure', candidate: 'unsure', replaceEquip: 'unsure', rta: 'unsure',
}

export type GrantCategory = 'energy' | 'autonomo' | 'hiring' | 'modernisation' | 'digital' | 'startup' | 'training' | 'innovation'

export interface GrantDocument { name: string; how: string | null; stage: 'apply' | 'after'; url?: string }

export interface Grant {
  id: string
  /** Which rule checks it (RULES below). */
  rule: string
  category: GrantCategory
  level: 'national' | 'regional' | 'provincial' | 'chamber'
  name: string
  /** Who gives it. */
  body: string
  amount: string
  /** The most it pays, in euros (0: not known). */
  max: number
  window: 'open' | 'closed' | 'permanent' | 'upcoming'
  opens: string | null
  closes: string | null
  next_call: string | null
  paid: string | null
  summary: string
  covers: string[]
  obligations: string[]
  steps: string[]
  /** The documents to gather (DOCUMENTS), and for a company only where marked. */
  documents: { id: string; required: boolean; applies_to?: 'company'; note?: string; url?: string }[]
  /** Grants with no document list: what to have ready, in words. */
  docs?: string[]
  /** The official page, its reference (BOJA, BOP…) and when it was last checked against it. */
  source: string
  ref: string | null
  checked: string
  note: string | null
}

/** A text and the values to fill into it. Values that look like dates ('2026-10-20') are shown as dates. */
export interface Text { text: string; vars?: Record<string, string | number> }

export interface Condition { label: string; state: 'pass' | 'fail' | 'unknown'; note?: Text }

export interface RuleResult {
  conds: Condition[]
  /** Already the business's (a credit it has, a quota it pays). */
  active?: boolean
  /** 'next': it applies to them, but only in a later call. */
  timing?: 'open' | 'next'
  whenNote?: Text
  /** Their own last day to apply, when it's earlier than the call's. */
  deadline?: string
  /** The amount for them, when the answers narrow it down. */
  amount?: Text
  max?: number
}

export type GrantStatus = 'yes' | 'check' | 'next' | 'no' | 'active'
export const STATUS_LABEL: Record<GrantStatus, string> = {
  yes: msg('Eligible'), check: msg('Confirm first'), next: msg('Next call'), no: msg('Not eligible'), active: msg('Yours already'),
}

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------
const C = (label: string, state: Condition['state'], note?: Text | string | null): Condition =>
  ({ label, state, ...(note ? { note: typeof note === 'string' ? { text: note } : note } : {}) })
const yn = (v: Answer) => (v === 'yes' ? 'pass' : v === 'no' ? 'fail' : 'unknown')
const pad = (n: number) => String(n).padStart(2, '0')
/** The first day of the month `n` months after year y, month m. */
const addM = (y: number, m: number, n: number) => {
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`
}
const minD = (a: string, b: string | null) => (b && b < a ? b : a)
const inAndalucia = (p: GrantProfile) => (p.province == null ? 'unknown' : p.province === 'outside' ? 'fail' : 'pass')
const inMalaga = (p: GrantProfile) => (p.province == null ? 'unknown' : p.province === 'malaga' ? 'pass' : 'fail')
const altaKnown = (p: GrantProfile): p is GrantProfile & { altaY: number; altaM: number } => p.alta === 'date' && !!p.altaY && !!p.altaM
const debtCond = (p: GrantProfile) => C(msg('Up to date with Hacienda and Social Security'), p.debts === 'no' ? 'pass' : p.debts === 'yes' ? 'fail' : 'unknown',
  p.debts === 'yes' ? msg('Debts block almost every grant. Clearing them (or a payment plan) can fix this.') : null)
const NEED_DATE = msg('Add the registration date to check.')

type Rule = (p: GrantProfile, g: Grant, today: string) => RuleResult

export const RULES: Record<string, Rule> = {
  equipos_hosteleria: p => ({ conds: [
    C(msg('Bar, café, restaurant or accommodation'), p.sector === 'hospitality' ? 'pass' : p.sector ? 'fail' : 'unknown'),
    C(msg('Replacing existing equipment with a more efficient model'), yn(p.replaceEquip), p.replaceEquip === 'no'
      ? msg('Only replacements qualify, not new additions.')
      : msg('Fridges, dishwashers, coffee or catering machines, AC units, awnings, terrace umbrellas. Not gas equipment.')),
    debtCond(p),
  ] }),

  cuota_cero(p, g, today) {
    const c: Condition[] = []
    const r: RuleResult = { conds: c, timing: 'open' }
    const label = msg('Registered as autónomo from January 2023 onwards')
    if (altaKnown(p)) c.push(C(label, p.altaY >= 2023 ? 'pass' : 'fail'))
    else if (p.alta === 'notyet') {
      c.push(C(label, 'pass'))
      r.timing = 'next'
      r.whenNote = { text: msg('You apply after 12 months on the tarifa plana, which falls after this call closes. Watch for the next call.') }
    } else c.push(C(label, 'unknown', NEED_DATE))
    c.push(C(msg('On the tarifa plana (reduced €80 quota)'), yn(p.tarifaPlana)))
    c.push(C(msg('Registered on the padrón in Andalucía'), yn(p.empadronado)))
    if (altaKnown(p) && p.altaY >= 2023) {
      const from = addM(p.altaY, p.altaM, 12), to = addM(p.altaY, p.altaM, 14)
      const window = msg('Apply within 2 months of finishing 12 months on the tarifa plana')
      if (to < today) {
        c.push(C(window, 'fail', { text: msg('The window ended around {date}. A second year of tarifa plana may give a second window.'), vars: { date: to } }))
      } else if (g.closes && from > g.closes) {
        r.timing = 'next'
        r.whenNote = { text: msg('The window opens around {date}, after this call closes. Watch for the next call.'), vars: { date: from } }
        c.push(C(window, 'pass', { text: msg('The window: {from} to {to} (approximate).'), vars: { from, to } }))
      } else {
        r.deadline = minD(to, g.closes)
        c.push(C(window, 'pass', from > today
          ? { text: msg('Apply between {from} and {to}.'), vars: { from, to: r.deadline } }
          : { text: msg('Apply by {date}.'), vars: { date: r.deadline } }))
      }
    }
    c.push(debtCond(p))
    return r
  },

  linea_2(p, g, today) {
    const c: Condition[] = []
    const r: RuleResult = { conds: c }
    c.push(C(msg('Individual autónomo, not a company partner or director'), p.entity === 'autonomo' ? 'pass' : p.entity ? 'fail' : 'unknown',
      p.entity && p.entity !== 'autonomo' ? msg('Partners and directors of SLs and other companies are excluded.') : null))
    c.push(C(msg('On the tarifa plana (reduced €80 quota)'), yn(p.tarifaPlana)))
    c.push(C(msg('Business based in Andalucía'), inAndalucia(p)))
    const within = msg('Apply within 2 months of registering as autónomo')
    if (altaKnown(p)) {
      const end = addM(p.altaY, p.altaM, 2)
      if (end < today) c.push(C(within, 'fail', { text: msg('That window ended around {date}.'), vars: { date: end } }))
      else {
        r.deadline = minD(end, g.closes)
        c.push(C(within, 'pass', { text: msg('Apply by {date}.'), vars: { date: r.deadline } }))
      }
    } else c.push(C(within, 'unknown', p.alta === 'notyet' ? msg('Register and apply before this call closes.') : NEED_DATE))
    c.push(C(msg('Viability plan showing a profit every year'), 'unknown', msg('Required with the application.')))
    c.push(debtCond(p))
    if (p.age && (p.gender === 'f' || p.gender === 'm')) {
      const young = (p.gender === 'f' && p.age < 35) || (p.gender === 'm' && p.age < 30)
      r.max = p.town === 'small' ? (young ? 5500 : 5000) : (young ? 5000 : 3800)
      r.amount = { text: msg('{amount}, one-off'), vars: { amount: r.max } }
    }
    return r
  },

  talento_joven(p) {
    const c = [C(msg('Business in Málaga province'), inMalaga(p)),
      C(msg('Hiring full-time for at least 6 months'), yn(p.hiring), p.hiring === 'no' ? msg('Part-time contracts don’t qualify.') : null)]
    const label = msg('New hire is under 30 and in Garantía Juvenil')
    if (p.candidate === 'youth') c.push(C(label, 'pass'), C(msg('They finished Talento Joven orientation at the Cámara'), 'unknown', msg('Ask the candidate or the Cámara.')))
    else c.push(C(label, p.candidate === 'unsure' ? 'unknown' : 'fail'))
    c.push(debtCond(p))
    return { conds: c }
  },

  talento_45(p) {
    const c = [C(msg('Business in Málaga province'), inMalaga(p)), C(msg('Hiring full-time for at least 6 months'), yn(p.hiring))]
    const label = msg('New hire is unemployed, aged 45 to 60')
    if (p.candidate === '45plus') c.push(C(label, 'pass'), C(msg('They’re a Talento 45+ participant'), 'unknown', msg('Ask the candidate or the Cámara.')))
    else c.push(C(label, p.candidate === 'unsure' ? 'unknown' : 'fail'))
    c.push(debtCond(p))
    return { conds: c }
  },

  pymetur: p => ({ conds: [
    C(msg('Hospitality or tourism business'), p.sector === 'hospitality' ? 'pass' : p.sector ? 'fail' : 'unknown'),
    C(msg('Business in Andalucía'), inAndalucia(p)),
    C(msg('Registered in the Registro de Turismo de Andalucía'), p.rta === 'yes' ? 'pass' : 'unknown',
      p.rta === 'yes' ? null : msg('Register now so you’re ready when the call opens.')),
    C(msg('A modernisation, accessibility or sustainability project not yet started'), 'unknown'),
    debtCond(p),
  ] }),

  camara_pyme: p => ({ conds: [
    C(msg('Business in Málaga province'), inMalaga(p)),
    C(msg('Registered in the IAE before 1 Jan 2024 (2026 rules)'), p.startY ? (p.startY < 2024 ? 'pass' : 'fail') : 'unknown',
      p.startY && p.startY >= 2024 ? msg('The cut-off usually moves a year each call.') : null),
    C(msg('Turnover of €100,000 or more last year'), yn(p.turnover)),
    debtCond(p),
  ] }),

  innovactiva: p => ({ conds: [
    C(p.entity === 'sl' ? msg('Every partner aged 18 to 35') : msg('Aged 18 to 35'), p.age ? (p.age >= 18 && p.age <= 35 ? 'pass' : 'fail') : 'unknown'),
    C(msg('Andalusian or living in Andalucía'), yn(p.empadronado)),
    C(msg('ESO or a higher official qualification'), yn(p.education)),
    C(msg('Business started within the dates the call sets'), 'unknown'),
    debtCond(p),
  ] }),

  diputacion_6000: p => ({ conds: [
    C(msg('Autónomo'), p.entity === 'autonomo' ? 'pass' : p.entity === 'sl' ? 'unknown' : p.entity ? 'fail' : 'unknown',
      p.entity === 'sl' ? msg('Check whether SL owners (autónomo societario) qualify in the next call.') : null),
    C(msg('Business in Málaga province'), inMalaga(p)),
    C(msg('Town under 20,000 people'), p.town === 'small' || p.town === 'mid' ? 'pass' : p.town === 'large' ? 'fail' : 'unknown',
      p.town === 'large' ? msg('Marbella, Málaga city, Estepona, Fuengirola and other large towns are excluded.') : null),
    debtCond(p),
  ] }),

  fundae(p) {
    if (p.employees && p.employees > 0) return { active: true, conds: [C(msg('You have employees, so you already have this credit'), 'pass')] }
    return { conds: [C(msg('Has employees'), p.employees == null ? 'unknown' : 'fail')] }
  },

  tarifa_plana(p) {
    if (p.tarifaPlana === 'yes') return { active: true, conds: [C(msg('Already on it'), 'pass')] }
    if (p.alta === 'notyet') return { conds: [C(msg('Request it when registering'), 'pass'), C(msg('Not registered as autónomo in the last 2 years'), 'unknown')] }
    return { conds: [C(msg('Requested at registration'), p.tarifaPlana === 'no' ? 'fail' : 'unknown',
      p.tarifaPlana === 'no' ? msg('It has to be requested when registering.') : null)] }
  },
}

export interface Evaluation { grant: Grant; result: RuleResult; status: GrantStatus }

/** One grant against the answers, on `today`. */
export function evaluate(grant: Grant, p: GrantProfile, today: string): Evaluation {
  const result = (RULES[grant.rule] ?? (() => ({ conds: [] })))(p, grant, today)
  let status: GrantStatus
  if (result.active) status = 'active'
  else if (result.conds.some(c => c.state === 'fail')) status = 'no'
  else if (grant.window === 'closed' || grant.window === 'upcoming' || result.timing === 'next'
    || (grant.window === 'open' && grant.closes && grant.closes < today)) status = 'next'
  else if (result.conds.some(c => c.state === 'unknown')) status = 'check'
  else status = 'yes'
  return { grant, result, status }
}

// Results in this order: what can be applied for now first, then to confirm, the next calls,
// what's already theirs, and last what doesn't fit.
const ORDER: GrantStatus[] = ['yes', 'check', 'next', 'active', 'no']
export const evaluateAll = (p: GrantProfile, today: string) =>
  GRANTS.map(g => evaluate(g, p, today)).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))

/** When to apply, for the card: a date (and how many days are left), or why there's none. */
export type Deadline = { kind: 'date'; date: string; days: number } | { kind: 'not_open' | 'later' | 'closed' | 'all_year' | 'until_funds' }
export function deadlineOf({ grant, result, status }: Evaluation, today: string): Deadline {
  if (status === 'next') return { kind: grant.window === 'upcoming' ? 'not_open' : result.timing === 'next' ? 'later' : 'closed' }
  if (grant.window === 'permanent') return { kind: 'all_year' }
  const date = result.deadline ?? grant.closes
  if (!date) return { kind: 'until_funds' }
  return { kind: 'date', date, days: daysBetween(today, date) }
}
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

/** The quick filters on the results (Solicita's), and which filter each category falls under. */
export type GrantFilter = 'all' | 'staff' | 'equipment' | 'digital' | 'startup' | 'premises'
export const FILTER_OF: Record<GrantCategory, Exclude<GrantFilter, 'all'>> = {
  hiring: 'staff', training: 'staff', energy: 'equipment', digital: 'digital', innovation: 'digital',
  autonomo: 'startup', startup: 'startup', modernisation: 'premises',
}
export const FILTERS: { key: GrantFilter; label: string }[] = [
  { key: 'all', label: msg('All') }, { key: 'staff', label: msg('Staff & training') }, { key: 'equipment', label: msg('Equipment & energy') },
  { key: 'digital', label: msg('Digital & innovation') }, { key: 'startup', label: msg('Starting up') }, { key: 'premises', label: msg('Premises & tourism') },
]

// ---------------------------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------------------------
export interface Question {
  key: keyof GrantProfile
  label: string
  /** For a company, asked about the owners instead. */
  companyLabel?: string
  hint?: string
  /** The answer that means "don't know" (what it's set to when checking whether it still matters). */
  unknown: GrantProfile[keyof GrantProfile]
  /** The rules it can change ('*': every grant). */
  rules: string[] | '*'
  options?: { value: string; label: string }[]
  kind: 'choice' | 'number' | 'month'
  show?: (p: GrantProfile) => boolean
}

const YES_NO = [{ value: 'yes', label: msg('Yes') }, { value: 'no', label: msg('No') }, { value: 'unsure', label: msg('Not sure') }]

/** About the business itself: what the app mostly knows already (Business page, Team). */
export const BUSINESS_QUESTIONS: Question[] = [
  { key: 'entity', label: msg('Business type'), kind: 'choice', unknown: null, rules: '*',
    options: [{ value: 'autonomo', label: 'Autónomo' }, { value: 'sl', label: msg('SL (limited company)') }, { value: 'other', label: msg('Other company') }] },
  { key: 'sector', label: msg('What kind of business?'), kind: 'choice', unknown: null, rules: '*',
    options: [{ value: 'hospitality', label: msg('Bar, café, restaurant or hotel') }, { value: 'retail', label: msg('Shop') }, { value: 'services', label: msg('Services') },
      { value: 'industry', label: msg('Industry or manufacturing') }, { value: 'other', label: msg('Other') }] },
  { key: 'province', label: msg('Where is it based?'), kind: 'choice', unknown: null, rules: '*',
    options: [{ value: 'malaga', label: msg('Málaga province') }, { value: 'andalucia', label: msg('Elsewhere in Andalucía') }, { value: 'outside', label: msg('Outside Andalucía') }] },
  { key: 'town', label: msg('Town size'), hint: msg('San Pedro de Alcántara counts as Marbella, which is over 20,000.'), kind: 'choice', unknown: 'unsure', rules: '*',
    options: [{ value: 'small', label: msg('Under 10,000') }, { value: 'mid', label: msg('10,000 to 20,000') }, { value: 'large', label: msg('Over 20,000') }, { value: 'unsure', label: msg('Not sure') }] },
  { key: 'startY', label: msg('When did the business start trading?'), hint: msg('The IAE registration date (alta en Hacienda).'), kind: 'month', unknown: null, rules: '*' },
  { key: 'employees', label: msg('Number of employees'), hint: msg('Not counting owners. Part-time staff count as one each.'), kind: 'number', unknown: null, rules: '*' },
]

/** Asked only while they can still change a grant's result (Solicita's adaptive questions). */
export const QUESTIONS: Question[] = [
  { key: 'debts', label: msg('Any unpaid debts with Hacienda or Social Security?'), hint: msg('Debts block almost every grant, so this comes first.'),
    kind: 'choice', unknown: 'unsure', rules: '*', options: [{ value: 'no', label: msg('No') }, { value: 'yes', label: msg('Yes') }, { value: 'unsure', label: msg('Not sure') }] },
  { key: 'replaceEquip', label: msg('Is there older equipment you could replace with a more efficient model?'),
    hint: msg('Fridges, dishwasher, coffee or catering machines, AC units, awning, terrace umbrellas. Not gas equipment.'),
    kind: 'choice', unknown: 'unsure', rules: ['equipos_hosteleria'], options: YES_NO },
  { key: 'alta', label: msg('When did you register as autónomo?'), companyLabel: msg('When did the owner register as autónomo (societario)?'),
    kind: 'choice', unknown: 'unsure', rules: ['cuota_cero', 'linea_2', 'tarifa_plana'],
    options: [{ value: 'date', label: msg('Pick a date') }, { value: 'notyet', label: msg('Not registered yet') }, { value: 'unsure', label: msg('Not sure') }] },
  { key: 'tarifaPlana', label: msg('On the tarifa plana (reduced €80 quota)?'), kind: 'choice', unknown: 'unsure', rules: ['cuota_cero', 'linea_2', 'tarifa_plana'],
    options: YES_NO, show: p => p.alta !== 'notyet' },
  { key: 'empadronado', label: msg('Are you registered on the padrón in an Andalusian town?'), companyLabel: msg('Are the owners registered on the padrón in an Andalusian town?'),
    kind: 'choice', unknown: 'unsure', rules: ['cuota_cero', 'innovactiva'], options: YES_NO },
  { key: 'age', label: msg('Your age'), companyLabel: msg('Age of the oldest partner'), kind: 'number', unknown: null, rules: ['linea_2', 'innovactiva'] },
  { key: 'gender', label: msg('Gender'), hint: msg('Optional. Only used because one grant pays different amounts.'), kind: 'choice', unknown: 'na', rules: ['linea_2'],
    options: [{ value: 'f', label: msg('Woman') }, { value: 'm', label: msg('Man') }, { value: 'na', label: msg('Prefer not to say') }] },
  { key: 'education', label: msg('At least ESO (secondary school) or an equivalent qualification?'), kind: 'choice', unknown: 'unsure', rules: ['innovactiva'], options: YES_NO },
  { key: 'turnover', label: msg('Did the business invoice €100,000 or more last year?'), kind: 'choice', unknown: 'unsure', rules: ['camara_pyme'], options: YES_NO },
  { key: 'rta', label: msg('Is the business in the Registro de Turismo de Andalucía?'), kind: 'choice', unknown: 'unsure', rules: ['pymetur'], options: YES_NO },
  { key: 'hiring', label: msg('Planning to hire someone full-time for at least 6 months?'), kind: 'choice', unknown: 'unsure', rules: ['talento_joven', 'talento_45'],
    options: [{ value: 'yes', label: msg('Yes') }, { value: 'no', label: msg('No') }, { value: 'unsure', label: msg('Maybe') }] },
  { key: 'candidate', label: msg('Who might you hire?'), kind: 'choice', unknown: 'unsure', rules: ['talento_joven', 'talento_45'], show: p => p.hiring !== 'no',
    options: [{ value: 'youth', label: msg('Under 30') }, { value: '45plus', label: msg('Unemployed, 45 to 60') }, { value: 'other', label: msg('Someone else') }, { value: 'unsure', label: msg('Not sure') }] },
]

/** Does this question still matter: is there a grant it could change that isn't ruled out already? */
export function questionMatters(q: Question, p: GrantProfile, today: string) {
  if (q.show && !q.show(p)) return false
  if (q.rules === '*') return true
  const probe = { ...p, [q.key]: q.unknown }
  return GRANTS.filter(g => (q.rules as string[]).includes(g.rule)).some(g => evaluate(g, probe, today).status !== 'no')
}

// ---------------------------------------------------------------------------------------------
// What the app already knows
// ---------------------------------------------------------------------------------------------
// Andalusian postcodes start with these (Almería, Cádiz, Córdoba, Granada, Huelva, Jaén, Málaga, Sevilla).
const ANDALUCIA_POSTCODES = ['04', '11', '14', '18', '21', '23', '29', '41']
// Towns in Málaga province with more than 20,000 people (INE 2024), and places that are part of one.
const LARGE_TOWNS = /\b(m[aá]laga capital|marbella|san pedro de alc[aá]ntara|nueva andaluc[ií]a|estepona|fuengirola|mijas|torremolinos|benalm[aá]dena|v[eé]lez[- ]m[aá]laga|torre del mar|rinc[oó]n de la victoria|antequera|alhaur[ií]n de la torre|alhaur[ií]n el grande|ronda|c[aá]rtama|co[ií]n|nerja)\b/i

/**
 * Answers the app can work out from the business details and the team: the business type from its
 * tax number, where it is from its address, what it does from its description, and the employees.
 */
export function knownAnswers(business: Pick<Business, 'tax_id' | 'address' | 'business_type'>, employees: number | null): Partial<GrantProfile> {
  const out: Partial<GrantProfile> = {}
  const tax = business.tax_id ? checkTaxId(business.tax_id) : null
  if (tax?.ok) out.entity = tax.kind !== 'CIF' ? 'autonomo' : tax.value.startsWith('B') ? 'sl' : 'other'
  const address = business.address ?? ''
  const postcode = address.match(/\b(\d{5})\b/)?.[1]
  if (postcode) out.province = postcode.startsWith('29') ? 'malaga' : ANDALUCIA_POSTCODES.includes(postcode.slice(0, 2)) ? 'andalucia' : 'outside'
  else if (/m[aá]laga/i.test(address)) out.province = 'malaga'
  if (out.province === 'malaga' && LARGE_TOWNS.test(address)) out.town = 'large'
  if (/caf[eé]|coffee|bar\b|restaurant|hotel|hostal|cafeter|bakery|panader|tapas|hosteler/i.test(business.business_type ?? '')) out.sector = 'hospitality'
  if (employees != null) out.employees = employees
  return out
}

/** The answers in force: blank, then what the app knows, then what someone answered (which wins). */
export const profileOf = (known: Partial<GrantProfile>, saved: Partial<GrantProfile>): GrantProfile => ({ ...BLANK_PROFILE, ...known, ...saved })

/** Saved answers: only the keys the rules know, with values of the right kind (the database keeps whatever jsonb it's given). */
export function cleanAnswers(raw: unknown): Partial<GrantProfile> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!(k in BLANK_PROFILE)) continue
    const blank = BLANK_PROFILE[k as keyof GrantProfile]
    if (v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) {
      if (typeof v === 'number' && typeof blank === 'string') continue
      out[k] = v
    }
  }
  return out as Partial<GrantProfile>
}

// ---------------------------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------------------------
export type GrantStage = 'interested' | 'gathering' | 'submitted' | 'info_requested' | 'awarded' | 'rejected' | 'paid' | 'obligations' | 'closed'

/** The stages in order (Rejected sits with Awarded: one or the other). Keep in step with the database's check. */
export const STAGES: { key: GrantStage; label: string }[] = [
  { key: 'interested', label: msg('Interested') },
  { key: 'gathering', label: msg('Gathering documents') },
  { key: 'submitted', label: msg('Submitted') },
  { key: 'info_requested', label: msg('More information requested') },
  { key: 'awarded', label: msg('Awarded') },
  { key: 'rejected', label: msg('Rejected') },
  { key: 'paid', label: msg('Paid') },
  { key: 'obligations', label: msg('Obligations') },
  { key: 'closed', label: msg('Closed') },
]
export const stageLabel = (s: GrantStage) => STAGES.find(x => x.key === s)?.label ?? s
/** Finished with: no more deadlines, and the grant can be tracked again. */
export const isDone = (s: GrantStage) => s === 'rejected' || s === 'closed'

/** The stage after this one (Rejected and Closed are the end; More information goes back to waiting on the decision). */
export function nextStage(s: GrantStage): GrantStage | null {
  const order: GrantStage[] = ['interested', 'gathering', 'submitted', 'awarded', 'paid', 'obligations', 'closed']
  if (s === 'info_requested') return 'awarded'
  if (isDone(s)) return null
  return order[order.indexOf(s) + 1] ?? null
}

export interface GrantApplication {
  id: string
  grant_id: string
  /** The grant's name when it was tracked (kept even if the catalogue changes). */
  grant_name: string
  stage: GrantStage
  submitted_on: string | null
  /** The expediente (file) number the administration gave it. */
  expediente: string | null
  amount_requested: number | null
  amount_awarded: number | null
  amount_received: number | null
  /** The next date that matters, and what it's for ("Send the justification"). */
  deadline: string | null
  deadline_label: string | null
  notes: string | null
  /** Ticked documents (DOCUMENTS ids, or the grant's own `docs` texts) and obligations (their texts). */
  docs_done: string[]
  obligations_done: string[]
  created_at: string
  updated_at: string
}
export type GrantApplicationInput = Partial<Omit<GrantApplication, 'created_at' | 'updated_at'>>

/** A grant's documents for this business (company-only ones only for a company), in the order to gather them. */
export function documentsFor(grant: Grant, entity: GrantProfile['entity']) {
  const company = entity === 'sl' || entity === 'other'
  return grant.documents.filter(d => d.applies_to !== 'company' || company)
}
