import { describe, expect, it } from 'vitest'
import { NO_CATEGORY, buildBoard, flatten, resolveMove, toPlainText, topPosition } from './todo'
import type { Todo, TodoCategory } from './types'

const cats: TodoCategory[] = [
  { id: 'shop', name: 'Shop', hint: null, colour: '#D46A2E', sort: 2 },
  { id: 'buy', name: 'Buying', hint: null, colour: '#C2961C', sort: 1 },
]
let n = 0
const todo = (title: string, p: Partial<Todo> = {}): Todo => ({
  id: title, title, category_id: 'shop', section: null, assignee_id: null, done: false, done_at: null,
  starred: false, pinned: false, position: ++n, created_at: '2026-10-01T09:00:00Z', ...p,
})
const all = { categoryId: null, starredOnly: false, showDone: false }

describe('To Do List board', () => {
  it('groups by category in the categories’ order, pinned first, done hidden', () => {
    const list = [todo('AC'), todo('Bin', { pinned: true }), todo('Cups', { category_id: 'buy' }), todo('Mop', { done: true })]
    const g = buildBoard(list, cats, all)
    expect(g.map(x => x.label)).toEqual(['Buying', 'Shop'])
    expect(g[1].sections[0].items.map(t => t.title)).toEqual(['Bin', 'AC'])
    expect(buildBoard(list, cats, { ...all, showDone: true })[1].count).toBe(3)
  })

  it('puts jobs of a removed category under No category, and splits sections', () => {
    const list = [todo('Old', { category_id: 'gone' }), todo('Photos', { section: 'Square' }), todo('Loose')]
    const g = buildBoard(list, cats, all)
    expect(g.map(x => x.key)).toEqual(['shop', NO_CATEGORY])
    expect(g[0].sections.map(s => s.label)).toEqual([null, 'Square'])
    expect(buildBoard(list, cats, { ...all, categoryId: NO_CATEGORY }).map(x => x.label)).toEqual(['No category'])
  })

  it('filters to starred jobs', () => {
    const g = buildBoard([todo('A', { starred: true }), todo('B')], cats, { ...all, starredOnly: true })
    expect(flatten(g).map(t => t.title)).toEqual(['A'])
  })

  it('a dragged job takes the category and section it lands in, between its neighbours', () => {
    const list = [todo('A', { position: 1 }), todo('B', { position: 2 }), todo('C', { position: 3, category_id: 'buy', section: 'Cups' })]
    const order = flatten(buildBoard(list, cats, all)) // C, A, B
    expect(resolveMove(order, cats, 'B', 'A')).toEqual({ category_id: 'shop', section: null, position: 0 })
    const move = resolveMove(order, cats, 'B', 'C')
    expect(move).toEqual({ category_id: 'buy', section: 'Cups', position: 2 })
    expect(resolveMove(order, cats, 'A', 'A')).toBeNull()
  })

  it('new jobs go above everything', () => {
    expect(topPosition([todo('A', { position: 3 }), todo('B', { position: -2 })])).toBe(-3)
    expect(topPosition([])).toBe(-1)
  })

  it('copies as text with sections, people and flags', () => {
    const text = toPlainText([todo('AC', { starred: true, assignee_id: 'p1' }), todo('Mop', { done: true, section: 'Clean' })], cats,
      new Map([['p1', 'Mark']]), 'Easy Beans')
    expect(text).toBe('Easy Beans: to do\n\nSHOP\n[ ] ★ AC  (Mark)\n[x] Mop  (Clean)\n')
  })
})
