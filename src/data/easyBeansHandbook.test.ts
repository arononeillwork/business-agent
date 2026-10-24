import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EASY_BEANS_ROLES, EASY_BEANS_RULES, handbookDuties } from './easyBeansHandbook'
import { roleProblem } from '../../shared/roles'
import { sectionProblem } from '../../shared/staffRules'

const seed = readFileSync(join(import.meta.dirname, '../../supabase/seed/easy_beans.sql'), 'utf8')
const sql = (s: string) => `'${s.replace(/'/g, "''")}'`

describe('Easy Beans roles and rules', () => {
  it('fit what the app and the database accept', () => {
    for (const r of EASY_BEANS_ROLES) expect(roleProblem({ name: r.name, summary: r.summary ?? null, duties: handbookDuties(r) }), r.name).toBeNull()
    for (const s of EASY_BEANS_RULES) expect(sectionProblem({ title: s.title, intro: s.intro ?? null, rules: s.rules }), s.title).toBeNull()
  })

  it('are the same in the café’s seed data as in the demo', () => {
    for (const r of EASY_BEANS_ROLES) {
      expect(seed, r.name).toContain(`(${sql(r.name)}, ${r.summary ? sql(r.summary) : 'null'}, ${r.position ? sql(r.position) : 'null'},`)
      expect(seed, r.name).toContain(sql(JSON.stringify(handbookDuties(r))))
    }
    for (const s of EASY_BEANS_RULES) {
      expect(seed, s.title).toContain(`(${sql(s.title)}, ${s.intro ? sql(s.intro) : 'null'},`)
      expect(seed, s.title).toContain(sql(JSON.stringify(s.rules)))
    }
  })
})
