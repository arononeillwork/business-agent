// Licences and documents for AI assistants: what the business keeps open (SGAE, the terrace permit,
// insurance…), when each runs out, and the documents kept in the café's Drive or OneDrive. An AI can
// add or update a licence and point it at its document (a link, e.g. a file already in Drive), and
// mark one renewed. Uploading the file itself stays on the Documents and Licences pages: the app
// only reaches the files it put in Drive itself, and a file is too big to pass through a chat.
// Same rules as the app: admins; a gestoría with finances access reads. Documents: pay access.
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolDef } from './tools'
import { CAFE_PRESETS, LICENCE_CATEGORIES, daysUntil, renewedUntil, statusOf, yearlyCost, type Licence, type LicenceCategory } from '../shared/licences'
import { expiryOf, filterDocuments, linkedTo, type KeptDocument } from '../shared/documents'
import { today } from '../shared/time'

const tool = <S extends z.ZodType>(def: ToolDef<S>) => def as unknown as ToolDef

function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message)
  return res.data as NonNullable<T>
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const CATEGORY_IDS = LICENCE_CATEGORIES.map(c => c.id) as [LicenceCategory, ...LicenceCategory[]]
const PRESET_KEYS = CAFE_PRESETS.map(p => p.key) as [string, ...string[]]
const STATUS_TEXT = { expired: 'ran out', due: 'renew soon', valid: 'up to date', permanent: 'doesn’t run out' } as const

type DocRow = Pick<KeptDocument, 'id' | 'name' | 'link'>

async function licencesWithDocs(sb: SupabaseClient) {
  const rows = check(await sb.from('licences').select('*').order('name')) as Licence[]
  const ids = [...new Set(rows.map(l => l.document_id).filter((x): x is string => !!x))]
  const docs = ids.length ? check(await sb.from('tax_documents').select('id, name, link').in('id', ids)) as DocRow[] : []
  return rows.map(l => ({ ...l, document: docs.find(d => d.id === l.document_id) ?? null }))
}

/** A licence by id or (partial, case-insensitive) name. */
function resolveLicence(rows: Licence[], which: string): Licence {
  const q = which.trim().toLowerCase()
  const exact = rows.filter(l => l.id === which || l.name.toLowerCase() === q)
  const matches = exact.length ? exact : rows.filter(l => l.name.toLowerCase().includes(q))
  if (matches.length === 1) return matches[0]
  if (!matches.length) throw new Error(`No licence matches "${which}". On file: ${rows.map(l => l.name).join(', ') || 'none yet'}`)
  throw new Error(`"${which}" matches several licences: ${matches.map(l => l.name).join(', ')}`)
}

const cost = (v: unknown) => (v == null ? null : Number(v))

function describe(l: Licence & { document?: DocRow | null }, now: string) {
  return {
    id: l.id, name: l.name, category: l.category, issuer: l.issuer, reference: l.reference, holder: l.holder,
    status: STATUS_TEXT[statusOf(l, now)], starts_on: l.starts_on, expires_on: l.expires_on,
    days_left: l.expires_on ? daysUntil(now, l.expires_on) : null,
    renews_every_months: l.renew_every_months, auto_renews: l.auto_renews, cost_eur: cost(l.cost), reminder_days: l.reminder_days,
    document: l.document ? { name: l.document.name, link: l.document.link } : null,
    link: l.link, notes: l.notes, active: l.active,
  }
}

