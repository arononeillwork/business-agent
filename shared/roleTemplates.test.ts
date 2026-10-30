import { describe, expect, it } from 'vitest'
import { ROLE_AREA_IDS, hiddenByRole, levelIn, levels, permissionsOf, roleProblem, tidyPermissions } from './roles'
import { ROLE_CATEGORIES, ROLE_TEMPLATES, categoryOf } from './roleTemplates'

describe('role permissions', () => {
  it('reads an area a role leaves out as Read, and never hides the team’s own shifts, holidays and hours', () => {
    expect(levelIn(undefined, 'rota')).toBe('read')
    expect(levelIn({ stock: 'none' }, 'stock')).toBe('none')
    expect(levelIn({ rota: 'none', timeoff: 'none', timecards: 'none' }, 'timeoff')).toBe('read')
    expect(tidyPermissions({ rota: 'none', stock: 'update' })).toEqual(levels('read', { stock: 'update' }))
  })

  it('gives admins everything, someone in no role Read, and the most of several roles', () => {
    const roles = [
      { people: ['lead'], permissions: levels('read', { rota: 'update', stock: 'none' }) },
      { people: ['lead', 'cleaner'], permissions: levels('read', { stock: 'read', calendar: 'none' }) },
      { people: ['cleaner'], permissions: levels('read', { stock: 'none', calendar: 'none', waste: 'none' }) },
    ]
    expect(permissionsOf({ id: 'boss', role: 'admin' }, [])).toEqual(levels('update'))
    expect(permissionsOf({ id: 'new', role: 'employee' }, roles)).toEqual(levels('read'))
    expect(permissionsOf({ id: 'lead', role: 'employee' }, roles)).toEqual(levels('read', { rota: 'update', calendar: 'read' }))
    // The waste log is hidden by one of the cleaner's roles but read in the other: Read.
    expect(permissionsOf({ id: 'cleaner', role: 'employee' }, roles)).toEqual(levels('read', { calendar: 'none' }))
    expect(hiddenByRole(permissionsOf({ id: 'cleaner', role: 'employee' }, roles))).toEqual(['calendar'])
    // Partners aren't in roles: their own areas decide what they open.
    expect(permissionsOf({ id: 'lead', role: 'partner' }, roles)).toEqual(levels('read'))
  })
})

describe('role templates', () => {
  it('are valid, each named once, answering to one in their own category', () => {
    expect(new Set(ROLE_TEMPLATES.map(p => p.id)).size).toBe(ROLE_TEMPLATES.length)
    for (const c of ROLE_CATEGORIES) {
      const names = c.templates.map(p => p.name)
      expect(new Set(names).size, c.id).toBe(names.length)
      for (const p of c.templates) {
        expect(p.id?.startsWith(`${c.id}.`), p.id).toBe(true)
        expect(roleProblem(p), p.id).toBeNull()
        if (p.reportsTo) expect(names, p.id).toContain(p.reportsTo)
        expect(Object.keys(p.permissions ?? {}).every(a => (ROLE_AREA_IDS as string[]).includes(a)), p.id).toBe(true)
      }
    }
  })

  it('a barista reads the rota, their holidays and hours; a shift lead runs the rota and the hours', () => {
    const tpl = (id: string) => tidyPermissions(ROLE_TEMPLATES.find(p => p.id === id)!.permissions)
    expect(tpl('cafe.barista')).toEqual(levels('read'))
    expect(tpl('cafe.shift-lead')).toMatchObject({ rota: 'update', timecards: 'update', timeoff: 'read' })
    expect(tpl('cafe.owner')).toEqual(levels('update'))
    expect(tpl('cafe.cleaner')).toMatchObject({ rota: 'read', stock: 'none' })
  })

  it('finds the business’s own category from what it says it is', () => {
    expect(categoryOf('Specialty café, drinks-first, owner-run')).toBe('cafe')
    expect(categoryOf('Restaurant & bar')).toBe('restaurant')
    expect(categoryOf('Salon & beauty')).toBe('salon')
    expect(categoryOf(null)).toBe('other')
  })
})
