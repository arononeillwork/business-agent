// Outsourcing: the jobs done for the business by people and firms outside the team (social media,
// the books, cleaning, the coffee machine's service…), who does each and on what terms, what it all
// costs a month, and the catalogue of people and firms to choose from for each job (migration 82).
// The usual jobs are kept by their English name (shown in the person's language); any other is the
// business's own words.
import { msg } from './i18n'

export type ContractorKind = 'freelancer' | 'agency' | 'company'
export const CONTRACTOR_KINDS: { id: ContractorKind; label: string }[] = [
  { id: 'freelancer', label: msg('Freelancer') },
  { id: 'agency', label: msg('Agency') },
  { id: 'company', label: msg('Company') },
]

/** How a price is charged: a month, a year, an hour, a day, a visit, or once for a project. */
export type RateUnit = 'month' | 'year' | 'hour' | 'day' | 'visit' | 'project'
export const RATE_UNITS: { id: RateUnit; label: string; price: string }[] = [
  { id: 'month', label: msg('A month'), price: msg('{price} a month') },
  { id: 'year', label: msg('A year'), price: msg('{price} a year') },
  { id: 'hour', label: msg('An hour'), price: msg('{price} an hour') },
  { id: 'day', label: msg('A day'), price: msg('{price} a day') },
  { id: 'visit', label: msg('A visit'), price: msg('{price} a visit') },
  { id: 'project', label: msg('Once, for a project'), price: msg('{price} for the project') },
]
/** Prices that are paid for so many hours, days or visits. */
export const COUNTED: RateUnit[] = ['hour', 'day', 'visit']

/** How many of those, in what time: 6 hours a week, 2 visits a month, 4 visits a year. */
export type QuantityPer = 'week' | 'month' | 'year'
export const QUANTITY_PERS: { id: QuantityPer; label: string; perMonth: number }[] = [
  { id: 'week', label: msg('a week'), perMonth: 52 / 12 },
  { id: 'month', label: msg('a month'), perMonth: 1 },
  { id: 'year', label: msg('a year'), perMonth: 1 / 12 },
]

/** A job a café often has done from outside, how it's usually charged and what it covers. */
export interface ServicePreset { name: string; unit: RateUnit; what: string }
export const SERVICES: ServicePreset[] = [
  { name: msg('Social media management'), unit: 'month', what: msg('Posts, stories and replies on Instagram, Facebook and TikTok, with a report each month.') },
  { name: msg('Photography & video'), unit: 'project', what: msg('Photos of the drinks, the food and the café, and short videos for reels.') },
  { name: msg('Graphic design'), unit: 'project', what: msg('Menus, posters, the logo, cups and bags.') },
  { name: msg('Website'), unit: 'month', what: msg('Building the website, keeping it up to date, and its hosting.') },
  { name: msg('Ads management'), unit: 'month', what: msg('Running the Facebook, Instagram and Google ads.') },
  { name: msg('Bookkeeping & payroll'), unit: 'month', what: msg('The gestoría: the books, payslips, Social Security and the tax returns.') },
  { name: msg('Cleaning'), unit: 'hour', what: msg('A deep clean of the café, the kitchen and the toilets.') },
  { name: msg('Window cleaning'), unit: 'visit', what: msg('The shop front and the windows, inside and out.') },
  { name: msg('Coffee machine servicing'), unit: 'visit', what: msg('The espresso machine and grinders: servicing, descaling and repairs.') },
  { name: msg('Pest control'), unit: 'visit', what: msg('The pest control contract and visit reports a food business keeps for inspections.') },
  { name: msg('Maintenance & repairs'), unit: 'hour', what: msg('A handyman, an electrician or a plumber for odd jobs.') },
  { name: msg('IT & till support'), unit: 'month', what: msg('The till, the Wi-Fi, the printers and the card reader.') },
  { name: msg('Laundry'), unit: 'month', what: msg('Aprons, cloths and tea towels, collected and brought back clean.') },
  { name: msg('Extra staff for events'), unit: 'hour', what: msg('Waiters or baristas for a busy weekend, catering or a private event.') },
]

export interface Contractor {
  id: string
  name: string
  kind: ContractorKind
  /** The jobs they do (a usual one's English name, or the business's own words). */
  services: string[]
  contact_name: string | null
  email: string | null
  phone: string | null
  /** They answer on WhatsApp at that number. */
  whatsapp: boolean
  website: string | null
  /** Their Instagram, Behance or portfolio. */
  portfolio_url: string | null
  location: string | null
  /** What they usually charge, without IVA. */
  rate: number | null
  rate_unit: RateUnit
  /** The business's own score, 1 to 5. */
  rating: number | null
  notes: string | null
  starred: boolean
  /** False: archived (kept with the jobs they did). */
  active: boolean
}
export type ContractorInput = Partial<Omit<Contractor, 'id'>> & { id?: string; name: string }

