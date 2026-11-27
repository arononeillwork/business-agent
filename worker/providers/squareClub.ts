// Square for the coffee club (worker/coffeeClub.ts): what the app makes there once (a subscription plan at a flat
// monthly price, the discount the team applies on the till, the checkout page people join on) and what it reads
// (the club's subscriptions and their invoices, the sales the discount was used on, a customer's note, which
// it keeps a line of). Needs SUBSCRIPTIONS_READ/WRITE, INVOICES_READ, ORDERS_READ/WRITE, PAYMENTS_WRITE (the
// checkout page), ITEMS_WRITE and CUSTOMERS_READ/WRITE: a connection made before them answers
// INSUFFICIENT_SCOPES (a SquareError with that code), and the business connects Square again.
import { SquareError, squareApi as api } from './square'

type Money = { amount: number; currency: string }
const money = (euros: number, currency: string): Money => ({ amount: Math.round(euros * 100), currency })
const euros = (m?: { amount?: number } | null) => Math.round(m?.amount ?? 0) / 100

interface CatalogObject { id: string; type: string; version?: number; [k: string]: unknown }

/**
 * Makes or changes a catalog object. Something made (a `#` id) keeps the key, so trying again gets the same one back;
 * a change to one already there carries its version, and the key does too, so it's never mistaken for an earlier one.
 */
async function upsert(sandbox: boolean, token: string, key: string, object: Record<string, unknown>) {
  const idempotency_key = object.version !== undefined ? `${key}:v${object.version}` : key
  const r = await api<{ catalog_object: CatalogObject }>(sandbox, token, '/v2/catalog/object', { idempotency_key, object })
  return r.catalog_object
}

/** The subscription plan (its name only: prices are its variations'). */
export const createPlan = async (sandbox: boolean, token: string, key: string, name: string) =>
  (await upsert(sandbox, token, key, { type: 'SUBSCRIPTION_PLAN', id: '#club-plan', subscription_plan_data: { name } })).id

/** A variation of the plan at one flat price a month, from the day someone joins, until they cancel. */
export const createVariation = async (sandbox: boolean, token: string, key: string, planId: string, name: string, price: number, currency: string) =>
  (await upsert(sandbox, token, key, {
    type: 'SUBSCRIPTION_PLAN_VARIATION', id: '#club-variation',
    subscription_plan_variation_data: {
      name, subscription_plan_id: planId,
      phases: [{ ordinal: 0, cadence: 'MONTHLY', pricing: { type: 'STATIC', price_money: money(price, currency) } }],
    },
  })).id

/**
 * The club's discount on the till: the whole drink, up to `max` off, applied by hand. Changing it (`id`) sends
 * Square's current version back, so a change made in Square meanwhile is refused rather than overwritten.
 */
export async function saveDiscount(sandbox: boolean, token: string, key: string, d: { id?: string | null; name: string; max: number; currency: string }) {
  let version: number | undefined
  if (d.id) {
    const found = await api<{ object?: CatalogObject }>(sandbox, token, `/v2/catalog/object/${encodeURIComponent(d.id)}`).catch(e => {
      if (e instanceof SquareError && e.code === 'NOT_FOUND') return { object: undefined }
      throw e
    })
    version = found.object?.version
    // Deleted in Square: a new one.
    if (!found.object) d = { ...d, id: null }
  }
  return (await upsert(sandbox, token, key, {
    type: 'DISCOUNT', id: d.id ?? '#club-discount', ...(version !== undefined ? { version } : {}),
    discount_data: { name: d.name, discount_type: 'FIXED_PERCENTAGE', percentage: '100', maximum_amount_money: money(d.max, d.currency), pin_required: false },
  })).id
}

/** Square's checkout page for joining: pays the first month and keeps the card for the next. */
export async function createSignupLink(sandbox: boolean, token: string, key: string,
  l: { name: string; price: number; currency: string; locationId: string; variationId: string; description?: string; buyerEmail?: string; redirectUrl?: string }) {
  const r = await api<{ payment_link: { id: string; url: string } }>(sandbox, token, '/v2/online-checkout/payment-links', {
    idempotency_key: key,
    ...(l.description ? { description: l.description } : {}),
    quick_pay: { name: l.name, price_money: money(l.price, l.currency), location_id: l.locationId },
    checkout_options: { subscription_plan_id: l.variationId, ask_for_shipping_address: false, ...(l.redirectUrl ? { redirect_url: l.redirectUrl } : {}) },
    // Someone joining from the website: their email filled in, so the membership is theirs on its account page.
    ...(l.buyerEmail ? { pre_populated_data: { buyer_email: l.buyerEmail } } : {}),
  })
  return { id: r.payment_link.id, url: r.payment_link.url }
}

