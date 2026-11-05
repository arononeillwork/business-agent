import { describe, expect, it } from 'vitest'
import { addProblem, splitName, squarePhone, suggestLinks, type SquareMember } from './squareTeam'

const member = (id: string, name: string, email: string | null = null, p: Partial<SquareMember> = {}): SquareMember =>
  ({ id, name, email, phone: null, is_owner: false, active: true, ...p })

describe('matching people to their Square team members', () => {
  const members = [
    member('TM1', "Aron O'Neill", 'Aron@Example.com'),
    member('TM2', 'María', null),
    member('TM3', 'Julio Pérez', 'julio.square@example.com'),
    member('TM4', 'Sofía', 'sofia@example.com', { active: false }),
    member('TM5', 'Mark Murray', 'mark@example.com'),
  ]

  it('the same email first (any case), then the same name (accents and case aside)', () => {
    const people = [
      { id: 'aron', full_name: 'Aron', email: ' aron@example.com ' },
      { id: 'maria', full_name: 'maria', email: 'maria@example.com' },
      { id: 'julio', full_name: 'Julio', email: 'julio@example.com' },
    ]
    expect(suggestLinks(people, members, [])).toEqual([
      { profile_id: 'aron', team_member_id: 'TM1', by: 'email' },
      { profile_id: 'maria', team_member_id: 'TM2', by: 'name' },
    ])
  })

  it('leaves out people already linked, team members already taken and ones switched off in Square', () => {
    const people = [{ id: 'mark', full_name: 'Mark Murray', email: 'mark@example.com' }, { id: 'sofia', full_name: 'Sofía', email: 'sofia@example.com' }]
    expect(suggestLinks(people, members, [{ profile_id: 'mark', team_member_id: 'TM9' }])).toEqual([])
    expect(suggestLinks([{ id: 'x', full_name: 'Someone', email: 'mark@example.com' }], members, [{ profile_id: 'mark', team_member_id: 'TM5' }])).toEqual([])
  })

  it('never guesses between two people, or two team members, with the same name', () => {
    expect(suggestLinks([{ id: 'a', full_name: 'Ana', email: null }, { id: 'b', full_name: 'Ana', email: null }], [member('T', 'Ana')], [])).toEqual([])
    expect(suggestLinks([{ id: 'a', full_name: 'Ana', email: null }], [member('T1', 'Ana'), member('T2', 'ANA')], [])).toEqual([])
  })

  it('one team member is only ever matched to one person', () => {
    const people = [{ id: 'a', full_name: 'Ana', email: 'ana@example.com' }, { id: 'b', full_name: 'Ana Ruiz', email: 'ana@example.com' }]
    expect(suggestLinks(people, [member('T', 'Ana', 'ana@example.com')], [])).toEqual([{ profile_id: 'a', team_member_id: 'T', by: 'email' }])
  })
})

describe('adding someone to Square', () => {
  it('splits the name as Square keeps it', () => {
    expect(splitName("Aron O'Neill")).toEqual({ given_name: 'Aron', family_name: "O'Neill" })
    expect(splitName('  María José  García López ')).toEqual({ given_name: 'María', family_name: 'José García López' })
    expect(splitName('Julio')).toEqual({ given_name: 'Julio' })
  })

  it('gives Square a phone number only when it is a whole one with its country code', () => {
    expect(squarePhone('+34 600 111 222')).toBe('+34600111222')
    expect(squarePhone('600 111 222')).toBeNull()
    expect(squarePhone(null)).toBeNull()
  })

  it('only someone active on the team, not linked yet, with a name', () => {
    const p = { full_name: 'Ana', role: 'employee', active: true }
    expect(addProblem(p, false)).toBeNull()
    expect(addProblem({ ...p, role: 'admin' }, false)).toBeNull()
    expect(addProblem(p, true)).toMatch(/linked to a Square login already/)
    expect(addProblem({ ...p, active: false }, false)).toMatch(/Switch them on/)
    expect(addProblem({ ...p, role: 'partner' }, false)).toMatch(/Only people on the team/)
    expect(addProblem({ ...p, full_name: ' ' }, false)).toMatch(/name/)
  })
})
