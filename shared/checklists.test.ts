import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EASY_BEANS_CHECKLISTS, checklistFor, checklistItemProblem, checklistProgress, checklistTree, itemText, tickable, type ChecklistItem,
} from './checklists'

const item = (id: string, p: Partial<ChecklistItem> = {}): ChecklistItem =>
  ({ id, list: 'opening', parent_id: null, text_en: id, text_es: null, sort: 0, ...p })

describe('daily checklists', () => {
  const items = [
    item('alarm', { sort: 2, text_es: 'Apagar la alarma' }),
    item('shutters', { sort: 1 }),
    item('turn-on', { sort: 3 }),
    item('ice', { parent_id: 'turn-on', sort: 2 }),
    item('coffee', { parent_id: 'turn-on', sort: 1 }),
    item('alarm-on', { list: 'closing', sort: 1 }),
  ]

  it('puts each list in order, with its steps under their item', () => {
    const tree = checklistTree(items, 'opening')
    expect(tree.map(n => n.item.id)).toEqual(['shutters', 'alarm', 'turn-on'])
    expect(tree[2].steps.map(s => s.id)).toEqual(['coffee', 'ice'])
    expect(checklistTree(items, 'closing').map(n => n.item.id)).toEqual(['alarm-on'])
  })

  it('ticks items without steps and each step; an item with steps is done when they all are', () => {
    const tree = checklistTree(items, 'opening')
    expect(tickable(tree).map(i => i.id)).toEqual(['shutters', 'alarm', 'coffee', 'ice'])
    expect(checklistProgress(tree, new Set(['alarm', 'coffee', 'alarm-on']))).toEqual({ done: 2, total: 4 })
  })

  it('reads in the person’s language, or the other one when it has none yet', () => {
    expect(itemText(items[0], 'es')).toBe('Apagar la alarma')
    expect(itemText(items[0], 'en')).toBe('alarm')
    expect(itemText(item('x', { text_en: null, text_es: 'Regar las plantas' }), 'en')).toBe('Regar las plantas')
    expect(itemText(item('x'), 'es')).toBe('x')
  })

  it('needs the words in one language at least, kept short', () => {
    expect(checklistItemProblem({ text_en: ' ', text_es: '' })).toBe('Write what to do, in English or Spanish')
    expect(checklistItemProblem({ text_es: 'Regar las plantas' })).toBeNull()
    expect(checklistItemProblem({ text_en: 'x'.repeat(301) })).toBe('Keep it to 300 characters')
  })

  it('opens on the start of the day until halfway through the opening hours, then the end of it', () => {
    const hours = { wed: { open: '08:00', close: '15:00' }, sat: { open: '18:00', close: '02:00' } }
    // Wednesday 4 November 2026: open 8 till 3, so halfway is 11:30.
    expect(checklistFor('2026-11-04', '11:29', hours)).toBe('opening')
    expect(checklistFor('2026-11-04', '11:30', hours)).toBe('closing')
    // Saturday: open past midnight, halfway is 22:00.
    expect(checklistFor('2026-11-07', '21:00', hours)).toBe('opening')
    expect(checklistFor('2026-11-07', '23:00', hours)).toBe('closing')
    // Closed, or no hours: noon.
    expect(checklistFor('2026-11-08', '11:59', hours)).toBe('opening')
    expect(checklistFor('2026-11-08', '12:00', null)).toBe('closing')
  })

  it('has Easy Beans’ own checklists in both languages, each thing once', () => {
    for (const list of Object.values(EASY_BEANS_CHECKLISTS)) {
      const all = list.flatMap(i => [i, ...(i.steps ?? [])])
      for (const x of all) {
        expect(checklistItemProblem({ text_en: x.en, text_es: x.es })).toBeNull()
        expect(x.en.trim() && x.es.trim()).toBeTruthy()
      }
      expect(new Set(list.map(i => i.en)).size).toBe(list.length)
    }
    expect(EASY_BEANS_CHECKLISTS.opening[0]).toEqual({ en: 'Open the 2 shutters', es: 'Abrir las 2 persianas' })
    expect(EASY_BEANS_CHECKLISTS.closing.at(-1)).toEqual({ en: 'Turn on the alarm', es: 'Activar la alarma' })
  })

  it('puts the same checklists into Easy Beans’ database (the `day_checklists` migration)', () => {
    const dir = join(import.meta.dirname, '../supabase/migrations')
    const file = readdirSync(dir).find(f => f.endsWith('_day_checklists.sql'))!
    const sql = readFileSync(join(dir, file), 'utf8')
    const seed = JSON.parse(sql.split('$json$')[1]) as typeof EASY_BEANS_CHECKLISTS
    expect(seed).toEqual(EASY_BEANS_CHECKLISTS)
  })
})
