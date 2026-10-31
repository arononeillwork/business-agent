// The staff kitty's share, month by month: what was taken each day (net sales from the till) above that
// day's breakeven (the cost of running the business: shared/dailyCost.ts). Admins with pay access only
// (it needs the takings, the running costs and the pay rates); the page works out the percentage.
import { useApp } from './AppContext'
import { useAsync } from './hooks'
import { useDailyCosts } from './dailyCost'
import { tillsOf } from '../components/till'
import { addMonths } from '../../shared/kitty'
import { overBreakeven } from '../../shared/dailyCost'
import { addDays, today } from '../../shared/time'

const lastDayOf = (m: string) => addDays(`${addMonths(m, 1)}-01`, -1)

/**
 * For each month (YYYY-MM, oldest first; the current one counts up to today): the takings above
 * breakeven and the days that made it. `till` is false when no till is connected (no takings to count).
 */
export function useBreakevenMonths(months: string[]) {
  const { api, canSeePay, isPartner } = useApp()
  const on = canSeePay && !isPartner && months.length > 0
  const now = today()
  const from = `${months[0] ?? now.slice(0, 7)}-01`
  const end = lastDayOf(months[months.length - 1] ?? now.slice(0, 7))
  const to = end > now ? now : end
  const integ = useAsync('integrations', () => (on ? api.integrations() : Promise.resolve(null)), [on])
  const till = tillsOf(integ.data?.integrations).length > 0
  const sales = useAsync('kitty-sales', () => (on && till ? api.sales(from, to) : Promise.resolve(null)), [on, till, from, to])
  const daily = useDailyCosts(from, to, on)
  const ready = on && !!integ.data && !!daily.costs && (!till || !!sales.data || !!sales.error)
  const byMonth = new Map<string, ReturnType<typeof overBreakeven> & { estimated: boolean }>()
  if (ready && daily.costs) {
    const takings = new Map((sales.data?.days ?? []).map(d => [d.date, d.gross - d.refunds]))
    for (const m of months) {
      const costs = daily.costs.filter(c => c.date.startsWith(m) && c.open)
      const days = costs.map(c => ({ date: c.date, takings: takings.get(c.date) ?? 0 }))
      byMonth.set(m, { ...overBreakeven(days, costs, 1), estimated: costs.some(c => c.teamFrom === 'estimate') })
    }
  }
  const open = daily.costs?.filter(c => c.open) ?? []
  return {
    on, ready, till, byMonth, error: daily.error ?? sales.error,
    /** The average breakeven of an open day over these months, and its two parts. */
    perDay: open.length ? {
      total: open.reduce((s, c) => s + c.total, 0) / open.length,
      fixed: open.reduce((s, c) => s + c.fixed, 0) / open.length,
      team: open.reduce((s, c) => s + c.team, 0) / open.length,
      estimated: open.some(c => c.teamFrom === 'estimate'),
    } : null,
  }
}
