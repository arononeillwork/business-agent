// The menu as customers see it, and the menus made from it: printed (physical) and on screens
// (digital). Menu items are the same rows as Menu costing (recipes): the menu adds what customers
// read (a description, a photo, the allergens, vegan or gluten free), whether it shows on the menus
// and its place in its section. A design lays the items out over an image (the app writes every name
// and price itself, so they're always right), or uses an image that is the whole menu; images are
// made with AI through Higgsfield, uploaded, or linked. Shared by the app and the Worker.
import { msg } from './i18n'
import { RECIPE_CATEGORIES } from './recipes'
import type { BrandColour } from './types'

// ---------------------------------------------------------------------------------------------
// Menu items
// ---------------------------------------------------------------------------------------------

/**
 * The 14 allergens a café in the EU must tell customers about (Regulation 1169/2011, Annex II), in
 * the Annex's order: menus often show them by number, with the key at the bottom.
 */
export type Allergen = 'gluten' | 'crustaceans' | 'eggs' | 'fish' | 'peanuts' | 'soy' | 'milk' | 'nuts' | 'celery' | 'mustard' | 'sesame'
  | 'sulphites' | 'lupin' | 'molluscs'
export const ALLERGENS: { id: Allergen; label: string }[] = [
  { id: 'gluten', label: msg('Gluten') },
  { id: 'crustaceans', label: msg('Crustaceans') },
  { id: 'eggs', label: msg('Eggs') },
  { id: 'fish', label: msg('Fish') },
  { id: 'peanuts', label: msg('Peanuts') },
  { id: 'soy', label: msg('Soy') },
  { id: 'milk', label: msg('Milk') },
  { id: 'nuts', label: msg('Nuts') },
  { id: 'celery', label: msg('Celery') },
  { id: 'mustard', label: msg('Mustard') },
  { id: 'sesame', label: msg('Sesame') },
  { id: 'sulphites', label: msg('Sulphites') },
  { id: 'lupin', label: msg('Lupin') },
  { id: 'molluscs', label: msg('Molluscs') },
]
/** An allergen's number on the menu (1–14, the Annex's order). */
export const allergenNumber = (a: Allergen) => ALLERGENS.findIndex(x => x.id === a) + 1
/** Allergens in the Annex's order, without repeats or unknown ones. */
export const cleanAllergens = (list: readonly string[]): Allergen[] => ALLERGENS.map(a => a.id).filter(a => list.includes(a))

export type Dietary = 'vegetarian' | 'vegan' | 'gluten_free' | 'dairy_free'
export const DIETARY: { id: Dietary; label: string; short: string }[] = [
  { id: 'vegetarian', label: msg('Vegetarian'), short: 'V' },
  { id: 'vegan', label: msg('Vegan'), short: 'VG' },
  { id: 'gluten_free', label: msg('Gluten free'), short: 'GF' },
  { id: 'dairy_free', label: msg('Dairy free'), short: 'DF' },
]
export const cleanDietary = (list: readonly string[]): Dietary[] => DIETARY.map(d => d.id).filter(d => list.includes(d))

/** Something said "gluten free" while its allergens include gluten (or "vegan" with milk or eggs): worth a second look. */
export function dietaryClash(i: Pick<MenuItem, 'allergens' | 'dietary'>): string | null {
  const has = (a: Allergen) => i.allergens.includes(a)
  if (i.dietary.includes('gluten_free') && has('gluten')) return msg('It says gluten free, but gluten is ticked as an allergen.')
  if (i.dietary.includes('vegan') && (has('milk') || has('eggs') || has('fish') || has('crustaceans') || has('molluscs'))) {
    return msg('It says vegan, but an animal allergen (milk, eggs, fish or shellfish) is ticked.')
  }
  if (i.dietary.includes('dairy_free') && has('milk')) return msg('It says dairy free, but milk is ticked as an allergen.')
  return null
}

