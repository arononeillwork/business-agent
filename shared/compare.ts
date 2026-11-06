// Business Agent next to GoHighLevel and Square, for a café in Spain: the public Compare page (/compare).
//
// What a route costs is what you'd pay each month to cover the jobs Business Agent's plan does, with each
// company's own products and add-ons at their list prices. Every competitor price is as published on its
// own pricing page on CHECKED_ON, VAT not included (as ours are). GoHighLevel bills in US dollars,
// converted at the ECB's reference rate that day. Business Agent's prices come from PLANS, so this page
// can't fall out of step with Pricing. Card fees aren't counted: every route keeps Square's free till
// (Business Agent reads its takings), so they're the same whichever you pick.
//
// Features are only marked where we're sure; where a competitor does a job, it gets the credit (Square
// syncs opening hours to Google; HighLevel and Square each have an MCP server). A price that changes:
// update it here, with CHECKED_ON, and the page and its tests follow.
// Display text is marked with msg() and translated where it's shown (t() in the app).
import { msg } from './i18n.ts'
import { PLANS, type Plan } from './plans.ts'

/** When every competitor price and feature below was last read from its own site. */
export const CHECKED_ON = '2026-11-06'
/** The ECB's euro reference rate on CHECKED_ON: what one euro buys in US dollars. */
export const USD_PER_EUR = 1.1165

export type ProductId = 'business_agent' | 'square' | 'gohighlevel'

export interface Product {
  id: ProductId
  /** The same in every language. */
  name: string
  /** Who it's made for, in their own words where they say it. */
  madeFor: string
  /** Separate apps (and logins) a café learns on this route. */
  apps: number
  /** Our estimate of the weeks until a new owner does 80% of the everyday jobs without help (the learning curve). */
  weeksTo80: number
  /** Why it takes that long, in a few words each. */
  why: string[]
  /** Longest free trial of the plan priced here. */
  trial: string
  /** Messages, calls or AI charged as they're used, on top of the monthly total. */
  usageCharges?: string
}

export const PRODUCTS: Product[] = [
  {
    id: 'business_agent', name: 'Business Agent', madeFor: msg('Cafés, shops and small teams in Spain'), apps: 1, weeksTo80: 1,
    why: [msg('One app for the team, the money and the marketing'), msg('Set up in 10 minutes: your first rota can go out today'), msg('Made for cafés: registro de jornada, IVA and allergens in Spanish')],
    trial: msg('2 months of Business, free'),
  },
  {
    id: 'square', name: 'Square', madeFor: msg('Taking card payments'), apps: 3, weeksTo80: 4,
    why: [msg('The till is easy; the team, marketing and stock tools are separate products'), msg('Stock and menu costing is another company’s app (MarketMan), with its own login'),
      msg('No social media, supplier invoices, tax deadlines or food safety: those are more apps again')],
    trial: msg('30 days of Restaurants Plus'),
  },
  {
    id: 'gohighlevel', name: 'GoHighLevel', madeFor: msg('Marketing agencies and their clients'), apps: 3, weeksTo80: 8,
    why: [msg('Built for agencies: pipelines, funnels and workflows to set up before it does anything'), msg('No rota or clock-ins, so the team needs another app (and the till its own)'),
      msg('In US dollars, with usage charges to keep an eye on')],
    trial: msg('14 days'), usageCharges: msg('Plus usage: texts, emails, calls and AI are charged as you use them'),
  },
]
export const product = (id: ProductId) => PRODUCTS.find(p => p.id === id)!

// ---------------------------------------------------------------------------------------------
// What each route costs a month, line by line, for a team of a given size (one venue).
// ---------------------------------------------------------------------------------------------
export const SOURCES = {
  highlevel: 'https://www.gohighlevel.com/pricing',
  highlevelMcp: 'https://help.gohighlevel.com/support/solutions/articles/155000007981-highlevel-mcp-server-model-context-protocol-',
  squareRestaurants: 'https://squareup.com/es/es/point-of-sale/restaurants/pricing',
  squareShifts: 'https://squareup.com/es/es/staff/shifts/pricing',
  squareGoogle: 'https://squareup.com/help/article/7689-set-up-google-business-profile-with-square',
  ecb: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html',
  pricing: '/pricing',
} as const