export interface OutsourcedJob {
  id: string
  service: string
  contractor_id: string
  /** What's included. */
  scope: string | null
  /** The price agreed, without IVA. */
  price: number | null
  price_unit: RateUnit
  /** For a price an hour, a day or a visit: how many, in what time. */
  quantity: number | null
  quantity_per: QuantityPer | null
  starts_on: string | null
  /** When the contract runs to, or the day it ended; null: until one side ends it. */
  ends_on: string | null
  notes: string | null
  /** False: it's over. */
  active: boolean
}
export type OutsourcedJobInput = Partial<Omit<OutsourcedJob, 'id'>> & { id?: string; service: string; contractor_id: string }

const round2 = (n: number) => Math.round(n * 100) / 100
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The usual job of that name, if it is one (any capitals). */
export const presetOf = (service: string) => SERVICES.find(s => same(s.name, service))

/**
 * What a job costs a month, without IVA: a yearly price spread over twelve months, a price an hour,
 * day or visit times how many there are in a month. Null for a one-off project, or when it can't be
 * told (no price yet, or an hourly price without the hours).
 */
export function monthlyCost(j: Pick<OutsourcedJob, 'price' | 'price_unit' | 'quantity' | 'quantity_per'>): number | null {
  if (j.price == null) return null
  if (j.price_unit === 'month') return round2(j.price)
  if (j.price_unit === 'year') return round2(j.price / 12)
  if (j.price_unit === 'project' || j.quantity == null || !j.quantity_per) return null
  return round2(j.price * j.quantity * QUANTITY_PERS.find(p => p.id === j.quantity_per)!.perMonth)
}

/** What the jobs being done now cost: a month (those that can be told), the ones that can't, and one-off projects. */
export function outsourcingTotals(jobs: OutsourcedJob[]) {
  const active = jobs.filter(j => j.active)
  const monthly = active.map(monthlyCost)
  return {
    jobs: active.length,
    monthly: round2(monthly.reduce<number>((sum, m) => sum + (m ?? 0), 0)),
    /** Jobs with a regular price whose monthly cost can't be told (no price, or no hours). */
    unknown: active.filter((j, i) => monthly[i] === null && j.price_unit !== 'project').length,
    oneOff: round2(active.filter(j => j.price_unit === 'project').reduce((sum, j) => sum + (j.price ?? 0), 0)),
  }
}

/** Days from one day to another (YYYY-MM-DD). */
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

/** Within this many days of its end, a contract shows as ending soon. */
export const ENDING_SOON_DAYS = 30

/**
 * Where a job's contract is: over, starting later, its end date passed while it's still going
 * (renew it or end it), ending within a month, or running.
 */
export type ContractState = 'ended' | 'upcoming' | 'overdue' | 'ending' | 'running'
export function contractState(j: Pick<OutsourcedJob, 'active' | 'starts_on' | 'ends_on'>, today: string): ContractState {
  if (!j.active) return 'ended'
  if (j.starts_on && j.starts_on > today) return 'upcoming'
  if (!j.ends_on) return 'running'
  const left = daysBetween(today, j.ends_on)
  return left < 0 ? 'overdue' : left <= ENDING_SOON_DAYS ? 'ending' : 'running'
}

/** The same job, whatever the capitals. */
export const sameJob = same

/** Jobs in order: the usual ones as listed, then the business's own, A to Z. */
export function compareServices(a: string, b: string) {
  const order = (n: string) => { const i = SERVICES.findIndex(s => same(s.name, n)); return i < 0 ? SERVICES.length : i }
  return order(a) - order(b) || a.trim().localeCompare(b.trim())
}

/** The jobs to show, in order, each once (whatever the capitals); the usual ones keep their own spelling. */
export function sortServices(names: string[]): string[] {
  const seen = new Map<string, string>()
  for (const n of names) {
    const name = presetOf(n)?.name ?? n.trim()
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name)
  }
  return [...seen.values()].sort(compareServices)
}

/** Whether they do that job. */
export const offers = (c: Pick<Contractor, 'services'>, service: string) => c.services.some(s => same(s, service))

/**
 * The people and firms to choose from for a job (not archived): starred first, then the best rated
 * (the ones not rated yet after), then the cheapest of those charged the same way, then by name.
 */
export function optionsFor<C extends Contractor>(service: string, contractors: C[]): C[] {
  return contractors.filter(c => c.active && offers(c, service))
    .sort((a, b) => Number(b.starred) - Number(a.starred) || (b.rating ?? 0) - (a.rating ?? 0)
      || (a.rate_unit === b.rate_unit ? (a.rate ?? Infinity) - (b.rate ?? Infinity) : 0) || a.name.localeCompare(b.name))
}

/**
 * The cheapest option for a job: among those charged the way most of them are (a month, an hour…),
 * the lowest rate, when at least two can be compared and it is the only one at that rate.
 */
export function cheapestOption(options: Pick<Contractor, 'id' | 'rate' | 'rate_unit'>[]): string | null {
  const priced = options.filter(o => o.rate != null)
  const count = (u: RateUnit) => priced.filter(o => o.rate_unit === u).length
  const unit = [...new Set(priced.map(o => o.rate_unit))].sort((a, b) => count(b) - count(a))[0]
  const alike = priced.filter(o => o.rate_unit === unit).sort((a, b) => a.rate! - b.rate!)
  if (alike.length < 2 || alike[0].rate === alike[1].rate) return null
  return alike[0].id
}
