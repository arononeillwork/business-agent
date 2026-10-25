// Dashboards: each person's own reports, made of widgets (takings, the team, stock, reviews, the
// advisor's findings…) over a period. Two templates to start from: Executive (the business at a
// glance: takings, costs, margins, what to act on) and Shop manager (the day to day: today's team,
// the busy hours, what's low, the jobs). Kept in the person's preferences, so nobody else's changes.
import { msg } from './i18n'
import { addDays, weekStart } from './time'

export type WidgetKind =
  | 'takings' | 'payments' | 'average_sale' | 'takings_by_day' | 'busiest_hours' | 'weekday_takings' | 'best_sellers' | 'payment_methods'
  | 'team_cost' | 'labour_share' | 'hours_worked' | 'on_today' | 'late_starts'
  | 'low_stock' | 'stock_value' | 'waste' | 'margins'
  | 'reviews' | 'area_prices' | 'todo' | 'advice'

export type WidgetSize = 'small' | 'medium' | 'large'
/** What a widget needs to show: the takings (a till, and pay access), pay access, admin, or just being on the team. */
export type WidgetNeeds = 'sales' | 'pay' | 'admin' | 'team'
export type WidgetGroup = 'sales' | 'team' | 'stock' | 'customers' | 'operations'

export const WIDGET_GROUPS: { id: WidgetGroup; label: string }[] = [
  { id: 'sales', label: msg('Sales') }, { id: 'team', label: msg('Team') }, { id: 'stock', label: msg('Stock') },
  { id: 'customers', label: msg('Customers and the area') }, { id: 'operations', label: msg('Running the place') },
]

export interface WidgetInfo { kind: WidgetKind; group: WidgetGroup; label: string; hint: string; size: WidgetSize; needs: WidgetNeeds[] }

export const WIDGETS: WidgetInfo[] = [
  { kind: 'takings', group: 'sales', label: msg('Takings'), hint: msg('What came in, against the period before'), size: 'small', needs: ['sales'] },
  { kind: 'payments', group: 'sales', label: msg('Payments'), hint: msg('How many sales, against the period before'), size: 'small', needs: ['sales'] },
  { kind: 'average_sale', group: 'sales', label: msg('Average sale'), hint: msg('What people spend each time'), size: 'small', needs: ['sales'] },
  { kind: 'takings_by_day', group: 'sales', label: msg('Takings by day'), hint: msg('Each day, with the period before as a line'), size: 'large', needs: ['sales'] },
  { kind: 'busiest_hours', group: 'sales', label: msg('Busiest hours'), hint: msg('Takings hour by hour'), size: 'medium', needs: ['sales'] },
  { kind: 'weekday_takings', group: 'sales', label: msg('Takings by day of the week'), hint: msg('An average day of each, over the last eight weeks'), size: 'medium', needs: ['sales'] },
  { kind: 'best_sellers', group: 'sales', label: msg('Best sellers'), hint: msg('What sold most (Square)'), size: 'medium', needs: ['sales'] },
  { kind: 'payment_methods', group: 'sales', label: msg('How people paid'), hint: msg('Card, phone, cash'), size: 'medium', needs: ['sales'] },
  { kind: 'team_cost', group: 'team', label: msg('Team cost'), hint: msg('Hours worked × pay, with Social Security'), size: 'small', needs: ['admin', 'pay'] },
  { kind: 'labour_share', group: 'team', label: msg('Team cost against takings'), hint: msg('Cafés usually aim for 25–35%'), size: 'small', needs: ['admin', 'sales'] },
  { kind: 'hours_worked', group: 'team', label: msg('Hours worked'), hint: msg('From the timecards, by person'), size: 'medium', needs: ['admin'] },
  { kind: 'on_today', group: 'team', label: msg('On today'), hint: msg('Who’s on the rota today'), size: 'medium', needs: ['team'] },
  { kind: 'late_starts', group: 'team', label: msg('Late starts'), hint: msg('Clocked in over 5 minutes after the shift started'), size: 'medium', needs: ['admin'] },
  { kind: 'low_stock', group: 'stock', label: msg('Low on stock'), hint: msg('At or below the reorder level'), size: 'medium', needs: ['team'] },
  { kind: 'stock_value', group: 'stock', label: msg('Stock value'), hint: msg('At cost, without IVA'), size: 'small', needs: ['pay'] },
  { kind: 'waste', group: 'stock', label: msg('Waste'), hint: msg('What was thrown away'), size: 'small', needs: ['team'] },
  { kind: 'margins', group: 'stock', label: msg('Lowest margins'), hint: msg('Menu items that make the least'), size: 'medium', needs: ['admin'] },
  { kind: 'reviews', group: 'customers', label: msg('Google reviews'), hint: msg('The rating and new reviews'), size: 'small', needs: ['admin'] },
  { kind: 'area_prices', group: 'customers', label: msg('Your prices against the area'), hint: msg('From Competitors'), size: 'small', needs: ['admin'] },
  { kind: 'todo', group: 'operations', label: msg('Jobs to do'), hint: msg('Open and starred jobs'), size: 'medium', needs: ['team'] },
  { kind: 'advice', group: 'operations', label: msg('Business advisor'), hint: msg('What to act on first'), size: 'large', needs: ['admin'] },
]
export const widgetInfo = (k: WidgetKind) => WIDGETS.find(w => w.kind === k)!
export const isWidgetKind = (k: unknown): k is WidgetKind => WIDGETS.some(w => w.kind === k)

