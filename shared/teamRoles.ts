// The three roles a team member can have: employee, shop manager and boss (the CEO or owner). Each is
// stored as the access the database already checks everywhere, so nothing else needs to know about
// them: a boss is an admin who sees pay and finances, a shop manager an admin who doesn't. Only a
// boss makes someone a boss or changes a boss; the database refuses anyone else (the `team_roles`
// migration), and the app and the AI connector say so first.
import { msg } from './i18n'
import type { Profile } from './types'

export type TeamRole = 'employee' | 'manager' | 'boss'

export const TEAM_ROLES: { id: TeamRole; label: string; plural: string; summary: string }[] = [
  { id: 'employee', label: msg('Employee'), plural: msg('Employees'),
    summary: msg('Their own shifts, clock-ins, time off and expenses, and what the whole team shares.') },
  { id: 'manager', label: msg('Shop manager'), plural: msg('Shop managers'),
    summary: msg('Runs the shop: the rota, timecards, time off, stock, the team and the business’s settings. Doesn’t see pay, takings, finances or billing.') },
  { id: 'boss', label: msg('Boss / CEO'), plural: msg('Bosses'),
    summary: msg('Everything a shop manager does, plus pay, takings, finances and billing, and who else is a boss.') },
]
export const TEAM_ROLE_IDS = TEAM_ROLES.map(r => r.id)

type Access = Pick<Profile, 'role' | 'can_see_pay'>

/** Someone's role on the team; null for the café tablet and partners, who aren't team members. */
export function teamRole(p: Access): TeamRole | null {
  if (p.role === 'admin') return p.can_see_pay ? 'boss' : 'manager'
  return p.role === 'employee' ? 'employee' : null
}

export const teamRoleLabel = (p: Access) => TEAM_ROLES.find(r => r.id === teamRole(p))?.label ?? null

/** The access a role is stored as. */
export const accessOf = (r: TeamRole): { role: 'admin' | 'employee'; can_see_pay: boolean } =>
  r === 'employee' ? { role: 'employee', can_see_pay: false } : { role: 'admin', can_see_pay: r === 'boss' }

/** What to save to give someone a role: only the fields that change. */
export function roleChange(p: Access, r: TeamRole): Partial<Access> {
  const next = accessOf(r)
  return { ...(next.role !== p.role ? { role: next.role } : {}), ...(next.can_see_pay !== p.can_see_pay ? { can_see_pay: next.can_see_pay } : {}) }
}

const isBoss = (p: Pick<Profile, 'role' | 'can_see_pay' | 'active'>) => p.active && teamRole(p) === 'boss'

/** Whether `me` may make someone a boss: a boss, or any admin while the business has no boss at all. */
export const mayMakeBoss = (me: Profile, team: Profile[]) =>
  me.role === 'admin' && me.active && (isBoss(me) || !team.some(isBoss))

/** Why `me` can't give `target` the role `to`, or null when they can. The database checks the same. */
export function roleBlock(me: Profile, target: Profile, to: TeamRole, team: Profile[]): string | null {
  if (me.role !== 'admin' || !me.active) return msg('Only a boss or shop manager can change roles')
  if (teamRole(target) === null) return msg('Only team members have a role')
  const was = teamRole(target)
  if (was === to) return null
  if ((was === 'boss' || to === 'boss') && !mayMakeBoss(me, team)) return msg('Only a boss can make someone a boss or change a boss’s role')
  if (was !== 'employee' && to === 'employee' && target.active && !team.some(p => p.id !== target.id && p.role === 'admin' && p.active)) {
    return msg('At least one admin must remain')
  }
  return null
}
