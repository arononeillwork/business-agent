import { describe, expect, it } from 'vitest'
import { accessOf, mayMakeOwner, roleBlock, roleChange, teamRole, teamRoleLabel, teamRoleOf } from './teamRoles'
import type { Profile } from './types'

const person = (id: string, role: Profile['role'], can_see_pay = false, active = true): Profile =>
  ({ id, full_name: id, email: null, role, can_see_pay, colour: '#000', active, phone: null, birth_date: null })

const owner = person('aron', 'admin', true)
const manager = person('mark', 'admin')
const julio = person('julio', 'employee')
const team = [owner, manager, julio]

describe('team roles', () => {
  it('reads the role from the access the database keeps', () => {
    expect(teamRole(owner)).toBe('owner')
    expect(teamRole(manager)).toBe('manager')
    expect(teamRole(julio)).toBe('employee')
    // Pay access left over on an employee gives them nothing: the database only lets admins see pay.
    expect(teamRole(person('x', 'employee', true))).toBe('employee')
    expect(teamRole(person('tablet', 'kiosk'))).toBeNull()
    expect(teamRole(person('gestoria', 'partner'))).toBeNull()
    expect(teamRoleLabel(owner)).toBe('Owner')
    expect(teamRoleLabel(person('tablet', 'kiosk'))).toBeNull()
  })

  it('takes "boss", the owner’s old name, from older clients and AIs', () => {
    expect(teamRoleOf('owner')).toBe('owner')
    expect(teamRoleOf('boss')).toBe('owner')
    expect(teamRoleOf('manager')).toBe('manager')
    expect(teamRoleOf('ceo')).toBeNull()
    expect(teamRoleOf(undefined)).toBeNull()
  })

  it('stores each role as admin and pay access, saving only what changes', () => {
    expect(accessOf('owner')).toEqual({ role: 'admin', can_see_pay: true })
    expect(accessOf('manager')).toEqual({ role: 'admin', can_see_pay: false })
    expect(accessOf('employee')).toEqual({ role: 'employee', can_see_pay: false })
    expect(roleChange(julio, 'manager')).toEqual({ role: 'admin' })
    expect(roleChange(manager, 'owner')).toEqual({ can_see_pay: true })
    expect(roleChange(owner, 'employee')).toEqual({ role: 'employee', can_see_pay: false })
    expect(roleChange(julio, 'employee')).toEqual({})
  })

  it('lets only an owner make or change an owner', () => {
    expect(roleBlock(owner, manager, 'owner', team)).toBeNull()
    expect(roleBlock(manager, julio, 'manager', team)).toBeNull()
    expect(roleBlock(manager, julio, 'owner', team)).toBe('Only an owner can make someone an owner or change an owner’s role')
    expect(roleBlock(manager, owner, 'manager', team)).toBe('Only an owner can make someone an owner or change an owner’s role')
    expect(roleBlock(julio, julio, 'manager', team)).toBe('Only an owner or shop manager can change roles')
    expect(roleBlock(owner, person('tablet', 'kiosk'), 'employee', team)).toBe('Only team members have a role')
    expect(mayMakeOwner(manager, team)).toBe(false)
    // A business left without an owner can still get one.
    expect(mayMakeOwner(manager, [manager, julio, { ...owner, active: false }])).toBe(true)
  })

  it('keeps an admin on the team', () => {
    // An owner can hand over and step down; a business left without one can make another.
    expect(roleBlock(owner, owner, 'manager', team)).toBeNull()
    expect(roleBlock(owner, manager, 'employee', team)).toBeNull()
    expect(roleBlock(manager, manager, 'employee', [{ ...owner, active: false }, manager, julio])).toBe('At least one admin must remain')
  })
})
