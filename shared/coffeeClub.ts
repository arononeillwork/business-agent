// The coffee club (Sales → Coffee club): a monthly membership, bought on Square's own checkout page, worth so many
// free coffees a week. Square takes the money (a subscription at one flat monthly price, its card charged each
// month); the app counts the coffees. On the Square till the team adds the member to the sale and applies the
// club's discount to the drink; the Worker reads the sale, counts it against the member's week (Monday to
// Sunday, the business's days) and writes what's left on the member's Square customer note, which the till shows
// whenever they're added to a sale (worker/coffeeClub.ts, the coffee_club migration).
import { msg } from './i18n'
import { localDate, weekStart } from './time'

/** A member's Square subscription, as Square has it. */
export type ClubStatus = 'pending' | 'active' | 'paused' | 'canceled' | 'deactivated'
/** Why a coffee on the till didn't count as a member's: see clubProblem. */
export type ClubProblem = 'no_customer' | 'not_member' | 'not_paid' | 'over_limit'
/** What the note on the till is written in. */
export type TillLanguage = 'en' | 'es'

export interface CoffeeClubSettings {
  name: string
  /** A month, tax included. */
  price: number
  currency: string
  coffees_per_week: number
  /** The most the discount takes off one drink. */
  max_value: number
  till_language: TillLanguage
  /** Taking new members: the sign-up page is up. */
  selling: boolean
  /** Square's checkout page for joining (null while not selling). */
  signup_url: string | null
  set_up_at: string
}

export interface ClubMember {
  id: string
  customer_id: string | null
  /** From Customers; null until Square's customer has come in. */
  name: string | null
  square_customer_id: string
  status: ClubStatus
  started_on: string | null
  /** The last day a cancelled membership runs. */
  ends_on: string | null
  /** The latest monthly charge went through (or none is due yet). */
  paid: boolean
  paid_through: string | null
  /** Coffees counted this week (Monday to Sunday). */
  used_this_week: number
  last_coffee: string | null
  /** Every coffee counted since they joined. */
  coffees: number
  /** Their member code: a barcode on their pass on the website (the club_member_codes migration). */
  card_code: string | null
  /** In the business's Square Loyalty programme, so they can tap their iPhone's pass at the till; null: not known. */
  loyalty: boolean | null
}

export interface ClubCoffee {
  id: string
  member_id: string | null
  /** The member's name, when it was one. */
  name: string | null
  /** What was on the till ("Flat White"). */
  item: string | null
  quantity: number
  /** What the discount took off. */
  value: number
  at: string
  problem: ClubProblem | null
  sorted_at: string | null
}

export interface CoffeeClubState {
  /** ok; not_set_up: no club yet; reconnect: Square was connected before the app asked for subscriptions. */
  status: 'ok' | 'not_set_up' | 'reconnect'
  club: CoffeeClubSettings | null
  members: ClubMember[]
  /** The last 60 days' coffees, newest first. */
  coffees: ClubCoffee[]
  /** This week's Monday, the business's day. */
  week: string
  /** When Square's sales were last looked through. */
  checked_at: string | null
  /**
   * Whether the business has a Square Loyalty programme, whose Apple Wallet pass lets a member tap their iPhone on the
   * till's customer display to be added to the sale. Null: not known (Square couldn't be asked just then).
   */
  loyalty_program: boolean | null
}

/** What an admin sets: the rest (Square's plan, the discount, the sign-up page) the Worker makes. */
export interface CoffeeClubInput {
  name: string
  price: number
  coffees_per_week: number
  max_value: number
  till_language: TillLanguage
  selling: boolean
}

/** What's usual to start with: €10 a month, a coffee a week, up to €5 off a drink. */
export const CLUB_DEFAULTS: CoffeeClubInput = { name: 'Coffee club', price: 10, coffees_per_week: 1, max_value: 5, till_language: 'en', selling: true }

const cents = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6

/** What's wrong with what was typed, or null. */
export function clubInputProblem(i: Partial<CoffeeClubInput>): string | null {
  const name = (i.name ?? '').trim()
  if (!name) return msg('Give the club a name')
  if (name.length > 40) return msg('Keep the name to 40 characters')
  const price = Number(i.price)
  if (!Number.isFinite(price) || price < 1 || price > 200) return msg('The price goes from €1 to €200 a month')
  if (!cents(price)) return msg('Use euros and cents')
  const n = Number(i.coffees_per_week)
  if (!Number.isInteger(n) || n < 1 || n > 14) return msg('From 1 to 14 coffees a week')
  const max = Number(i.max_value)
  if (!Number.isFinite(max) || max < 0.5 || max > 50) return msg('The most off a drink goes from €0.50 to €50')
  if (!cents(max)) return msg('Use euros and cents')
  if (i.till_language !== 'en' && i.till_language !== 'es') return msg('Choose the language of the note on the till')
  return null
}

