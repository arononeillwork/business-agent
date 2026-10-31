// The People page: the team as a hierarchy, the owners at the top, then the shop managers, then the
// employees, each with the roles they hold on Roles & responsibilities.
import { sortRoles, type JobRole } from './roles'
import { TEAM_ROLES, teamRole, type TeamRole } from './teamRoles'
import type { Profile } from './types'

export interface Tier { role: TeamRole; label: string; plural: string; people: Profile[] }

/** Who's on the team now, top of the hierarchy first; a level with nobody in it is left out. */
export function teamTiers(profiles: Profile[]): Tier[] {
  const on = profiles.filter(p => p.active && teamRole(p) !== null)
  return [...TEAM_ROLES].reverse().map(r => ({
    role: r.id, label: r.label, plural: r.plural,
    people: on.filter(p => teamRole(p) === r.id).sort((a, b) => a.full_name.localeCompare(b.full_name)),
  })).filter(t => t.people.length)
}

/** The names of the roles each person holds, in the roles' order. */
export function jobRolesByPerson(roles: Pick<JobRole, 'name' | 'sort' | 'people'>[]): Map<string, string[]> {
  const by = new Map<string, string[]>()
  for (const r of sortRoles(roles)) for (const id of r.people) by.set(id, [...(by.get(id) ?? []), r.name])
  return by
}
