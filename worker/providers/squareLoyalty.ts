// Square Loyalty and Gift Cards (the Loyalty page). Reads the programme, its members and what
// happened lately; the only changes made are goodwill points (an adjustment, with a reason) and
// selling a digital gift card (created, then activated at the café's location for the amount paid).
// Every change carries an idempotency key, so a retried request never gives points or a card twice.
// Card numbers (GANs) are cut to their last 4 digits here, before anything leaves the Worker; only
// giftCardNumber() gives one card's whole number, for an admin's "Copy number".
import { squareApi, SquareError } from './square'
import { last4, type GiftCard, type GiftCardActivity, type GiftCardActivityKind, type LoyaltyEvent, type LoyaltyEventKind, type LoyaltyProgram } from '../../shared/loyalty'

interface Money { amount?: number; currency?: string }
const euros = (m?: Money) => (m?.amount ?? 0) / 100

interface SquareProgram {
  status?: string
  terminology?: { one?: string; other?: string }
  reward_tiers?: { id?: string; name?: string; points: number }[]
  accrual_rules?: { accrual_type: string; points?: number; visit_data?: { minimum_amount_money?: Money }; spend_data?: { amount_money?: Money } }[]
}

/** The seller's programme (`main` is Square's word for its only one); null when none is set up or it's switched off. */
export async function program(sandbox: boolean, token: string): Promise<LoyaltyProgram | null> {
  let p: SquareProgram | undefined
  try {
    p = (await squareApi<{ program?: SquareProgram }>(sandbox, token, '/v2/loyalty/programs/main')).program
  } catch (e) {
    if (e instanceof SquareError && e.code === 'NOT_FOUND') return null
    throw e
  }
  if (!p || p.status !== 'ACTIVE') return null
  const visit = p.accrual_rules?.find(r => r.accrual_type === 'VISIT')
  const spend = p.accrual_rules?.find(r => r.accrual_type === 'SPEND')
  return {
    one: p.terminology?.one ?? 'Point',
    other: p.terminology?.other ?? 'Points',
    per_visit: visit ? visit.points ?? 1 : null,
    minimum_spend: visit?.visit_data?.minimum_amount_money ? euros(visit.visit_data.minimum_amount_money) : null,
    per_spend: spend?.spend_data?.amount_money ? { points: spend.points ?? 1, amount: euros(spend.spend_data.amount_money) } : null,
    tiers: (p.reward_tiers ?? []).map(t => ({ id: t.id ?? '', name: t.name ?? '', points: t.points })).sort((a, b) => a.points - b.points),
  }
}

export interface SquareLoyaltyAccount { id: string; customer_id?: string; balance?: number; lifetime_points?: number; enrolled_at?: string; created_at?: string }

/** Every member of the programme (up to 2,000). */
export async function accounts(sandbox: boolean, token: string): Promise<SquareLoyaltyAccount[]> {
  const out: SquareLoyaltyAccount[] = []
  let cursor: string | undefined
  for (let page = 0; page < 10; page++) {
    const r = await squareApi<{ loyalty_accounts?: SquareLoyaltyAccount[]; cursor?: string }>(sandbox, token, '/v2/loyalty/accounts/search',
      { limit: 200, ...(cursor ? { cursor } : {}) })
    out.push(...r.loyalty_accounts ?? [])
    cursor = r.cursor
    if (!cursor) break
  }
  return out
}

interface SquareLoyaltyEvent {
  id: string; type: string; created_at: string; loyalty_account_id: string
  accumulate_points?: { points?: number }; adjust_points?: { points?: number; reason?: string }
  redeem_reward?: { reward_id?: string }; expire_points?: { points?: number }; create_reward?: { points?: number }
}
const KIND: Record<string, LoyaltyEventKind> = {
  ACCUMULATE_POINTS: 'earn', ACCUMULATE_PROMOTION_POINTS: 'earn', REDEEM_REWARD: 'redeem', ADJUST_POINTS: 'adjust', EXPIRE_POINTS: 'expire',
}

