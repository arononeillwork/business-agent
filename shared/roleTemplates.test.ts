import { describe, expect, it } from 'vitest'
import { ROLE_AREA_IDS, fullAccess, hiddenByRole, levelIn, levels, permissionsOf, roleNamesOf, roleProblem, tidyPermissions } from './roles'
import { ROLE_CATEGORIES, ROLE_TEMPLATES, categoryOf } from './roleTemplates'

describe('role permissions', () => {
  it('reads an area a role leaves out as Read, and never hides the team’s own shifts, holidays and hours', () => {
    expect(levelIn(undefined, 'rota')).toBe('read')
    expect(levelIn({ stock: 'none' }, 'stock')).toBe('none')
    expect(levelIn({ rota: 'none', timeoff: 'none', timecards: 'none' }, 'timeoff')).toBe('read')
    expect(tidyPermissions({ rota: 'none', stock: 'update' })).toEqual(levels('read', { stock: 'update' }))
  })

  it('keeps each area to the levels it offers: Own is the To Do List’s, and the business, its hours and dashboards are shown or not', () => {
    expect(levelIn({ todo: 'own' }, 'todo')).toBe('own')
    expect(levelIn({ stock: 'own' }, 'stock')).toBe('read')
    expect(levelIn({ business: 'update', hours: 'update', dashboards: 'none' }, 'hours')).toBe('read')
    expect(fullAccess()).toMatchObject({ business: 'read', hours: 'read', dashboards: 'read', todo: 'update', rota: 'update' })
    // Own is more than Hidden and less than Read.
    const roles = [{ people: ['a'], permissions: { todo: 'own' as const } }, { people: ['a'], permissions: { todo: 'none' as const } }]
    expect(permissionsOf({ id: 'a', role: 'employee' }, roles).todo).toBe('own')
    expect(permissionsOf({ id: 'a', role: 'employee' }, [...roles, { people: ['a'], permissions: {} }]).todo).toBe('read')
  })

  it('names someone by their roles, in the roles’ order', () => {
    const roles = [{ name: 'Barista', sort: 2, people: ['m'] }, { name: 'Cleaner', sort: 1, people: ['m', 'c'] }]
    expect(roleNamesOf('m', roles)).toEqual(['Cleaner', 'Barista'])
    expect(roleNamesOf('x', roles)).toEqual([])
  })

  it('gives admins everything, someone in no role Read, and the most of several roles', () => {
    const roles = [
      { people: ['lead'], permissions: levels('read', { rota: 'update', stock: 'none' }) },
      { people: ['lead', 'cleaner'], permissions: levels('read', { stock: 'read', calendar: 'none' }) },
      { people: ['cleaner'], permissions: levels('read', { stock: 'none', calendar: 'none', waste: 'none' }) },
    ]
    expect(permissionsOf({ id: 'boss', role: 'admin' }, [])).toEqual(fullAccess())
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

  it('a barista reads the rota, holidays and hours, their own tasks and no more; owners see everything', () => {
    const tpl = (id: string) => tidyPermissions(ROLE_TEMPLATES.find(p => p.id === id)!.permissions)
    expect(tpl('cafe.barista')).toEqual(levels('read', { business: 'none', brand: 'none', dashboards: 'none', stock: 'none', expenses: 'none', ai: 'none', todo: 'own' }))
    expect(hiddenByRole(tpl('cafe.barista'))).toEqual(['business', 'brand', 'dashboards', 'stock', 'expenses', 'ai-assistants'])
    expect(tpl('cafe.shift-lead')).toMatchObject({ rota: 'update', timecards: 'update', timeoff: 'read' })
    for (const owner of ROLE_TEMPLATES.filter(p => p.id?.endsWith('.owner'))) expect(tpl(owner.id!), owner.id).toEqual(fullAccess())
    expect(tpl('cafe.cleaner')).toMatchObject({ rota: 'read', stock: 'none' })
  })

  it('finds the business’s own category from what it says it is', () => {
    expect(categoryOf('Specialty café, drinks-first, owner-run')).toBe('cafe')
    expect(categoryOf('Restaurant & bar')).toBe('restaurant')
    expect(categoryOf('Salon & beauty')).toBe('salon')
    expect(categoryOf(null)).toBe('other')
  })
})
