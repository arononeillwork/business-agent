import { describe, expect, it } from 'vitest'
import { resolveConflicts } from './resolve-conflicts'

// A conflict as `git checkout --conflict=diff3` writes it.
const conflict = (ours: string[], base: string[], theirs: string[]) =>
  ['<<<<<<< ours', ...ours, '||||||| base', ...base, '=======', ...theirs, '>>>>>>> theirs'].join('\n')

describe('settling merge conflicts for the merge queue', () => {
  it('keeps both sides when both only added lines at the same spot, ours first', () => {
    const text = ['const routes = [', "  'rota',", conflict(["  'stock',"], [], ["  'grants',"]), ']'].join('\n')
    expect(resolveConflicts(text)).toBe(['const routes = [', "  'rota',", "  'stock',", "  'grants',", ']'].join('\n'))
  })

  it('keeps each added block whole when both end the same way', () => {
    const ours = ["test.describe('loyalty', () => {", "  test('a', () => {", '  })', '})', '']
    const theirs = ["test.describe('stock', () => {", "  test('b', () => {", '  })', '})', '']
    expect(resolveConflicts(conflict(ours, [], theirs))).toBe([...ours, ...theirs].join('\n'))
  })

  it('keeps the same addition once', () => {
    expect(resolveConflicts(conflict(["import { a } from './a'"], [], ["import { a } from './a'"]))).toBe("import { a } from './a'")
  })

  it('in code, gives a line both changes when they are in different places on it', () => {
    const base = "expect(names).toEqual(['Rota', 'Time off', 'Team'])"
    const ours = "expect(names).toEqual(['Rota', 'Time off', 'Team', 'Roles & responsibilities'])"
    const theirs = "expect(names).toEqual(['Rota', 'Time off', 'Tips', 'Team'])"
    expect(resolveConflicts(conflict([ours], [base], [theirs])))
      .toBe("expect(names).toEqual(['Rota', 'Time off', 'Tips', 'Team', 'Roles & responsibilities'])")
  })

  it('keeps two additions at the same spot on a line, ours first', () => {
    expect(resolveConflicts(conflict(["const a = ['x', 'y']"], ["const a = ['x']"], ["const a = ['x', 'z']"]))).toBe("const a = ['x', 'y', 'z']")
  })

  it('leaves it for a person when both sides changed the same words', () => {
    expect(resolveConflicts(conflict(['const limit = 5'], ['const limit = 3'], ['const limit = 10']))).toBeNull()
    expect(resolveConflicts(conflict(["label: 'Alerts'"], ["label: 'Notifications'"], ["label: 'Bell'"]))).toBeNull()
  })

  it('never merges prose word by word', () => {
    const base = 'Sales and **Finances**.'
    expect(resolveConflicts(conflict(['Sales, **Finances** and P&L.'], [base], ['Sales and **Finances**. Loyalty too.']), { wordsToo: false })).toBeNull()
    expect(resolveConflicts(conflict(['- Stock'], [], ['- Grants']), { wordsToo: false })).toBe('- Stock\n- Grants')
  })

  it("leaves it for a person when the conflict isn't in diff3 style, or isn't finished", () => {
    expect(resolveConflicts(['<<<<<<< ours', 'a', '=======', 'b', '>>>>>>> theirs'].join('\n'))).toBeNull()
    expect(resolveConflicts(['<<<<<<< ours', 'a', '||||||| base', '======='].join('\n'))).toBeNull()
    expect(resolveConflicts('no conflict here')).toBeNull()
  })

  it('settles every conflict in a file or none', () => {
    const text = [conflict(['a'], [], ['b']), 'middle', conflict(['x = 1'], ['x = 0'], ['x = 2'])].join('\n')
    expect(resolveConflicts(text)).toBeNull()
  })
})
