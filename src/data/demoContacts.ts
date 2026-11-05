// The demo's contacts: Easy Beans' lawyer, bank advisor and plumber & electrician. Mirrors the
// `business_contacts` migration's rules: each says who sees it, admins change the ones they see, and only
// an owner makes one owners-only.
import type { Api } from './api'
import { EASY_BEANS_CONTACTS, contactProblem, seesContact, tidyContact, type Contact } from '../../shared/contacts'

interface Who { isStaff: () => boolean; isAdmin: () => boolean; canSeePay: () => boolean; uid: () => string }

type ContactsApi = Pick<Api, 'contacts' | 'saveContact' | 'deleteContact'>

const RLS = 'new row violates row-level security policy for table "business_contacts"'

export function demoContactsApi(w: Who): ContactsApi {
  const rows: Contact[] = EASY_BEANS_CONTACTS.map((c, i) => ({ id: `contact-${i + 1}`, ...c }))
  const sees = (c: Pick<Contact, 'seen_by'>) => seesContact(c.seen_by, { isStaff: w.isStaff(), isAdmin: w.isAdmin(), canSeePay: w.canSeePay() })
  const mayChange = (c: Pick<Contact, 'seen_by'>) => w.isAdmin() && sees(c)

  return {
    async contacts() { return structuredClone(rows.filter(sees)) },
    async saveContact({ id, ...input }) {
      const was = id ? rows.find(c => c.id === id && sees(c)) : undefined
      if (id && !was) throw new Error('That isn’t here any more')
      const next: Contact = tidyContact({
        id: was?.id ?? w.uid(), job: null, company: null, phone: null, whatsapp: false, email: null, website: null, notes: null, seen_by: 'team',
        ...was, ...input,
      })
      if (!mayChange(next) || (was && !mayChange(was))) throw new Error(RLS)
      const problem = contactProblem(next)
      if (problem) throw new Error(problem)
      if (was) Object.assign(was, next)
      else rows.push(next)
      return next.id
    },
    async deleteContact(id) {
      const i = rows.findIndex(c => c.id === id && mayChange(c))
      if (i >= 0) rows.splice(i, 1)
    },
  }
}