/** How a member stands, for a label: pending, active, payment failed, paused, ending (cancelled, still running) or ended. */
export type Standing = 'pending' | 'active' | 'payment_failed' | 'paused' | 'ending' | 'ended'
export function standing(m: Pick<ClubMember, 'status' | 'paid' | 'ends_on'>): Standing {
  if (m.status === 'canceled' || m.status === 'deactivated') return 'ended'
  if (m.status === 'paused') return 'paused'
  if (m.status === 'pending') return 'pending'
  if (!m.paid) return 'payment_failed'
  return m.ends_on ? 'ending' : 'active'
}

/** A member whose coffees count: active in Square, with the latest charge paid. */
export const inGoodStanding = (m: Pick<ClubMember, 'status' | 'paid'>) => m.status === 'active' && m.paid

/** The Monday of the week an instant falls in, in the business's time zone. */
export const weekOf = (iso: string, tz?: string) => weekStart(localDate(iso, tz))

/**
 * Why a coffee on the till doesn't count as a member's, or null when it does: nobody added to the sale, someone
 * who isn't a member, a member not in good standing, or one whose week's coffees `used` already had.
 */
export function clubProblem(customerId: string | null, member: Pick<ClubMember, 'status' | 'paid'> | null,
  used: number, quantity: number, perWeek: number): ClubProblem | null {
  if (!customerId) return 'no_customer'
  if (!member) return 'not_member'
  if (!inGoodStanding(member)) return 'not_paid'
  return used + quantity > perWeek ? 'over_limit' : null
}

/** A member code as it's shown under the barcode: "7Q2K 9XMB". */
export const cardCodeText = (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`

/** Each note line the app writes starts with this, so it finds and replaces its own and leaves the team's alone. */
export const NOTE_MARK = '☕ '

const dayMonth = (date: string) => `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`

/**
 * The line on a member's Square customer note, which the till shows when they're added to a sale: whether this
 * week's coffee is there to have. Null: no line (the membership has ended).
 */
export function noteLine(club: Pick<CoffeeClubSettings, 'name' | 'coffees_per_week' | 'till_language'>,
  m: Pick<ClubMember, 'status' | 'paid' | 'started_on' | 'used_this_week'>): string | null {
  const es = club.till_language === 'es'
  const n = club.coffees_per_week
  const left = Math.max(0, n - m.used_this_week)
  const say = (text: string) => `${NOTE_MARK}${club.name}: ${text}`
  if (m.status === 'canceled' || m.status === 'deactivated') return null
  if (m.status === 'pending') return say(es ? `empieza el ${m.started_on ? dayMonth(m.started_on) : '–'}` : `starts ${m.started_on ? dayMonth(m.started_on) : '–'}`)
  if (m.status === 'paused') return say(es ? 'en pausa. Cobrar normal' : 'paused. Charge as normal')
  if (!m.paid) return say(es ? 'el último pago falló. Cobrar normal' : 'the last payment failed. Charge as normal')
  if (left === 0) {
    if (n === 1) return say(es ? 'ya tomó el café de esta semana. El próximo, el lunes' : 'this week’s coffee used. Next one on Monday')
    return say(es ? `ya tomó los ${n} cafés de esta semana. Más el lunes` : `all ${n} coffees used this week. More on Monday`)
  }
  if (n === 1) return say(es ? 'el café de esta semana está listo' : 'this week’s coffee is ready')
  return say(es ? `le quedan ${left} de ${n} cafés esta semana` : `${left} of ${n} coffees left this week`)
}

/** The team's own note, without the app's line. */
export const withoutNoteLine = (note: string | null | undefined) =>
  (note ?? '').split('\n').filter(l => !l.startsWith(NOTE_MARK)).join('\n').trim()

/** The note with the app's line first (or without it, for null), the team's own lines kept as they were. */
export function withNoteLine(note: string | null | undefined, line: string | null) {
  const own = withoutNoteLine(note)
  return [line, own].filter(Boolean).join('\n')
}

/** The figures at the top of the page: members in good standing, coffees this week, and the month in money. */
export function clubTotals(s: Pick<CoffeeClubState, 'club' | 'members' | 'coffees' | 'week'>, month: string) {
  const good = s.members.filter(inGoodStanding)
  const counted = s.coffees.filter(c => !c.problem)
  const thisMonth = counted.filter(c => c.at.slice(0, 7) === month)
  return {
    members: good.length,
    /** A month's takings from the members in good standing now. */
    monthly: Math.round(good.length * (s.club?.price ?? 0) * 100) / 100,
    week: s.members.reduce((n, m) => n + m.used_this_week, 0),
    month_coffees: thisMonth.reduce((n, c) => n + c.quantity, 0),
    /** What the coffees given this month would have cost at the till. */
    month_value: Math.round(thisMonth.reduce((n, c) => n + c.value, 0) * 100) / 100,
    problems: s.coffees.filter(c => c.problem && !c.sorted_at).length,
  }
}
