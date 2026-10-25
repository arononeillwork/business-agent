import { describe, expect, it } from 'vitest'
import { EVERYONE, NO_CATEGORY, UNASSIGNED, buildBoard, buildColumns, countByCategory, flatten, inStep, resolveBoardMove, resolveMove, toPlainText, topPosition } from './todo'
import type { Todo, TodoCategory } from './types'

const cats: TodoCategory[] = [
  { id: 'shop', name: 'Shop', hint: null, colour: '#D46A2E', sort: 2 },
  { id: 'buy', name: 'Buying', hint: null, colour: '#C2961C', sort: 1 },
]
let n = 0
const todo = (title: string, p: Partial<Todo> = {}): Todo => ({
  id: title, title, category_id: 'shop', section: null, assignee_id: null, done: false, status: p.done ? 'done' : 'todo', done_at: null,
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

describe('To Do board (kanban)', () => {
  const none = { categoryIds: [], starredOnly: false }
  const jobs = () => [
    todo('Fix tap', { status: 'todo', position: 1, assignee_id: 'aron' }),
    todo('Order cups', { status: 'doing', position: 2, category_id: 'buy', assignee_id: 'julio' }),
    todo('Paint door', { status: 'todo', position: 3, starred: true }),
    todo('Old job', { status: 'todo', position: 4, category_id: 'gone', assignee_id: 'julio' }),
    todo('Mop', { status: 'done', done: true, position: 5, assignee_id: 'aron' }),
    todo('Pinned', { status: 'todo', position: 6, pinned: true, assignee_id: 'aron' }),
  ]
  const titles = (cols: ReturnType<typeof buildColumns>) => cols.map(c => [c.id, c.items.map(t => t.title)])

  it('shows everyone’s jobs in To do, Doing and Done, pinned first', () => {
    expect(titles(buildColumns(jobs(), cats, EVERYONE, none))).toEqual([
      ['todo', ['Pinned', 'Fix tap', 'Paint door', 'Old job']], ['doing', ['Order cups']], ['done', ['Mop']],
    ])
  })

  it('one person’s view, or the jobs nobody has yet', () => {
    expect(titles(buildColumns(jobs(), cats, 'julio', none))).toEqual([['todo', ['Old job']], ['doing', ['Order cups']], ['done', []]])
    expect(titles(buildColumns(jobs(), cats, UNASSIGNED, none))).toEqual([['todo', ['Paint door']], ['doing', []], ['done', []]])
  })

  it('filters by any number of categories (and the removed one), and by star; counts the view’s jobs per category', () => {
    expect(titles(buildColumns(jobs(), cats, EVERYONE, { categoryIds: ['buy', NO_CATEGORY], starredOnly: false })))
      .toEqual([['todo', ['Old job']], ['doing', ['Order cups']], ['done', []]])
    expect(titles(buildColumns(jobs(), cats, EVERYONE, { categoryIds: [], starredOnly: true }))).toEqual([['todo', ['Paint door']], ['doing', []], ['done', []]])
    expect(countByCategory(jobs(), cats, EVERYONE)).toEqual({ shop: 4, buy: 1, [NO_CATEGORY]: 1 })
    expect(countByCategory(jobs(), cats, 'aron')).toEqual({ shop: 3 })
  })

  it('moving a card and ticking it off stay in step', () => {
    const [fix, cups, , , mop] = jobs()
    expect(inStep(fix, { status: 'done' })).toEqual({ status: 'done', done: true })
    expect(inStep(mop, { status: 'doing' })).toEqual({ status: 'doing', done: false })
    expect(inStep(fix, { done: true })).toEqual({ done: true, status: 'done' })
    expect(inStep(mop, { done: false })).toEqual({ done: false, status: 'todo' })
    expect(inStep(cups, { done: false })).toEqual({ done: false, status: 'doing' })
    expect(inStep(cups, { title: 'Order mugs' })).toEqual({ title: 'Order mugs' })
  })

  it('a dropped card takes the column and a place between its new neighbours', () => {
    const cols = buildColumns(jobs(), cats, EVERYONE, none) // todo: Pinned 6, Fix tap 1, Paint door 3, Old job 4
    expect(resolveBoardMove(cols, 'Order cups', { card: 'Paint door' })).toEqual({ status: 'todo', position: 2 }) // before Paint door
    expect(resolveBoardMove(cols, 'Order cups', { column: 'done' })).toEqual({ status: 'done', position: 6 }) // the bottom of Done
    expect(resolveBoardMove(cols, 'Mop', { column: 'doing' })).toEqual({ status: 'doing', position: 3 }) // after Order cups
    expect(resolveBoardMove(cols, 'Fix tap', { card: 'Old job' })).toEqual({ status: 'todo', position: 5 }) // dragged down: after Old job
    expect(resolveBoardMove(cols, 'Old job', { card: 'Fix tap' })).toEqual({ status: 'todo', position: 0 }) // dragged up: before Fix tap, under the pinned one
    expect(resolveBoardMove(cols, 'Pinned', { card: 'Paint door' })).toBeNull() // the only pinned card stays above the rest
    const moved = buildColumns(jobs().map(t => (t.id === 'Old job' ? { ...t, position: 0 } : t)), cats, EVERYONE, none)
    expect(moved[0].items.map(t => t.title)).toEqual(['Pinned', 'Old job', 'Fix tap', 'Paint door'])
    expect(resolveBoardMove(cols, 'Fix tap', { card: 'Fix tap' })).toBeNull()
    expect(resolveBoardMove(cols, 'Old job', { column: 'todo' })).toBeNull() // already last in its column
    const empty = buildColumns([todo('Only', { status: 'todo', position: 1 })], cats, EVERYONE, none)
    expect(resolveBoardMove(empty, 'Only', { column: 'doing' })).toEqual({ status: 'doing', position: 0 })
  })

  it('the text copy marks jobs being done', () => {
    const text = toPlainText([todo('Order cups', { status: 'doing' })], cats, new Map())
    expect(text).toContain('[~] Order cups')
  })
})
