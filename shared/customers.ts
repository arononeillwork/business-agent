// Customers and leads: where people came from, their name and search, and reading a CSV someone
// exported from another app or a spreadsheet (Spanish Excel included) into new customers.
import { msg } from './i18n'
import type { Customer, CustomerInput, CustomerSource } from './types'

/** Where people came from, in the order offered. Brand names are the same in every language. */
export const SOURCES: { key: CustomerSource; label: string }[] = [
  { key: 'walk_in', label: msg('Walk-in') }, { key: 'instagram', label: 'Instagram' }, { key: 'facebook', label: 'Facebook' },
  { key: 'tiktok', label: 'TikTok' }, { key: 'website', label: msg('Website') }, { key: 'google', label: 'Google' },
  { key: 'referral', label: msg('Referral') }, { key: 'event', label: msg('Event') }, { key: 'other', label: msg('Other') },
]
export const sourceLabel = (s: CustomerSource) => SOURCES.find(x => x.key === s)?.label ?? s

/** First and last name, or the company, email or phone when there's no name. */
export const customerName = (c: Pick<Customer, 'first_name' | 'last_name' | 'company' | 'email' | 'phone'>) =>
  [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || c.email || c.phone || ''

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Does the search box match them (name, email, phone, company, notes, tags; accents and case aside)? */
export function matchesSearch(c: Customer, q: string) {
  const term = fold(q.trim())
  if (!term) return true
  const digits = term.replace(/[\s+]/g, '')
  if (/^\d{3,}$/.test(digits) && c.phone?.replace(/\D/g, '').includes(digits)) return true
  return fold([c.first_name, c.last_name, c.email, c.phone, c.company, c.notes, c.instagram, ...c.tags].filter(Boolean).join(' ')).includes(term)
}

export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * A phone number as saved: "+34 600 000 000". A number without a country code is taken as Spanish;
 * 00 in front means a country code follows. Returns null when there's nothing that looks like one.
 */
export function cleanPhone(raw: string): string | null {
  // "(0)" is the UK's trunk zero, not dialled from abroad.
  let v = raw.trim().replace(/\(0\)/g, '').replace(/[().\-/]/g, ' ').replace(/\s+/g, ' ')
  if (v.startsWith('00')) v = `+${v.slice(2)}`
  const digits = v.replace(/\D/g, '')
  if (digits.length < 6 || digits.length > 15) return null
  if (v.startsWith('+')) {
    // A Spanish number written all together is spaced the usual way.
    return digits.startsWith('34') && digits.length === 11 ? `+34 ${spaced(digits.slice(2))}` : `+${v.slice(1).replace(/[^\d ]/g, '').trim()}`
  }
  if (digits.startsWith('34') && digits.length === 11) return `+34 ${spaced(digits.slice(2))}`
  return digits.length === 9 ? `+34 ${spaced(digits)}` : null
}
const spaced = (nine: string) => nine.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3')

// ---------------------------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------------------------

/**
 * The rows of a CSV file. Commas, semicolons (Spanish Excel) or tabs, whichever the first line
 * uses; quoted fields may hold the separator, quotes ("") and line breaks; a byte-order mark is dropped.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const first = src.split(/\r?\n/, 1)[0] ?? ''
  const count = (ch: string) => first.split(ch).length - 1
  const sep = [';', '\t', ','].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',')
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field.trim() === '') { quoted = true; field = '' }
    else if (ch === sep) { row.push(field.trim()); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field.trim()); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field.trim()); rows.push(row) }
  return rows.filter(r => r.some(c => c !== ''))
}

/** A CSV file's text: UTF-8, or Windows-1252 (what Excel on a Spanish PC saves), so accents survive either way. */
export function decodeCsv(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes) } catch { return new TextDecoder('windows-1252').decode(bytes) }
}

export type ImportField = 'first_name' | 'last_name' | 'full_name' | 'email' | 'phone' | 'company' | 'notes' | 'instagram'
  | 'birthday' | 'tags' | 'consent'

// Column headings people use, in English and Spanish, compared without accents, case or punctuation.
const HEADINGS: Record<ImportField, string[]> = {
  first_name: ['first name', 'firstname', 'given name', 'forename', 'nombre', 'nombre de pila'],
  last_name: ['last name', 'lastname', 'surname', 'family name', 'apellido', 'apellidos', 'primer apellido'],
  full_name: ['name', 'full name', 'fullname', 'contact', 'contact name', 'customer', 'client', 'nombre completo', 'nombre y apellidos',
    'cliente', 'contacto'],
  email: ['email', 'e mail', 'email address', 'mail', 'correo', 'correo electronico', 'email del cliente'],
  phone: ['phone', 'phone number', 'mobile', 'mobile phone', 'cell', 'telephone', 'tel', 'whatsapp', 'telefono', 'movil',
    'telefono movil', 'numero de telefono', 'celular'],
  company: ['company', 'business', 'organisation', 'organization', 'company name', 'empresa', 'compania', 'negocio', 'organizacion'],
  notes: ['notes', 'note', 'comments', 'comment', 'notas', 'nota', 'comentarios', 'observaciones'],
  instagram: ['instagram', 'ig', 'instagram handle', 'usuario de instagram'],
  birthday: ['birthday', 'birth date', 'date of birth', 'dob', 'cumpleanos', 'fecha de nacimiento'],
  tags: ['tags', 'tag', 'labels', 'groups', 'etiquetas', 'etiqueta', 'grupos'],
  consent: ['marketing', 'marketing ok', 'consent', 'marketing consent', 'accepts marketing', 'subscribed', 'opt in', 'newsletter',
    'consentimiento', 'acepta marketing', 'acepta publicidad', 'suscrito', 'publicidad'],
}
const plain = (s: string) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim()