export interface MenuVariant { id: string; name: string; price_change: number }
export interface MenuItem {
  id: string
  name: string
  category: string | null
  /** The price, IVA included (null: not priced yet). */
  sell_price: number | null
  vat_rate: number
  description: string | null
  photo_url: string | null
  allergens: Allergen[]
  dietary: Dietary[]
  /** Picked out on the menus (a house favourite). */
  featured: boolean
  /** Shown on the printed and digital menus (off: kept, but not offered for now). */
  on_menu: boolean
  /** Its place in its section (then A–Z). */
  menu_sort: number
  /** From Menu costing (oat milk +0.40): shown with the item, changed there. */
  variants: MenuVariant[]
}
export type MenuItemInput = Omit<MenuItem, 'id' | 'variants' | 'menu_sort'> & { id?: string }

export const MAX_DESCRIPTION = 300

/** A menu item that can't be saved as it is: why (null: fine). */
export function menuItemProblem(i: Pick<MenuItemInput, 'name' | 'sell_price' | 'description' | 'photo_url'>): string | null {
  if (!i.name.trim()) return msg('Give it a name')
  if (i.sell_price !== null && !(i.sell_price >= 0 && i.sell_price < 100_000)) return msg('Enter the price like 3,20')
  if ((i.description ?? '').length > MAX_DESCRIPTION) return msg('Keep the description under 300 characters')
  // Uploads and AI photos come back as https addresses; the demo keeps its own in the browser (blob:, data:).
  if (i.photo_url && !/^(https?:\/\/\S+|blob:\S+|data:image\/)/i.test(i.photo_url)) return msg('The photo’s address should start with https://')
  return null
}

/** Sections in menu order: the usual ones first (Coffee, Tea & matcha…), then any others A–Z; items without one last. */
export function categoryOrder(categories: (string | null)[]): (string | null)[] {
  const usual: readonly string[] = RECIPE_CATEGORIES
  const known = usual.filter(c => categories.includes(c))
  const other = [...new Set(categories.filter((c): c is string => !!c && !usual.includes(c)))].sort((a, b) => a.localeCompare(b))
  return [...known, ...other, ...(categories.includes(null) ? [null] : [])]
}

const bySort = (a: MenuItem, b: MenuItem) => a.menu_sort - b.menu_sort || a.name.localeCompare(b.name)

export interface MenuSection { category: string | null; items: MenuItem[] }

/**
 * The menu in sections, each in its order. `only`: just these categories (a design's); `all`: the
 * items that are off the menu too (the Menu page shows them, the menus themselves don't).
 */
export function menuSections(items: MenuItem[], { only = [], all = false }: { only?: string[]; all?: boolean } = {}): MenuSection[] {
  const shown = items.filter(i => (all || i.on_menu) && (!only.length || (i.category !== null && only.includes(i.category))))
  return categoryOrder(shown.map(i => i.category))
    .map(category => ({ category, items: shown.filter(i => i.category === category).sort(bySort) }))
    .filter(s => s.items.length)
}

/** The ids of an item's section after moving it one place up or down (for saving the new order). */
export function moveInSection(items: MenuItem[], id: string, by: -1 | 1): string[] | null {
  const item = items.find(i => i.id === id)
  if (!item) return null
  const section = items.filter(i => i.category === item.category).sort(bySort).map(i => i.id)
  const at = section.indexOf(id)
  const to = at + by
  if (to < 0 || to >= section.length) return null
  ;[section[at], section[to]] = [section[to], section[at]]
  return section
}

// ---------------------------------------------------------------------------------------------
// Designs: printed and on screens
// ---------------------------------------------------------------------------------------------

