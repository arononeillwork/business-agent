// Stock: what's running low, what to order from whom and when, what the stock is worth, and the
// message to send a supplier. Shared by the app and its tests; the database keeps the figures
// (migration 52: suppliers, stock_items, stock_movements).
import { msg } from './i18n'
import { DAY_KEYS, type DayKey } from './types'
import { addDays, dayKey, localDate, localTime } from './time'
import { cleanPhone, decodeCsv, parseCsv } from './customers'
import type { WasteReason } from './recipes'

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
  notes: string | null
  active: boolean
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
}
/** A delivery, waste… (change: how many in or out) or a count (counted: the figure). */
export type MovementInput = { item_id: string; reason: MovementReason; change?: number; counted?: number; note?: string | null; waste_reason?: WasteReason }

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