/** Which field each column holds (by position), from its heading; null for columns we don't use. */
export function mapHeadings(headings: string[]): (ImportField | null)[] {
  const used = new Set<ImportField>()
  return headings.map(h => {
    const p = plain(h)
    const f = (Object.keys(HEADINGS) as ImportField[]).find(k => !used.has(k) && HEADINGS[k].includes(p))
    if (f) used.add(f)
    return f ?? null
  })
}

const YES = new Set(['yes', 'y', 'si', 's', 'true', '1', 'x', 'ok', 'subscribed', 'suscrito', 'opted in'])

/** "1990-05-14", "14/05/1990" or "14-05-1990" (day first, as in Spain) → "1990-05-14"; null otherwise. */
export function cleanDate(raw: string): string | null {
  const v = raw.trim()
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  const dmy = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  const parts = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : null
  if (!parts) return null
  const [y, m, d] = parts
  const out = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const check = new Date(`${out}T12:00:00Z`)
  return !Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === out && y >= '1900' ? out : null
}

export interface CsvImport {
  /** The people found, ready to save (kind and source are chosen when importing). */
  rows: CustomerInput[]
  /** Which columns were recognised: heading → field. */
  columns: { heading: string; field: ImportField | null }[]
  /** Lines with no name, email or phone we could read. */
  skipped: number
}

/** Read a CSV file into new customers. Emails and phones that don't look right are left out. */
export function readCustomersCsv(text: string): CsvImport {
  const [head = [], ...lines] = parseCsv(text)
  const fields = mapHeadings(head)
  // A lone "Nombre" column, with no surname column, holds the whole name.
  if (!fields.includes('last_name') && !fields.includes('full_name') && fields.includes('first_name')) fields[fields.indexOf('first_name')] = 'full_name'
  const rows: CustomerInput[] = []
  let skipped = 0
  for (const line of lines) {
    const get = (f: ImportField) => { const i = fields.indexOf(f); return i >= 0 ? (line[i] ?? '').trim() : '' }
    let first = get('first_name'), last = get('last_name')
    const full = get('full_name')
    if (full && !first && !last) [first, last] = splitName(full)
    else if (full && !first) first = full
    const email = get('email').toLowerCase()
    const r: CustomerInput = {
      first_name: first.slice(0, 100) || null, last_name: last.slice(0, 100) || null,
      email: EMAIL.test(email) && email.length <= 254 ? email : null,
      phone: get('phone') ? cleanPhone(get('phone')) : null,
      company: get('company').slice(0, 120) || null,
      notes: get('notes').slice(0, 2000) || null,
      instagram: /^@?[A-Za-z0-9._]{1,30}$/.test(get('instagram')) ? get('instagram').replace(/^@/, '') : null,
      birthday: get('birthday') ? cleanDate(get('birthday')) : null,
      tags: [...new Set(get('tags').split(/[,;|]/).map(t => t.trim()).filter(Boolean))].slice(0, 20),
      marketing_consent: YES.has(plain(get('consent'))),
    }
    if (r.first_name || r.last_name || r.email || r.phone) rows.push(r)
    else skipped++
  }
  return { rows, columns: head.map((heading, i) => ({ heading, field: fields[i] })), skipped }
}

/** "Lucía García López" → ["Lucía", "García López"]: Spanish surnames come in twos. */
function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/)
  return parts.length === 1 ? [parts[0], ''] : [parts[0], parts.slice(1).join(' ')]
}

/** Leave out people already on the list (same email or phone) and repeats within the file. */
export function withoutDuplicates(rows: CustomerInput[], existing: Pick<Customer, 'email' | 'phone'>[]): { fresh: CustomerInput[]; duplicates: number } {
  const key = (p: string | null | undefined) => p?.replace(/\D/g, '') || null
  const emails = new Set(existing.map(c => c.email?.toLowerCase()).filter(Boolean))
  const phones = new Set(existing.map(c => key(c.phone)).filter(Boolean))
  const fresh: CustomerInput[] = []
  for (const r of rows) {
    const email = r.email?.toLowerCase(), phone = key(r.phone)
    if ((email && emails.has(email)) || (phone && phones.has(phone))) continue
    if (email) emails.add(email)
    if (phone) phones.add(phone)
    fresh.push(r)
  }
  return { fresh, duplicates: rows.length - fresh.length }
}
