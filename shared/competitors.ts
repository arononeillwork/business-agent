// What a café would pay elsewhere for what a Business Agent plan does, line by line, for the
// comparison page (/compare). Each stack is set against the plan that covers what it does. List prices, excluding VAT, checked 18 October 2026; US dollar prices
// converted at €0.92 per dollar. Example business: one café, 10 staff. Re-check before changing.
// competitors.test.ts checks every total adds up. Display text is marked with msg() and translated
// where it's shown (t() in the app).
import { msg } from './i18n'

export const PRICES_CHECKED = msg('18 October 2026')
export const USD_TO_EUR = 0.92

export interface StackLine {
  item: string
  /** What it covers, in our terms. */
  covers: string
  /** Euros a month, excluding VAT. */
  eur: number
  /** Shown when the price is in dollars. */
  usd?: number
  source: string
}

import type { PlanId } from './plans'

export interface Competitor {
  id: 'square' | 'gohighlevel'
  name: string
  /** The Business Agent plan that does what this stack does. */
  plan: PlanId
  /** One-line summary for the tab. */
  tagline: string
  lines: StackLine[]
  /** What we include that this stack doesn't (or that we couldn't price). */
  missing: string[]
  /** Costs left out of the total, so the total is never inflated. */
  extras: string[]
}

const usd = (n: number) => Math.round(n * USD_TO_EUR * 100) / 100

export const COMPETITORS: Competitor[] = [
  {
    id: 'square', name: 'Square', plan: 'pro', tagline: msg('Square for Restaurants with its add-ons'),
    lines: [
      { item: 'Square for Restaurants Plus', covers: msg('Rota (Turnos), timecards, team permissions (Equipos Plus), shift reports'), eur: 59,
        source: 'https://squareup.com/es/es/point-of-sale/restaurants/pricing' },
      { item: msg('Marketing Square (email, up to 500 contacts)'), covers: msg('Customer marketing emails'), eur: 15,
        source: 'https://squareup.com/es/es/software/marketing/email' },
      { item: msg('Metricool Starter (Square has no social scheduler)'), covers: msg('Scheduling posts to Instagram, Facebook, TikTok and Google'), eur: 20,
        source: 'https://metricool.com/pricing/' },
    ],
    missing: [
      msg('Opening hours synced to Google Maps'),
      msg("What's on: matches, fiestas and bank holidays for planning staff"),
      msg('WhatsApp shift reminders (Square Messages Plus is not confirmed in Spain)'),
    ],
    extras: [msg('Square Loyalty, from €40 a month, is not counted: Business Agent has no loyalty scheme.')],
  },
  {
    id: 'gohighlevel', name: 'GoHighLevel', plan: 'business', tagline: msg('GoHighLevel plus a rota app (it has no rota or timecards)'),
    lines: [
      { item: 'GoHighLevel Starter ($97)', covers: msg('Social planner, messaging inbox, email marketing'), eur: usd(97), usd: 97,
        source: 'https://www.gohighlevel.com/pricing' },
      { item: msg('GoHighLevel WhatsApp add-on ($10)'), covers: msg('WhatsApp messages'), eur: usd(10), usd: 10,
        source: 'https://www.gohighlevel.com/pricing' },
      { item: msg('Sesame HR Essential (€4.75 × 15, its minimum)'), covers: msg('Rota, clock-ins, registro de jornada, time off'), eur: 71.25,
        source: 'https://www.sesamehr.es/precio' },
    ],
    missing: [
      msg('Opening hours synced to Google Maps'),
      msg('Takings from Square, SumUp or Stripe next to team cost'),
      msg("What's on: matches, fiestas and bank holidays"),
      msg('One app for the team: rota and messages live in two different products'),
    ],
    extras: [msg('Text messages and emails are charged per use on GoHighLevel (from its wallet) and are not counted here.')],
  },
]

export const stackTotal = (c: Competitor) => Math.round(c.lines.reduce((sum, l) => sum + l.eur, 0) * 100) / 100

/** Their monthly total, ours, and what that saves a month and a year. */
export function savings(c: Competitor, oursMonthly: number) {
  const theirs = stackTotal(c)
  const month = Math.round((theirs - oursMonthly) * 100) / 100
  return { theirs, ours: oursMonthly, month, year: Math.round(month * 12 * 100) / 100, percent: Math.round((month / theirs) * 100) }
}

/** Euros as on the site; pass the app's locale() to format the number in the person's language. */
export const euro = (n: number, locale = 'en-IE') => `€${n.toLocaleString(locale, { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`