export interface LineItem {
  /** What it is. */
  label: string
  /** What it does for the café. */
  covers: string
  /** Euros a month, VAT not included, to the cent. */
  monthly: number
  /** How it's priced, as its company says it; filled in with `vars`. */
  basis: string
  vars?: Record<string, string | number>
  source: string
}

const cents = (n: number) => Math.round(n * 100) / 100
/** US dollars in euros at the ECB rate, to the cent. */
export const fromUsd = (usd: number) => cents(usd / USD_PER_EUR)

/** Square's list prices in Spain (VAT not included). */
export const SQUARE = {
  /** Square Shifts: free up to this many people (the owner included)… */
  shiftsFreeUpTo: 5,
  /** …then Shifts Plus, per person a month (the owner included). */
  shiftsPerPerson: 3.5,
  /** Square for Restaurants Plus, a venue a month: team management Plus included, so cheaper for bigger teams. */
  restaurantsPlus: 59,
  /** Square Marketing (email and text campaigns), from, a venue a month. */
  marketing: 15,
  /** Stock and menu costing by MarketMan, sold through Square, a venue a month. */
  marketman: 89,
  /** Card payments in person, on every Square plan. */
  cardPercent: 1.25, cardFixed: 0.05,
}
/** HighLevel's list prices, in US dollars a month (Starter also by the year). */
export const HIGHLEVEL_USD = { starter: 97, starterYearly: 970, whatsapp: 10, listings: 30 }

/** The Business Agent plan that covers a café with this many people: the cheapest with WhatsApp reminders and takings that fits the team. */
export function businessAgentPlan(people: number): Plan {
  return PLANS.find(p => p.features.includes('whatsapp') && p.features.includes('takings') && (p.limits.people === null || p.limits.people >= people))!
}

const till: LineItem = {
  label: msg('Square till, free plan'), covers: msg('Card payments: the fees are the same on every route'), monthly: 0,
  basis: msg('€0 a month, then {percent}% + €{fixed} a card payment'), vars: { percent: SQUARE.cardPercent, fixed: SQUARE.cardFixed.toFixed(2) }, source: SOURCES.squareRestaurants,
}

/** The rota, clock-ins and timecards from Square, the cheapest way it sells them for this many people. */
export function squareTeam(people: number): LineItem {
  const covers = msg('Rota, clock-ins and timecards')
  if (people <= SQUARE.shiftsFreeUpTo) {
    return { label: msg('Square Shifts, free plan'), covers, monthly: 0, basis: msg('Free up to {n} people'), vars: { n: SQUARE.shiftsFreeUpTo }, source: SOURCES.squareShifts }
  }
  const perPerson = cents(SQUARE.shiftsPerPerson * people)
  if (perPerson <= SQUARE.restaurantsPlus) {
    return { label: msg('Square Shifts Plus'), covers, monthly: perPerson, basis: msg('€{price} a person a month, the owner included'), vars: { price: SQUARE.shiftsPerPerson.toFixed(2) }, source: SOURCES.squareShifts }
  }
  return { label: msg('Square for Restaurants Plus'), covers: msg('Rota, clock-ins and timecards (team tools included)'), monthly: SQUARE.restaurantsPlus,
    basis: msg('€{price} a month a venue'), vars: { price: SQUARE.restaurantsPlus }, source: SOURCES.squareRestaurants }
}

