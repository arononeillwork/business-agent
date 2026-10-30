// The three roles a team member can have: employee, shop manager and owner. Each is stored as the
// access the database already checks everywhere, so nothing else needs to know about them: an owner
// is an admin who sees pay and finances, a shop manager an admin who doesn't. Only an owner makes
// someone an owner or changes an owner; the database refuses anyone else (the `team_roles` and
// `owner_role` migrations), and the app and the AI connector say so first.
import { msg } from './i18n'
import type { Profile } from './types'

export type TeamRole = 'employee' | 'manager' | 'owner'

export const TEAM_ROLES: { id: TeamRole; label: string; plural: string; summary: string }[] = [
  { id: 'employee', label: msg('Employee'), plural: msg('Employees'),
    summary: msg('Their own shifts, clock-ins, time off and expenses, and what the whole team shares.') },
  { id: 'manager', label: msg('Shop manager'), plural: msg('Shop managers'),
    summary: msg('Runs the shop: the rota, timecards, time off, stock, the team and the business’s settings. Doesn’t see pay, takings, finances or billing.') },
  { id: 'owner', label: msg('Owner'), plural: msg('Owners'),
    summary: msg('Everything a shop manager does, plus pay, takings, finances and billing, and who else is an owner.') },
]
export const TEAM_ROLE_IDS = TEAM_ROLES.map(r => r.id)

/** A role as asked for, from the app, the AI connector or an older client: "boss" was the owner's name before. */
export const teamRoleOf = (s: string | null | undefined): TeamRole | null =>
  s === 'boss' ? 'owner' : TEAM_ROLE_IDS.find(r => r === s) ?? null

type Access = Pick<Profile, 'role' | 'can_see_pay'>

/** Someone's role on the team; null for the café tablet and partners, who aren't team members. */
export function teamRole(p: Access): TeamRole | null {
  if (p.role === 'admin') return p.can_see_pay ? 'owner' : 'manager'
  return p.role === 'employee' ? 'employee' : null
}

export const teamRoleLabel = (p: Access) => TEAM_ROLES.find(r => r.id === teamRole(p))?.label ?? null

/** The access a role is stored as. */
export const accessOf = (r: TeamRole): { role: 'admin' | 'employee'; can_see_pay: boolean } =>
  r === 'employee' ? { role: 'employee', can_see_pay: false } : { role: 'admin', can_see_pay: r === 'owner' }

/** What to save to give someone a role: only the fields that change. */
export function roleChange(p: Access, r: TeamRole): Partial<Access> {
  const next = accessOf(r)
  return { ...(next.role !== p.role ? { role: next.role } : {}), ...(next.can_see_pay !== p.can_see_pay ? { can_see_pay: next.can_see_pay } : {}) }
}

const isOwner = (p: Pick<Profile, 'role' | 'can_see_pay' | 'active'>) => p.active && teamRole(p) === 'owner'

/** Whether `me` may make someone an owner: an owner, or any admin while the business has no owner at all. */
export const mayMakeOwner = (me: Profile, team: Profile[]) =>
  me.role === 'admin' && me.active && (isOwner(me) || !team.some(isOwner))

/** Why `me` can't give `target` the role `to`, or null when they can. The database checks the same. */
export function roleBlock(me: Profile, target: Profile, to: TeamRole, team: Profile[]): string | null {
  if (me.role !== 'admin' || !me.active) return msg('Only an owner or shop manager can change roles')
  if (teamRole(target) === null) return msg('Only team members have a role')
  const was = teamRole(target)
  if (was === to) return null
  if ((was === 'owner' || to === 'owner') && !mayMakeOwner(me, team)) return msg('Only an owner can make someone an owner or change an owner’s role')
  if (was !== 'employee' && to === 'employee' && target.active && !team.some(p => p.id !== target.id && p.role === 'admin' && p.active)) {
    return msg('At least one admin must remain')
  }
  return null
}
