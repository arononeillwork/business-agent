import { describe, expect, it } from 'vitest'
import { accessOf, mayMakeBoss, roleBlock, roleChange, teamRole, teamRoleLabel } from './teamRoles'
import type { Profile } from './types'

const person = (id: string, role: Profile['role'], can_see_pay = false, active = true): Profile =>
  ({ id, full_name: id, email: null, role, can_see_pay, colour: '#000', active, phone: null, birth_date: null })

const boss = person('aron', 'admin', true)
const manager = person('mark', 'admin')
const julio = person('julio', 'employee')
const team = [boss, manager, julio]

describe('team roles', () => {
  it('reads the role from the access the database keeps', () => {
    expect(teamRole(boss)).toBe('boss')
    expect(teamRole(manager)).toBe('manager')
    expect(teamRole(julio)).toBe('employee')
    // Pay access left over on an employee gives them nothing: the database only lets admins see pay.
    expect(teamRole(person('x', 'employee', true))).toBe('employee')
    expect(teamRole(person('tablet', 'kiosk'))).toBeNull()
    expect(teamRole(person('gestoria', 'partner'))).toBeNull()
    expect(teamRoleLabel(boss)).toBe('Boss / CEO')
    expect(teamRoleLabel(person('tablet', 'kiosk'))).toBeNull()
  })

  it('stores each role as admin and pay access, saving only what changes', () => {
    expect(accessOf('boss')).toEqual({ role: 'admin', can_see_pay: true })
    expect(accessOf('manager')).toEqual({ role: 'admin', can_see_pay: false })
    expect(accessOf('employee')).toEqual({ role: 'employee', can_see_pay: false })
    expect(roleChange(julio, 'manager')).toEqual({ role: 'admin' })
    expect(roleChange(manager, 'boss')).toEqual({ can_see_pay: true })
    expect(roleChange(boss, 'employee')).toEqual({ role: 'employee', can_see_pay: false })
    expect(roleChange(julio, 'employee')).toEqual({})
  })

  it('lets only a boss make or change a boss', () => {
    expect(roleBlock(boss, manager, 'boss', team)).toBeNull()
    expect(roleBlock(manager, julio, 'manager', team)).toBeNull()
    expect(roleBlock(manager, julio, 'boss', team)).toBe('Only a boss can make someone a boss or change a boss’s role')
    expect(roleBlock(manager, boss, 'manager', team)).toBe('Only a boss can make someone a boss or change a boss’s role')
    expect(roleBlock(julio, julio, 'manager', team)).toBe('Only a boss or shop manager can change roles')
    expect(roleBlock(boss, person('tablet', 'kiosk'), 'employee', team)).toBe('Only team members have a role')
    expect(mayMakeBoss(manager, team)).toBe(false)
    // A business left without a boss can still get one.
    expect(mayMakeBoss(manager, [manager, julio, { ...boss, active: false }])).toBe(true)
  })

  it('keeps an admin on the team', () => {
    // A boss can hand over and step down; a business left without one can make another.
    expect(roleBlock(boss, boss, 'manager', team)).toBeNull()
    expect(roleBlock(boss, manager, 'employee', team)).toBeNull()
    expect(roleBlock(manager, manager, 'employee', [{ ...boss, active: false }, manager, julio])).toBe('At least one admin must remain')
  })
})
