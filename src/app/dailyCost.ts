// The cost of running the business each day (shared/dailyCost.ts) for the pages that show it: Sales'
// cost line, the staff kitty's breakeven and Finances' Staff wages. Admins with pay access only (it
// needs the pay rates); others get nothing back.
import { useMemo } from 'react'
import { useApp } from './AppContext'
import { useAsync } from './hooks'
import { dailyCosts, isOwner, payrollRates, rotaMonth } from '../../shared/dailyCost'
import { addDays, zonedIso } from '../../shared/time'

/**
 * The rates the team is paid at, for wages (Rota, Staff wages, Profit & loss, Timecards, dashboards): with
 * owner pay off (Finances → Staff wages), the owners' hours cost nothing. Breakeven uses everyone's rate.
 */
export function usePayRates() {
  const { rates, profiles, settings } = useApp()
  const ownerPay = settings?.owner_pay !== false
  return useMemo(() => payrollRates(rates, profiles, ownerPay), [rates, profiles, ownerPay])
}

/**
 * Each day's running cost and team from `from` to `to` (YYYY-MM-DD), once loaded; null for those who can't
 * see pay. This is the breakeven: owners on the rota count at their rate, with owner pay on or off.
 */
export function useDailyCosts(from: string, to: string, on = true) {
  const { api, canSeePay, isPartner, rates, settings, business } = useApp()
  const enabled = on && canSeePay && !isPartner && from <= to
  const data = useAsync('daily-costs', async () => {
    if (!enabled) return null
    const [expenses, shifts] = await Promise.all([api.expenses(), api.shifts(zonedIso(from, '00:00'), zonedIso(addDays(to, 1), '00:00'))])
    return { expenses, shifts }
  }, [enabled, from, to])
  const costs = data.data
    ? dailyCosts(from, to, { expenses: data.data.expenses, shifts: data.data.shifts, rates, multiplier: settings?.employer_cost_multiplier ?? 1, openingHours: business?.opening_hours })
    : null
  return { costs, error: data.error, reload: data.reload }
}

/**
 * The month's rota (YYYY-MM): hours and cost per person, for Finances' Staff wages; and `owners`, what the
 * owners' hours on it cost at their rates, owner pay on or off (what owner pay off takes off Finances).
 */
export function useRotaMonth(month: string, on = true) {
  const { api, canSeePay, isPartner, settings, rates: allRates, profiles } = useApp()
  const rates = usePayRates()
  const enabled = on && canSeePay && !isPartner
  const first = `${month}-01`
  const next = addDays(`${month}-28`, 4).slice(0, 7)
  const data = useAsync('rota-month', () => (enabled ? api.shifts(zonedIso(first, '00:00'), zonedIso(`${next}-01`, '00:00')) : Promise.resolve(null)), [enabled, month])
  const multiplier = settings?.employer_cost_multiplier ?? 1
  const owners = useMemo(() => {
    if (!data.data) return 0
    const ids = new Set(profiles.filter(isOwner).map(p => p.id))
    return rotaMonth(month, { shifts: data.data, rates: allRates, multiplier }).people.filter(p => ids.has(p.id)).reduce((s, p) => s + p.cost, 0)
  }, [data.data, month, allRates, multiplier, profiles])
  return { month: data.data ? rotaMonth(month, { shifts: data.data, rates, multiplier }) : null, owners, error: data.error }
}
