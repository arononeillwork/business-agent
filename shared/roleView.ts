// Seeing the app as a role: from the Agents button (its Roles tab), an owner looks at the app the way
// someone in one of the business's roles (Roles & responsibilities: the owner, the shop manager, a
// barista…) sees it: the pages their access and their role's permissions open, and those pages as they
// show to them (a barista sees nobody's pay). It's kept like the agent they view as (preferences.agentView),
// as "role:" and the role's id.
import { fullAccess, hiddenByRole, tidyPermissions, type JobRole, type RoleArea, type RoleLevel } from './roles'
import { teamRole, type TeamRole } from './teamRoles'
import type { Profile } from './types'

const PREFIX = 'role:'
/** What's kept for viewing as a role. */
export const roleViewKey = (roleId: string) => `${PREFIX}${roleId}`
/** The role a kept view is of; null for an agent's or none. */
export const roleViewId = (key: string | null | undefined) => (key?.startsWith(PREFIX) ? key.slice(PREFIX.length) : null)

const RANK: Record<TeamRole, number> = { employee: 0, manager: 1, owner: 2 }

/**
 * The access someone in the role has: a ready-made owner or manager role is what it says; any other,
 * what everyone in it has (the least among them); a role nobody is in yet, an employee's.
 */
export function roleAccess(role: Pick<JobRole, 'template' | 'people'>, team: Pick<Profile, 'id' | 'role' | 'can_see_pay' | 'active'>[]): TeamRole {
  const kind = role.template?.split('.').pop()
  if (kind === 'owner') return 'owner'
  if (kind === 'manager' || kind === 'shop-manager') return 'manager'
  const theirs = team.filter(p => p.active && role.people.includes(p.id)).map(teamRole).filter((r): r is TeamRole => !!r)
  return theirs.length ? theirs.reduce((a, b) => (RANK[b] < RANK[a] ? b : a)) : 'employee'
}

/** Who someone in the role is to the app: their access and what the role lets them do in each area. */
export interface RoleViewer {
  access: TeamRole
  isAdmin: boolean
  canSeePay: boolean
  permissions: Record<RoleArea, RoleLevel>
}

export function roleViewer(role: Pick<JobRole, 'template' | 'people' | 'permissions'>, team: Pick<Profile, 'id' | 'role' | 'can_see_pay' | 'active'>[]): RoleViewer {
  const access = roleAccess(role, team)
  // Admins can do everything; an employee what their role gives (as permissionsOf works it out).
  const permissions = access === 'employee' ? tidyPermissions(role.permissions) : fullAccess()
  return { access, isAdmin: access !== 'employee', canSeePay: access === 'owner', permissions }
}

type Page = { key: string; who?: 'admin' | 'pay' }
type MenuSection = { key: string; items: (Page & { children?: Page[] })[] }

/** Whether someone in the role can open the page: their access, and their role's permissions. */
export const roleOpens = (page: Page, viewer: RoleViewer) =>
  (!page.who || (page.who === 'admin' ? viewer.isAdmin : viewer.canSeePay)) && !hiddenByRole(viewer.permissions).includes(page.key)

/** Menu pages left out while viewing as the role: every one they couldn't open, Settings' too (the line at the top is the way back). */
export function hiddenByRoleView(viewer: RoleViewer | null, sections: MenuSection[]): string[] {
  if (!viewer) return []
  return sections.flatMap(s => s.items.flatMap(n => [n, ...(n.children ?? [])])).filter(n => !roleOpens(n, viewer)).map(n => n.key)
}
