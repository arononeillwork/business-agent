import { describe, expect, it } from 'vitest'
import { AREAS, CORE, selectTests } from './select-e2e'

const matches = (pattern: string, title: string) => new RegExp(pattern, 'i').test(title)

describe('which browser tests a change runs', () => {
  it('always the core: sign-in, the landing page and who can see what', () => {
    const p = selectTests(['worker/billing.ts', 'supabase/migrations/x.sql', 'docs/billing.md'])
    expect(p).toBe(CORE)
    for (const t of ['the app opens at the sign-in screen and shows nothing before login', 'employees never see Billing',
      'staff can\'t open the café tablet screen from their own login', 'rejects a wrong PIN and clocks in with the right one',
      'the gestoría sees payroll and finances read-only, and nothing else']) expect(matches(p, t)).toBe(true)
    expect(matches(p, 'adds a calendar event')).toBe(false)
  })

  it('plus the areas a change touches', () => {
    const p = selectTests(['src/pages/MusicPage.tsx', 'worker/music.ts'])
    expect(matches(p, 'café music: search all of YouTube Music, and play a song now, next or at the end, or a whole playlist')).toBe(true)
    expect(matches(p, 'adds a calendar event')).toBe(false)
    expect(matches(selectTests(['src/pages/BillingPage.tsx']), 'billing on Free: paid pages show what they need, the trial of Business unlocks them')).toBe(true)
  })

  it('everything when a change touches what every page uses, the tests themselves, or a file it does not know', () => {
    for (const f of ['src/app/AppShell.tsx', 'src/data/demoApi.ts', 'shared/types.ts', 'package-lock.json', 'e2e/demo.spec.ts', 'src/pages/NewPage.tsx']) {
      expect(selectTests([f]), f).toBe('all')
    }
  })

  it('every area names files and tests', () => {
    for (const a of AREAS) { expect(a.files.length, a.name).toBeGreaterThan(0); expect(a.tests, a.name).not.toBe('') }
  })
})
