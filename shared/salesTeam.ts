// The admin area's sales team (/admin, the admin_area migration): a lane for each salesperson, a column
// for each stage, a card for each business they're talking to about Business Agent. A business is added
// from whatever is to hand: its Instagram link, a phone number, an email or its website, pasted into one
// box and put where it belongs. The Worker (worker/adminArea.ts) and the demo tidy what's sent the same way.
import { msg } from './i18n'
import { cleanInstagram } from './reps'
import { EMAIL, cleanPhone } from './customers'

export type ProspectStage = 'to_contact' | 'contacted' | 'demo' | 'trial' | 'won' | 'lost'

/** The columns, in order. */
export const PROSPECT_STAGES: { id: ProspectStage; label: string }[] = [
  { id: 'to_contact', label: msg('To contact') }, { id: 'contacted', label: msg('Contacted') }, { id: 'demo', label: msg('Demo booked') },
  { id: 'trial', label: msg('Signed up') }, { id: 'won', label: msg('Paying') }, { id: 'lost', label: msg('Not now') },
]
export const prospectStageLabel = (s: ProspectStage) => PROSPECT_STAGES.find(x => x.id === s)?.label ?? s
export const isProspectStage = (v: unknown): v is ProspectStage => PROSPECT_STAGES.some(s => s.id === v)

export interface SalesMember {
  id: string; name: string; position: number
  /** Their rep code for sign-ups (JULIO27), from HQ's reps; null until they have one. */
  rep_id?: string | null; code?: string | null
}

/** A café to sign up, or a partner (a roaster, a supplier) who could bring cafés. */
export type ProspectKind = 'customer' | 'partner'
export const PROSPECT_KINDS: { id: ProspectKind; label: string }[] = [{ id: 'customer', label: msg('Customer') }, { id: 'partner', label: msg('Partner') }]
export const isProspectKind = (v: unknown): v is ProspectKind => v === 'customer' || v === 'partner'

/** The kind of business a contact is, to show the board by (the admin_area_people migration). */
export type BusinessType = 'cafe' | 'restaurant' | 'barber' | 'garage' | 'financial' | 'other'
export const BUSINESS_TYPES: { id: BusinessType; label: string; many: string }[] = [
  { id: 'cafe', label: msg('Café'), many: msg('Cafés') }, { id: 'restaurant', label: msg('Restaurant'), many: msg('Restaurants') },
  { id: 'barber', label: msg('Barber'), many: msg('Barbers') }, { id: 'garage', label: msg('Garage'), many: msg('Garages') },
  { id: 'financial', label: msg('Financial'), many: msg('Financial') }, { id: 'other', label: msg('Something else'), many: msg('Something else') },
]
export const isBusinessType = (v: unknown): v is BusinessType => BUSINESS_TYPES.some(x => x.id === v)
/** A contact's kind of business (a café, when it was added before there were kinds). */
export const businessTypeOf = (p: Pick<Prospect, 'business_type'>): BusinessType => p.business_type ?? 'cafe'
export const businessTypeLabel = (b: BusinessType) => BUSINESS_TYPES.find(x => x.id === b)?.label ?? b
export interface Prospect {
  id: string
  /** Whose lane (null: nobody's yet, as when someone leaves the team). */
  member_id: string | null
  name: string
  stage: ProspectStage
  kind?: ProspectKind
  /** A café, a restaurant, a garage or something else. */
  business_type?: BusinessType
  /** The business that signed up for it with a rep code (on HQ's list); the card then moves by itself. */
  introduction_id?: string | null
  instagram: string | null
  phone: string | null
  email: string | null
  website: string | null
  town: string | null
  notes: string | null
  follow_up_on: string | null
  created_at: string
  updated_at: string
}
export type ProspectInput = Partial<Omit<Prospect, 'id' | 'created_at' | 'updated_at' | 'introduction_id'>> & { id?: string }
export interface SalesBoard { team: SalesMember[]; prospects: Prospect[] }

/** A session in the admin area: its token (kept in the browser) and when it ends. */
export interface AdminSession { token: string; expires_at: string }
/** The session has ended (locked, timed out, or the PIN changed): the PIN opens it again. */
export class AdminLocked extends Error {
  constructor(message = 'Locked: type the PIN to open it again') { super(message); this.name = 'AdminLocked' }
}

/** The PIN as typed: 4 to 12 digits. */
export const isAdminPin = (v: string) => /^[0-9]{4,12}$/.test(v)

/** What a pasted link, number or address is. */
export type ContactKind = 'instagram' | 'phone' | 'email' | 'website'
export interface ReadContact { kind: ContactKind; value: string }

/** A website as kept: with https:// in front. Null when it isn't one (or is Instagram's). */
export function cleanWebsite(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v || /\s/.test(v) || v.includes('@')) return null
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(url)
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname) || /(^|\.)instagram\.com$/i.test(u.hostname)) return null
    return u.href.replace(/\/$/, '') === `${u.protocol}//${u.host}` ? `${u.protocol}//${u.host}` : u.href
  } catch { return null }
}

/**
 * What someone pasted into the one box: an Instagram link or @name, a phone number, an email or a
 * website. Null when it's none of them (then it's taken as the business's name).
 */
