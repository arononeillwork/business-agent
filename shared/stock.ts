// Stock: what's running low, what to order from whom and when, what the stock is worth, and the
// message to send a supplier. Shared by the app and its tests; the database keeps the figures
// (migration 52: suppliers, stock_items, stock_movements).
import { msg } from './i18n'
import { DAY_KEYS, type DayKey } from './types'
import { addDays, dayKey, localDate, localTime } from './time'
import { cleanPhone, decodeCsv, parseCsv } from './customers'
import type { WasteReason } from './recipes'
import type { Allergen, Diet } from './allergens'

export interface Supplier {
  id: string
  name: string
  kind: string | null
  contact_name: string | null
  email: string | null
  phone: string | null
  /** They take orders on WhatsApp at that number. */
  whatsapp: boolean
  website: string | null
  /** Their ordering page or trade portal. */
  order_url: string | null
  address: string | null
  /** The business's customer number with them. */
  account_number: string | null
  order_days: DayKey[]
  /** Last time to order on an order day ("12:00"); null: any time that day. */
  cutoff: string | null
  lead_days: number
  minimum_order: number | null
  payment_terms: string | null
  /** Their CIF/NIF, to recognise their e-invoices (Invoices). */
  tax_id?: string | null
  /** The addresses or domains their invoices are emailed from, when not their contact email (Invoices → From email). */
  invoice_from?: string[]
  notes: string | null
  active: boolean
  /** Starred by an admin: one the café relies on. */
  starred: boolean
  /** What they supply, for the filters on Suppliers (an admin's choice); empty: worked out from their type, name and items. */
  supplies?: SupplyGroup[]
}
export type SupplierInput = Partial<Omit<Supplier, 'id'>> & { id?: string; name: string }

export type StockUnit = 'unit' | 'kg' | 'g' | 'l' | 'ml' | 'pack' | 'box' | 'case' | 'bag' | 'bottle' | 'carton' | 'tub' | 'roll'
export const UNITS: { id: StockUnit; label: string }[] = [
  { id: 'unit', label: msg('units') }, { id: 'kg', label: 'kg' }, { id: 'g', label: 'g' }, { id: 'l', label: 'l' }, { id: 'ml', label: 'ml' },
  { id: 'pack', label: msg('packs') }, { id: 'box', label: msg('boxes') }, { id: 'case', label: msg('cases') }, { id: 'bag', label: msg('bags') },
  { id: 'bottle', label: msg('bottles') }, { id: 'carton', label: msg('cartons') }, { id: 'tub', label: msg('tubs') }, { id: 'roll', label: msg('rolls') },
]
export const unitLabel = (u: StockUnit) => UNITS.find(x => x.id === u)?.label ?? u

/** Offered in the lists; any other category or place typed is kept too. Saved in English (shown with t()). */
export const CATEGORIES = [msg('Coffee'), msg('Milk & dairy'), msg('Tea & matcha'), msg('Syrups & sauces'), msg('Bakery'), msg('Food'),
  msg('Packaging'), msg('Cleaning'), msg('Shop')]
export const LOCATIONS = [msg('Bar'), msg('Storeroom'), msg('Fridge'), msg('Shop shelf')]
export const SUPPLIER_KINDS = [msg('Coffee roaster'), msg('Bakery'), msg('Dairy'), msg('Packaging'), msg('Cash & carry'), msg('Drinks'), msg('Cleaning')]

/** What a supplier supplies, the filters on Suppliers (saved as the ids; suppliers_supplies in the database). */
export type SupplyGroup = 'drinks' | 'food' | 'coffee' | 'fruit_veg' | 'groceries'
export const SUPPLY_GROUPS: { id: SupplyGroup; label: string }[] = [
  { id: 'drinks', label: msg('Drinks') }, { id: 'food', label: msg('Food') }, { id: 'coffee', label: msg('Coffee') },
  { id: 'fruit_veg', label: msg('Fruit & veg') }, { id: 'groceries', label: msg('Groceries') },
]
export const isSupplyGroup = (g: unknown): g is SupplyGroup => SUPPLY_GROUPS.some(x => x.id === g)

