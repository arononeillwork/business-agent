// The figures the Business advisor and Dashboards read: the last eight weeks of takings, four weeks
// of best sellers, timecards and rota, the menu's margins, stock and waste, reviews and the area's
// prices. Each comes from where its own page gets it (the same cache), and only what the person may
// see is asked for. Advice in the person's language comes from shared/insights.ts.
import { useMemo } from 'react'
import { useApp } from './AppContext'
import { useAsync } from './hooks'
import { tillsOf } from '../components/till'
import { analyse } from '../../shared/localCompetitors'
import { costing, priceForTarget, wasteSummary } from '../../shared/recipes'
import { isLow } from '../../shared/stock'
import { advise, type AdviceFormat, type AdviceInput } from '../../shared/insights'
import { addDays, formatMoney, today, zonedIso } from '../../shared/time'
import type { DayKey } from '../../shared/types'
import { currentLanguage, msg, t } from '../i18n'

/** A day of the week in the plural, as advice says it ("Mondays"). */
export const DAYS_PLURAL: Record<DayKey, string> = {
  mon: msg('Mondays'), tue: msg('Tuesdays'), wed: msg('Wednesdays'), thu: msg('Thursdays'), fri: msg('Fridays'), sat: msg('Saturdays'), sun: msg('Sundays'),
}

/** How advice reads in the person's language. */
export function adviceFormat(): AdviceFormat {
  const lists = new Intl.ListFormat(currentLanguage() === 'en' ? 'en-GB' : currentLanguage(), { style: 'long', type: 'conjunction' })
  return { money: formatMoney, days: d => t(DAYS_PLURAL[d]), list: items => lists.format(items), hour: h => `${h}:00` }
}

/** Everything the advice is worked out from, loading as it comes (`input` is null until the takings are in, when there are any). */
export function useAdviceInput() {
  const { api, isAdmin, isPartner, canSeePay, canSeeFinances, business, profiles, rates, settings } = useApp()
  const day = today()
  const from8 = addDays(day, -55), from4 = addDays(day, -27)
  const staff = !isPartner
  const integ = useAsync('integrations', () => (isAdmin ? api.integrations() : Promise.resolve(null)), [isAdmin])
  const tills = tillsOf(integ.data?.integrations ?? undefined)
  const money = canSeePay && staff && tills.length > 0
  const sales = useAsync('advisor-sales', () => (money ? api.sales(from8, day) : Promise.resolve(null)), [money, day])
  const items = useAsync('advisor-items', () => (money ? api.salesItems(from4, day) : Promise.resolve(null)), [money, day])
  const team = useAsync('advisor-team', async () => {
    if (!isAdmin || !staff) return null
    const [entries, shifts] = await Promise.all([api.timeEntries(zonedIso(from4, '00:00'), zonedIso(addDays(day, 1), '00:00')),
      api.shifts(zonedIso(from4, '00:00'), zonedIso(addDays(day, 1), '00:00'))])
    return { entries, shifts }
  }, [isAdmin, staff, day])
  const stock = useAsync('stock', () => api.stockItems(), [])
  const moves = useAsync('stock-movements', () => api.stockMovements(), [])
  const recipes = useAsync('advisor-recipes', () => (isAdmin && staff ? api.recipes() : Promise.resolve([])), [isAdmin, staff])
  const reviews = useAsync('advisor-reviews', () => (isAdmin && staff ? api.reviews() : Promise.resolve(null)), [isAdmin, staff])
  const area = useAsync('competitors', () => (isAdmin && staff ? api.competitors() : Promise.resolve(null)), [isAdmin && staff])

  const waiting = !integ.data && isAdmin ? true : money && !sales.data && !sales.error
  // Worked out once per change in what it reads (not on every render while the rest loads).
  const input = useMemo<AdviceInput>(() => {
    const names = new Map(profiles.map(p => [p.id, p.full_name.split(' ')[0]]))
    const stockItems = stock.data ?? []
    const recent = (moves.data ?? []).filter(m => m.at.slice(0, 10) >= from4 && !m.undone_at)
    const waste = moves.data && stockItems.length && canSeeFinances ? wasteSummary(recent, stockItems) : null
    const entries = team.data?.entries ?? null
    const teamCost = entries && canSeeFinances
      ? entries.reduce((s, e) => s + e.paid_minutes / 60 * (rates.get(e.profile_id) ?? 0), 0) * (settings?.employer_cost_multiplier ?? 1) : null
    const r = reviews.data
    const month = addDays(day, -30)
    let vsArea: AdviceInput['vsArea'] = null
    if (area.data && recipes.data) {
      const a = analyse(area.data, recipes.data, business?.opening_hours ?? null, day)
      vsArea = a.rows.flatMap(row => (row.ours && row.avg !== null ? [{ name: row.item.name, ours: row.ours.price, avg: row.avg, n: row.n }] : []))
    }
    return {
      today: day,
      sales: sales.data?.days ?? null,
      openingHours: business?.opening_hours ?? null,
      items: items.data?.items ?? null,
      menu: recipes.data && stockItems.length ? recipes.data.filter(x => x.active && x.sell_price !== null && x.lines.length).flatMap(x => {
        const c = costing(x, stockItems)
        return c.marginPct === null || c.missing.length ? [] : [{ name: x.name, marginPct: c.marginPct, target: x.target_margin, priceForTarget: priceForTarget(c.cost, x.target_margin, x.vat_rate) }]
      }) : null,
      vsArea,
      entries,
      shifts: team.data?.shifts ?? null,
      names,
      teamCost: teamCost === null || !money ? null : Math.round(teamCost * 100) / 100,
      waste: waste ? { cost: waste.cost, ofPurchases: waste.ofPurchases, top: waste.top.slice(0, 3) } : null,
      lowStock: stock.data ? stockItems.filter(isLow).map(i => i.name) : null,
      reviews: r && r.feed ? {
        rating: r.google_rating, count: r.google_count,
        lastMonth: r.reviews.filter(x => x.created_at.slice(0, 10) >= month).length,
        low: r.reviews.filter(x => x.created_at.slice(0, 10) >= month && x.rating <= 3).length,
        unreplied: r.can_reply ? r.reviews.filter(x => !x.reply && x.created_at.slice(0, 10) >= addDays(day, -90)).length : 0,
      } : null,
    }
  }, [day, from4, sales.data, items.data, team.data, stock.data, moves.data, recipes.data, reviews.data, area.data, business, profiles, rates,
    settings, canSeeFinances, money])
  return { input, loading: waiting, till: tills.length > 0, money, sales: sales.data, items: items.data, error: sales.error }
}

/** The advice, in the person's language, as it loads. */
export function useAdvice() {
  const data = useAdviceInput()
  const language = currentLanguage()
  const advice = useMemo(() => (data.loading ? [] : advise(data.input, adviceFormat())), [data.loading, data.input, language])
  return { ...data, advice }
}