/** Physical: printed on paper. Digital: shown on a screen (the Screens page plays it). */
export type MenuFormat = 'physical' | 'digital'
export type MenuSize = 'a4_portrait' | 'a4_landscape' | 'a3_portrait' | 'a5_portrait' | 'screen_landscape' | 'screen_portrait'
export interface SizeInfo { id: MenuSize; format: MenuFormat; label: string; width: number; height: number; unit: 'mm' | 'px' }
export const MENU_SIZES: SizeInfo[] = [
  { id: 'a4_portrait', format: 'physical', label: msg('A4, portrait'), width: 210, height: 297, unit: 'mm' },
  { id: 'a4_landscape', format: 'physical', label: msg('A4, landscape'), width: 297, height: 210, unit: 'mm' },
  { id: 'a3_portrait', format: 'physical', label: msg('A3 poster'), width: 297, height: 420, unit: 'mm' },
  { id: 'a5_portrait', format: 'physical', label: msg('A5 table card'), width: 148, height: 210, unit: 'mm' },
  { id: 'screen_landscape', format: 'digital', label: msg('Screen, landscape (16:9)'), width: 1920, height: 1080, unit: 'px' },
  { id: 'screen_portrait', format: 'digital', label: msg('Screen, portrait (9:16)'), width: 1080, height: 1920, unit: 'px' },
]
export const sizeOf = (id: MenuSize | string) => MENU_SIZES.find(s => s.id === id) ?? MENU_SIZES[0]
export const sizesFor = (format: MenuFormat) => MENU_SIZES.filter(s => s.format === format)
export const isPortrait = (id: MenuSize | string) => sizeOf(id).height > sizeOf(id).width

/**
 * background: the app writes the menu over the image, from the menu items (names and prices are
 * always right and follow any change). full: the image is the whole menu (made with its words in,
 * or a menu designed elsewhere and uploaded); it doesn't change when the menu does.
 */
export type MenuMode = 'background' | 'full'
/** Dark writing (for light images) or light writing (for dark ones). */
export type TextTone = 'dark' | 'light'

export type AiModel = 'ideogram' | 'recraft' | 'qwen'
export type MenuImageSource = 'ai' | 'upload' | 'link'
export type MenuImageStatus = 'queued' | 'working' | 'ready' | 'failed'

export interface MenuImage {
  id: string
  /** The design it's for; or the menu item, for an item's photo made with AI. */
  design_id: string | null
  item_id: string | null
  /** Null until an AI image is ready. */
  url: string | null
  source: MenuImageSource
  model: AiModel | null
  /** What was asked for (the person's words; for an edit, the change). */
  prompt: string | null
  /** The image this one was changed from (an edit). */
  edit_of: string | null
  status: MenuImageStatus
  error: string | null
  /** Kept in the café's own storage (Drive, OneDrive or R2); false: only at Higgsfield, which keeps it 7 days. */
  stored: boolean
  created_at: string
}

/** Asking for an AI image: for a design or an item's photo, or a change to one of their images. */
export interface MenuImageRequest {
  design_id?: string
  item_id?: string
  /** The look wanted (or, for a change, what to change). */
  prompt: string
  model: AiModel
  edit_of?: string | null
}

export interface MenuDesign {
  id: string
  name: string
  format: MenuFormat
  size: MenuSize
  mode: MenuMode
  /** Sections on it, in menu order; empty: every section. */
  categories: string[]
  /** The heading (the business's name when empty), a line under it and one at the bottom. */
  title: string | null
  subtitle: string | null
  footer: string | null
  text_tone: TextTone
  /** A soft panel behind the writing, so it reads over a busy image. */
  panel: boolean
  show_descriptions: boolean
  show_allergens: boolean
  /** The image in use (one of `images`). */
  image_id: string | null
  /** Its images, newest first. */
  images: MenuImage[]
  updated_at: string
}
export type MenuDesignInput = Omit<MenuDesign, 'id' | 'images' | 'updated_at'> & { id?: string }

