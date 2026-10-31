import { describe, expect, it } from 'vitest'
import { jobRolesByPerson, teamTiers } from './people'
import { petProblem, petsByPerson, type Pet } from './pets'
import type { Profile } from './types'

const person = (id: string, role: Profile['role'], can_see_pay = false, active = true): Profile =>
  ({ id, full_name: id, email: null, role, can_see_pay, colour: '#000', active, phone: null, birth_date: null })

describe('people', () => {
  it('puts the team in a hierarchy: owners, shop managers, then employees', () => {
    const tiers = teamTiers([person('Maria', 'employee'), person('Aron', 'admin', true), person('Julio', 'employee'),
      person('Mark', 'admin', true), person('Tablet', 'kiosk'), person('Laura', 'partner'), person('Gone', 'employee', false, false)])
    expect(tiers.map(t => [t.role, t.people.map(p => p.full_name)])).toEqual([
      ['owner', ['Aron', 'Mark']],
      ['employee', ['Julio', 'Maria']],
    ])
    expect(tiers[0].plural).toBe('Owners')
  })

  it('lists the roles each person holds, in the roles’ order', () => {
    const by = jobRolesByPerson([
      { name: 'Barista', sort: 2, people: ['julio', 'maria'] },
      { name: 'Shift lead', sort: 1, people: ['maria'] },
    ])
    expect(by.get('maria')).toEqual(['Shift lead', 'Barista'])
    expect(by.get('julio')).toEqual(['Barista'])
    expect(by.get('aron')).toBeUndefined()
  })
})

describe('pets', () => {
  const pet = (name: string, profile_id: string, sort: number): Pet =>
    ({ id: name, profile_id, name, kind: 'dog', breed: null, photo: null, sort, created_at: '' })

  it('groups each person’s pets in their order', () => {
    const by = petsByPerson([pet('Cooper', 'aron', 2), pet('Fudge', 'aron', 1), pet('Luna', 'maria', 0)])
    expect(by.get('aron')!.map(p => p.name)).toEqual(['Fudge', 'Cooper'])
    expect(by.get('maria')!.map(p => p.name)).toEqual(['Luna'])
  })

  it('checks a pet before it’s saved, as the database does', () => {
    expect(petProblem({ name: 'Fudge', photo: 'data:image/jpeg;base64,/9j/' })).toBeNull()
    expect(petProblem({ name: '  ' })).toBe('Give your pet a name')
    expect(petProblem({ name: 'x'.repeat(41) })).toBe('Keep the name to 40 characters')
    expect(petProblem({ name: 'Fudge', breed: 'x'.repeat(61) })).toBe('Keep the breed to 60 characters')
    expect(petProblem({ name: 'Fudge', photo: 'https://example.com/fudge.jpg' })).toBe('That photo can’t be used. Try another.')
  })
})
