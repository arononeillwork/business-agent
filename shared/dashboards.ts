// Dashboards: each person's own reports, made of widgets (takings, the team, stock, reviews, the
// advisor's findings…) over a period. Two templates to start from: Executive (the business at a
// glance: takings, costs, margins, what to act on) and Shop manager (the day to day: today's team,
// the busy hours, what's low, the jobs). Kept in the person's preferences, so nobody else's changes.
// A third, Accountant, is what the gestoría or accountant asks for, over whole months and quarters
// (its figures: shared/accountant.ts).
// A fourth, Sales, is for whoever runs the selling: the takings and where the period is heading, the best
// days and hours, what sells most, who sold it at the till, the reps who bring people in (shared/salesDashboard.ts).
import { msg } from './i18n'
import { addDays, weekStart } from './time'

export type WidgetKind =
  | 'takings' | 'payments' | 'average_sale' | 'takings_by_day' | 'busiest_hours' | 'weekday_takings' | 'best_sellers' | 'payment_methods'
  | 'team_cost' | 'labour_share' | 'hours_worked' | 'on_today' | 'late_starts'
  | 'low_stock' | 'stock_value' | 'waste' | 'margins'
  | 'reviews' | 'area_prices' | 'todo' | 'advice'
  | 'net_takings' | 'vat' | 'pnl' | 'wages' | 'tax_due' | 'invoices' | 'claims' | 'running_costs' | 'credit_debit'
  | 'sales_pace' | 'items_sold' | 'team_sales' | 'top_reps' | 'tips' | 'refunds'

export type WidgetSize = 'small' | 'medium' | 'large'
/**
 * What a widget needs to show: the takings (a till, and pay access), pay access, admin, just being on the team,
 * or the business's finances (admins with pay access, and a gestoría given the finances area: canSeeFinances).
 */
export type WidgetNeeds = 'sales' | 'pay' | 'admin' | 'team' | 'finances'
export type WidgetGroup = 'sales' | 'team' | 'stock' | 'customers' | 'operations' | 'accounts'