export const newDesign = (format: MenuFormat, name: string): MenuDesignInput => ({
  name, format, size: format === 'physical' ? 'a4_portrait' : 'screen_landscape', mode: 'background', categories: [], title: null, subtitle: null,
  footer: msg('Prices include IVA. Ask us about allergens.'), text_tone: 'dark', panel: true, show_descriptions: true, show_allergens: true, image_id: null,
})

/** The image a design shows (its chosen one, if ready). */
export const imageOf = (d: Pick<MenuDesign, 'image_id' | 'images'>) => d.images.find(i => i.id === d.image_id && i.status === 'ready' && i.url) ?? null

export function designProblem(d: Pick<MenuDesignInput, 'name' | 'format' | 'size' | 'title' | 'subtitle' | 'footer'>): string | null {
  if (!d.name.trim()) return msg('Give the design a name')
  if (sizeOf(d.size).format !== d.format || !MENU_SIZES.some(s => s.id === d.size)) return msg('Pick a size for this kind of menu')
  if ((d.title ?? '').length > 80 || (d.subtitle ?? '').length > 120) return msg('Keep the heading short')
  if ((d.footer ?? '').length > 300) return msg('Keep the bottom line under 300 characters')
  return null
}

// ---------------------------------------------------------------------------------------------
// AI images (Higgsfield: https://docs.higgsfield.ai)
// ---------------------------------------------------------------------------------------------

export interface AiModelInfo {
  id: AiModel
  name: string
  does: string
  /** Higgsfield's address for it (after https://api.higgsfield.ai/). */
  endpoint: string
  /** For changes to an image: this model's own (Ideogram takes an image), or Qwen's edit. */
  edits: 'self' | string
  /** Shapes it makes. */
  ratios: string[]
}
export const AI_MODELS: AiModelInfo[] = [
  { id: 'ideogram', name: 'Ideogram 4.0', does: msg('Best with words: a whole menu with its names and prices written in, or a heading.'), endpoint: 'ideogram/v4.0',
    edits: 'self', ratios: ['1:1', '1:2', '2:1', '2:3', '3:2', '4:5', '5:4', '9:16', '16:9', '5:8', '8:5', '3:4', '4:3'] },
  { id: 'recraft', name: 'Recraft V4.1', does: msg('Illustrations and artwork in your brand colours, for behind the menu.'), endpoint: 'recraft/v4.1/text-to-image',
    edits: 'alibaba/qwen-image-3/edit', ratios: ['1:1', '2:1', '1:2', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '6:10', '14:10', '10:14', '16:9', '9:16'] },
  { id: 'qwen', name: 'Qwen Image 3', does: msg('Photos of food and drinks, and changes to an image you have.'), endpoint: 'alibaba/qwen-image-3/text-to-image',
    edits: 'alibaba/qwen-image-3/edit', ratios: ['1:1', '2:3', '3:2', '3:4', '4:3', '7:9', '9:7', '9:16', '16:9', '21:9'] },
]
export const modelOf = (id: AiModel | string | null | undefined) => AI_MODELS.find(m => m.id === id) ?? AI_MODELS[0]
/** Qwen's edit takes these shapes. */
const EDIT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '7:9', '9:7', '9:16', '16:9', '21:9']

/** The shape among `ratios` closest to width × height (compared as proportions, so 2:1 and 1:2 are as far from 1:1). */
export function closestRatio(width: number, height: number, ratios: string[]): string {
  const target = Math.log(width / height)
  const of = (r: string) => { const [w, h] = r.split(':').map(Number); return Math.log(w / h) }
  return ratios.reduce((best, r) => (Math.abs(of(r) - target) < Math.abs(of(best) - target) ? r : best))
}

export const MAX_PROMPT = 1500

