// Employment contracts (Team → Contracts): each person's contract with the business under Spanish law:
// its type (indefinido, fijo discontinuo, temporal…), its dates and trial period (periodo de prueba), the
// hours a week, the gross salary, the collective agreement (convenio) and the job (grupo profesional).
// The salary is kept apart from the rest (the `employment_contracts` migration), so a shop manager runs
// the contracts without seeing pay. Admins add, change and end them; everyone sees their own.
import { msg } from './i18n'

export type ContractKind =
  | 'indefinido' | 'indefinido_parcial' | 'fijo_discontinuo' | 'temporal_produccion' | 'temporal_sustitucion' | 'formativo' | 'autonomo'

/** The kinds of contract Spanish law has (since the 2022 labour reform), and working as a freelancer. */
export const CONTRACT_KINDS: { id: ContractKind; label: string; summary: string; temporary: boolean }[] = [
  { id: 'indefinido', label: msg('Permanent (indefinido)'), temporary: false,
    summary: msg('Full-time with no end date: the usual contract since the 2022 labour reform.') },
  { id: 'indefinido_parcial', label: msg('Permanent part-time (indefinido a tiempo parcial)'), temporary: false,
    summary: msg('No end date, for fewer hours than full-time. The hours a week go in the contract.') },
  { id: 'fijo_discontinuo', label: msg('Seasonal permanent (fijo discontinuo)'), temporary: false,
    summary: msg('Permanent, for work that comes back each season: called back every year, in the order of the convenio.') },
  { id: 'temporal_produccion', label: msg('Temporary: busy periods (circunstancias de la producción)'), temporary: true,
    summary: msg('For a rise in work, such as the summer: up to 6 months (12 if the convenio says so), or 90 days a year for short, planned peaks.') },
  { id: 'temporal_sustitucion', label: msg('Temporary: cover (sustitución)'), temporary: true,
    summary: msg('Covers someone who is away and keeps their job (leave, sick leave): it ends when they come back.') },
  { id: 'formativo', label: msg('Training or work placement (formativo / prácticas)'), temporary: true,
    summary: msg('Training while working, or first job after studying: from 6 months to 1 year (prácticas) or 3 months to 2 years (formación en alternancia).') },
  { id: 'autonomo', label: msg('Freelance (autónomo)'), temporary: false,
    summary: msg('Not an employee: works for the business on their own account and invoices it.') },
]
export const contractKind = (id: ContractKind) => CONTRACT_KINDS.find(k => k.id === id) ?? CONTRACT_KINDS[0]

/** How the gross salary is given: an hour, a month or a year. */
export type SalaryPer = 'hour' | 'month' | 'year'
export const SALARY_PERS: { id: SalaryPer; label: string; amount: string }[] = [
  { id: 'hour', label: msg('An hour'), amount: msg('{price} an hour') },
  { id: 'month', label: msg('A month'), amount: msg('{price} a month') },
  { id: 'year', label: msg('A year'), amount: msg('{price} a year') },
]

/** The convenio a new contract starts with: hostelería in Málaga, where Easy Beans is. */
export const DEFAULT_CONVENIO = 'Hostelería de Málaga'

export interface EmploymentContract {
  id: string
  /** Whose contract it is. */
  profile_id: string
  kind: ContractKind
  starts_on: string
  /** The last day; null while it runs with no end date (a permanent contract). */
  ends_on: string | null
  /** The last day of the trial period (periodo de prueba), if it has one. */
  trial_ends_on: string | null
  hours_per_week: number | null
  /** The gross salary. Null when there's none yet, or for someone who doesn't see pay. */
  salary: number | null
  salary_per: SalaryPer | null
  /** The collective agreement (convenio colectivo) it's under. */
  convenio: string | null
  /** The job and its category (grupo profesional) in the convenio. */
  job_title: string | null
  /** The signed contract: a link to it in Drive or OneDrive. */
  document_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}
/** A new contract (no id) or the fields to change. Without `salary`, the pay is left as it is. */
export type EmploymentContractInput = Partial<Omit<EmploymentContract, 'id' | 'created_at' | 'updated_at'>> & { id?: string }

/** Within this many days of its last day, a contract shows as ending soon. */
export const ENDING_SOON_DAYS = 30
/** Within this many days of the end of its trial period, the trial shows as ending soon. */
export const TRIAL_SOON_DAYS = 14

/** Days from one day to another (YYYY-MM-DD). */
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

/**
 * Where a contract is today: not started yet, in its trial period, running, ending within 30 days, or
 * ended. Ending soon comes before the trial period: it's the one to act on.
 */
