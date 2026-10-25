// Food safety (the APPCC's daily records): fridge, freezer and hot-holding temperatures, and the
// cleaning and checks done, each by whom and when, with what was done when something was out of
// range. Inspectors ask for these records; nothing is changed or deleted once written.
// Limits from Spain's rules for prepared food (Real Decreto 3484/2000): chilled at 4 °C or below
// (8 °C when eaten within 24 hours), frozen at −18 °C or below, kept hot at 65 °C or above.
import { msg } from './i18n'
import { addDays, weekStart } from './time'

export type PointKind = 'temperature' | 'task'
export type Frequency = 'twice_daily' | 'daily' | 'weekly' | 'monthly'
export const FREQUENCIES: { id: Frequency; label: string }[] = [
  { id: 'twice_daily', label: msg('Twice a day') }, { id: 'daily', label: msg('Every day') },
  { id: 'weekly', label: msg('Every week') }, { id: 'monthly', label: msg('Every month') },
]
export const frequencyLabel = (f: Frequency) => FREQUENCIES.find(x => x.id === f)!.label

/** Something checked: a fridge's temperature, or a job (clean the coffee machine). */
export interface SafetyPoint {
  id: string
  name: string
  kind: PointKind
  /** Temperatures only: the lowest and highest it may read (°C); either can be open. */
  min_temp: number | null
  max_temp: number | null
  frequency: Frequency
  /** Where it is: Kitchen, Bar… */
  area: string | null
  /** How to do it, or what to do when it's out of range. */
  instructions: string | null
  active: boolean
  sort: number
}
export type PointInput = Partial<Omit<SafetyPoint, 'id'>> & { id?: string; name: string }

export interface SafetyCheck {
  id: string
  point_id: string
  checked_at: string
  /** Temperatures: what it read (°C). */
  reading: number | null
  /** In range (or done); worked out by the database. */
  ok: boolean
  /** What was done when it wasn't (moved the food, called the engineer). */
  action: string | null
  note: string | null
  by: string | null
}
export interface CheckInput { point_id: string; reading?: number | null; action?: string | null; note?: string | null }

/** A reading inside the point's limits (open limits always pass). */
export const inRange = (p: Pick<SafetyPoint, 'min_temp' | 'max_temp'>, reading: number) =>
  (p.min_temp === null || reading >= p.min_temp) && (p.max_temp === null || reading <= p.max_temp)

/** "0 to 5 °C", "−18 °C or below", "65 °C or above". */
export function limitsText(p: Pick<SafetyPoint, 'min_temp' | 'max_temp'>): { text: string; vars: Record<string, string> } | null {
  const c = (n: number) => String(n).replace('-', '−')
  if (p.min_temp !== null && p.max_temp !== null) return { text: msg('{min} to {max} °C'), vars: { min: c(p.min_temp), max: c(p.max_temp) } }
  if (p.max_temp !== null) return { text: msg('{max} °C or below'), vars: { max: c(p.max_temp) } }
  if (p.min_temp !== null) return { text: msg('{min} °C or above'), vars: { min: c(p.min_temp) } }
  return null
}

/** The first day of the period a check counts for (the day, its week from Monday, or its month). */
export function periodStart(f: Frequency, day: string) {
  if (f === 'weekly') return weekStart(day)
  if (f === 'monthly') return `${day.slice(0, 7)}-01`
  return day
}
const needed = (f: Frequency) => (f === 'twice_daily' ? 2 : 1)

export interface Due { point: SafetyPoint; done: number; needed: number; last: SafetyCheck | null }

/**
 * What's to do in the period that includes `today`, for each active point: how many checks it
 * needs (two a day for twice daily), how many were done, and the last one.
 * `checks` holds checks with their local day (`day`, YYYY-MM-DD).
 */
