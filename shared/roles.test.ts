import { describe, expect, it } from 'vitest'
import { ROLE_PRESETS, dutiesByWhen, dutiesFromLines, linesOf, presetPosition, roleProblem, sortRoles } from './roles'
import { RULE_PRESETS, readState, rulesChangedAt, rulesFromLines, sectionProblem } from './staffRules'

describe('roles', () => {
  it('reads duties one per line, tidied, and writes them back', () => {
    const duties = dutiesFromLines({ opening: ' - Switch on the machine\n\n• Count the float\nswitch on the machine ', closing: 'Lock up' })
    expect(duties).toEqual([
      { when: 'opening', text: 'Switch on the machine' }, { when: 'opening', text: 'Count the float' }, { when: 'closing', text: 'Lock up' },
    ])
    expect(linesOf(duties)).toEqual({ core: '', also: '', opening: 'Switch on the machine\nCount the float', service: '', closing: 'Lock up', weekly: '' })
    expect(dutiesByWhen(duties).map(g => [g.id, g.duties.length])).toEqual([['opening', 2], ['closing', 1]])
  })

  it('says what’s wrong before saving', () => {
    expect(roleProblem({ name: ' ', summary: null, duties: [] })).toBe('Give the role a name')
    expect(roleProblem({ name: 'Barista', summary: null, duties: [{ when: 'service', text: 'x'.repeat(301) }] })).toBe('Keep each duty to 300 characters')
    expect(roleProblem({ name: 'Barista', summary: 'Coffee', duties: [] })).toBeNull()
  })

  it('keeps the order given, then by name', () => {
    expect(sortRoles([{ sort: 1, name: 'B' }, { sort: 0, name: 'Z' }, { sort: 1, name: 'A' }]).map(r => r.name)).toEqual(['Z', 'A', 'B'])
  })

  it('the presets are valid, answer to presets, and find their rota position in either language', () => {
    for (const p of ROLE_PRESETS) {
      expect(roleProblem(p)).toBeNull()
      if (p.reportsTo) expect(ROLE_PRESETS.map(x => x.name)).toContain(p.reportsTo)
    }
    const positions = [{ id: 1, name: 'Barista', active: true }, { id: 4, name: 'Propietario', active: true }, { id: 5, name: 'Cocina', active: false }]
    const named = (n: string) => ROLE_PRESETS.find(p => p.name === n)!
    expect(presetPosition(named('Barista'), positions)).toBe(1)
    expect(presetPosition(named('Owner'), positions)).toBe(4)
    expect(presetPosition(named('Kitchen'), positions)).toBeNull() // not active
    expect(presetPosition(named('Shift lead'), positions)).toBeNull()
  })
})

describe('staff rules', () => {
  it('reads rules one per line, tidied', () => {
    expect(rulesFromLines('1. Be on time\n- Wash your hands\n\nwash your hands\n')).toEqual(['1. Be on time', 'Wash your hands'])
  })

  it('says what’s wrong before saving, and the presets are valid', () => {
    expect(sectionProblem({ title: 'Phones', intro: null, rules: [] })).toBe('Write at least one rule')
    expect(sectionProblem({ title: '', intro: null, rules: ['x'] })).toBe('Give the section a title')
    for (const p of RULE_PRESETS) expect(sectionProblem({ title: p.title, intro: p.intro ?? null, rules: p.rules })).toBeNull()
  })

  it('asks again after a change: never, before the change, or since', () => {
    const changed = rulesChangedAt([{ updated_at: '2026-09-20T10:00:00Z' }, { updated_at: '2026-09-27T10:00:00Z' }])
    expect(changed).toBe('2026-09-27T10:00:00Z')
    expect(rulesChangedAt([])).toBeNull()
    expect(readState(undefined, changed)).toBe('never')
    expect(readState({ profile_id: 'a', read_at: '2026-09-23T10:00:00Z' }, changed)).toBe('outdated')
    expect(readState({ profile_id: 'a', read_at: '2026-09-28T10:00:00+00:00' }, changed)).toBe('read')
    expect(readState({ profile_id: 'a', read_at: '2026-09-28T10:00:00Z' }, null)).toBe('read')
  })
})
