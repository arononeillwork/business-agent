// Contacts for AI assistants: the people the business calls on (the lawyer, the bank, the plumber…), with
// how to reach them, and adding or changing one. Same rule as the app (the `business_contacts`
// migration): only the owners (admins with pay access) see and change them.
import { z } from 'zod'
import type { ToolDef } from './tools'
import type { Profile } from '../shared/types'
import {
  USUAL_JOBS, contactProblem, jobKey, jobName, matchesContact, sortContacts, tidyContact, type Contact, type ContactInput,
} from '../shared/contacts'

const tool = <S extends z.ZodType>(def: ToolDef<S>) => def as unknown as ToolDef

function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message)
  return res.data as NonNullable<T>
}

const COLUMNS = 'id, name, job, company, phone, whatsapp, email, website, notes'
// The tools speak English: a usual job is its English name.
const english = (s: string) => s

/** Contacts are the owners' own: a shop manager is an admin too, but without pay access. */
function needOwner(me: Profile) {
  if (!(me.role === 'admin' && me.can_see_pay)) throw new Error('Only the owners see the contacts')
}

const describe = (c: Contact) => ({
  id: c.id, name: c.name, what_they_do: jobName(c.job, english) || null, company: c.company, phone: c.phone, whatsapp: c.whatsapp,
  email: c.email, website: c.website, notes: c.notes,
})

/** A contact by id or (partial, case-insensitive) name. */
function resolveContact(rows: Contact[], which: string): Contact {
  const q = which.trim().toLowerCase()
  const exact = rows.filter(c => c.id === which || c.name.toLowerCase() === q)
  const matches = exact.length ? exact : rows.filter(c => c.name.toLowerCase().includes(q))
  if (matches.length === 1) return matches[0]
  if (!matches.length) throw new Error(`No contact matches "${which}". On file: ${rows.map(c => c.name).join(', ') || 'none yet'}`)
  throw new Error(`"${which}" matches several contacts: ${matches.map(c => c.name).join(', ')}`)
}

export const CONTACT_TOOLS: ToolDef[] = [
  tool({
    name: 'list_contacts',
    title: 'Contacts',
    description: 'Owners: the people the business calls on (its lawyer, bank advisor, plumber, electrician, gestoría…): what each does, their company, phone (and whether they answer on WhatsApp), email, website and notes. `search` finds by name, what they do, company, email or a phone number\'s digits.',
    admin: true,
    readOnly: true,
    input: z.object({
      search: z.string().max(100).optional().describe('e.g. "plumber", "BBVA", "Eduardo"'),
    }),
    async run({ sb, me }, a) {
      needOwner(me)
      const rows = check(await sb.from('business_contacts').select(COLUMNS).order('name')) as Contact[]
      const found = sortContacts(rows.filter(c => matchesContact(c, a.search ?? '', english)), english)
      return { contacts: found.map(describe), ...(a.search && !found.length ? { note: `Nobody matches "${a.search}". On file: ${rows.map(c => c.name).join(', ') || 'none yet'}` } : {}) }
    },
  }),

  tool({
    name: 'save_contact',
    title: 'Add or change a contact',
    description: `Owners: add someone the business calls on (name needed), or change one found by \`contact\` (their name or id). The usual jobs (kept in English, shown in each person's language): ${USUAL_JOBS.join(', ')}; any other is fine in the business's own words. Phone numbers with their country code (+34 600 000 000; a 9-digit Spanish number is fine). Fields left out stay as they are; pass "" to clear one. Summarise what will change and get a yes before saving.`,
    admin: true,
    input: z.object({
      contact: z.string().optional().describe('The contact to change: their name (or part of it) or id. Leave out to add someone new.'),
      name: z.string().min(1).max(120).optional(),
      what_they_do: z.string().max(80).optional().describe('e.g. Lawyer, Bank advisor, Plumber & electrician'),
      company: z.string().max(120).optional().describe('Their firm or bank, e.g. BBVA'),
      phone: z.string().max(40).optional(),
      whatsapp: z.boolean().optional().describe('They answer on WhatsApp at that number'),
      email: z.string().max(254).optional(),
      website: z.string().max(300).optional(),
      notes: z.string().max(2000).optional(),
    }),
    async run({ sb, me }, a) {
      needOwner(me)
      const rows = check(await sb.from('business_contacts').select(COLUMNS).order('name')) as Contact[]
      const current = a.contact ? resolveContact(rows, a.contact) : null
      if (!current && !a.name) throw new Error('Someone new needs a name')
      if (!current) {
        const dup = rows.find(c => c.name.toLowerCase() === a.name!.trim().toLowerCase())
        if (dup) throw new Error(`"${dup.name}" is already on file: pass contact: "${dup.name}" to change them`)
      }
      const typed: Partial<ContactInput> = {
        name: a.name, job: a.what_they_do === undefined ? undefined : jobKey(a.what_they_do, english), company: a.company, phone: a.phone,
        whatsapp: a.whatsapp, email: a.email, website: a.website, notes: a.notes,
      }
      const changes = Object.fromEntries(Object.entries(typed).filter(([, v]) => v !== undefined)) as Partial<ContactInput>
      if (current && !Object.keys(changes).length) throw new Error('Nothing to change')
      // A phone typed without its country code is the business's country's (an Irish 087… is +353 87…).
      const { data: where } = await sb.from('business').select('country').maybeSingle()
      const country = (where as { country?: string } | null)?.country === 'IE' ? 'IE' : 'ES'
      const next = tidyContact({ ...current, ...changes, name: changes.name ?? current!.name }, country)
      const problem = contactProblem(next, country)
      if (problem) throw new Error(problem)
      const { id: _id, ...row } = next
      const id = current
        ? (check(await sb.from('business_contacts').update(row).eq('id', current.id)), current.id)
        : (check(await sb.from('business_contacts').insert(row).select('id').single()) as { id: string }).id
      const saved = (check(await sb.from('business_contacts').select(COLUMNS).eq('id', id)) as Contact[])[0]
      return { [current ? 'updated' : 'added']: describe(saved) }
    },
  }),
]
