// What a café would pay elsewhere for what Business Agent's top plan does, line by line, for the
// comparison page (/compare). List prices, excluding VAT, checked 18 October 2026; US dollar prices
// converted at €0.92 per dollar. Example business: one café, 10 staff. Re-check before changing.
// competitors.test.ts checks every total adds up.

export const PRICES_CHECKED = '18 October 2026'
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

export interface Competitor {
  id: 'square' | 'gohighlevel'
  name: string
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
    id: 'square', name: 'Square', tagline: 'Square for Restaurants with its add-ons',
    lines: [
      { item: 'Square for Restaurants Plus', covers: 'Rota (Turnos), timecards, team permissions (Equipos Plus), shift reports', eur: 59,
        source: 'https://squareup.com/es/es/point-of-sale/restaurants/pricing' },
      { item: 'Marketing Square (email, up to 500 contacts)', covers: 'Customer marketing emails', eur: 15,
        source: 'https://squareup.com/es/es/software/marketing/email' },
      { item: 'Metricool Starter (Square has no social scheduler)', covers: 'Scheduling posts to Instagram, Facebook, TikTok and Google', eur: 20,
        source: 'https://metricool.com/pricing/' },
    ],
    missing: [
      'Opening hours synced to Google Maps',
      'Read-only access for your gestoría',
      "What's on: matches, fiestas and bank holidays for planning staff",
      'WhatsApp shift reminders (Square Messages Plus is not confirmed in Spain)',
    ],
    extras: ['Square Loyalty, from €40 a month, is not counted: Business Agent has no loyalty scheme.'],
  },
  {
    id: 'gohighlevel', name: 'GoHighLevel', tagline: 'GoHighLevel plus a rota app (it has no rota or timecards)',
    lines: [
      { item: 'GoHighLevel Starter ($97)', covers: 'Social planner, messaging inbox, email marketing', eur: usd(97), usd: 97,
        source: 'https://www.gohighlevel.com/pricing' },
      { item: 'GoHighLevel WhatsApp add-on ($10)', covers: 'WhatsApp messages', eur: usd(10), usd: 10,
        source: 'https://www.gohighlevel.com/pricing' },
      { item: 'Sesame HR Essential (€4.75 × 15, its minimum)', covers: 'Rota, clock-ins, registro de jornada, time off', eur: 71.25,
        source: 'https://www.sesamehr.es/precio' },
    ],
    missing: [
      'Opening hours synced to Google Maps',
      'Takings from Stripe or Square next to team cost',
      "What's on: matches, fiestas and bank holidays",
      'One app for the team: rota and messages live in two different products',
    ],
    extras: ['Text messages and emails are charged per use on GoHighLevel (from its wallet) and are not counted here.'],
  },
]

export const stackTotal = (c: Competitor) => Math.round(c.lines.reduce((sum, l) => sum + l.eur, 0) * 100) / 100

/** Their monthly total, ours, and what that saves a month and a year. */
export function savings(c: Competitor, oursMonthly: number) {
  const theirs = stackTotal(c)
  const month = Math.round((theirs - oursMonthly) * 100) / 100
  return { theirs, ours: oursMonthly, month, year: Math.round(month * 12 * 100) / 100, percent: Math.round((month / theirs) * 100) }
}

export const euro = (n: number) => `€${n.toLocaleString('en-IE', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`