/** Ideas to start from, per kind of image (shown as chips; the person's words are what's sent). */
export const PROMPT_IDEAS: Record<MenuMode, string[]> = {
  background: [
    msg('Warm Mediterranean café, terracotta and cream, olive branches and coffee beans at the edges'),
    msg('Hand-drawn chalkboard with coffee cups and croissants sketched around the border'),
    msg('Soft watercolour of latte art and pastries, pale paper texture, lots of white space'),
    msg('Minimal Scandinavian style, oat and sage colours, a single coffee cup line drawing'),
  ],
  full: [
    msg('Elegant printed menu, cream paper, dark green serif headings, thin gold lines'),
    msg('Chalkboard menu written by hand in white chalk, small doodles of cups'),
    msg('Modern café menu board, black background, bold white sans-serif, coloured accents'),
  ],
}

export interface PromptInput {
  mode: MenuMode
  format: MenuFormat
  size: MenuSize
  /** The heading (the business's name when the design has none). */
  title: string
  subtitle?: string | null
  footer?: string | null
  /** The menu's sections, for a whole-menu image. */
  sections?: MenuSection[]
  /** Prices as the menu shows them (3,20 €). */
  money?: (n: number) => string
}

/** A price on an image: the item's, with its variants' price changes after it (Oat milk +0,40 €). */
const priced = (i: MenuItem, money: (n: number) => string) => {
  const extras = i.variants.filter(v => v.price_change > 0).map(v => `${v.name} +${money(v.price_change)}`)
  return `${i.name}${i.sell_price === null ? '' : ` ${money(i.sell_price)}`}${extras.length ? ` (${extras.join(', ')})` : ''}`
}

/**
 * What's asked of the AI: the person's words (the style), and what the design needs: the shape, room
 * for the writing and no words of its own (the app writes the menu over it), or the whole menu with
 * exactly its names and prices.
 */
export function buildPrompt(style: string, d: PromptInput): string {
  const where = d.format === 'physical' ? 'a printed café menu' : 'a café menu screen'
  const shape = isPortrait(d.size) ? 'portrait' : 'landscape'
  // The person's words as a sentence of their own.
  const typed = style.trim().replace(/\s+/g, ' ')
  const words = typed && !/[.!?]$/.test(typed) ? `${typed}.` : typed
  if (d.mode === 'background') {
    return [words, `Background artwork for ${where}, ${shape}.`, 'Keep the middle calm and plain, with room for the menu to be written over it.',
      'No text, no letters, no words, no numbers, no logos.'].filter(Boolean).join(' ')
  }
  const money = d.money ?? ((n: number) => `${n.toFixed(2).replace('.', ',')} €`)
  const sections = (d.sections ?? []).map(s => `${(s.category ?? 'More').toUpperCase()}: ${s.items.map(i => priced(i, money)).join('; ')}`)
  return [words, `${where[0].toUpperCase()}${where.slice(1)}, ${shape}, with clear, readable lettering.`, `The heading reads "${d.title}".`,
    d.subtitle ? `Under it, smaller: "${d.subtitle}".` : '',
    sections.length ? `Write exactly these sections, items and prices, spelled exactly as given: ${sections.join(' | ')}.` : '',
    d.footer ? `At the bottom, small: "${d.footer}".` : '', 'Nothing else written.'].filter(Boolean).join(' ').slice(0, 2048)
}

/** A photo of one menu item, for the menu and the item's card. */
export function photoPrompt(i: Pick<MenuItem, 'name' | 'description' | 'category'>, style = ''): string {
  const typed = style.trim()
  return [typed && !/[.!?]$/.test(typed) ? `${typed}.` : typed, `A professional photograph of ${i.name}${i.description ? `: ${i.description}` : ''}, as served in a specialty café.`,
    'Natural window light, appetising, shallow depth of field, on a simple table. Square. No text, no logos.'].filter(Boolean).join(' ')
}

const rgb = (hex: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}

export interface AiRequest { endpoint: string; body: Record<string, unknown> }

/**
 * Higgsfield's request for an image: which model address and what it takes. `image`: the public
 * address of the image to change (an edit); Recraft takes none, so its edits go to Qwen's.
 * `square`: an item's photo.
 */
