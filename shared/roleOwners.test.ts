import { describe, expect, it } from 'vitest'
import { NOT_OWNED, buildLanes, dropTarget, laneOfRole, laneOwners, moveRole, ownerChanges, type RoleOwner } from './roleOwners'

const roles = [
  { id: 'barista', name: 'Barista', sort: 3 }, { id: 'chef', name: 'Chef', sort: 2 }, { id: 'people', name: 'Head of People', sort: 0 },
  { id: 'investor', name: 'Investor', sort: 1 }, { id: 'cleaner', name: 'Cleaner', sort: 4 },
]
const owned: RoleOwner[] = [
  { id: 'barista', owned_by: 'aron', owner_sort: 1 }, { id: 'people', owned_by: 'aron', owner_sort: 0 },
  { id: 'investor', owned_by: 'mark', owner_sort: 0 }, { id: 'chef', owned_by: 'gone', owner_sort: 0 }, { id: 'cleaner', owned_by: null, owner_sort: 0 },
]
const lanes = buildLanes(roles, owned, ['aron', 'mark'])

describe('who owns each role', () => {
  it('gives each owner a lane, after the roles nobody owns, in the order they were put in', () => {
    expect(lanes).toEqual([
      // Chef's owner has no lane any more (no longer an owner): not owned.
      { id: NOT_OWNED, roles: ['chef', 'cleaner'] },
      { id: 'aron', roles: ['people', 'barista'] },
      { id: 'mark', roles: ['investor'] },
    ])
    expect(laneOfRole(lanes, 'investor')).toBe('mark')
    expect(buildLanes(roles, [], [])).toEqual([{ id: NOT_OWNED, roles: ['people', 'investor', 'chef', 'barista', 'cleaner'] }])
  })

  it('lanes for the active owners only, less a login kept off People', () => {
    const p = (id: string, role: 'admin' | 'employee', can_see_pay: boolean, more = {}) => ({ id, role, can_see_pay, active: true, ...more })
    expect(laneOwners([p('aron', 'admin', true), p('mark', 'admin', true), p('manager', 'admin', false), p('maria', 'employee', false),
      p('old', 'admin', true, { active: false }), p('till', 'admin', true, { on_people: false })]).map(x => x.id)).toEqual(['aron', 'mark'])
  })

  it('moves a role to another lane or along its own, and saves only what changed', () => {
    const next = moveRole(lanes, 'barista', 'mark', 0)
    expect(next.map(l => l.roles)).toEqual([['chef', 'cleaner'], ['people'], ['barista', 'investor']])
    expect(ownerChanges(next, owned, ['aron', 'mark'])).toEqual([
      { id: 'barista', owned_by: 'mark', owner_sort: 0 }, { id: 'investor', owned_by: 'mark', owner_sort: 1 },
    ])
    // To the end of a lane when no place is given; back to not owned.
    const away = moveRole(lanes, 'people', NOT_OWNED)
    expect(away[0].roles).toEqual(['chef', 'cleaner', 'people'])
    expect(ownerChanges(away, owned, ['aron', NOT_OWNED])).toEqual([
      // Chef shows as not owned, so moving into that lane leaves it not owned for good.
      { id: 'chef', owned_by: null, owner_sort: 0 }, { id: 'cleaner', owned_by: null, owner_sort: 1 },
      { id: 'people', owned_by: null, owner_sort: 2 }, { id: 'barista', owned_by: 'aron', owner_sort: 0 },
    ])
    expect(ownerChanges(lanes, owned, ['aron', 'mark'])).toEqual([])
  })

  it('works out where a dragged role lands', () => {
    // Over a role in another lane: in its place; over the lane itself: at the end.
    expect(dropTarget(lanes, 'cleaner', { role: 'barista' })).toEqual({ lane: 'aron', at: 1 })
    expect(dropTarget(lanes, 'cleaner', { lane: 'mark' })).toEqual({ lane: 'mark', at: 1 })
    // Along its own lane: down goes after the one it's over, up before it.
    expect(dropTarget(lanes, 'people', { role: 'barista' })).toEqual({ lane: 'aron', at: 1 })
    expect(dropTarget(lanes, 'barista', { role: 'people' })).toEqual({ lane: 'aron', at: 0 })
    // Where it already is: nothing to do.
    expect(dropTarget(lanes, 'barista', { role: 'barista' })).toBeNull()
    expect(dropTarget(lanes, 'barista', { lane: 'aron' })).toBeNull()
    expect(dropTarget(lanes, 'nope', { lane: 'aron' })).toBeNull()
  })
})