/** What happened between two instants: points earned, rewards redeemed, adjustments, points expired (up to 3,000 events). */
export async function events(sandbox: boolean, token: string, fromIso: string, toIso: string): Promise<LoyaltyEvent[]> {
  const out: LoyaltyEvent[] = []
  let cursor: string | undefined
  for (let page = 0; page < 100; page++) {
    const r = await squareApi<{ events?: SquareLoyaltyEvent[]; cursor?: string }>(sandbox, token, '/v2/loyalty/events/search', {
      limit: 30, ...(cursor ? { cursor } : {}),
      query: { filter: { date_time_filter: { created_at: { start_at: fromIso, end_at: toIso } } } },
    })
    for (const e of r.events ?? []) {
      const kind = KIND[e.type] ?? 'other'
      // Creating a reward takes its points off (they come back if it's deleted); its redeeming is counted instead.
      if (e.type === 'CREATE_REWARD' || e.type === 'DELETE_REWARD') continue
      const points = e.accumulate_points?.points ?? e.adjust_points?.points ?? (e.expire_points?.points ? -e.expire_points.points : 0)
      out.push({ id: e.id, kind, points, at: e.created_at, account_id: e.loyalty_account_id, reason: e.adjust_points?.reason ?? null })
    }
    cursor = r.cursor
    if (!cursor) break
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/** Goodwill points (or taking some back): one ADJUST_POINTS event, never twice for the same key. */
export async function adjust(sandbox: boolean, token: string, accountId: string, points: number, reason: string, idempotencyKey: string) {
  const r = await squareApi<{ event?: SquareLoyaltyEvent }>(sandbox, token, `/v2/loyalty/accounts/${encodeURIComponent(accountId)}/adjust`, {
    idempotency_key: idempotencyKey, adjust_points: { points, reason: reason.slice(0, 100) },
  })
  return r.event?.id ?? null
}

interface SquareGiftCard { id: string; type?: string; state?: string; balance_money?: Money; gan?: string; created_at?: string; customer_ids?: string[] }
/** What a card's activities say about it (see giftCardBook). */
interface CardUse { original: number | null; last_used: string | null }
const toCard = (g: SquareGiftCard, use: CardUse = { original: null, last_used: null }): Omit<GiftCard, 'customer'> => ({
  id: g.id, last4: last4(g.gan), type: g.type === 'PHYSICAL' ? 'PHYSICAL' : 'DIGITAL',
  state: (['ACTIVE', 'PENDING', 'DEACTIVATED', 'BLOCKED'].includes(g.state ?? '') ? g.state : 'PENDING') as GiftCard['state'],
  balance: euros(g.balance_money), created_at: g.created_at ?? '', customer_id: g.customer_ids?.[0] ?? null, ...use,
})

/** Every gift card in Square, whatever its state (up to 2,000), as Square gives them. */
async function listGiftCards(sandbox: boolean, token: string) {
  const out: SquareGiftCard[] = []
  let cursor: string | undefined
  for (let page = 0; page < 40; page++) {
    const q = new URLSearchParams({ limit: '50', ...(cursor ? { cursor } : {}) })
    const r = await squareApi<{ gift_cards?: SquareGiftCard[]; cursor?: string }>(sandbox, token, `/v2/gift-cards?${q}`)
    out.push(...r.gift_cards ?? [])
    cursor = r.cursor
    if (!cursor) break
  }
  return out
}
interface SquareActivity {
  id: string; type: string; created_at: string; gift_card_id?: string; gift_card_gan?: string; gift_card_balance_money?: Money
  activate_activity_details?: { amount_money?: Money }; load_activity_details?: { amount_money?: Money }
  redeem_activity_details?: { amount_money?: Money }; clear_balance_activity_details?: { reason?: string }
}
const ACTIVITY: Record<string, GiftCardActivityKind> = { ACTIVATE: 'activate', LOAD: 'load', REDEEM: 'redeem', CLEAR_BALANCE: 'clear' }

/** Gift card activities between two instants, newest first, as Square gives them (up to `pages` × 100). */
async function listActivities(sandbox: boolean, token: string, fromIso: string, toIso: string, pages: number) {
  const out: SquareActivity[] = []
  let cursor: string | undefined
  for (let page = 0; page < pages; page++) {
    const q = new URLSearchParams({ begin_time: fromIso, end_time: toIso, limit: '100', sort_order: 'DESC', ...(cursor ? { cursor } : {}) })
    const r = await squareApi<{ gift_card_activities?: SquareActivity[]; cursor?: string }>(sandbox, token, `/v2/gift-cards/activities?${q}`)
    out.push(...r.gift_card_activities ?? [])
    cursor = r.cursor
    if (!cursor) break
  }
  return out
}

const toActivity = (a: SquareActivity): GiftCardActivity => {
  const money = a.activate_activity_details?.amount_money ?? a.load_activity_details?.amount_money ?? a.redeem_activity_details?.amount_money
  return { id: a.id, kind: ACTIVITY[a.type] ?? 'other', amount: euros(money), at: a.created_at, last4: last4(a.gift_card_gan),
    balance: a.gift_card_balance_money ? euros(a.gift_card_balance_money) : null }
}

/**
 * The Gift cards tab: every card (up to 2,000, newest first) with what its history says (the amount
 * it was first loaded with, when it was last spent with), and what happened between fromIso and toIso.
 * Square's card carries neither, so they come from every activity since the oldest card was made (up
 * to 4,000, newest first; cards older than that leave them unknown). Numbers are cut to their last 4 digits.
 */
export async function giftCardBook(sandbox: boolean, token: string, fromIso: string, toIso: string) {
  const raw = await listGiftCards(sandbox, token)
  const since = new Date(Math.min(Date.parse(fromIso), ...raw.map(g => Date.parse(g.created_at ?? '')).filter(n => !Number.isNaN(n)))).toISOString()
  const all = await listActivities(sandbox, token, since, toIso, 40)
  const from = Date.parse(fromIso), to = Date.parse(toIso)
  // An activity names its card by id and by number; match on the number when the id isn't there.
  const byGan = new Map(raw.filter(g => g.gan).map(g => [g.gan!, g.id]))
  const use = new Map<string, CardUse & { activated?: string }>()
  for (const a of all) {
    const id = a.gift_card_id ?? (a.gift_card_gan ? byGan.get(a.gift_card_gan) : undefined)
    if (!id) continue
    const u = use.get(id) ?? { original: null, last_used: null }
    if (a.type === 'ACTIVATE' && (!u.activated || a.created_at < u.activated)) {
      u.activated = a.created_at
      u.original = euros(a.activate_activity_details?.amount_money)
    }
    if (a.type === 'REDEEM' && (!u.last_used || a.created_at > u.last_used)) u.last_used = a.created_at
    use.set(id, u)
  }
  const cards = raw.map(g => {
    const u = use.get(g.id)
    return toCard(g, { original: u?.original ?? null, last_used: u?.last_used ?? null })
  }).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const activities = all.filter(a => Date.parse(a.created_at) >= from && Date.parse(a.created_at) < to).map(toActivity).sort((a, b) => b.at.localeCompare(a.at))
  return { currency: raw.find(g => g.balance_money?.currency)?.balance_money?.currency ?? 'EUR', cards, activities }
}

/** One card's whole number (GAN), for an admin's "Copy number": asked of Square each time, never kept. */
export async function giftCardNumber(sandbox: boolean, token: string, id: string) {
  const { gift_card: card } = await squareApi<{ gift_card?: SquareGiftCard }>(sandbox, token, `/v2/gift-cards/${encodeURIComponent(id)}`)
  return (card?.gan ?? '').replace(/\s/g, '')
}

/**
 * Sell a digital gift card: create it, activate it at the location for the amount (paid at the till
 * outside a Square order, so the payment is recorded as taken in person), and link it to a customer
 * if one was chosen. Each step has its own idempotency key built from one key, so trying again after
 * a failure never makes a second card or loads it twice.
 */
export async function sellGiftCard(sandbox: boolean, token: string, s: { locationId: string; amount: number; currency: string; customerId?: string | null; key: string }) {
  const { gift_card: card } = await squareApi<{ gift_card: SquareGiftCard }>(sandbox, token, '/v2/gift-cards', {
    idempotency_key: `${s.key}:create`, location_id: s.locationId, gift_card: { type: 'DIGITAL' },
  })
  await squareApi(sandbox, token, '/v2/gift-cards/activities', {
    idempotency_key: `${s.key}:activate`,
    gift_card_activity: { type: 'ACTIVATE', location_id: s.locationId, gift_card_id: card.id,
      activate_activity_details: { amount_money: { amount: Math.round(s.amount * 100), currency: s.currency }, buyer_payment_instrument_ids: ['IN_PERSON'] } },
  })
  if (s.customerId) await squareApi(sandbox, token, `/v2/gift-cards/${encodeURIComponent(card.id)}/link-customer`, { customer_id: s.customerId })
  return { ...toCard({ ...card, state: 'ACTIVE', balance_money: { amount: Math.round(s.amount * 100), currency: s.currency }, customer_ids: s.customerId ? [s.customerId] : card.customer_ids },
    { original: s.amount, last_used: null }) }
}
