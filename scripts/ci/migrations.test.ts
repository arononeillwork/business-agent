import { describe, expect, it } from 'vitest'
import { parseMigration, renumber, renumberReferences } from './migrations'

const main = ['20261101000068_competitors.sql', '20261101000074_roles_and_rules.sql', '20261102000077_sales_reps.sql', '20261102000078_staff_kitty.sql']

describe('migration numbers in the merge queue', () => {
  it('reads the date, number and name', () => {
    expect(parseMigration('20261022000043_customers.sql')).toEqual({ file: '20261022000043_customers.sql', date: '20261022', number: 43, name: 'customers' })
    expect(parseMigration('README.md')).toBeNull()
  })

  it('leaves new migrations alone when they already come after main', () => {
    expect(renumber(main, ['20261103000079_menu.sql', '20261103000080_screens.sql'])).toEqual([])
  })

  it("gives a branch's migrations the next free numbers, in their order, when theirs are taken", () => {
    expect(renumber(main, ['20261031000066_menu.sql', '20261031000067_screens.sql'])).toEqual([
      { from: '20261031000066_menu.sql', to: '20261102000079_menu.sql', fromNumber: 66, toNumber: 79 },
      { from: '20261031000067_screens.sql', to: '20261102000080_screens.sql', fromNumber: 67, toNumber: 80 },
    ])
  })

  it('moves a free number that would run before what main already has', () => {
    expect(renumber(main, ['20261029000070_hiring.sql'])).toEqual([
      { from: '20261029000070_hiring.sql', to: '20261102000079_hiring.sql', fromNumber: 70, toNumber: 79 },
    ])
  })

  it('keeps a later date of its own', () => {
    expect(renumber(main, ['20261105000077_tips.sql'])[0].to).toBe('20261105000079_tips.sql')
  })

  it('points "migration 66" at the new number, and nothing else', () => {
    const renames = renumber(main, ['20261031000066_menu.sql'])
    expect(renumberReferences('// The menu (migration 66), like migration 28 and migration 660', renames))
      .toBe('// The menu (migration 79), like migration 28 and migration 660')
    expect(renumberReferences('Migrations 66 and 28', renames)).toBe('Migrations 79 and 28')
  })
})
