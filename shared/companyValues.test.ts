import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EASY_BEANS_VALUES, valueProblem, valuesOf, type CompanyValue } from './companyValues'

const value = (id: string, p: Partial<CompanyValue> = {}): CompanyValue =>
  ({ id, kind: 'value', parent_id: null, text_en: id, text_es: null, sort: 0, ...p })

describe('company values', () => {
  it('puts the values in order, each with its points, and the words apart', () => {
    const items = [
      value('smile', { sort: 2 }),
      value('energy', { sort: 1 }),
      value('worse day', { parent_id: 'energy', sort: 1 }),
      value('horrible', { kind: 'word', sort: 1 }),
    ]
    expect(valuesOf(items, 'value').map(n => [n.item.id, n.points.map(p => p.id)])).toEqual([['energy', ['worse day']], ['smile', []]])
    expect(valuesOf(items, 'word').map(n => n.item.id)).toEqual(['horrible'])
  })

  it('needs the words in one language at least, kept short', () => {
    expect(valueProblem({ text_en: ' ', text_es: '' })).toBe('Write it in English or Spanish')
    expect(valueProblem({ text_es: 'Horrible' })).toBeNull()
    expect(valueProblem({ text_en: 'x'.repeat(301) })).toBe('Keep it to 300 characters')
  })

  it('has Easy Beans’ own, in both languages', () => {
    const all = [...EASY_BEANS_VALUES.values.flatMap(v => [v, ...(v.points ?? [])]), ...EASY_BEANS_VALUES.words]
    for (const v of all) expect(valueProblem({ text_en: v.en, text_es: v.es })).toBeNull()
    expect(EASY_BEANS_VALUES.values).toHaveLength(6)
    expect(EASY_BEANS_VALUES.values[0].points).toEqual([{ en: 'There’s always someone having a worse day than you.', es: 'Siempre hay alguien que está teniendo un día peor que tú.' }])
    expect(EASY_BEANS_VALUES.words.map(w => w.en)).toEqual(['Horrible', 'Stupido'])
  })

  it('puts the same into Easy Beans’ database (the `company_values` migration)', () => {
    const dir = join(import.meta.dirname, '../supabase/migrations')
    const sql = readFileSync(join(dir, readdirSync(dir).find(f => f.endsWith('_company_values.sql'))!), 'utf8')
    expect(JSON.parse(sql.split('$json$')[1])).toEqual(EASY_BEANS_VALUES)
  })
})
