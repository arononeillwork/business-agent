// Each person's own Square login. In Square, everyone who takes payments is a team member with their
// own passcode, and each payment says which team member took it. Linking a person here to their Square
// team member is how the Leaderboard knows who sold what. An admin links them on the person's Team panel
// (or lets the app match them by email, then by name), or adds someone to Square from there.
// Square doesn't let apps set a passcode (or permissions): the owner sets them in the Square Dashboard
// (Staff → Team), and Square then sends the person the invitation to sign in.
import { msg } from './i18n'

/** A Square team member, as the app shows one. */
export interface SquareMember {
  id: string
  name: string
  email: string | null
  phone: string | null
  is_owner: boolean
  active: boolean
}

/** A person here linked to their Square team member (square_team_links). */
export interface SquareLink {
  profile_id: string
  team_member_id: string
  /** The app added them to Square (Add to Square), as opposed to linking someone already there. */
  created_in_square: boolean
}

export type SquareTeamStatus = 'ok' | 'not_connected' | 'reconnect'
export interface SquareTeam {
  status: SquareTeamStatus
  members: SquareMember[]
  links: SquareLink[]
}

/** Where the owner sets someone's Square passcode: the Square Dashboard, never the app. */
export const PASSCODE_HELP = msg('Their passcode (the PIN they sign in to Square Point of Sale with) is set in the Square Dashboard: Staff → Team → their name. Square then sends them an invitation.')
/** A Square connection made before team members were asked for. */
export const RECONNECT_TEAM = msg('Connect Square again to allow team members: Connections → Square → Connect again.')

const plain = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const emailOf = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/**
 * Who to link to whom, for the people not linked yet: the Square team member with the same email first;
 * otherwise the one with the same name (accents, case and spacing aside), when exactly one person and one
 * team member have it. Team members already linked, and ones switched off in Square, aren't offered.
 */
export function suggestLinks(people: { id: string; full_name: string; email: string | null }[], members: SquareMember[], links: Pick<SquareLink, 'profile_id' | 'team_member_id'>[]) {
  const linkedPeople = new Set(links.map(l => l.profile_id)), taken = new Set(links.map(l => l.team_member_id))
  const open = members.filter(m => m.active && !taken.has(m.id))
  const out: { profile_id: string; team_member_id: string; by: 'email' | 'name' }[] = []
  const waiting = people.filter(p => !linkedPeople.has(p.id))
  for (const p of waiting) {
    const e = emailOf(p.email)
    const m = e ? open.find(x => !taken.has(x.id) && emailOf(x.email) === e) : undefined
    if (m) { out.push({ profile_id: p.id, team_member_id: m.id, by: 'email' }); taken.add(m.id) }
  }
  for (const p of waiting.filter(p => !out.some(o => o.profile_id === p.id))) {
    const n = plain(p.full_name)
    if (!n) continue
    const same = open.filter(x => !taken.has(x.id) && plain(x.name) === n)
    const twins = waiting.filter(q => plain(q.full_name) === n)
    if (same.length === 1 && twins.length === 1) { out.push({ profile_id: p.id, team_member_id: same[0].id, by: 'name' }); taken.add(same[0].id) }
  }
  return out
}

/** A full name as Square keeps it: the first word given, the rest family ("Maria" alone has no family name). */
export function splitName(full: string): { given_name: string; family_name?: string } {
  const words = full.trim().split(/\s+/).filter(Boolean)
  const [given = '', ...rest] = words
  return rest.length ? { given_name: given, family_name: rest.join(' ') } : { given_name: given }
}

/** A phone number as Square takes it (E.164, "+34600111222"); null when it isn't one. */
export function squarePhone(phone: string | null | undefined): string | null {
  const p = (phone ?? '').replace(/[\s().-]/g, '')
  return /^\+[1-9]\d{6,14}$/.test(p) ? p : null
}

/** What stops this person being added to Square (null: nothing). */
export function addProblem(person: { full_name: string; role: string; active: boolean }, linked: boolean): string | null {
  if (linked) return msg('They’re linked to a Square login already')
  if (!person.active) return msg('Switch them on first')
  if (person.role !== 'admin' && person.role !== 'employee') return msg('Only people on the team can have a Square login')
  if (!person.full_name.trim()) return msg('Give them a name first')
  return null
}
