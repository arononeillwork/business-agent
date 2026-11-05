// The demo's contacts: Easy Beans' lawyer, bank advisor and plumber & electrician. Mirrors the
// `business_contacts` migration's rule: only the owners (admins with pay access) see and change them.
import type { Api } from './api'
import { EASY_BEANS_CONTACTS, contactProblem, tidyContact, type Contact } from '../../shared/contacts'

interface Who { isOwner: () => boolean; uid: () => string }

type ContactsApi = Pick<Api, 'contacts' | 'saveContact' | 'deleteContact'>

const RLS = 'new row violates row-level security policy for table "business_contacts"'

export function demoContactsApi(w: Who): ContactsApi {
  const rows: Contact[] = EASY_BEANS_CONTACTS.map((c, i) => ({ id: `contact-${i + 1}`, ...c }))

  return {
    async contacts() { return w.isOwner() ? structuredClone(rows) : [] },
    async saveContact({ id, ...input }) {
      if (!w.isOwner()) throw new Error(RLS)
      const was = id ? rows.find(c => c.id === id) : undefined
      if (id && !was) throw new Error('That isn’t here any more')
      const next: Contact = tidyContact({
        id: was?.id ?? w.uid(), job: null, company: null, phone: null, whatsapp: false, email: null, website: null, notes: null,
        ...was, ...input,
      })
      const problem = contactProblem(next)
      if (problem) throw new Error(problem)
      if (was) Object.assign(was, next)
      else rows.push(next)
      return next.id
    },
    async deleteContact(id) {
      const i = rows.findIndex(c => c.id === id)
      if (w.isOwner() && i >= 0) rows.splice(i, 1)
    },
  }
}
