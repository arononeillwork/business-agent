import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EASY_BEANS_CHECKLISTS, checklistFor, checklistItemProblem, checklistProgress, checklistTree, itemText, tickable, type ChecklistItem,
} from './checklists'

const item = (id: string, p: Partial<ChecklistItem> = {}): ChecklistItem =>
  ({ id, list: 'opening', parent_id: null, text_en: id, text_es: null, sort: 0, ...p })

/** Easy Beans' start of the day, in order (the database test checks the same). */
const OPENING = [
  'Open the 2 shutters', 'Turn off the alarm', 'Clock in on the app', 'Take out and lay out the tables outside', 'Turn on:',
  'Set up the awnings outside (front and back)', 'Turn on the lights for:', 'Check the stock of bakery items, and bake more if needed',
  'Stock the fridges with pastries', 'Stock the fridges with milk and drinks', 'Put music on', 'Stock check and update the system',
  'Put the chalkboard sign out', 'Check and clean the display fridges', 'Fill up the dog bowl and put it outside, on the corner',
  'Cockroach sweep: kill and remove', 'Brush the front of the shop, in front of the shutter', 'Clean and wipe each table',
]

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

  it('has the start of the day as the owners changed it (the `checklist_changes` migration does the same to the database)', () => {
    const open = EASY_BEANS_CHECKLISTS.opening
    expect(open.map(i => i.en)).toEqual(OPENING)
    expect(open.find(i => i.en === 'Take out and lay out the tables outside')!.steps).toBeUndefined()
    expect(open.find(i => i.en === 'Turn on:')!.steps!.map(x => x.en)).toEqual(['Coffee machine', 'Lights under the counter', 'Till system'])
    expect(open.find(i => i.en === 'Turn on the lights for:')!.steps!.map(x => x.en))
      .toEqual(['The front 2 fridges', 'The back 2 fridges', 'The outside lights (logo light), from the fuse board (box of electrics)', 'The sign in front of the coffee machine'])
    expect(open.find(i => i.en === 'Stock the fridges with milk and drinks')).toEqual({ en: 'Stock the fridges with milk and drinks',
      es: 'Reponer los refrigeradores con leche y bebidas', steps: [{ en: 'Place an order if needed', es: 'Hacer un pedido si es necesario' }] })
  })

  it('started from the owners’ first version, which the `day_checklists` migration put into the database', () => {
    const dir = join(import.meta.dirname, '../supabase/migrations')
    const sql = readFileSync(join(dir, readdirSync(dir).find(f => f.endsWith('_day_checklists.sql'))!), 'utf8')
    const first = JSON.parse(sql.split('$json$')[1]) as typeof EASY_BEANS_CHECKLISTS
    // The end of the day hasn't changed; the start of the day lost five things and steps, and gained none.
    expect(first.closing).toEqual(EASY_BEANS_CHECKLISTS.closing)
    const words = (l: typeof first.opening) => new Set(l.flatMap(i => [i.en, ...(i.steps ?? []).map(x => x.en)]))
    const before = words(first.opening), after = words(EASY_BEANS_CHECKLISTS.opening)
    expect([...before].filter(w => !after.has(w)).sort()).toEqual([
      'Check the toilets are clean, and clean them if needed', 'Flower pots and menus on the tables, facing up in Spanish', 'Ice machine',
      'Make sure the fabric above is tight, but not too tight, as they are not the best', 'Put one ashtray out the front of the café',
      'Stock check the fridges: soda and milk', 'Under the counter', 'Water the plants',
    ])
    expect([...after].filter(w => !before.has(w))).toEqual(['Stock the fridges with milk and drinks'])
  })
})