export const WIDGET_GROUPS: { id: WidgetGroup; label: string }[] = [
  { id: 'sales', label: msg('Sales') }, { id: 'team', label: msg('Team') }, { id: 'stock', label: msg('Stock') },
  { id: 'customers', label: msg('Customers and the area') }, { id: 'operations', label: msg('Running the place') },
  { id: 'accounts', label: msg('Accounts') },
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
  { kind: 'sales_pace', group: 'sales', label: msg('On course for'), hint: msg('Where the period is heading: so far, and a usual day for each day left'), size: 'small', needs: ['sales'] },
  { kind: 'items_sold', group: 'sales', label: msg('Most sold'), hint: msg('By how many sold, not the money (Square)'), size: 'medium', needs: ['sales'] },
  { kind: 'team_sales', group: 'sales', label: msg('Sales by person'), hint: msg('Who took the payments at the till (Square)'), size: 'medium', needs: ['admin'] },
  { kind: 'top_reps', group: 'sales', label: msg('Reps who brought most'), hint: msg('From Sales reps & rewards: what each earned in the period'), size: 'medium', needs: ['admin'] },
  { kind: 'tips', group: 'sales', label: msg('Tips'), hint: msg('What customers left, against the period before'), size: 'small', needs: ['sales'] },
  { kind: 'refunds', group: 'sales', label: msg('Refunds'), hint: msg('What was given back, and its share of the takings'), size: 'small', needs: ['sales'] },
  { kind: 'team_cost', group: 'team', label: msg('Team cost'), hint: msg('Hours worked × pay, with Social Security'), size: 'small', needs: ['admin', 'pay'] },
  { kind: 'labour_share', group: 'team', label: msg('Team cost against takings'), hint: msg('Cafés usually aim for 25–35%'), size: 'small', needs: ['admin', 'sales'] },
  { kind: 'hours_worked', group: 'team', label: msg('Hours worked'), hint: msg('From the timecards, by person'), size: 'medium', needs: ['admin'] },
  { kind: 'on_today', group: 'team', label: msg('On today'), hint: msg('Who’s on the rota today'), size: 'medium', needs: ['team'] },
  { kind: 'late_starts', group: 'team', label: msg('Late starts'), hint: msg('Clocked in over 5 minutes after the shift started'), size: 'medium', needs: ['admin'] },
  { kind: 'low_stock', group: 'stock', label: msg('Low on stock'), hint: msg('At or below the reorder level'), size: 'medium', needs: ['team'] },
  { kind: 'stock_value', group: 'stock', label: msg('Stock value'), hint: msg('At cost, without VAT'), size: 'small', needs: ['pay'] },
  { kind: 'waste', group: 'stock', label: msg('Waste'), hint: msg('What was thrown away'), size: 'small', needs: ['team'] },
  { kind: 'margins', group: 'stock', label: msg('Lowest margins'), hint: msg('Menu items that make the least'), size: 'medium', needs: ['admin'] },
  { kind: 'reviews', group: 'customers', label: msg('Google reviews'), hint: msg('The rating and new reviews'), size: 'small', needs: ['admin'] },
  { kind: 'area_prices', group: 'customers', label: msg('Your prices against the area'), hint: msg('From Competitors'), size: 'small', needs: ['admin'] },
  { kind: 'todo', group: 'operations', label: msg('Jobs to do'), hint: msg('Open and starred jobs'), size: 'medium', needs: ['team'] },
  { kind: 'advice', group: 'operations', label: msg('Business advisor'), hint: msg('What to act on first'), size: 'large', needs: ['admin'] },
  { kind: 'net_takings', group: 'accounts', label: msg('Takings, net of refunds'), hint: msg('What came in less refunds, and the VAT in it'), size: 'small', needs: ['sales', 'finances'] },
  { kind: 'vat', group: 'accounts', label: msg('VAT'), hint: msg('On the takings and sales invoices, against the invoices received'), size: 'medium', needs: ['sales', 'finances'] },
  { kind: 'pnl', group: 'accounts', label: msg('Profit & loss'), hint: msg('Takings without VAT, the costs and the team: the operating profit'), size: 'medium', needs: ['sales', 'finances'] },
  { kind: 'wages', group: 'accounts', label: msg('Staff wages'), hint: msg('Pay and the employer’s Social Security, from the timecards and the rota'), size: 'small', needs: ['admin', 'pay'] },
  { kind: 'tax_due', group: 'accounts', label: msg('Next tax returns'), hint: msg('What’s due next, from Tax'), size: 'medium', needs: ['finances'] },
  { kind: 'invoices', group: 'accounts', label: msg('Invoices to pay'), hint: msg('Received and not paid yet, overdue first'), size: 'medium', needs: ['finances'] },
  { kind: 'claims', group: 'accounts', label: msg('Expenses to pay back'), hint: msg('What the team spent for the business and is owed'), size: 'medium', needs: ['finances'] },
  { kind: 'running_costs', group: 'accounts', label: msg('Monthly costs'), hint: msg('The running costs on Finances'), size: 'small', needs: ['finances'] },
  { kind: 'credit_debit', group: 'accounts', label: msg('Credit & debit'), hint: msg('Loans and finance still to pay, and money to come in'), size: 'small', needs: ['finances'] },
]
export const widgetInfo = (k: WidgetKind) => WIDGETS.find(w => w.kind === k)!
export const isWidgetKind = (k: unknown): k is WidgetKind => WIDGETS.some(w => w.kind === k)

export interface Widget { id: string; kind: WidgetKind; size: WidgetSize }
export type DashTemplate = 'executive' | 'manager' | 'sales' | 'accountant' | 'blank'
/** `period`: its own, when its template has periods of its own (the Accountant's); the others share SavedDashboards' period. */
export interface Dashboard { id: string; name: string; template: DashTemplate; widgets: Widget[]; period?: DashPeriod }
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
  { id: 'sales', name: msg('Sales'), hint: msg('For whoever runs the selling: the takings, how many sales and the average, where the period is heading, the busiest days and hours, what sells most, who sold it at the till, the reps who bring people in, tips and refunds.'),
    widgets: [w('takings'), w('payments'), w('average_sale'), w('sales_pace'), w('takings_by_day'), w('best_sellers'), w('items_sold'), w('busiest_hours'),
      w('weekday_takings'), w('team_sales'), w('top_reps'), w('payment_methods'), w('tips'), w('refunds')] },
  { id: 'accountant', name: msg('Accountant'), hint: msg('For the gestoría or accountant, by the month or the quarter: takings net of refunds and how people paid, the profit and loss, VAT, the next tax returns, invoices to pay, expenses to pay back, the monthly costs and what’s owed.'),
    widgets: [w('net_takings'), w('wages'), w('running_costs'), w('credit_debit'), w('pnl'), w('vat'), w('payment_methods'), w('tax_due'),
      w('invoices'), w('claims')] },
]

/** Who's looking, as useApp() says: what canHave goes by. */
export interface Viewer { isAdmin: boolean; isPartner: boolean; canSeePay: boolean; canSeeFinances: boolean }