// Words that say what something is, in English and Spanish (accents taken off first).
const SUPPLY_WORDS: Record<SupplyGroup, { supplier: RegExp; item: RegExp; categories: string[] }> = {
  coffee: { supplier: /coffee|cafe|roast|tostad|espresso/, item: /coffee|cafe\b|espresso|decaf|beans|grano/, categories: ['Coffee'] },
  drinks: { supplier: /drink|bebida|beverage|juice|zumo|water|agua|soda|\btea\b|\bte\b|matcha|chai|dairy|lacteo|milk|leche|syrup|sirope|kombucha/,
    item: /milk|leche|juice|zumo|water|agua|soda|cola|tonic|\btea\b|matcha|chai|syrup|sirope|kombucha|lemonade|limonada|drink|bebida/,
    categories: ['Milk & dairy', 'Tea & matcha', 'Syrups & sauces'] },
  food: { supplier: /bak|bread|\bpan\b|panader|pasteler|patiss|boulang|food|comida|cake|deli|charcut|queso|cheese/,
    item: /croissant|pain au|cake|tarta|bread|\bpan\b|brownie|cookie|galleta|\btart|bagel|sandwich|bocadillo|toast|muffin|scone|quiche|cheese|queso|ham|jamon|egg|huevo/,
    categories: ['Bakery', 'Food'] },
  fruit_veg: { supplier: /fruit|fruta|\bveg|verdur|produce|berry|berries|huerta|hortaliz|organic|ecologic/,
    item: /banana|platano|strawberr|fresa|blueberr|arandano|raspberr|frambuesa|berry|berries|acai|mango|avocado|aguacate|lemon|limon|\blime\b|\blima\b|orange|naranja|apple|manzana|\bmint\b|menta|spinach|espinaca|kale|tomato|tomate|cucumber|pepino|ginger|jengibre|pineapple|pina\b|kiwi|passion fruit|maracuya|coconut|\bcoco\b|lettuce|lechuga|basil|albahaca|carrot|zanahoria|beetroot|remolacha|pomegranate|granada|peach|melocoton|melon|watermelon|sandia|grape|\buva|\bpear\b|\bpera\b|\bfig\b|higo|pitaya|dragon fruit|fruit|fruta/,
    categories: [] },
  groceries: { supplier: /cash|carry|grocer|supermarket|supermercado|wholesale|mayorista|makro|mercadona|alcampo|carrefour|lidl|costco|\bmetro\b|\bdia\b|ultramarinos|abarrotes/,
    item: /sugar|azucar|honey|\bmiel|\boats?\b|avena|flour|harina|cocoa|cacao|chocolate|\bsalt\b|\bsal\b|spice|cinnamon|canela|vanilla|vainilla|\brice\b|arroz|pasta|olive oil|aceite|vinegar|vinagre|seeds?\b|semillas?|chia|granola|\bjam\b|mermelada|peanut butter|crema de cacahuete|almonds?\b|almendras?\b|walnut|nuez|nueces|hazelnut|avellana|cashew|anacardo|dates|datiles|coconut flakes/,
    categories: [] },
}
const unaccented = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * What a supplier supplies: the admin's choice when there is one, otherwise worked out from its type
 * and name and from the items bought from it (a cash & carry is groceries, the açaí comes from fruit & veg).
 */
export function suppliesOf(s: Pick<Supplier, 'name' | 'kind' | 'supplies'>, items: Pick<StockItem, 'name' | 'category'>[] = []): SupplyGroup[] {
  if (s.supplies?.length) return SUPPLY_GROUPS.map(g => g.id).filter(g => s.supplies!.includes(g))
  const own = `${unaccented(s.kind)} ${unaccented(s.name)}`
  return SUPPLY_GROUPS.map(g => g.id).filter(g => {
    const w = SUPPLY_WORDS[g]
    if (w.supplier.test(own)) return true
    return items.some(i => {
      if (i.category && w.categories.includes(i.category)) return true
      const name = unaccented(i.name)
      // A pantry word in a drink's name (almond milk) doesn't make it groceries.
      if (g === 'groceries' && SUPPLY_WORDS.drinks.item.test(name)) return false
      return w.item.test(name)
    })
  })
}

