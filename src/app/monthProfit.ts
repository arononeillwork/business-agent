// Each month's operating profit as Profit & loss works it out (takings without IVA, the cost of
// sales, the team from timecards or the rota, the running costs and one-off lines), for pages that
// use it outside Profit & loss (the staff kitty's share of profit). Admins with pay access only.
import { useApp } from './AppContext'
import { usePayRates } from './dailyCost'
import { useAsync } from './hooks'
import { tillsOf } from '../components/till'
import { buildPnl, monthsBetween } from '../../shared/pnl'
import { addMonths } from '../../shared/kitty'
import { addDays, today, zonedIso } from '../../shared/time'

/**
 * Operating profit for each of `months` (YYYY-MM, oldest first): a map from month to profit.
 * `till` is false when no till is connected (no takings to count, so no profit to share), and
 * `ready` once everything has loaded.
 */
export function useMonthlyProfit(months: string[]) {
  const { api, canSeeFinances, isPartner, settings } = useApp()
  const rates = usePayRates()
  const on = canSeeFinances && !isPartner && months.length > 0
  const from = months[0] ?? today().slice(0, 7)
  const to = months[months.length - 1] ?? from
  const lastDay = addDays(`${addMonths(to, 1)}-01`, -1)
  const fromIso = zonedIso(`${from}-01`, '00:00')
  const toIso = zonedIso(addDays(lastDay, 1), '00:00')
  const integ = useAsync('integrations', () => (on ? api.integrations() : Promise.resolve(null)), [on])
  const till = tillsOf(integ.data?.integrations).length > 0
  const sales = useAsync('month-profit-sales', () => (on && till ? api.sales(`${from}-01`, lastDay) : Promise.resolve(null)), [on, till, from, lastDay])
  const rest = useAsync('month-profit', async () => {
    if (!on) return null
    const [expenses, entries, shifts, pnlSettings, lines] = await Promise.all([
      api.expenses(), api.timeEntries(fromIso, toIso), api.shifts(fromIso, toIso), api.pnlSettings(), api.pnlLines(from, to),
    ])
    return { expenses, entries, shifts, pnlSettings, lines }
  }, [on, from, to])

  const ready = on && !!integ.data && !!rest.data && (!till || !!sales.data || !!sales.error)
  const profit = new Map<string, number>()
  if (ready && till && sales.data) {
    const days = sales.data.days
    const span = monthsBetween(from, to)
    const pnl = buildPnl({
      months: span, today: today(), opened: days.find(d => d.gross > 0)?.date ?? null, vatRate: rest.data!.pnlSettings.vat_rate,
      employerMultiplier: settings?.employer_cost_multiplier ?? 1, takings: days, expenses: rest.data!.expenses, entries: rest.data!.entries,
      shifts: rest.data!.shifts, rates, lines: rest.data!.lines,
    })
    span.forEach((m, i) => { if (months.includes(m)) profit.set(m, pnl.operatingProfit[i]) })
  }
  return { on, ready, till, profit, error: rest.error ?? sales.error }
}
