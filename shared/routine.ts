// The weekly routine: what's done on set days, every week or less often (the stock take and buying list
// on Monday, the cleaner's run, the supplier price check, the accounts talk with the gestoría, the
// business meeting…), each with its time, who does it and a short checklist. The Calendar shows each
// day's under its theme, with filters to hide a category or one activity (the `weekly_routine`
// migration). The team reads it and ticks things done; admins change it.
import { msg } from './i18n'
import { addDays, weekStart } from './time'
import { isoWeekday, type Weekday } from './themeDays'

export type RoutineCategory = 'stock' | 'cleaning' | 'suppliers' | 'accounts' | 'meetings' | 'maintenance' | 'marketing' | 'team'
/** Each category, its name and colour (the app gives each its icon). */
export const ROUTINE_CATEGORIES: { id: RoutineCategory; label: string; colour: string }[] = [
  { id: 'stock', label: msg('Stock & buying'), colour: '#B86E2A' },
  { id: 'cleaning', label: msg('Cleaning'), colour: '#2F86A6' },
  { id: 'suppliers', label: msg('Suppliers & wholesale'), colour: '#7A5BAE' },
  { id: 'accounts', label: msg('Accounts & admin'), colour: '#4A6536' },
  { id: 'meetings', label: msg('Meetings'), colour: '#C2506A' },
  { id: 'maintenance', label: msg('Maintenance'), colour: '#6B645E' },
  { id: 'marketing', label: msg('Marketing'), colour: '#C77A12' },
  { id: 'team', label: msg('Team'), colour: '#2F7D7A' },
]
export const ROUTINE_CATEGORY_IDS = ROUTINE_CATEGORIES.map(c => c.id)
export const categoryOf = (id: string) => ROUTINE_CATEGORIES.find(c => c.id === id) ?? ROUTINE_CATEGORIES[ROUTINE_CATEGORIES.length - 1]

export interface RoutineItem {
  id: string
  name: string
  category: RoutineCategory
  /** The days of the week it's on (1 Monday … 7 Sunday). */
  weekdays: Weekday[]
  /** Every week (1), or every 2, 3 or 4 weeks counted from the week it starts. */
  every_weeks: number
  /** Only one week of the month: the first (1) to the fourth (4) of those weekdays, or the last (5). */
  month_week: number | null
  /** When it starts (nothing before then); every 2 weeks counts from this week. */
  starts_on: string
  /** Its time slot (HH:mm), when it has one. */
  starts_at: string | null
  ends_at: string | null
  /** Who does it: someone on the team, or a role from Roles & responsibilities (or nobody in particular). */
  profile_id: string | null
  job_role_id: string | null
  /** What to do, one thing per line. */
  checklist: string[]
  notes: string | null
  /** Off: kept, not shown on the calendar. */
  active: boolean
  sort: number
}
export type RoutineItemInput = Partial<Omit<RoutineItem, 'id'>> & Pick<RoutineItem, 'name' | 'category' | 'weekdays'> & { id?: string }

/** Someone ticked an activity done for a date. */
export interface RoutineDone { item_id: string; day: string; done_by: string | null; done_at: string }

export const ROUTINE_LIMITS = { name: 80, notes: 1000, checklist: 30, line: 200 }

/** How often, as the form offers it: every 1–4 weeks, or one week of the month. */
export type RoutineEvery = 'w1' | 'w2' | 'w3' | 'w4' | 'm1' | 'm2' | 'm3' | 'm4' | 'm5'
export const ROUTINE_EVERY: { id: RoutineEvery; label: string }[] = [
  { id: 'w1', label: msg('Every week') },
  { id: 'w2', label: msg('Every 2 weeks') },
  { id: 'w3', label: msg('Every 3 weeks') },
  { id: 'w4', label: msg('Every 4 weeks') },
  { id: 'm1', label: msg('First week of the month') },
  { id: 'm2', label: msg('Second week of the month') },
  { id: 'm3', label: msg('Third week of the month') },
  { id: 'm4', label: msg('Fourth week of the month') },
  { id: 'm5', label: msg('Last week of the month') },
]
export const everyOf = (r: Pick<RoutineItem, 'every_weeks' | 'month_week'>): RoutineEvery =>
  (r.month_week ? `m${r.month_week}` : `w${Math.min(4, Math.max(1, r.every_weeks))}`) as RoutineEvery
export const fromEvery = (e: RoutineEvery): Pick<RoutineItem, 'every_weeks' | 'month_week'> =>
  e.startsWith('m') ? { every_weeks: 1, month_week: Number(e.slice(1)) } : { every_weeks: Number(e.slice(1)), month_week: null }