/** Each route's line items for a café with this many people. */
export function routeItems(id: ProductId, people: number): LineItem[] {
  if (id === 'business_agent') {
    const plan = businessAgentPlan(people)
    return [
      { label: msg('Business Agent {plan}'), vars: { plan: plan.name, price: plan.monthly }, monthly: plan.monthly,
        covers: msg('Rota, clock-ins, social, campaigns, Google, stock, menu costing, P&L, tax and more'), basis: msg('€{price} a month for the whole team'), source: SOURCES.pricing },
      till,
    ]
  }
  if (id === 'square') {
    return [
      till,
      squareTeam(people),
      { label: msg('Square Marketing'), covers: msg('Email and text campaigns'), monthly: SQUARE.marketing, basis: msg('From €{price} a month a venue'), vars: { price: SQUARE.marketing }, source: SOURCES.squareRestaurants },
      { label: msg('MarketMan stock management, through Square'), covers: msg('Stock, suppliers and menu costing'), monthly: SQUARE.marketman, basis: msg('€{price} a month a venue'), vars: { price: SQUARE.marketman }, source: SOURCES.squareRestaurants },
    ]
  }
  return [
    { label: msg('HighLevel Starter'), covers: msg('CRM, social planner, campaigns and reviews'), monthly: fromUsd(HIGHLEVEL_USD.starter), basis: msg('${price} a month'), vars: { price: HIGHLEVEL_USD.starter }, source: SOURCES.highlevel },
    { label: msg('HighLevel WhatsApp integration'), covers: msg('WhatsApp messages'), monthly: fromUsd(HIGHLEVEL_USD.whatsapp), basis: msg('${price} a month a sub-account'), vars: { price: HIGHLEVEL_USD.whatsapp }, source: SOURCES.highlevel },
    { label: msg('HighLevel online listings management'), covers: msg('Opening hours on Google and other listings'), monthly: fromUsd(HIGHLEVEL_USD.listings), basis: msg('${price} a month a sub-account'), vars: { price: HIGHLEVEL_USD.listings }, source: SOURCES.highlevel },
    squareTeam(people),
    till,
  ]
}

/** What a route costs a month, VAT not included. */
export const monthlyCost = (id: ProductId, people: number) => cents(routeItems(id, people).reduce((s, i) => s + i.monthly, 0))

/** What a route has cost after so many months (the running total). */
export const costAfter = (id: ProductId, people: number, months: number) => cents(monthlyCost(id, people) * months)

/** Team sizes to pick from on the page; the first chosen is TEAM_DEFAULT. */
export const TEAM_SIZES = [5, 10, 15, 25, 40]
export const TEAM_DEFAULT = 10

// ---------------------------------------------------------------------------------------------
// The learning curve: our estimate, not a measured study (the page says so).
// ---------------------------------------------------------------------------------------------
/**
 * The share of everyday jobs a new owner does without help after so many weeks, on a curve that reaches
 * 80% at the product's `weeksTo80`. Whole percentages.
 */
export function familiarity(id: ProductId, week: number): number {
  const tau = product(id).weeksTo80 / Math.log(5)
  return Math.round(100 * (1 - Math.exp(-week / tau)))
}
export const CURVE_WEEKS = 12

// ---------------------------------------------------------------------------------------------
// Feature by feature.
// ---------------------------------------------------------------------------------------------
/** yes: built in. extra: a paid add-on (counted in the route's cost). partial: part of the job. no: not at any price from them. */
export type Has = 'yes' | 'extra' | 'partial' | 'no'
export interface Cell { has: Has; note?: string }
export interface FeatureRow { label: string; values: Record<ProductId, Cell> }

const yes = (note?: string): Cell => ({ has: 'yes', note })
const extra = (note: string): Cell => ({ has: 'extra', note })
const partly = (note: string): Cell => ({ has: 'partial', note })
const no = (note?: string): Cell => ({ has: 'no', note })

