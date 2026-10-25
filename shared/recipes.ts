// Menu and recipe costing: what a serving costs from the stock items in it (their cost per unit,
// so it follows the supplier's prices), with an allowance for waste, against the menu price without
// IVA. Variants add items or swap one (oat milk instead of whole) and can change the price.
import { msg } from './i18n'
import type { StockItem, StockUnit } from './stock'

export interface RecipeVariant { id: string; name: string; price_change: number }
export interface RecipeLine {
  item_id: string
  quantity: number
  unit: StockUnit
  /** null: in the recipe itself; otherwise only in that variant. */
  variant_id: string | null
  /** A variant's line taking the place of this item in the recipe. */
  replaces_item_id: string | null
}
export interface Recipe {
  id: string
  name: string
  category: string | null
  /** The item's name on the Square till, when it came from there. */
  square_item: string | null
  /** Menu price, IVA included. */
  sell_price: number | null
  vat_rate: number
  /** Gross margin aimed for, % of the price without IVA. */
  target_margin: number
  /** Allowance for waste, % added to the cost of what goes in. */
  wastage_pct: number
  notes: string | null
  active: boolean
  variants: RecipeVariant[]
  lines: RecipeLine[]
}
export type RecipeInput = Omit<Recipe, 'id'> & { id?: string }

export const RECIPE_CATEGORIES = [msg('Coffee'), msg('Tea & matcha'), msg('Cold drinks'), msg('Food'), msg('Bakery'), msg('Shop')]
export const DEFAULT_TARGET_MARGIN = 70

/** Units that measure the same thing, and how many of the smallest each one is. */
const SCALE: Partial<Record<StockUnit, [string, number]>> = { kg: ['mass', 1000], g: ['mass', 1], l: ['volume', 1000], ml: ['volume', 1] }

/** A quantity in another unit (g ↔ kg, ml ↔ l, or the same unit); null when they don't measure the same thing. */
export function convert(qty: number, from: StockUnit, to: StockUnit): number | null {
  if (from === to) return qty
  const a = SCALE[from], b = SCALE[to]
  if (!a || !b || a[0] !== b[0]) return null
  return qty * a[1] / b[1]
}

/** The units a recipe can use for an item counted in `unit`: kg → g or kg, l → ml or l, else its own. */
export const unitsFor = (unit: StockUnit): StockUnit[] => (unit === 'kg' || unit === 'g' ? ['g', 'kg'] : unit === 'l' || unit === 'ml' ? ['ml', 'l'] : [unit])

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places

/** What one line costs: its quantity in the item's own unit × the item's cost. Null: no cost yet, or a unit that doesn't fit. */
export function lineCost(line: Pick<RecipeLine, 'quantity' | 'unit'>, item: Pick<StockItem, 'unit' | 'cost_per_unit'> | undefined): number | null {
  if (!item || item.cost_per_unit === null) return null
  const q = convert(line.quantity, line.unit, item.unit)
  return q === null ? null : q * item.cost_per_unit
}

/** The lines in a serving: the recipe's, less any a variant swaps out, plus the variant's own. */
export function linesFor(r: Pick<Recipe, 'lines'>, variantId: string | null = null) {
  const own = r.lines.filter(l => l.variant_id === null)
  if (!variantId) return own
  const extra = r.lines.filter(l => l.variant_id === variantId)
  const swapped = new Set(extra.map(l => l.replaces_item_id).filter(Boolean))
  return [...own.filter(l => !swapped.has(l.item_id)), ...extra]
}

export interface Costing {
  /** What a serving costs, waste allowance included (without IVA). */
  cost: number
  /** The menu price, IVA included, and without it. */
  price: number | null
  net: number | null
  /** Price without IVA less cost, in euros and as a share of the price without IVA. */
  margin: number | null
  marginPct: number | null
  /** Below the margin aimed for. */
  below: boolean
  /** Lines whose item has no cost, or a unit that doesn't fit: the cost leaves them out. */
  missing: string[]
}

/** A serving of the recipe (or of one variant), from the stock items' costs. */
export function costing(r: Pick<Recipe, 'lines' | 'variants' | 'sell_price' | 'vat_rate' | 'wastage_pct' | 'target_margin'>, items: StockItem[],
  variantId: string | null = null): Costing {
  const missing: string[] = []
  let raw = 0
  for (const l of linesFor(r, variantId)) {
    const item = items.find(i => i.id === l.item_id)
    const c = lineCost(l, item)
    if (c === null) missing.push(item?.name ?? '?')
    else raw += c
  }
  const cost = round(raw * (1 + r.wastage_pct / 100), 4)
  const change = variantId ? r.variants.find(v => v.id === variantId)?.price_change ?? 0 : 0
  const price = r.sell_price === null ? null : round(r.sell_price + change)
  const net = price === null ? null : round(price / (1 + r.vat_rate / 100), 4)
  const margin = net === null ? null : round(net - cost, 4)
  const marginPct = net ? round((net - cost) / net * 100, 1) : null
  return { cost, price, net, margin, marginPct, below: marginPct !== null && marginPct < r.target_margin, missing }
}

/** The menu price (IVA included) that would give the margin aimed for, rounded up to 5 cents. */
export function priceForTarget(cost: number, targetPct: number, vatRate: number) {
  if (targetPct >= 100) return null
  const net = cost / (1 - targetPct / 100)
  return Math.ceil(net * (1 + vatRate / 100) * 20 - 1e-9) / 20
}

// ---------------------------------------------------------------------------------------------
// Waste
// ---------------------------------------------------------------------------------------------

export type WasteReason = 'expired' | 'spilled' | 'wrong_order' | 'quality' | 'staff_drink' | 'other'
export const WASTE_REASONS: { id: WasteReason; label: string }[] = [
  { id: 'expired', label: msg('Out of date') },
  { id: 'spilled', label: msg('Spilled or dropped') },
  { id: 'wrong_order', label: msg('Wrong order') },
  { id: 'quality', label: msg('Not good enough') },
  { id: 'staff_drink', label: msg('Staff drink') },
  { id: 'other', label: msg('Other') },
]
export const wasteReasonLabel = (r: WasteReason | null) => WASTE_REASONS.find(x => x.id === r)?.label ?? msg('Other')

interface Move { item_id: string; reason: string; change: number }
/** Waste over a period: its cost, the items wasted most (by cost), and waste as a share of what was delivered. */
export function wasteSummary(moves: Move[], items: Pick<StockItem, 'id' | 'name' | 'cost_per_unit'>[]) {
  const cost = (m: Move) => Math.abs(m.change) * (items.find(i => i.id === m.item_id)?.cost_per_unit ?? 0)
  const waste = moves.filter(m => m.reason === 'waste')
  const delivered = moves.filter(m => m.reason === 'delivery').reduce((s, m) => s + cost(m), 0)
  const total = waste.reduce((s, m) => s + cost(m), 0)
  const byItem = new Map<string, { name: string; quantity: number; cost: number }>()
  for (const m of waste) {
    const name = items.find(i => i.id === m.item_id)?.name ?? '?'
    const row = byItem.get(m.item_id) ?? { name, quantity: 0, cost: 0 }
    row.quantity = round(row.quantity + Math.abs(m.change))
    row.cost = round(row.cost + cost(m))
    byItem.set(m.item_id, row)
  }
  return {
    cost: round(total),
    top: [...byItem.values()].sort((a, b) => b.cost - a.cost || b.quantity - a.quantity),
    /** % of the cost of deliveries in the same period; null when nothing was delivered. */
    ofPurchases: delivered > 0 ? round(total / delivered * 100, 1) : null,
  }
}