export interface Widget { id: string; kind: WidgetKind; size: WidgetSize }
export type DashTemplate = 'executive' | 'manager' | 'blank'
export interface Dashboard { id: string; name: string; template: DashTemplate; widgets: Widget[] }
/** Kept in the person's preferences. */
export interface SavedDashboards { boards: Dashboard[]; open?: string; period?: DashPeriod }

const w = (kind: WidgetKind, size: WidgetSize = widgetInfo(kind).size) => ({ kind, size })

export const TEMPLATES: { id: Exclude<DashTemplate, 'blank'>; name: string; hint: string; widgets: { kind: WidgetKind; size: WidgetSize }[] }[] = [
  { id: 'executive', name: msg('Executive'), hint: msg('The business at a glance: takings and the trend, what the team costs against them, margins, reviews, and what to act on first.'),
    widgets: [w('takings'), w('average_sale'), w('labour_share'), w('team_cost'), w('takings_by_day'), w('best_sellers'), w('margins'),
      w('reviews'), w('waste'), w('stock_value'), w('area_prices'), w('advice')] },
  { id: 'manager', name: msg('Shop manager'), hint: msg('The day to day: today’s takings and team, the busy hours, what’s running low, waste and the jobs to do.'),
    widgets: [w('takings'), w('payments'), w('waste'), w('average_sale'), w('on_today'), w('busiest_hours'), w('low_stock'), w('todo'),
      w('best_sellers'), w('hours_worked'), w('late_starts')] },
]

let n = 0
const id = () => `${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** A new dashboard from a template (or blank), with the widgets the person can see. */
export function newDashboard(template: DashTemplate, name: string, can: (k: WidgetKind) => boolean): Dashboard {
  const from = TEMPLATES.find(x => x.id === template)
  return { id: id(), name, template, widgets: (from?.widgets ?? []).filter(x => can(x.kind)).map(x => ({ id: id(), ...x })) }
}
export const addWidget = (d: Dashboard, kind: WidgetKind): Dashboard => ({ ...d, widgets: [...d.widgets, { id: id(), kind, size: widgetInfo(kind).size }] })
export const removeWidget = (d: Dashboard, widgetId: string): Dashboard => ({ ...d, widgets: d.widgets.filter(x => x.id !== widgetId) })
export const resizeWidget = (d: Dashboard, widgetId: string, size: WidgetSize): Dashboard => ({ ...d, widgets: d.widgets.map(x => (x.id === widgetId ? { ...x, size } : x)) })
/** Move a widget one place earlier (-1) or later (+1). */
export function moveWidget(d: Dashboard, widgetId: string, by: -1 | 1): Dashboard {
  const i = d.widgets.findIndex(x => x.id === widgetId), j = i + by
  if (i < 0 || j < 0 || j >= d.widgets.length) return d
  const widgets = [...d.widgets];
  [widgets[i], widgets[j]] = [widgets[j], widgets[i]]
  return { ...d, widgets }
}

/** What was saved, made safe to show (anything unknown dropped). */
export function readSaved(v: unknown): SavedDashboards {
  const s = (v && typeof v === 'object' ? v : {}) as Partial<SavedDashboards>
  const boards = Array.isArray(s.boards) ? s.boards.filter(b => b && typeof b.id === 'string' && typeof b.name === 'string' && Array.isArray(b.widgets))
    .map(b => ({ ...b, widgets: b.widgets.filter(x => x && typeof x.id === 'string' && isWidgetKind(x.kind)).map(x => ({ ...x, size: (['small', 'medium', 'large'] as const).includes(x.size) ? x.size : widgetInfo(x.kind).size })) })) : []
  return { boards, open: typeof s.open === 'string' ? s.open : undefined, period: DASH_PERIODS.some(p => p.id === s.period) ? s.period : undefined }
}

// ---------------- Periods ----------------

export type DashPeriod = 'today' | 'week' | 'month' | '30'
export const DASH_PERIODS: { id: DashPeriod; label: string }[] = [
  { id: 'today', label: msg('Today') }, { id: 'week', label: msg('This week') }, { id: 'month', label: msg('This month') }, { id: '30', label: msg('Last 30 days') },
]
export interface DashRange { from: string; to: string; prevFrom: string; prevTo: string }

/** The dates of a period and of the one it's compared with, the same length earlier on (today: the same day last week). */
export function dashRange(p: DashPeriod, day: string): DashRange {
  if (p === 'today') return { from: day, to: day, prevFrom: addDays(day, -7), prevTo: addDays(day, -7) }
  if (p === 'week') { const m = weekStart(day); return { from: m, to: day, prevFrom: addDays(m, -7), prevTo: addDays(day, -7) } }
  if (p === 'month') {
    const first = `${day.slice(0, 8)}01`
    const prevFirst = `${addDays(first, -1).slice(0, 8)}01`
    const sameDay = addDays(prevFirst, Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000))
    return { from: first, to: day, prevFrom: prevFirst, prevTo: sameDay >= first ? addDays(first, -1) : sameDay }
  }
  return { from: addDays(day, -29), to: day, prevFrom: addDays(day, -59), prevTo: addDays(day, -30) }
}