export interface StockItem {
  id: string
  name: string
  category: string | null
  supplier_id: string | null
  supplier_sku: string | null
  /** The item on the supplier's website. */
  product_url: string | null
  unit: StockUnit
  /** How it comes, in words ("6 × 1 l"). */
  pack_size: string | null
  /** Ordered in multiples of this many units (a case of six: 6). */
  order_multiple: number
  /** One unit, wholesale, without IVA. */
  cost_per_unit: number | null
  vat_rate: number
  /** Shop items: the shelf price, IVA included. */
  sell_price: number | null
  on_hand: number
  par_level: number | null
  reorder_at: number | null
  location: string | null
  retail: boolean
  notes: string | null
  active: boolean
  updated_at: string
  /** The EU's 14 it contains (Allergens page); null: nobody has said yet. */
  allergens?: Allergen[] | null
  /** Traces it may contain. */
  may_contain?: Allergen[]
  /** Vegan, vegetarian or neither (Allergens page); null: nobody has said yet. */
  diet?: Diet | null
}
export type StockItemInput = Partial<Omit<StockItem, 'id' | 'updated_at'>> & { id?: string; name: string }

export type MovementReason = 'delivery' | 'count' | 'waste' | 'sold' | 'used' | 'correction'
export const REASONS: { id: MovementReason; label: string; sign: 1 | -1 | 0 }[] = [
  { id: 'delivery', label: msg('Delivery'), sign: 1 },
  { id: 'count', label: msg('Stock count'), sign: 0 },
  { id: 'used', label: msg('Used'), sign: -1 },
  { id: 'waste', label: msg('Waste'), sign: -1 },
  { id: 'sold', label: msg('Sold'), sign: -1 },
  { id: 'correction', label: msg('Correction'), sign: 0 },
]
export const reasonLabel = (r: MovementReason) => REASONS.find(x => x.id === r)?.label ?? r

export interface StockMovement {
  id: string
  item_id: string
  at: string
  reason: MovementReason
  change: number
  counted: number | null
  on_hand_after: number
  note: string | null
  by: string | null
  /** Waste only: why. */
  waste_reason: WasteReason | null
  /** Waste taken off the log (or changed, and logged again): when. A correction put its stock back. */
  undone_at?: string | null
}
/** A delivery, waste… (change: how many in or out) or a count (counted: the figure). */
export type MovementInput = { item_id: string; reason: MovementReason; change?: number; counted?: number; note?: string | null; waste_reason?: WasteReason }
/** A waste log entry as changed: what, how many (thrown away, so more than 0), why and the note. */
export interface WasteEdit { item_id: string; quantity: number; waste_reason: WasteReason; note: string | null }

const round2 = (n: number) => Math.round(n * 100) / 100

/** Down to its reorder level (or below). Items without one are never "low". */
export const isLow = (i: Pick<StockItem, 'on_hand' | 'reorder_at' | 'active'>) => i.active && i.reorder_at !== null && i.on_hand <= i.reorder_at

/** How many to order: up to the par level (or, without one, back up to twice the reorder level), in whole order multiples. */
export function suggestedOrder(i: Pick<StockItem, 'on_hand' | 'reorder_at' | 'par_level' | 'order_multiple' | 'active'>): number {
  if (!isLow(i)) return 0
  const target = i.par_level ?? i.reorder_at! * 2
  const need = target - i.on_hand
  if (need <= 0) return 0
  const m = i.order_multiple > 0 ? i.order_multiple : 1
  return round2(Math.ceil(round2(need / m)) * m)
}