export const LICENCE_TOOLS: ToolDef[] = [
  tool({
    name: 'list_licences',
    title: 'Licences and renewals',
    description: 'The licences, permits, insurance, safety checks and certificates the business keeps (SGAE and AGEDI music licences, the terrace permit, the opening licence…): each one\'s issuer, reference number, when it runs out and its status (ran out, renew soon, up to date), how often it renews, the cost, its document (file name and link) and the link where it\'s renewed. Then what they cost a year and the usual ones for a café in Spain that aren\'t on file yet (with a preset key for save_licence). Costs are euros.',
    admin: true,
    partner: ['finances'],
    readOnly: true,
    input: z.object({
      include_inactive: z.boolean().optional().describe('Also the ones no longer kept (default false)'),
    }),
    async run({ sb }, a) {
      const now = today()
      const rows = await licencesWithDocs(sb)
      const shown = rows.filter(l => a.include_inactive || l.active)
      const order = { expired: 0, due: 1, valid: 2, permanent: 3 }
      shown.sort((x, y) => order[statusOf(x, now)] - order[statusOf(y, now)] || (x.expires_on ?? '9').localeCompare(y.expires_on ?? '9'))
      const have = rows.map(l => l.name.toLowerCase())
      return {
        today: now,
        licences: shown.map(l => describe(l, now)),
        cost_eur_a_year: Math.round(yearlyCost(rows.map(l => ({ ...l, cost: cost(l.cost) }))) * 100) / 100,
        usual_ones_not_on_file: CAFE_PRESETS.filter(p => !have.some(n => n.includes(p.name.toLowerCase().split(' (')[0].split(' /')[0])))
          .map(p => ({ preset: p.key, name: p.name, issuer: p.issuer || null, renews_every_months: p.renew_every_months, what: p.what })),
      }
    },
  }),

  tool({
    name: 'save_licence',
    title: 'Add or update a licence',
    description: 'Add a licence (or permit, insurance, safety check, certificate, contract) or change one on file, found by `licence` (its name or id). `preset` fills a usual one for a café in Spain (e.g. "sgae", "agedi", "terraza") with its name, issuer, category and renewal. `link` is where its document is or where it\'s renewed, e.g. the Google Drive link of the signed SGAE form. `renewed: true` moves its last day on by one renewal period. Fields left out stay as they are. Summarise what will change and get a yes before saving.',
    admin: true,
    input: z.object({
      licence: z.string().optional().describe('The licence to change: its name (or part of it) or id. Leave out to add a new one.'),
      preset: z.enum(PRESET_KEYS).optional().describe('A usual one to start from: ' + PRESET_KEYS.join(', ')),
      name: z.string().min(1).max(120).optional(),
      category: z.enum(CATEGORY_IDS).optional(),
      issuer: z.string().max(120).nullable().optional().describe('Who gives it: SGAE, Ayuntamiento de Marbella, the insurer…'),
      reference: z.string().max(80).nullable().optional().describe('Its number: contract, policy or expediente number'),
      holder: z.string().max(120).nullable().optional().describe('Whose it is when it\'s a person\'s (a food handler\'s certificate)'),
      starts_on: date.nullable().optional(),
      expires_on: date.nullable().optional().describe('Its last day; null when it doesn\'t run out'),
      renew_every_months: z.number().int().min(1).max(240).nullable().optional(),
      auto_renews: z.boolean().optional().describe('Renewed by itself, e.g. by direct debit'),
      cost_eur: z.number().min(0).nullable().optional().describe('What each renewal costs'),
      reminder_days: z.number().int().min(0).max(365).optional().describe('Days before it runs out that admins are reminded (default 30)'),
      link: z.string().regex(/^https?:\/\/\S+$/, 'A web address starting https://').nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
      active: z.boolean().optional(),
      renewed: z.boolean().optional().describe('It was just renewed: its last day moves on one period'),
    }),
    async run({ sb }, a) {
      const now = today()
      const rows = check(await sb.from('licences').select('*').order('name')) as Licence[]
      const current = a.licence ? resolveLicence(rows, a.licence) : null
      const preset = a.preset ? CAFE_PRESETS.find(p => p.key === a.preset)! : null
      const row: Record<string, unknown> = {}
      if (preset && !current) {
        Object.assign(row, { name: preset.name, category: preset.category, issuer: preset.issuer || null, renew_every_months: preset.renew_every_months,
          ...(preset.link ? { link: preset.link } : {}) })
      }
      const fields = ['name', 'category', 'issuer', 'reference', 'holder', 'starts_on', 'expires_on', 'renew_every_months', 'auto_renews',
        'reminder_days', 'link', 'notes', 'active'] as const
      for (const f of fields) if (a[f] !== undefined) row[f] = a[f]
      if (a.cost_eur !== undefined) row.cost = a.cost_eur
      if (a.renewed) {
        const base = { expires_on: (row.expires_on as string | null | undefined) ?? current?.expires_on ?? null,
          renew_every_months: (row.renew_every_months as number | null | undefined) ?? current?.renew_every_months ?? null }
        const until = renewedUntil(base, now)
        if (!until) throw new Error('Say how often it renews (renew_every_months) to mark it renewed')
        row.expires_on = until
      }
      if (!current && !row.name) throw new Error('A new licence needs a name or a preset')
      if (!current) {
        const dup = rows.find(l => l.name.toLowerCase() === String(row.name).trim().toLowerCase())
        if (dup) throw new Error(`"${dup.name}" is already on file: pass licence: "${dup.name}" to change it`)
      }
      if (current && !Object.keys(row).length) throw new Error('Nothing to change')
      const id = current
        ? (check(await sb.from('licences').update(row).eq('id', current.id)), current.id)
        : (check(await sb.from('licences').insert(row).select('id').single()) as { id: string }).id
      const saved = (await licencesWithDocs(sb)).find(l => l.id === id)
      return { ok: true, [current ? 'updated' : 'added']: saved ? describe(saved, now) : { id } }
    },
  }),

  tool({
    name: 'find_documents',
    title: 'Find kept documents',
    description: 'Search the documents the business keeps in its Google Drive or OneDrive (contracts, insurance, licences\' files, invoices, tax papers): by words in the name, title, tags, notes, folder or what it belongs to (an invoice\'s supplier, a licence\'s name). Each with its kind, year, folder, link, when it runs out and what it belongs to. Only admins with pay access see documents.',
    admin: true,
    partner: ['finances'],
    readOnly: true,
    input: z.object({
      q: z.string().max(200).optional().describe('Words to find, e.g. "sgae", "seguro 2026"'),
      kind: z.enum(['sales_invoice', 'purchase_invoice', 'receipt', 'payslip', 'bank_statement', 'tax_return', 'contract', 'other']).optional(),
      year: z.number().int().min(2000).max(2100).optional(),
      limit: z.number().int().min(1).max(100).optional().describe('At most this many (default 25)'),
    }),
    async run({ sb }, a) {
      const docs = check(await sb.from('tax_documents').select('*').order('uploaded_at', { ascending: false })) as KeptDocument[]
      const licences = check(await sb.from('licences').select('id, name, expires_on, document_id')) as (Pick<Licence, 'id' | 'name' | 'expires_on' | 'document_id'>)[]
      const withLinks = docs.map(d => ({ ...d, folder: d.folder ?? [], tags: d.tags ?? [],
        licences: licences.filter(l => l.document_id === d.id).map(l => ({ id: l.id, name: l.name, expires_on: l.expires_on })) }))
      const found = filterDocuments(withLinks, { q: a.q ?? '', kind: a.kind ?? 'all', year: a.year ?? 'all', linked: 'all' })
      const limit = a.limit ?? 25
      return {
        found: found.length,
        documents: found.slice(0, limit).map(d => ({
          id: d.id, name: d.name, title: d.title ?? null, kind: d.kind, year: d.year, folder: d.folder.join('/'), link: d.link,
          tags: d.tags, expires_on: expiryOf(d), belongs_to: linkedTo(d), licences: d.licences.map(l => l.name), notes: d.notes,
        })),
        ...(found.length > limit ? { note: `Showing ${limit} of ${found.length}: narrow the search or raise limit.` } : {}),
        ...(!docs.length ? { note: 'No documents kept yet, or this account has no pay access. Files are added on the Documents page.' } : {}),
      }
    },
  }),
]