/** What's wrong with an activity before it's saved (the database says the same), or null. */
export function routineProblem(r: Partial<RoutineItemInput>): string | null {
  const name = (r.name ?? '').trim()
  if (!name) return msg('Give the activity a name')
  if (name.length > ROUTINE_LIMITS.name) return msg('Keep the name to 80 characters')
  if (!r.category || !ROUTINE_CATEGORY_IDS.includes(r.category)) return msg('Pick a category')
  if (!r.weekdays?.length || r.weekdays.some(w => !Number.isInteger(w) || w < 1 || w > 7)) return msg('Pick at least one day')
  if (r.every_weeks != null && (!Number.isInteger(r.every_weeks) || r.every_weeks < 1 || r.every_weeks > 8)) return msg('Every 1 to 8 weeks')
  if (r.month_week != null && (r.month_week < 1 || r.month_week > 5 || (r.every_weeks ?? 1) !== 1)) return msg('Pick the week of the month')
  const hm = /^([01]\d|2[0-3]):[0-5]\d$/
  if (r.starts_at && !hm.test(r.starts_at)) return msg('Times are like 09:30')
  if (r.ends_at && (!r.starts_at || !hm.test(r.ends_at))) return msg('Give it a start time before the end')
  if (r.starts_at && r.ends_at && r.ends_at <= r.starts_at) return msg('It ends after it starts')
  if (r.profile_id && r.job_role_id) return msg('Someone or a role, not both')
  if ((r.notes ?? '').trim().length > ROUTINE_LIMITS.notes) return msg('Keep the notes to 1000 characters')
  const lines = r.checklist ?? []
  if (lines.length > ROUTINE_LIMITS.checklist) return msg('Up to 30 things on the checklist')
  if (lines.some(l => l.trim().length > ROUTINE_LIMITS.line)) return msg('Keep each thing on the checklist to 200 characters')
  return null
}

/** The checklist from the form (one per line): trimmed, bullets and blanks left out. */
export const checklistFrom = (text: string) =>
  text.split('\n').map(l => l.replace(/^\s*[-•*·]\s*/, '').trim()).filter(Boolean).slice(0, ROUTINE_LIMITS.checklist)

/** Whole weeks from one Monday to another. */
const weeksBetween = (fromMonday: string, toMonday: string) =>
  Math.round((Date.parse(`${toMonday}T12:00:00Z`) - Date.parse(`${fromMonday}T12:00:00Z`)) / (7 * 86_400_000))

/** Whether an activity falls on a date: its weekday, how often it runs, and not before it starts. */
export function fallsOn(r: Pick<RoutineItem, 'weekdays' | 'every_weeks' | 'month_week' | 'starts_on'>, date: string): boolean {
  if (date < r.starts_on || !r.weekdays.includes(isoWeekday(date))) return false
  if (r.month_week) {
    // The last one: a week later is in another month. Otherwise the 1st to 7th is the first week, and so on.
    if (r.month_week === 5) return addDays(date, 7).slice(0, 7) !== date.slice(0, 7)
    return Math.ceil(Number(date.slice(8, 10)) / 7) === r.month_week
  }
  return weeksBetween(weekStart(r.starts_on), weekStart(date)) % Math.max(1, r.every_weeks) === 0
}

/** Untimed activities first, then by time; then in their order. */
const byTime = (a: RoutineItem, b: RoutineItem) =>
  (a.starts_at ?? '').localeCompare(b.starts_at ?? '') || a.sort - b.sort || a.name.localeCompare(b.name)

/** The activities on a date, in the day's order (switched-off ones left out). */
export const routineOn = (items: RoutineItem[], date: string) => items.filter(r => r.active && fallsOn(r, date)).sort(byTime)

/** Activities on one weekday, every one (for the Routine tab), in the day's order. */
export const routineOnWeekday = (items: RoutineItem[], weekday: Weekday) => items.filter(r => r.weekdays.includes(weekday)).sort(byTime)

/** "09:00–09:45", "09:00", or '' without a time. */
export const slotOf = (r: Pick<RoutineItem, 'starts_at' | 'ends_at'>) =>
  r.starts_at ? (r.ends_at ? `${r.starts_at.slice(0, 5)}–${r.ends_at.slice(0, 5)}` : r.starts_at.slice(0, 5)) : ''

/**
 * What someone shows on their calendar (kept in their preferences): the theme days and the routine
 * (shown unless turned off), and the routine's categories and activities they hid for themselves.
 */
export interface CalendarShow { themes?: boolean; routine?: boolean; hiddenCategories?: RoutineCategory[]; hiddenItems?: string[] }

/** The activities someone sees, after their own filters. */
export const shownRoutine = (items: RoutineItem[], show: CalendarShow | undefined) =>
  show?.routine === false ? [] : items.filter(r => !show?.hiddenCategories?.includes(r.category) && !show?.hiddenItems?.includes(r.id))