/** A checkout page's description changed in place (its address, and the QR codes printed for it, stay the same). */
export async function updateSignupDescription(sandbox: boolean, token: string, id: string, description: string) {
  const path = `/v2/online-checkout/payment-links/${encodeURIComponent(id)}`
  const { payment_link: link } = await api<{ payment_link: { version: number } }>(sandbox, token, path)
  await api(sandbox, token, path, { payment_link: { version: link.version, description } }, 'PUT')
}

/** Takes a checkout page down (already gone is fine). */
export async function deleteSignupLink(sandbox: boolean, token: string, id: string) {
  try {
    await api(sandbox, token, `/v2/online-checkout/payment-links/${encodeURIComponent(id)}`, undefined, 'DELETE')
  } catch (e) {
    if (!(e instanceof SquareError && e.code === 'NOT_FOUND')) throw e
  }
}

/** A subscription as Square gives one (what we read of it). */
export interface SquareSubscription {
  id: string
  location_id?: string
  plan_variation_id?: string
  customer_id?: string
  start_date?: string
  canceled_date?: string
  charged_through_date?: string
  status?: 'PENDING' | 'ACTIVE' | 'CANCELED' | 'DEACTIVATED' | 'PAUSED'
}

/** Every subscription at these locations (up to 2,000). */
export async function subscriptions(sandbox: boolean, token: string, locationIds: string[]): Promise<SquareSubscription[]> {
  const out: SquareSubscription[] = []
  let cursor: string | undefined
  for (let page = 0; page < 10; page++) {
    const r = await api<{ subscriptions?: SquareSubscription[]; cursor?: string }>(sandbox, token, '/v2/subscriptions/search', {
      limit: 200, ...(cursor ? { cursor } : {}), query: { filter: { location_ids: locationIds } },
    })
    out.push(...r.subscriptions ?? [])
    cursor = r.cursor
    if (!cursor) break
  }
  return out
}

export const subscription = async (sandbox: boolean, token: string, id: string) =>
  (await api<{ subscription: SquareSubscription }>(sandbox, token, `/v2/subscriptions/${encodeURIComponent(id)}`)).subscription

/** Ends a subscription at the end of the month already paid for. */
export const cancelSubscription = async (sandbox: boolean, token: string, id: string) =>
  (await api<{ subscription: SquareSubscription }>(sandbox, token, `/v2/subscriptions/${encodeURIComponent(id)}/cancel`, {})).subscription

export interface SquareInvoice { id: string; subscription_id?: string; status?: string; created_at?: string }

/** A location's invoices (the monthly charges among them), newest pages first as Square gives them (up to 1,000). */
export async function invoices(sandbox: boolean, token: string, locationId: string): Promise<SquareInvoice[]> {
  const out: SquareInvoice[] = []
  let cursor: string | undefined
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({ location_id: locationId, limit: '200', ...(cursor ? { cursor } : {}) })
    const r = await api<{ invoices?: SquareInvoice[]; cursor?: string }>(sandbox, token, `/v2/invoices?${q}`)
    out.push(...r.invoices ?? [])
    cursor = r.cursor
    if (!cursor) break
  }
  return out
}

/** An invoice that says the month's charge didn't go through. */
export const unpaid = (status?: string) => status === 'UNPAID' || status === 'FAILED' || status === 'CANCELED' || status === 'PARTIALLY_PAID'

/** Whether each subscription's latest invoice was paid (subscriptions without one aren't in it). */
export function paidBySubscription(list: SquareInvoice[]) {
  const latest = new Map<string, SquareInvoice>()
  for (const i of list) {
    if (!i.subscription_id) continue
    const kept = latest.get(i.subscription_id)
    if (!kept || (i.created_at ?? '') > (kept.created_at ?? '')) latest.set(i.subscription_id, i)
  }
  return new Map([...latest].map(([id, i]) => [id, !unpaid(i.status)]))
}

/** A sale as Square gives one (what the club reads of it). */
export interface SquareOrder {
  id: string
  state?: string
  location_id?: string
  customer_id?: string
  closed_at?: string
  created_at?: string
  discounts?: { uid: string; catalog_object_id?: string; scope?: 'LINE_ITEM' | 'ORDER'; applied_money?: { amount: number } }[]
  line_items?: { uid: string; name?: string; variation_name?: string; quantity?: string; applied_discounts?: { discount_uid: string; applied_money?: { amount: number } }[] }[]
  tenders?: { customer_id?: string }[]
}