export function aiRequest(model: AiModel, prompt: string, shape: { width: number; height: number }, opts: { image?: string | null; colours?: BrandColour[] } = {}): AiRequest {
  const info = modelOf(model)
  const p = prompt.slice(0, model === 'ideogram' ? 2048 : 4000)
  if (opts.image) {
    if (info.edits === 'self') {
      return { endpoint: info.endpoint, body: { prompt: p, image_url: opts.image, image_weight: 60, rendering_speed: 'QUALITY',
        aspect_ratio: closestRatio(shape.width, shape.height, info.ratios) } }
    }
    return { endpoint: info.edits, body: { prompt: p, image_urls: [opts.image], resolution: '2k', aspect_ratio: closestRatio(shape.width, shape.height, EDIT_RATIOS) } }
  }
  const aspect_ratio = closestRatio(shape.width, shape.height, info.ratios)
  if (model === 'ideogram') return { endpoint: info.endpoint, body: { prompt: p, aspect_ratio, rendering_speed: 'QUALITY' } }
  if (model === 'recraft') {
    const colours = (opts.colours ?? []).map(c => rgb(c.hex)).filter((c): c is number[] => !!c).slice(0, 5)
    return { endpoint: info.endpoint, body: { prompt: p, aspect_ratio, resolution: '1k', output_format: 'jpg', ...(colours.length ? { colors: colours.map(c => ({ rgb: c })) } : {}) } }
  }
  return { endpoint: info.endpoint, body: { prompt: p, aspect_ratio, resolution: '2k' } }
}

/** Higgsfield's answer about a request (its status address, or a webhook), as the app needs it. */
export interface AiResult { status: 'queued' | 'working' | 'ready' | 'failed'; url: string | null; error: string | null }

/** Read Higgsfield's status or webhook answer: { status, images: [{ url }] } or { status, payload: { images } }. */
export function readAiResult(raw: unknown): AiResult {
  const r = (raw ?? {}) as { status?: string; error?: string | null; images?: { url?: string }[]; payload?: { images?: { url?: string }[] } | null }
  const url = (r.images ?? r.payload?.images ?? []).find(i => typeof i?.url === 'string' && /^https:\/\//.test(i.url))?.url ?? null
  switch (r.status) {
    case 'queued': return { status: 'queued', url: null, error: null }
    case 'in_progress': return { status: 'working', url: null, error: null }
    case 'completed': return url ? { status: 'ready', url, error: null } : { status: 'failed', url: null, error: 'Higgsfield finished without an image. Try again.' }
    case 'nsfw': return { status: 'failed', url: null, error: 'Higgsfield’s safety check stopped this image. Try different words (nothing is charged).' }
    case 'canceled': return { status: 'failed', url: null, error: 'It was cancelled.' }
    case 'failed': return { status: 'failed', url: null, error: r.error ? `Higgsfield couldn’t make it: ${r.error}` : 'Higgsfield couldn’t make it. Try again (nothing is charged).' }
    default: return { status: 'failed', url: null, error: 'Higgsfield’s answer wasn’t understood. Try again.' }
  }
}

/** Higgsfield's error answers ({ detail: "…" }, status codes) in plain words. */
export function aiErrorText(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  const said = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(d => (d as { msg?: string })?.msg).filter(Boolean).join('; ') : ''
  if (status === 401) return 'Higgsfield didn’t accept the API key. Check the key ID and secret on the Connections page.'
  if (status === 403) return 'The Higgsfield account has run out of credits. Add credits at higgsfield.ai, then try again.'
  if (status === 429) return 'Higgsfield is busy with this account’s other images. Try again in a minute.'
  if (status === 423 || status === 503) return 'That Higgsfield model is resting for a moment. Try again shortly, or pick another model.'
  if (status === 400 || status === 422) return `Higgsfield couldn’t use that request${said ? `: ${said}` : ''}.`
  return `Higgsfield didn’t answer (${status}). Try again in a moment.`
}