/**
 * Whether someone can have what a widget (or a report) needs. The team's widgets are for the team; admin, pay
 * and the takings for the business's own admins (never a partner: the till isn't theirs to read); the finances
 * for admins with pay access and a gestoría given the finances area, who is the business's accountant too.
 */
export const canHave = (needs: WidgetNeeds[], v: Viewer) => needs.every(n => (n === 'finances' ? v.canSeeFinances
  : n === 'admin' ? v.isAdmin && !v.isPartner : n === 'pay' || n === 'sales' ? v.canSeePay && !v.isPartner : !v.isPartner))

/** The templates worth offering someone: those with a widget they can see. */
export const templatesFor = (can: (k: WidgetKind) => boolean) => TEMPLATES.filter(x => x.widgets.some(w => can(w.kind)))

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

export type DashPeriod = 'today' | 'week' | 'month' | '30' | 'last_month' | 'quarter' | 'last_quarter'
export const DASH_PERIODS: { id: DashPeriod; label: string }[] = [
  { id: 'today', label: msg('Today') }, { id: 'week', label: msg('This week') }, { id: 'month', label: msg('This month') }, { id: '30', label: msg('Last 30 days') },
]
/** The Accountant's periods: whole months and quarters, as the books and the VAT returns go. It opens on last month, the one just closed. */
export const ACCOUNTANT_PERIODS: { id: DashPeriod; label: string }[] = [
  { id: 'month', label: msg('This month') }, { id: 'last_month', label: msg('Last month') }, { id: 'quarter', label: msg('This quarter') },
  { id: 'last_quarter', label: msg('Last quarter') },
]
const OWN_PERIODS: Partial<Record<DashTemplate, { periods: { id: DashPeriod; label: string }[]; start: DashPeriod }>> = {
  accountant: { periods: ACCOUNTANT_PERIODS, start: 'last_month' },
}

/** The periods a dashboard offers: its template's own (the Accountant's), or the usual ones. */
export const periodsOf = (d: Pick<Dashboard, 'template'>) => OWN_PERIODS[d.template]?.periods ?? DASH_PERIODS
/** Whether a dashboard keeps a period of its own, rather than the one the others share. */
export const ownPeriod = (d: Pick<Dashboard, 'template'>) => !!OWN_PERIODS[d.template]

/** The period a dashboard shows: its own (one it offers, else the one its template starts on), or the shared one (this week to start). */
export function boardPeriod(d: Pick<Dashboard, 'template' | 'period'> | null, shared: DashPeriod | undefined): DashPeriod {
  const own = d ? OWN_PERIODS[d.template] : undefined
  if (d && own) return own.periods.some(p => p.id === d.period) ? d.period! : own.start
  return shared && DASH_PERIODS.some(p => p.id === shared) ? shared : 'week'
}

export interface DashRange { from: string; to: string; prevFrom: string; prevTo: string }

/**
 * The last day of a period still going on `day` (today: itself; this week, month or quarter: its last day), or
 * null for one that isn't (the last 30 days, last month, last quarter). On course for goes by it; the period
 * before ends at periodEnd(p, prevFrom).
 */
export function periodEnd(p: DashPeriod, day: string): string | null {
  if (p === 'today') return day
  if (p === 'week') return addDays(weekStart(day), 6)
  if (p === 'month') return addDays(monthStart(addDays(monthStart(day), 32)), -1)
  if (p === 'quarter') return addDays(quarterStart(addDays(quarterStart(day), 95)), -1)
  return null
}

const monthStart = (day: string) => `${day.slice(0, 8)}01`
const quarterStart = (day: string) => `${day.slice(0, 5)}${String(Math.floor((Number(day.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`
const daysFrom = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

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
  // Last month and last quarter: whole, against the whole one before. This quarter: so far, against as many days of the last one.
  if (p === 'last_month') {
    const first = monthStart(addDays(monthStart(day), -1))
    return { from: first, to: addDays(monthStart(day), -1), prevFrom: monthStart(addDays(first, -1)), prevTo: addDays(first, -1) }
  }
  if (p === 'quarter') {
    const first = quarterStart(day), prevFirst = quarterStart(addDays(first, -1))
    const sameDay = addDays(prevFirst, daysFrom(first, day))
    return { from: first, to: day, prevFrom: prevFirst, prevTo: sameDay >= first ? addDays(first, -1) : sameDay }
  }
  if (p === 'last_quarter') {
    const first = quarterStart(addDays(quarterStart(day), -1))
    return { from: first, to: addDays(quarterStart(day), -1), prevFrom: quarterStart(addDays(first, -1)), prevTo: addDays(first, -1) }
  }
  return { from: addDays(day, -29), to: day, prevFrom: addDays(day, -59), prevTo: addDays(day, -30) }
}
