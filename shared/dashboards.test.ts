import { describe, expect, it } from 'vitest'
import {
  ACCOUNTANT_PERIODS, DASH_PERIODS, TEMPLATES, WIDGETS, boardPeriod, canHave, dashRange, newDashboard, ownPeriod, periodsOf, readSaved, templatesFor,
  widgetInfo, type Viewer, type WidgetKind,
} from './dashboards'

const owner: Viewer = { isAdmin: true, isPartner: false, canSeePay: true, canSeeFinances: true }
const manager: Viewer = { isAdmin: true, isPartner: false, canSeePay: false, canSeeFinances: false }
const employee: Viewer = { isAdmin: false, isPartner: false, canSeePay: false, canSeeFinances: false }
const gestoria: Viewer = { isAdmin: false, isPartner: true, canSeePay: true, canSeeFinances: true }
const payroll: Viewer = { isAdmin: false, isPartner: true, canSeePay: true, canSeeFinances: false }
const accountant = TEMPLATES.find(x => x.id === 'accountant')!
const kinds = (v: Viewer) => accountant.widgets.map(w => w.kind).filter(k => canHave(widgetInfo(k).needs, v))

describe('dashboards: who sees what', () => {
  it('the owner (an admin with pay access) gets every widget on the Accountant', () => {
    expect(kinds(owner)).toEqual(accountant.widgets.map(w => w.kind))
  })

  it('an employee, or an admin without pay access, gets none of its money', () => {
    expect(kinds(employee)).toEqual([])
    expect(kinds(manager)).toEqual([])
    // Still the team's widgets, as before.
    expect(canHave(widgetInfo('low_stock').needs, employee)).toBe(true)
    expect(canHave(widgetInfo('team_cost').needs, manager)).toBe(false)
  })

  it('a gestoría with the finances area gets the finances, but not the till, the team or anyone’s pay', () => {
    expect(kinds(gestoria)).toEqual(['running_costs', 'credit_debit', 'tax_due', 'invoices', 'claims'])
    for (const k of ['takings', 'net_takings', 'vat', 'pnl', 'wages', 'team_cost', 'low_stock'] as WidgetKind[]) expect(canHave(widgetInfo(k).needs, gestoria)).toBe(false)
    // Payroll partners see pay on their own pages, not here.
    expect(kinds(payroll)).toEqual([])
  })

  it('offers the templates with something to see: employees not the Accountant, the gestoría only it', () => {
    const offered = (v: Viewer) => templatesFor(k => canHave(widgetInfo(k).needs, v)).map(x => x.id)
    expect(offered(owner)).toEqual(['executive', 'manager', 'accountant'])
    expect(offered(employee)).toEqual(['executive', 'manager'])
    expect(offered(gestoria)).toEqual(['accountant'])
    expect(offered(payroll)).toEqual([])
  })

  it('every Accountant widget is in the Accounts group, but How people paid (Sales) it borrows', () => {
    for (const w of accountant.widgets.filter(x => x.kind !== 'payment_methods')) expect(widgetInfo(w.kind).group).toBe('accounts')
    expect(WIDGETS.filter(w => w.group === 'accounts').map(w => w.kind).sort()).toEqual(accountant.widgets.map(w => w.kind).filter(k => k !== 'payment_methods').sort())
  })

  it('a new Accountant dashboard has only the widgets its person can see', () => {
    const d = newDashboard('accountant', 'Accountant', k => canHave(widgetInfo(k).needs, gestoria))
    expect(d.widgets.map(w => w.kind)).toEqual(['running_costs', 'credit_debit', 'tax_due', 'invoices', 'claims'])
  })
})

describe('dashboards: periods', () => {
  const day = '2026-09-30'

  it('last month: the whole month, against the whole month before', () => {
    expect(dashRange('last_month', day)).toEqual({ from: '2026-08-01', to: '2026-08-31', prevFrom: '2026-07-01', prevTo: '2026-07-31' })
    expect(dashRange('last_month', '2026-03-05')).toEqual({ from: '2026-02-01', to: '2026-02-28', prevFrom: '2026-01-01', prevTo: '2026-01-31' })
    expect(dashRange('last_month', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31', prevFrom: '2025-11-01', prevTo: '2025-11-30' })
  })

  it('this quarter so far, against as many days of the quarter before', () => {
    expect(dashRange('quarter', day)).toEqual({ from: '2026-07-01', to: day, prevFrom: '2026-04-01', prevTo: '2026-06-30' })
    expect(dashRange('quarter', '2026-11-22')).toEqual({ from: '2026-10-01', to: '2026-11-22', prevFrom: '2026-07-01', prevTo: '2026-08-22' })
    // The quarter before is shorter (Q1 has 90 days): it stops at its own end.
    expect(dashRange('quarter', '2026-06-30')).toMatchObject({ from: '2026-04-01', prevFrom: '2026-01-01', prevTo: '2026-03-31' })
    expect(dashRange('quarter', '2026-01-15')).toEqual({ from: '2026-01-01', to: '2026-01-15', prevFrom: '2025-10-01', prevTo: '2025-10-15' })
  })

  it('last quarter: the whole quarter, against the whole one before', () => {
    expect(dashRange('last_quarter', day)).toEqual({ from: '2026-04-01', to: '2026-06-30', prevFrom: '2026-01-01', prevTo: '2026-03-31' })
    expect(dashRange('last_quarter', '2026-10-01')).toEqual({ from: '2026-07-01', to: '2026-09-30', prevFrom: '2026-04-01', prevTo: '2026-06-30' })
    expect(dashRange('last_quarter', '2026-02-10')).toEqual({ from: '2025-10-01', to: '2025-12-31', prevFrom: '2025-07-01', prevTo: '2025-09-30' })
  })

  it('the Accountant has its own periods, months and quarters, and opens on last month; the others share the usual ones', () => {
    expect(periodsOf({ template: 'accountant' })).toBe(ACCOUNTANT_PERIODS)
    expect(ACCOUNTANT_PERIODS.map(p => p.id)).toEqual(['month', 'last_month', 'quarter', 'last_quarter'])
    expect(periodsOf({ template: 'executive' })).toBe(DASH_PERIODS)
    expect(ownPeriod({ template: 'accountant' })).toBe(true)
    expect(ownPeriod({ template: 'blank' })).toBe(false)
    expect(boardPeriod({ template: 'accountant' }, 'today')).toBe('last_month')
    expect(boardPeriod({ template: 'accountant', period: 'quarter' }, 'today')).toBe('quarter')
    // One it doesn't offer (saved by hand, or from before) falls back to where it starts.
    expect(boardPeriod({ template: 'accountant', period: 'today' }, 'week')).toBe('last_month')
    expect(boardPeriod({ template: 'manager', period: 'quarter' }, 'today')).toBe('today')
    expect(boardPeriod({ template: 'manager' }, undefined)).toBe('week')
    expect(boardPeriod(null, 'month')).toBe('month')
  })

  it('keeps a dashboard’s own period when read back', () => {
    const s = readSaved({ boards: [{ id: 'a', name: 'Accountant', template: 'accountant', period: 'last_quarter', widgets: [{ id: 'w', kind: 'vat', size: 'medium' }] }] })
    expect(boardPeriod(s.boards[0], s.period)).toBe('last_quarter')
    expect(s.boards[0].widgets.map(w => w.kind)).toEqual(['vat'])
  })
})