export type ContractStatus = 'upcoming' | 'trial' | 'active' | 'ending' | 'ended'
export function contractStatus(c: Pick<EmploymentContract, 'starts_on' | 'ends_on' | 'trial_ends_on'>, today: string): ContractStatus {
  if (c.ends_on && c.ends_on < today) return 'ended'
  if (c.starts_on > today) return 'upcoming'
  if (c.ends_on && daysBetween(today, c.ends_on) <= ENDING_SOON_DAYS) return 'ending'
  if (c.trial_ends_on && c.trial_ends_on >= today) return 'trial'
  return 'active'
}

/** In its trial period, which ends within two weeks. */
export const trialEndingSoon = (c: Pick<EmploymentContract, 'starts_on' | 'ends_on' | 'trial_ends_on'>, today: string) =>
  !!c.trial_ends_on && c.trial_ends_on >= today && c.starts_on <= today && !(c.ends_on && c.ends_on < today)
  && daysBetween(today, c.trial_ends_on) <= TRIAL_SOON_DAYS

/** Running today: started, and not ended. */
export const isCurrent = (c: Pick<EmploymentContract, 'starts_on' | 'ends_on' | 'trial_ends_on'>, today: string) =>
  !['upcoming', 'ended'].includes(contractStatus(c, today))

/** The page's filters: every contract, those not ended (starting later too), those ending soon, the ended. */
export type ContractFilter = 'all' | 'active' | 'ending' | 'ended'
export const CONTRACT_FILTERS: { id: ContractFilter; label: string }[] = [
  { id: 'all', label: msg('All') },
  { id: 'active', label: msg('Active') },
  { id: 'ending', label: msg('Ending soon') },
  { id: 'ended', label: msg('Ended') },
]
export function inFilter(status: ContractStatus, filter: ContractFilter) {
  if (filter === 'all') return true
  if (filter === 'active') return status !== 'ended'
  return status === filter
}

/** Weeks in a month, on average: 52 weeks over 12 months. */
export const WEEKS_A_MONTH = 52 / 12
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * The gross salary a month: as it is when given a month, a year's over 12 months, an hour's times the
 * hours a week times 52 weeks over 12 months. Null without a salary, or for an hourly one without the hours.
 */
export function monthlyGross(c: Pick<EmploymentContract, 'salary' | 'salary_per' | 'hours_per_week'>): number | null {
  if (c.salary == null || !c.salary_per) return null
  if (c.salary_per === 'month') return round2(c.salary)
  if (c.salary_per === 'year') return round2(c.salary / 12)
  return c.hours_per_week == null ? null : round2(c.salary * c.hours_per_week * WEEKS_A_MONTH)
}

/**
 * The contracts running today: how many people are on one, their hours a week, and their gross pay a
 * month (from the salaries that can be read; `unknown` counts those with no figure to add up).
 */
export function contractTotals(contracts: EmploymentContract[], today: string) {
  const current = contracts.filter(c => isCurrent(c, today))
  const monthly = current.map(monthlyGross)
  return {
    people: new Set(current.map(c => c.profile_id)).size,
    contracts: current.length,
    hours: round2(current.reduce((sum, c) => sum + (c.hours_per_week ?? 0), 0)),
    monthly: round2(monthly.reduce<number>((sum, m) => sum + (m ?? 0), 0)),
    unknown: monthly.filter(m => m === null).length,
  }
}

/** Each person's contracts, newest first (by the day each starts). */
export function contractsByPerson(contracts: EmploymentContract[]): Map<string, EmploymentContract[]> {
  const by = new Map<string, EmploymentContract[]>()
  for (const c of [...contracts].sort((a, b) => b.starts_on.localeCompare(a.starts_on) || b.created_at.localeCompare(a.created_at))) {
    by.set(c.profile_id, [...(by.get(c.profile_id) ?? []), c])
  }
  return by
}

/** The same limits as the database's. */
export const CONTRACT_LIMITS = { hours: 80, convenio: 200, jobTitle: 120, notes: 2000, url: 2000 }

/** What's wrong with a contract before it's saved (the database says the same), or null. */
export function contractProblem(c: EmploymentContractInput & { profile_id?: string; starts_on?: string }): string | null {
  if (!c.profile_id) return msg('Choose whose contract it is')
  if (!c.kind || !CONTRACT_KINDS.some(k => k.id === c.kind)) return msg('Choose the type of contract')
  if (!c.starts_on) return msg('Say when it starts')
  if (c.ends_on && c.ends_on < c.starts_on) return msg('It can’t end before it starts')
  if (c.trial_ends_on && c.trial_ends_on < c.starts_on) return msg('The trial period can’t end before the contract starts')
  if (c.hours_per_week != null && !(c.hours_per_week > 0 && c.hours_per_week <= CONTRACT_LIMITS.hours)) return msg('Give the hours a week, up to 80')
  if (c.salary != null && !(c.salary >= 0)) return msg('Enter numbers like 12 or 1,45')
  if (c.document_url && !/^https?:\/\/\S+$/i.test(c.document_url.trim())) return msg('The link needs to start with https://')
  return null
}