/** What it's worth: units in × cost (items without a cost count as nothing). */
export const stockValue = (items: Pick<StockItem, 'on_hand' | 'cost_per_unit' | 'active'>[]) =>
  round2(items.filter(i => i.active).reduce((s, i) => s + Math.max(0, i.on_hand) * (i.cost_per_unit ?? 0), 0))

/** A shop item's margin: the shelf price without IVA, less the cost, as a share of that price (null: no price or cost). */
export function retailMargin(i: Pick<StockItem, 'sell_price' | 'cost_per_unit' | 'vat_rate'>): number | null {
  if (!i.sell_price || i.cost_per_unit === null) return null
  const net = i.sell_price / (1 + i.vat_rate / 100)
  return Math.round((net - i.cost_per_unit) / net * 1000) / 10
}

export interface OrderLine { item: StockItem; qty: number; net: number; vat: number; gross: number }
export interface SupplierOrder {
  supplier: Supplier | null
  lines: OrderLine[]
  net: number
  gross: number
  /** Below the supplier's minimum order (null: they have none). */
  short: number | null
}

/** The order list: every low item with something to order, grouped by supplier (the ones without one last). */
export function orderList(items: StockItem[], suppliers: Supplier[]): SupplierOrder[] {
  const groups = new Map<string, OrderLine[]>()
  for (const item of items) {
    const qty = suggestedOrder(item)
    if (!qty) continue
    const net = round2(qty * (item.cost_per_unit ?? 0))
    const vat = round2(net * item.vat_rate / 100)
    const key = item.supplier_id && suppliers.some(s => s.id === item.supplier_id) ? item.supplier_id : ''
    groups.set(key, [...(groups.get(key) ?? []), { item, qty, net, vat, gross: round2(net + vat) }])
  }
  return [...groups].map(([id, lines]) => {
    const supplier = suppliers.find(s => s.id === id) ?? null
    const net = round2(lines.reduce((s, l) => s + l.net, 0))
    const gross = round2(lines.reduce((s, l) => s + l.gross, 0))
    const short = supplier?.minimum_order && net < supplier.minimum_order ? round2(supplier.minimum_order - net) : null
    return { supplier, lines: lines.sort((a, b) => a.item.name.localeCompare(b.item.name)), net, gross, short }
  }).sort((a, b) => (a.supplier ? (b.supplier ? a.supplier.name.localeCompare(b.supplier.name) : -1) : 1))
}

/**
 * The next time to order from a supplier, from `now` (in the business's time zone): the first of
 * their order days still before its cut-off, and the day it should arrive. Null: no order days set.
 */
export function nextOrderDay(s: Pick<Supplier, 'order_days' | 'cutoff' | 'lead_days'>, now: Date): { date: string; by: string | null; arrives: string } | null {
  if (!s.order_days.length) return null
  const today = localDate(now)
  for (let i = 0; i < 8; i++) {
    const date = addDays(today, i)
    if (!s.order_days.includes(dayKey(date))) continue
    if (i === 0 && s.cutoff && localTime(now) >= s.cutoff.slice(0, 5)) continue
    return { date, by: s.cutoff ? s.cutoff.slice(0, 5) : null, arrives: addDays(date, s.lead_days) }
  }
  return null
}

const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ','))
const UNIT_ES: Record<StockUnit, [string, string]> = {
  unit: ['unidad', 'unidades'], kg: ['kg', 'kg'], g: ['g', 'g'], l: ['l', 'l'], ml: ['ml', 'ml'], pack: ['paquete', 'paquetes'],
  box: ['caja', 'cajas'], case: ['caja', 'cajas'], bag: ['bolsa', 'bolsas'], bottle: ['botella', 'botellas'], carton: ['brik', 'briks'],
  tub: ['tarrina', 'tarrinas'], roll: ['rollo', 'rollos'],
}
const UNIT_EN: Record<StockUnit, [string, string]> = {
  unit: ['unit', 'units'], kg: ['kg', 'kg'], g: ['g', 'g'], l: ['l', 'l'], ml: ['ml', 'ml'], pack: ['pack', 'packs'], box: ['box', 'boxes'],
  case: ['case', 'cases'], bag: ['bag', 'bags'], bottle: ['bottle', 'bottles'], carton: ['carton', 'cartons'], tub: ['tub', 'tubs'], roll: ['roll', 'rolls'],
}

