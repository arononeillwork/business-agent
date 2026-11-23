import { describe, expect, it } from 'vitest'
import { hiddenByRoleView, roleAccess, roleOpens, roleViewId, roleViewKey, roleViewer } from './roleView'
import { ROLE_PRESETS, frontLine } from './roles'

const team = [
  { id: 'aron', role: 'admin' as const, can_see_pay: true, active: true },
  { id: 'mark', role: 'admin' as const, can_see_pay: true, active: true },
  { id: 'lee', role: 'admin' as const, can_see_pay: false, active: true },
  { id: 'maria', role: 'employee' as const, can_see_pay: false, active: true },
]
const preset = (id: string) => ROLE_PRESETS.find(p => p.id === id)!

describe('viewing the app as a role', () => {
  it('keeps the view as "role:" and the role’s id, apart from an agent’s', () => {
    expect(roleViewKey('r-1')).toBe('role:r-1')
    expect(roleViewId('role:r-1')).toBe('r-1')
    expect(roleViewId('finance')).toBeNull()
    expect(roleViewId(null)).toBeNull()
  })

  it('a ready-made owner or manager role is what it says; any other has what everyone in it has', () => {
    expect(roleAccess({ template: 'cafe.owner', people: [] }, team)).toBe('owner')
    // Mark (an owner) is in the café's Shop Manager role: it's still a shop manager's view.
    expect(roleAccess({ template: 'cafe.shop-manager', people: ['mark'] }, team)).toBe('manager')
    expect(roleAccess({ template: 'salon.manager', people: [] }, team)).toBe('manager')
    // An owner who also works as a barista doesn't make the barista's view an owner's.
    expect(roleAccess({ template: 'cafe.barista', people: ['maria', 'aron'] }, team)).toBe('employee')
    expect(roleAccess({ template: null, people: ['aron'] }, team)).toBe('owner')
    expect(roleAccess({ template: null, people: ['lee', 'aron'] }, team)).toBe('manager')
    expect(roleAccess({ template: null, people: [] }, team)).toBe('employee')
  })

  it('a barista sees nobody’s pay, and only the pages their role opens; an owner sees everything', () => {
    const barista = roleViewer({ template: 'cafe.barista', people: ['maria'], permissions: preset('cafe.barista').permissions }, team)
    expect(barista).toMatchObject({ access: 'employee', isAdmin: false, canSeePay: false })
    expect(roleOpens({ key: 'finances', who: 'pay' }, barista)).toBe(false)
    expect(roleOpens({ key: 'reviews', who: 'admin' }, barista)).toBe(false)
    expect(roleOpens({ key: 'rota' }, barista)).toBe(true)
    // The barista's role leaves the stock out.
    expect(roleOpens({ key: 'stock' }, barista)).toBe(false)
    // And the To Do List, Ideas, QR codes, Reps & rewards, the Social planner and the Leaderboard.
    for (const key of ['todo', 'ideas', 'qrcodes', 'reps', 'social', 'leaderboard']) expect(roleOpens({ key }, barista), key).toBe(false)

    const owner = roleViewer({ template: 'cafe.owner', people: ['aron'], permissions: preset('cafe.owner').permissions }, team)
    expect(owner).toMatchObject({ access: 'owner', isAdmin: true, canSeePay: true })
    expect(roleOpens({ key: 'finances', who: 'pay' }, owner)).toBe(true)

    const manager = roleViewer({ template: 'cafe.shop-manager', people: [], permissions: frontLine() }, team)
    expect(roleOpens({ key: 'reviews', who: 'admin' }, manager)).toBe(true)
    expect(roleOpens({ key: 'finances', who: 'pay' }, manager)).toBe(false)
  })

  it('leaves out of the menu every page the role can’t open, Settings’ too', () => {
    const sections = [
      { key: 'team', items: [{ key: 'rota' }, { key: 'hiring', who: 'admin' as const }] },
      { key: 'accounts', items: [{ key: 'finances', who: 'pay' as const, children: [{ key: 'pnl', who: 'pay' as const }] }] },
      { key: 'admin', items: [{ key: 'connections', who: 'admin' as const }, { key: 'notifications' }] },
    ]
    const barista = roleViewer({ template: 'cafe.barista', people: [], permissions: preset('cafe.barista').permissions }, team)
    expect(hiddenByRoleView(barista, sections)).toEqual(['hiring', 'finances', 'pnl', 'connections'])
    expect(hiddenByRoleView(null, sections)).toEqual([])
  })
})