export function readContact(raw: string): ReadContact | null {
  const v = raw.trim()
  if (!v) return null
  if (/^(https?:\/\/)?(www\.|m\.)?instagram\.com\//i.test(v) || /^@[a-z0-9._]{1,30}$/i.test(v)) {
    const handle = cleanInstagram(v.replace(/^(https?:\/\/)?m\./i, '$1'))
    return handle ? { kind: 'instagram', value: handle } : null
  }
  if (EMAIL.test(v)) return { kind: 'email', value: v.toLowerCase() }
  if (/^[+(]?[\d\s().\-/]{6,}$/.test(v)) {
    const phone = cleanPhone(v, 'ES')
    return phone ? { kind: 'phone', value: phone } : null
  }
  const site = /\.[a-z]{2,}(\/|$)/i.test(v) ? cleanWebsite(v) : null
  return site ? { kind: 'website', value: site } : null
}

/** A name to start from, from an Instagram name: "the_bootes_cafe" → "The Bootes Cafe", "roasted.spain" → "Roasted Spain". */
export function nameFromHandle(handle: string): string {
  return handle.split(/[._]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}
/** A name to start from, from a website: "https://www.cafelola.es/menu" → "Cafelola". */
export function nameFromWebsite(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    const first = host.split('.')[0]
    return first ? first[0].toUpperCase() + first.slice(1) : ''
  } catch { return '' }
}

export const instagramLink = (handle: string) => `https://www.instagram.com/${handle}/`
export const phoneLink = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
export const whatsAppLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null)
const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * What's sent for a business, tidied and checked as the database will: a name (or one from its
 * Instagram or website), the stage, and each way to reach it in the shape it's kept. A field not sent
 * is left as it is (a change sends only what changed); `{ error }` says what isn't right.
 */
export function cleanProspect(input: Record<string, unknown>, isNew: boolean): { row: Record<string, unknown> } | { error: string } {
  const row: Record<string, unknown> = {}
  const has = (k: string) => k in input
  if (has('instagram')) {
    const raw = text(input.instagram, 200)
    const handle = raw ? cleanInstagram(raw) : null
    if (raw && !handle) return { error: 'That isn’t an Instagram link or name' }
    row.instagram = handle
  }
  if (has('phone')) {
    const raw = text(input.phone, 40)
    const phone = raw ? cleanPhone(raw, 'ES') : null
    if (raw && !phone) return { error: 'That isn’t a phone number' }
    row.phone = phone
  }
  if (has('email')) {
    const raw = text(input.email, 200)
    if (raw && !EMAIL.test(raw)) return { error: 'That isn’t an email address' }
    row.email = raw?.toLowerCase() ?? null
  }
  if (has('website')) {
    const raw = text(input.website, 300)
    const site = raw ? cleanWebsite(raw) : null
    if (raw && !site) return { error: 'That isn’t a website' }
    row.website = site
  }
  if (has('name') || isNew) {
    const name = text(input.name, 120)
      ?? (typeof row.instagram === 'string' ? nameFromHandle(row.instagram) : null)
      ?? (typeof row.website === 'string' ? nameFromWebsite(row.website) || null : null)
    if (!name) return { error: 'Give the business a name, or its Instagram' }
    row.name = name
  }
  if (has('stage') || isNew) {
    const stage = input.stage ?? 'to_contact'
    if (!isProspectStage(stage)) return { error: 'That isn’t a stage on the board' }
    row.stage = stage
  }
  if (has('member_id')) {
    const m = input.member_id
    if (m !== null && (typeof m !== 'string' || !/^[0-9a-f-]{36}$/i.test(m))) return { error: 'Choose someone on the sales team' }
    row.member_id = m
  }
  if (has('kind') || isNew) {
    const kind = input.kind ?? 'customer'
    if (!isProspectKind(kind)) return { error: 'A contact is a customer or a partner' }
    row.kind = kind
  }
  if (has('business_type')) {
    if (!isBusinessType(input.business_type)) return { error: 'Choose what kind of business it is' }
    row.business_type = input.business_type
  }
  if (has('town')) row.town = text(input.town, 80)
  if (has('notes')) row.notes = text(input.notes, 2000)
  if (has('follow_up_on')) {
    const d = input.follow_up_on
    if (d !== null && d !== '' && (typeof d !== 'string' || !DAY.test(d))) return { error: 'That isn’t a date' }
    row.follow_up_on = d || null
  }
  if (isNew && !row.instagram && !row.phone && !row.email && !row.website) return { error: 'Add a way to reach them: Instagram, a phone number, an email or a website' }
  return { row }
}

/** A salesperson's name, tidied; null when there isn't one. */
export const cleanMemberName = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, 80) : null)

/** The board's rows: a lane per salesperson in their order, then nobody's (only when it has any), a column per stage. */
export function lanes(board: SalesBoard): { member: SalesMember | null; byStage: Record<ProspectStage, Prospect[]>; total: number }[] {
  const team = [...board.team].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  const known = new Set(team.map(m => m.id))
  const of = (id: string | null) => board.prospects.filter(p => (id === null ? !p.member_id || !known.has(p.member_id) : p.member_id === id))
  const lane = (member: SalesMember | null) => {
    const mine = of(member?.id ?? null)
    const byStage = Object.fromEntries(PROSPECT_STAGES.map(s => [s.id,
      mine.filter(p => p.stage === s.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.name.localeCompare(b.name))])) as Record<ProspectStage, Prospect[]>
    return { member, byStage, total: mine.length }
  }
  const out = team.map(lane)
  const nobody = lane(null)
  return nobody.total ? [...out, nobody] : out
}

/** A follow-up that's today or gone by, while the business is still being talked to. */
export const followUpDue = (p: Prospect, today: string) => !!p.follow_up_on && p.follow_up_on <= today && p.stage !== 'won' && p.stage !== 'lost'

/** The words the Worker answers with when the database refuses (a duplicate, a check). */
export function prospectError(message: string): string {
  if (/sales_prospects_instagram_key/.test(message)) return 'That Instagram is on the board already'
  if (/sales_team_name_key/.test(message)) return 'Someone on the sales team has that name already'
  if (/check constraint|invalid input syntax/i.test(message)) return 'Something there isn’t right. Check it and try again.'
  return message
}