/**
 * The order as a message to send the supplier (WhatsApp or email). Spanish unless asked otherwise:
 * the suppliers are local. Each line: how many, the item, its pack and the supplier's reference.
 */
export function orderMessage(order: SupplierOrder, business: string, lang: 'es' | 'en' = 'es', deliver?: string | null): string {
  const s = order.supplier
  const units = lang === 'es' ? UNIT_ES : UNIT_EN
  const lines = order.lines.map(l => {
    const u = units[l.item.unit][l.qty === 1 ? 0 : 1]
    const extra = [l.item.pack_size, l.item.supplier_sku ? (lang === 'es' ? `ref. ${l.item.supplier_sku}` : `ref ${l.item.supplier_sku}`) : null].filter(Boolean)
    return `- ${qtyText(l.qty)} ${u} · ${l.item.name}${extra.length ? ` (${extra.join(', ')})` : ''}`
  })
  const account = s?.account_number ? (lang === 'es' ? ` (cliente ${s.account_number})` : ` (account ${s.account_number})`) : ''
  const day = deliver ? new Date(`${deliver}T12:00:00Z`) : null
  const when = day
    ? lang === 'es'
      ? `\nPara entregar el ${day.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}, si puede ser.`
      : `\nFor delivery on ${day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}, if possible.`
    : ''
  const hello = lang === 'es' ? `Hola${s?.contact_name ? ` ${s.contact_name}` : ''}` : `Hello${s?.contact_name ? ` ${s.contact_name}` : ''}`
  return lang === 'es'
    ? `${hello}, os hago un pedido para ${business}${account}:\n${lines.join('\n')}${when}\n¡Gracias!`
    : `${hello}, here's an order for ${business}${account}:\n${lines.join('\n')}${when}\nThank you!`
}

