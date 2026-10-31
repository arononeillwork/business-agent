// Who owns each role (Roles & responsibilities → Ownership, owners only): the owners share the business's
// roles between them, a lane each, plus one for the roles nobody owns yet. A role is dragged from lane
// to lane or within one (or moved from its Owner menu), and keeps its owner and its place in the lane
// (job_roles.owned_by and owner_sort: the `role_owners` migration, which lets only an owner change them
// and only to an active owner of the business).
import { sortRoles, type JobRole } from './roles'
import { teamRole } from './teamRoles'
import type { Profile } from './types'

/** A role's owner (null: not owned yet) and its place in their lane. */
export interface RoleOwner { id: string; owned_by: string | null; owner_sort: number }

/** The lane of the roles nobody owns yet; the others are the owners' ids. */
export const NOT_OWNED = 'not-owned'

/** A lane and its roles (ids), in order. */
export interface Lane { id: string; roles: string[] }

/** The people with a lane: the team's active owners, less a login the business keeps off People (a shared one). */
export const laneOwners = <P extends Pick<Profile, 'role' | 'can_see_pay' | 'active' | 'on_people'>>(profiles: P[]) =>
  profiles.filter(p => p.active && teamRole(p) === 'owner' && p.on_people !== false)

/**
 * The lanes: not owned yet first, then each owner's. Each lane has its roles in the order they were put
 * in, then in the roles' own order; a role whose owner has no lane (no longer an owner) is not owned.
 */
export function buildLanes(roles: Pick<JobRole, 'id' | 'name' | 'sort'>[], owners: RoleOwner[], ownerIds: string[]): Lane[] {
  const of = new Map(owners.map(o => [o.id, o]))
  const laneOf = (id: string) => { const by = of.get(id)?.owned_by; return by && ownerIds.includes(by) ? by : NOT_OWNED }
  const place = (id: string) => of.get(id)?.owner_sort ?? 0
  const ordered = sortRoles(roles)
  return [NOT_OWNED, ...ownerIds].map(lane => ({
    id: lane, roles: ordered.filter(r => laneOf(r.id) === lane).sort((a, b) => place(a.id) - place(b.id)).map(r => r.id),
  }))
}

/** The lanes with a role moved to a lane, at a place in it (its end unless given). */
export function moveRole(lanes: Lane[], roleId: string, toLane: string, at?: number): Lane[] {
  return lanes.map(l => {
    const rest = l.roles.filter(r => r !== roleId)
    if (l.id !== toLane) return { ...l, roles: rest }
    const i = Math.min(Math.max(at ?? rest.length, 0), rest.length)
    return { ...l, roles: [...rest.slice(0, i), roleId, ...rest.slice(i)] }
  })
}

/**
 * Where a role dragged over a lane (its empty space) or over another role lands: the lane and its place
 * there; null when it would stay where it is. Over a role further down its own lane, it goes after it.
 */
export function dropTarget(lanes: Lane[], roleId: string, over: { lane: string } | { role: string }): { lane: string; at: number } | null {
  const from = lanes.find(l => l.roles.includes(roleId))
  if (!from) return null
  const to = 'lane' in over ? lanes.find(l => l.id === over.lane) : lanes.find(l => l.roles.includes(over.role))
  if (!to) return null
  const rest = to.roles.filter(r => r !== roleId)
  let at = rest.length
  if ('role' in over) {
    if (over.role === roleId) return null
    const down = from === to && from.roles.indexOf(roleId) < from.roles.indexOf(over.role)
    at = rest.indexOf(over.role) + (down ? 1 : 0)
  }
  if (from === to && from.roles.indexOf(roleId) === at) return null
  return { lane: to.id, at }
}

/** What to save after a move: the roles in these lanes whose owner or place changed. */
export function ownerChanges(lanes: Lane[], before: RoleOwner[], touched: string[]): RoleOwner[] {
  const was = new Map(before.map(o => [o.id, o]))
  return lanes.filter(l => touched.includes(l.id))
    .flatMap(l => l.roles.map((id, i): RoleOwner => ({ id, owned_by: l.id === NOT_OWNED ? null : l.id, owner_sort: i })))
    .filter(n => { const b = was.get(n.id); return !b || (b.owned_by ?? null) !== n.owned_by || b.owner_sort !== n.owner_sort })
}

/** The lane a role is in. */
export const laneOfRole = (lanes: Lane[], roleId: string) => lanes.find(l => l.roles.includes(roleId))?.id ?? NOT_OWNED