export const order = async (sandbox: boolean, token: string, id: string) =>
  (await api<{ order: SquareOrder }>(sandbox, token, `/v2/orders/${encodeURIComponent(id)}`)).order

/** Completed sales closed between two instants, oldest first (up to 10 pages of 500). */
export async function completedOrders(sandbox: boolean, token: string, locationIds: string[], fromIso: string, toIso: string): Promise<SquareOrder[]> {
  const out: SquareOrder[] = []
  let cursor: string | undefined
  for (let page = 0; page < 10; page++) {
    const r = await api<{ orders?: SquareOrder[]; cursor?: string }>(sandbox, token, '/v2/orders/search', {
      location_ids: locationIds, limit: 500, ...(cursor ? { cursor } : {}),
      query: { filter: { state_filter: { states: ['COMPLETED'] }, date_time_filter: { closed_at: { start_at: fromIso, end_at: toIso } } },
        sort: { sort_field: 'CLOSED_AT', sort_order: 'ASC' } },
    })
    out.push(...r.orders ?? [])
    cursor = r.cursor
    if (!cursor) break
  }
  return out
}

/** One coffee line of a sale the club's discount was used on. */
export interface ClubLine { uid: string; item: string | null; quantity: number; value: number }

/**
 * The lines of a sale the club's discount (`discountId`) took something off. A discount applied to the whole
 * sale rather than a drink counts as one coffee, worth what it took off (it can't be more than the club's most).
 */
export function clubLines(o: SquareOrder, discountId: string): ClubLine[] {
  const ours = (o.discounts ?? []).filter(d => d.catalog_object_id === discountId)
  if (!ours.length) return []
  const out: ClubLine[] = []
  for (const d of ours) {
    if (d.scope === 'ORDER') {
      out.push({ uid: `order:${d.uid}`, item: null, quantity: 1, value: euros(d.applied_money) })
      continue
    }
    for (const li of o.line_items ?? []) {
      const applied = li.applied_discounts?.find(a => a.discount_uid === d.uid)
      if (!applied) continue
      const quantity = Math.max(1, Math.min(50, Math.round(Number(li.quantity ?? 1)) || 1))
      const item = [li.name?.trim(), li.variation_name && !/^regular$/i.test(li.variation_name) ? li.variation_name : null].filter(Boolean).join(' · ')
      out.push({ uid: li.uid, item: item || null, quantity, value: euros(applied.applied_money) })
    }
  }
  return out
}

/** Who the sale was for: the customer added to it (or to its payment). */
export const customerOf = (o: SquareOrder) => o.customer_id ?? o.tenders?.find(t => t.customer_id)?.customer_id ?? null

export interface SquareCustomerNote { id: string; note?: string; version?: number }

export const customer = async (sandbox: boolean, token: string, id: string) =>
  (await api<{ customer: SquareCustomerNote & Record<string, unknown> }>(sandbox, token, `/v2/customers/${encodeURIComponent(id)}`)).customer

/** Sets a customer's note (the rest of the customer as it was), with the version read, so a change meanwhile is refused. */
export async function setNote(sandbox: boolean, token: string, id: string, note: string, version?: number) {
  await api(sandbox, token, `/v2/customers/${encodeURIComponent(id)}`, { note, ...(version !== undefined ? { version } : {}) }, 'PUT')
}

// ---------------------------------------------------------------------------------------------------------------
// Square applies the free coffee by itself: a customer group of the members due a coffee, the drinks it covers (a
// product set of categories, one drink a sale) and a pricing rule tying them to the club's discount, the same one the
// team can apply by hand (so the till lists one). Square applies a pricing rule's discount by itself;
// `customer_group_ids_any` keeps it to customers in the group.
// ---------------------------------------------------------------------------------------------------------------

