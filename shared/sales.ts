// Takings from more than one payment system (the till, Square or SumUp, plus Stripe for online
// payments) added up into one set of days, keeping each system's share of every day.
import type { Sales, SalesDay, SalesProvider } from './types'

const round = (n: number) => Math.round(n * 100) / 100

/** Several payment systems' takings, day by day: amounts, hours and payment methods added up. */
export function mergeSales(parts: { provider: SalesProvider; sales: Pick<Sales, 'currency' | 'days'> }[]): Pick<Sales, 'currency' | 'days'> {
  if (parts.length === 1) return { currency: parts[0].sales.currency, days: parts[0].sales.days }
  const byDate = new Map<string, SalesDay>()
  for (const { provider, sales } of parts) {
    for (const d of sales.days) {
      const row = byDate.get(d.date) ?? { date: d.date, gross: 0, tips: 0, refunds: 0, payments: 0, sources: {} }
      row.gross = round(row.gross + d.gross)
      row.tips = round(row.tips + d.tips)
      row.refunds = round(row.refunds + d.refunds)
      row.payments += d.payments
      if (d.hours) row.hours = (row.hours ?? Array<number>(24).fill(0)).map((h, i) => round(h + (d.hours![i] ?? 0)))
      // Stripe has no payment methods: what it took online is all card.
      const methods = d.methods ?? (provider === 'stripe' && d.gross ? { card: d.gross } : undefined)
      if (methods) {
        row.methods ??= {}
        for (const [k, v] of Object.entries(methods) as [keyof NonNullable<SalesDay['methods']>, number][]) row.methods[k] = round((row.methods[k] ?? 0) + v)
      }
      row.sources![provider] = round((row.sources![provider] ?? 0) + d.gross)
      byDate.set(d.date, row)
    }
  }
  return { currency: parts[0].sales.currency, days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) }
}
