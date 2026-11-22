// Roles and staff rules as they're shown: a role's name, what it's for and its duties, and a section of
// rules, in the app's language when the app knows them in both (a ready-made role, or a business's own
// roles and rules that come with their Spanish: tk() in src/i18n). They're saved as written; only the
// screen changes with the language, so editing one starts from what was saved.
import type { JobRole } from '../../shared/roles'
import { tk } from '../i18n'

export const shownRole = <R extends Pick<JobRole, 'name' | 'summary' | 'duties'>>(r: R): R =>
  ({ ...r, name: tk(r.name), summary: r.summary && tk(r.summary), duties: r.duties.map(d => ({ ...d, text: tk(d.text) })) })

/** A role's name as shown. */
export const shownRoleName = (name: string) => tk(name)

/** A section of staff rules as shown. */
export const shownSection = <S extends { title: string; intro?: string | null; rules: string[] }>(s: S): S =>
  ({ ...s, title: tk(s.title), intro: s.intro && tk(s.intro), rules: s.rules.map(tk) })