/** The item library's categories (for choosing the drinks), by name. */
export async function categories(sandbox: boolean, token: string): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = []
  let cursor: string | undefined
  for (let page = 0; page < 10; page++) {
    const r = await api<{ objects?: { id: string; is_deleted?: boolean; category_data?: { name?: string } }[]; cursor?: string }>(sandbox, token,
      `/v2/catalog/list?types=CATEGORY${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    for (const o of r.objects ?? []) if (!o.is_deleted && o.category_data?.name) out.push({ id: o.id, name: o.category_data.name })
    cursor = r.cursor
    if (!cursor) break
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** A customer group (CUSTOMERS_WRITE). The same key gives back the same group. */
export async function createGroup(sandbox: boolean, token: string, key: string, name: string) {
  return (await api<{ group: { id: string } }>(sandbox, token, '/v2/customers/groups', { idempotency_key: key, group: { name } })).group.id
}

/** Puts a customer in a group, or takes them out (already so is fine). */
export async function setInGroup(sandbox: boolean, token: string, customerId: string, groupId: string, inGroup: boolean) {
  const path = `/v2/customers/${encodeURIComponent(customerId)}/groups/${encodeURIComponent(groupId)}`
  await api(sandbox, token, path, inGroup ? {} : undefined, inGroup ? 'PUT' : 'DELETE')
}

/** A catalog object's current version, or null when it's gone from Square. */
export async function versionOf(sandbox: boolean, token: string, id: string | null | undefined): Promise<number | null> {
  if (!id) return null
  try {
    return (await api<{ object?: CatalogObject }>(sandbox, token, `/v2/catalog/object/${encodeURIComponent(id)}`)).object?.version ?? null
  } catch (e) {
    if (e instanceof SquareError && e.code === 'NOT_FOUND') return null
    throw e
  }
}

/**
 * The automatic discount, made or brought up to date: the drinks (the categories, at most one a sale) and the pricing
 * rule for the group, which applies the club's discount (`discountId`, the whole drink up to the most). Each sends
 * Square's current version back, so a change made in Square meanwhile is refused rather than overwritten; one deleted
 * in Square is made again.
 */
export async function saveAutoDiscount(sandbox: boolean, token: string, key: string, a: {
  discountId: string; productSetId?: string | null; ruleId?: string | null; timePeriodId?: string | null
  name: string; categoryIds: string[]; groupId: string
  /** Only at these times (the business's time, Monday 1 … Sunday 7); null: whenever. */
  hours?: { from: string; to: string; days: number[] } | null
}) {
  const [sv, rv, tv] = await Promise.all([versionOf(sandbox, token, a.productSetId), versionOf(sandbox, token, a.ruleId), versionOf(sandbox, token, a.timePeriodId)])
  const keep = (id: string | null | undefined, version: number | null, temp: string) => (id && version !== null ? { id, version } : { id: temp })
  const productSetId = (await upsert(sandbox, token, `${key}:drinks`, {
    type: 'PRODUCT_SET', ...keep(a.productSetId, sv, '#club-drinks'),
    product_set_data: { name: `${a.name}: drinks`, product_ids_any: a.categoryIds, quantity_max: 1 },
  })).id
  // The times: a weekly-repeating period Square's rule follows (an iCalendar event, in the seller's local time).
  const timePeriodId = a.hours ? (await upsert(sandbox, token, `${key}:hours`, {
    type: 'TIME_PERIOD', ...keep(a.timePeriodId, tv, '#club-hours'),
    time_period_data: { event: clubHoursEvent(a.hours) },
  })).id : null
  const ruleId = (await upsert(sandbox, token, `${key}:rule`, {
    type: 'PRICING_RULE', ...keep(a.ruleId, rv, '#club-rule'),
    pricing_rule_data: {
      name: a.name, discount_id: a.discountId, match_products_id: productSetId, customer_group_ids_any: [a.groupId],
      ...(timePeriodId ? { time_period_ids: [timePeriodId] } : {}),
    },
  })).id
  // Times taken off: the rule no longer follows the old period, so it goes.
  if (!a.hours && a.timePeriodId && tv !== null) await deleteCatalogObject(sandbox, token, a.timePeriodId)
  return { productSetId, ruleId, timePeriodId }
}

const ICAL_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
/**
 * The free coffee's times as Square's time period wants them: an iCalendar event starting on a past Monday at `from`,
 * lasting until `to`, repeating weekly on the days. Square reads DTSTART without a zone as the seller's local time.
 */
export function clubHoursEvent(h: { from: string; to: string; days: number[] }, monday = '20261123') {
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const length = minutes(h.to) - minutes(h.from)
  const duration = `PT${Math.floor(length / 60) ? `${Math.floor(length / 60)}H` : ''}${length % 60 ? `${length % 60}M` : ''}`
  const days = [...new Set(h.days)].sort().map(d => ICAL_DAYS[d - 1]).join(',')
  return ['BEGIN:VEVENT', `DTSTART:${monday}T${h.from.replace(':', '')}00`, `DURATION:${duration}`, `RRULE:FREQ=WEEKLY;BYDAY=${days}`, 'END:VEVENT'].join('\n')
}

/** Removes a catalog object (already gone is fine). */
export async function deleteCatalogObject(sandbox: boolean, token: string, id: string) {
  try {
    await api(sandbox, token, `/v2/catalog/object/${encodeURIComponent(id)}`, undefined, 'DELETE')
  } catch (e) {
    if (!(e instanceof SquareError && e.code === 'NOT_FOUND')) throw e
  }
}
