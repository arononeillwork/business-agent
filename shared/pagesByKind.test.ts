// Pages a new business starts with hidden, by its kind: the same in the app (shared/hqReps.ts) and in
// the database (the pages_by_kind migration), and each one a page of the menu that can be hidden.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUSINESS_KINDS, KIND_HIDDEN_PAGES } from './hqReps'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'supabase/migrations')
// Found by name, so it still matches if the merge queue gives the migration another number.
const file = readdirSync(dir).filter(f => f.endsWith('_pages_by_kind.sql')).sort().pop()!
const sql = readFileSync(join(dir, file), 'utf8')
const shell = readFileSync(join(root, 'src/app/AppShell.tsx'), 'utf8')
const menuKeys = new Set([...shell.matchAll(/\{ key: '([a-z-]+)', to: '\//g)].map(m => m[1]))

describe('pages by kind of business', () => {
  it('match what the database sets for each kind', () => {
    const db: Record<string, string[]> = {}
    for (const [, kind, list] of sql.matchAll(/when '(\w+)' then array\[([^\]]*)\]/g)) db[kind] = [...list.matchAll(/'([a-z-]+)'/g)].map(m => m[1])
    const hiding = Object.fromEntries(Object.entries(KIND_HIDDEN_PAGES).filter(([, pages]) => pages.length))
    expect(db).toEqual(hiding)
  })

  it('name real pages of the menu, never Pages itself, for every kind there is', () => {
    expect(Object.keys(KIND_HIDDEN_PAGES).sort()).toEqual(BUSINESS_KINDS.map(k => k.id).sort())
    for (const pages of Object.values(KIND_HIDDEN_PAGES)) {
      for (const p of pages) expect(menuKeys.has(p), p).toBe(true)
      expect(pages).not.toContain('pages')
    }
    // A café sees everything, as before.
    expect(KIND_HIDDEN_PAGES.cafe).toEqual([])
  })
})