export function dueToday(points: SafetyPoint[], checks: (SafetyCheck & { day: string })[], today: string): Due[] {
  return points.filter(p => p.active).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map(p => {
    const from = periodStart(p.frequency, today)
    const mine = checks.filter(c => c.point_id === p.id && c.day >= from && c.day <= today).sort((a, b) => b.checked_at.localeCompare(a.checked_at))
    return { point: p, done: mine.length, needed: needed(p.frequency), last: mine[0] ?? null }
  })
}

/** The days to show in the log: today and the ones before it. */
export const lastDays = (today: string, n: number) => Array.from({ length: n }, (_, i) => addDays(today, -i))

export interface PointPreset { key: string; name: string; kind: PointKind; min_temp: number | null; max_temp: number | null; frequency: Frequency; area: string; instructions: string }

/** What a café usually records. A starting point: the business's own APPCC says what applies. */
export const CAFE_POINTS: PointPreset[] = [
  { key: 'fridge', name: msg('Kitchen fridge'), kind: 'temperature', min_temp: 0, max_temp: 4, frequency: 'twice_daily', area: msg('Kitchen'),
    instructions: msg('Above 4 °C: move the food to another fridge, check the door seal, and ask the person in charge what can be kept.') },
  { key: 'milk', name: msg('Milk fridge (bar)'), kind: 'temperature', min_temp: 0, max_temp: 4, frequency: 'twice_daily', area: msg('Bar'),
    instructions: msg('Above 4 °C: move the milk to the kitchen fridge and check the door is closing.') },
  { key: 'display', name: msg('Cake display'), kind: 'temperature', min_temp: 0, max_temp: 8, frequency: 'daily', area: msg('Bar'),
    instructions: msg('Cakes in the display are sold the same day. Above 8 °C: move them to the fridge.') },
  { key: 'freezer', name: msg('Freezer'), kind: 'temperature', min_temp: null, max_temp: -18, frequency: 'daily', area: msg('Kitchen'),
    instructions: msg('Above −18 °C: don’t open it, check it’s plugged in, and call the engineer if it doesn’t recover.') },
  { key: 'hot', name: msg('Hot holding (soup, toasties)'), kind: 'temperature', min_temp: 65, max_temp: null, frequency: 'daily', area: msg('Kitchen'),
    instructions: msg('Below 65 °C: heat it back up to above 75 °C once, or throw it away.') },
  { key: 'machine', name: msg('Coffee machine backflush and steam wands'), kind: 'task', min_temp: null, max_temp: null, frequency: 'daily', area: msg('Bar'),
    instructions: msg('At closing: backflush with detergent, soak the portafilters, purge and wipe the steam wands.') },
  { key: 'surfaces', name: msg('Surfaces and chopping boards sanitised'), kind: 'task', min_temp: null, max_temp: null, frequency: 'daily', area: msg('Kitchen'),
    instructions: msg('After each service, with the food-safe sanitiser.') },
  { key: 'dates', name: msg('Use-by dates and labels checked'), kind: 'task', min_temp: null, max_temp: null, frequency: 'daily', area: msg('Kitchen'),
    instructions: msg('Opened food labelled with the day it was opened; anything past its date thrown away (and logged as waste).') },
  { key: 'deep', name: msg('Fridges deep cleaned'), kind: 'task', min_temp: null, max_temp: null, frequency: 'weekly', area: msg('Kitchen'),
    instructions: msg('Emptied, washed and sanitised, seals included.') },
  { key: 'grinders', name: msg('Grinders cleaned'), kind: 'task', min_temp: null, max_temp: null, frequency: 'weekly', area: msg('Bar'),
    instructions: msg('Hoppers washed and burrs brushed (or cleaning tablets run through).') },
  { key: 'pests', name: msg('Pest check (traps and signs)'), kind: 'task', min_temp: null, max_temp: null, frequency: 'monthly', area: msg('Storeroom'),
    instructions: msg('Look at the traps and for droppings or gnawing; anything found goes to the pest control company.') },
]