/** Open WhatsApp with the message written (the person still presses send). */
export const whatsappLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
export const emailLink = (email: string, subject: string, body: string) =>
  `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

// ---------------------------------------------------------------------------------------------
// CSV import: a supplier's price list or an old stock sheet
// ---------------------------------------------------------------------------------------------

export type StockField = 'name' | 'category' | 'supplier' | 'sku' | 'url' | 'unit' | 'pack' | 'multiple' | 'cost' | 'vat' | 'price'
  | 'on_hand' | 'par' | 'reorder' | 'location' | 'notes'

/** Headings people use (English and Spanish), lower case and without accents. */
const HEADINGS: [StockField, RegExp][] = [
  ['sku', /^(sku|ref|referencia|codigo|code|item code|product code)$/],
  ['url', /^(url|link|enlace|web|product (link|url|page))$/],
  ['multiple', /^(order (multiple|in)|multiplo|pedido minimo)$/],
  ['reorder', /^(reorder( at| level)?|minimo|stock minimo|punto de pedido)$/],
  ['par', /^(par( level)?|maximo|stock maximo|order up to)$/],
  ['on_hand', /^(on hand|stock|in stock|cantidad|existencias|qty|quantity)$/],
  ['price', /^(price|sell price|shop price|pvp|precio venta|precio de venta)$/],
  ['cost', /^(cost|cost price|unit cost|coste|precio|precio coste|precio compra)$/],
  ['vat', /^(vat|vat rate|iva|% iva)$/],
  ['supplier', /^(supplier|proveedor|vendor)$/],
  ['category', /^(category|categoria|familia|type|tipo)$/],
  ['unit', /^(unit|unidad|ud|uom)$/],
  ['pack', /^(pack|pack size|formato|envase)$/],
  ['location', /^(location|ubicacion|lugar|where)$/],
  ['notes', /^(notes|notas|comments|comentarios)$/],
  ['name', /^(name|item|product|producto|articulo|nombre|descripcion|description)$/],
]
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** "1,45 €", "1.45", "12" → a number (null when there's none). */
export function readNumber(raw: string | undefined): number | null {
  const v = (raw ?? '').replace(/[€%\s]/g, '')
  if (!v) return null
  const n = Number(/,\d{1,2}$/.test(v) ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

const UNIT_WORDS: [StockUnit, RegExp][] = [
  ['kg', /^(kg|kilo|kilos|kilogramos?)$/], ['g', /^(g|gr|gramos?)$/], ['l', /^(l|lt|litros?|litres?|liters?)$/], ['ml', /^ml$/],
  ['pack', /^(pack|packs|paquetes?)$/], ['box', /^(box|boxes|caja|cajas)$/], ['case', /^(case|cases)$/], ['bag', /^(bags?|bolsas?)$/],
  ['bottle', /^(bottles?|botellas?)$/], ['carton', /^(cartons?|briks?)$/], ['tub', /^(tubs?|tarrinas?)$/], ['roll', /^(rolls?|rollos?)$/],
  ['unit', /^(units?|ud|uds|unidad|unidades|each|pcs?)$/],
]

export interface StockCsvImport {
  columns: { heading: string; field: StockField | null }[]
  /** supplier: the name in the file, matched to a supplier by name when added. */
  rows: (StockItemInput & { supplier?: string | null })[]
  /** Lines with no item name. */
  skipped: number
}

/** Items from a CSV file (from Excel, Google Sheets or a supplier's price list). */
export function readStockCsv(bytes: Uint8Array): StockCsvImport {
  const [head = [], ...lines] = parseCsv(decodeCsv(bytes))
  const fields = head.map(h => HEADINGS.find(([, r]) => r.test(plain(h)))?.[0] ?? null)
  const columns = head.map((heading, i) => ({ heading, field: fields.indexOf(fields[i]) === i ? fields[i] : null }))
  const rows: StockCsvImport['rows'] = []
  let skipped = 0
  for (const line of lines) {
    const get = (f: StockField) => { const i = columns.findIndex(c => c.field === f); return i < 0 ? undefined : line[i]?.trim() || undefined }
    const name = get('name')
    if (!name) { skipped++; continue }
    const unit = UNIT_WORDS.find(([, r]) => r.test(plain(get('unit') ?? '')))?.[0] ?? 'unit'
    const url = get('url')
    rows.push({
      name: name.slice(0, 120), category: get('category') ?? null, supplier: get('supplier') ?? null, supplier_sku: get('sku') ?? null,
      product_url: url && /^https?:\/\/\S+$/i.test(url) ? url : null, unit, pack_size: get('pack') ?? null,
      order_multiple: Math.max(1, readNumber(get('multiple')) ?? 1), cost_per_unit: readNumber(get('cost')),
      vat_rate: Math.min(21, Math.max(0, readNumber(get('vat')) ?? 10)), sell_price: readNumber(get('price')),
      on_hand: readNumber(get('on_hand')) ?? 0, par_level: readNumber(get('par')), reorder_at: readNumber(get('reorder')),
      location: get('location') ?? null, notes: get('notes') ?? null, retail: readNumber(get('price')) !== null,
    })
  }
  return { columns, rows, skipped }
}

/** A phone typed for a supplier, as saved ("+34 600 000 000"); null when it doesn't look like one. */
export const supplierPhone = (raw: string | null | undefined) => (raw?.trim() ? cleanPhone(raw) : null)

/** The order days in order (Monday first), each once. */
export const sortDays = (days: string[]) => DAY_KEYS.filter(d => days.includes(d))

// ---------------------------------------------------------------------------------------------
// Wholesale prices over time (stock_item_prices: kept by the database whenever a cost changes)
// ---------------------------------------------------------------------------------------------

export interface StockPrice { item_id: string; cost_per_unit: number; changed_at: string }
export interface PriceChange { item_id: string; from: number; to: number; pct: number; at: string }

/** Each item's last price change (from the price before it to now), newest first. Items whose price never changed have none. */
export function lastPriceChanges(history: StockPrice[]): PriceChange[] {
  const byItem = new Map<string, StockPrice[]>()
  for (const p of history) byItem.set(p.item_id, [...(byItem.get(p.item_id) ?? []), p])
  const out: PriceChange[] = []
  for (const [item, prices] of byItem) {
    const [now, before] = [...prices].sort((a, b) => b.changed_at.localeCompare(a.changed_at))
    if (!before || Number(before.cost_per_unit) === Number(now.cost_per_unit)) continue
    const from = Number(before.cost_per_unit), to = Number(now.cost_per_unit)
    out.push({ item_id: item, from, to, pct: from > 0 ? Math.round((to - from) / from * 1000) / 10 : 0, at: now.changed_at })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/** Price rises since a day (YYYY-MM-DD), biggest first. */
export const risesSince = (changes: PriceChange[], since: string) =>
  changes.filter(c => c.to > c.from && c.at.slice(0, 10) >= since).sort((a, b) => b.pct - a.pct)

/** An item's cost with IVA on top. */
export const costWithVat = (i: Pick<StockItem, 'cost_per_unit' | 'vat_rate'>) =>
  i.cost_per_unit === null ? null : Math.round(i.cost_per_unit * (1 + Number(i.vat_rate) / 100) * 100) / 100

export interface PriceListMatch {
  /** Items already on the list, with what the file changes on them (its price, reference, link…). */
  updates: { item: StockItem; patch: Partial<StockItemInput> }[]
  /** New items, with their supplier matched by name. */
  added: StockItemInput[]
  /** Lines for items already on the list that change nothing. */
  unchanged: number
}

/**
 * A supplier's price list against the items there already: a line for an item on the list (the same
 * supplier reference, or the same name from that supplier) updates it with what the file has
 * (so its new price is kept with the ones before it); the rest are added.
 */
export function matchPriceList(csv: StockCsvImport, items: StockItem[], supplierId: (name?: string | null) => string | null): PriceListMatch {
  const has = new Set(csv.columns.map(c => c.field))
  const low = (s?: string | null) => s?.trim().toLowerCase() || null
  const out: PriceListMatch = { updates: [], added: [], unchanged: 0 }
  for (const { supplier, ...r } of csv.rows) {
    const sup = supplierId(supplier)
    const fits = (i: StockItem) => !sup || !i.supplier_id || i.supplier_id === sup
    const item = (r.supplier_sku ? items.find(i => fits(i) && low(i.supplier_sku) === low(r.supplier_sku)) : undefined)
      ?? items.find(i => fits(i) && low(i.name) === low(r.name))
    if (!item) { out.added.push({ ...r, supplier_id: sup }); continue }
    const patch: Partial<StockItemInput> = {}
    if (has.has('cost') && r.cost_per_unit != null) patch.cost_per_unit = r.cost_per_unit
    if (has.has('vat') && r.vat_rate != null) patch.vat_rate = r.vat_rate
    if (has.has('price') && r.sell_price != null) patch.sell_price = r.sell_price
    if (has.has('sku') && r.supplier_sku) patch.supplier_sku = r.supplier_sku
    if (has.has('url') && r.product_url) patch.product_url = r.product_url
    if (has.has('pack') && r.pack_size) patch.pack_size = r.pack_size
    if (has.has('multiple') && r.order_multiple) patch.order_multiple = r.order_multiple
    if (sup && !item.supplier_id) patch.supplier_id = sup
    for (const k of Object.keys(patch) as (keyof StockItemInput)[]) if (patch[k] === item[k as keyof StockItem]) delete patch[k]
    if (Object.keys(patch).length) out.updates.push({ item, patch })
    else out.unchanged++
  }
  return out
}