/** `jobs: false`: shown in the table, but not one of the café's jobs that the counts and "Still missing" are about. */
export const FEATURE_GROUPS: { group: string; rows: FeatureRow[]; jobs?: false }[] = [
  { group: msg('Team'), rows: [
    { label: msg('Shift rota on everyone’s phone'), values: { business_agent: yes(), square: yes(msg('Square Shifts')), gohighlevel: no(msg('Its calendars book customers, not staff shifts')) } },
    { label: msg('Clock-ins, breaks and timecards'), values: { business_agent: yes(), square: yes(msg('Square Shifts')), gohighlevel: no() } },
    { label: msg('Registro de jornada: the monthly hours record to sign'), values: { business_agent: yes(), square: partly(msg('Timecards to export and lay out yourself')), gohighlevel: no() } },
    { label: msg('Shift reminders on WhatsApp'), values: { business_agent: yes(), square: no(), gohighlevel: no(msg('No shifts to remind anyone of')) } },
    { label: msg('Time off requests and approvals'), values: { business_agent: yes(), square: yes(msg('Square Shifts')), gohighlevel: no() } },
    { label: msg('Hiring: job posts, applicants and CVs'), values: { business_agent: yes(), square: no(), gohighlevel: partly(msg('Build it yourself from forms and pipelines')) } },
  ] },
  { group: msg('Sales and money'), rows: [
    { label: msg('Card payments at the till'), values: { business_agent: partly(msg('Works with your Square, SumUp or Stripe till')), square: yes(), gohighlevel: partly(msg('Online payments and invoices, no café till')) } },
    { label: msg('Takings next to what the rota costs'), values: { business_agent: yes(), square: yes(), gohighlevel: no() } },
    { label: msg('Profit and loss, month by month'), values: { business_agent: yes(), square: partly(msg('Sales reports, without your costs')), gohighlevel: no() } },
    { label: msg('Supplier invoices and expenses'), values: { business_agent: yes(msg('Collected from Gmail or Outlook')), square: no(), gohighlevel: no(msg('Its invoices are for billing your customers')) } },
    { label: msg('Tax returns and their deadlines'), values: { business_agent: yes(msg('IVA and IRPF, with reminders')), square: no(), gohighlevel: no() } },
  ] },
  { group: msg('Stock and menu'), rows: [
    { label: msg('Stock, suppliers and the order list'), values: { business_agent: yes(), square: extra(msg('MarketMan, another app')), gohighlevel: no() } },
    { label: msg('Menu costing and margins'), values: { business_agent: yes(), square: extra(msg('MarketMan, another app')), gohighlevel: no() } },
    { label: msg('Food safety and waste logs'), values: { business_agent: yes(), square: no(), gohighlevel: no() } },
  ] },
  { group: msg('Marketing'), rows: [
    { label: msg('Social posts planned for Instagram, Facebook, TikTok and LinkedIn'), values: { business_agent: yes(), square: no(), gohighlevel: yes(msg('Social Planner')) } },
    { label: msg('Email and text campaigns'), values: { business_agent: yes(), square: extra(msg('Square Marketing')), gohighlevel: yes(msg('Each message charged as sent')) } },
    { label: msg('Opening hours kept up to date on Google Maps'), values: { business_agent: yes(), square: yes(msg('From your location details')), gohighlevel: extra(msg('Online listings add-on')) } },
    { label: msg('Google reviews in one place, with replies'), values: { business_agent: yes(), square: no(), gohighlevel: yes(msg('Reputation management')) } },
    { label: msg('Competitors’ prices, hours and ratings'), values: { business_agent: yes(), square: no(), gohighlevel: no() } },
  ] },
  { group: msg('AI'), rows: [
    { label: msg('Your own AI (Claude, ChatGPT) works in it, through MCP'), values: { business_agent: yes(msg('The whole business, on every plan')), square: yes(msg('Square’s own data')), gohighlevel: yes(msg('HighLevel’s own data')) } },
  ] },
  { group: msg('Made for you'), rows: [
    { label: msg('In Spanish, priced in euros'), values: { business_agent: yes(), square: yes(), gohighlevel: partly(msg('Priced and billed in US dollars')) } },
    { label: msg('A free plan to start on'), values: { business_agent: yes(msg('Up to 3 people')), square: yes(msg('The till, and Shifts up to 5 people')), gohighlevel: no(msg('A 14-day trial')) } },
  ], jobs: false },
]

/** The café's jobs, every one of them: what the counts on the page are out of. */
export const FEATURE_ROWS = FEATURE_GROUPS.filter(g => g.jobs !== false).flatMap(g => g.rows)

/** How many of the jobs a route does: built in, as a paid add-on, in part, and not at all. */
export function coverage(id: ProductId): Record<Has, number> {
  const count: Record<Has, number> = { yes: 0, extra: 0, partial: 0, no: 0 }
  for (const r of FEATURE_ROWS) count[r.values[id].has]++
  return count
}

/** The jobs a route doesn't do at any price (shown under its cost: what you'd still need another app for). */
export const missing = (id: ProductId) => FEATURE_ROWS.filter(r => r.values[id].has === 'no').map(r => r.label)
