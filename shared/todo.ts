// To Do List board logic, kept apart from the page so it can be unit tested: grouping by
// category, the order jobs show in, where a dragged job lands, and the plain-text copy.
import { msg } from './i18n'
import type { Todo, TodoCategory, TodoPatch, TodoStatus } from './types'

export interface TodoFilters { categoryId: string | null; starredOnly: boolean; showDone: boolean }
/** The category filter value for jobs whose category was removed. */
export const NO_CATEGORY = 'none'

export interface TodoSection { key: string; label: string | null; items: Todo[] }
export interface TodoGroup {
  /** The category id, or NO_CATEGORY. */
  key: string
  label: string
  hint: string | null
  colour: string
  count: number
  sections: TodoSection[]
}

const keyOf = (t: Todo, categories: TodoCategory[]) =>
  t.category_id && categories.some(c => c.id === t.category_id) ? t.category_id : NO_CATEGORY

/** Does a job pass the filters (category aside)? */
export function visible(t: Todo, f: Pick<TodoFilters, 'starredOnly' | 'showDone'>) {
  return (f.showDone || !t.done) && (!f.starredOnly || t.starred)
}

/** Filtered, grouped by category (in the categories' order), pinned first and done last in each. */
export function buildBoard(todos: Todo[], categories: TodoCategory[], f: TodoFilters): TodoGroup[] {
  const shown = todos.filter(t => visible(t, f) && (!f.categoryId || keyOf(t, categories) === f.categoryId))
    .sort(byManualOrder)
  const defs = [
    ...[...categories].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
      .map(c => ({ key: c.id, label: c.name, hint: c.hint, colour: c.colour })),
    { key: NO_CATEGORY, label: msg('No category'), hint: msg('Jobs whose category was removed'), colour: '#8A7E76' },
  ]
  return defs.map(d => {
    const items = shown.filter(t => keyOf(t, categories) === d.key).sort(byPinnedThenDone)
    return { ...d, count: items.length, sections: splitIntoSections(items) }
  }).filter(g => g.count > 0)
}

/** Loose jobs first, then each named section in the order it first appears. */
function splitIntoSections(items: Todo[]): TodoSection[] {
  const loose = items.filter(t => !t.section?.trim())
  const named: TodoSection[] = []
  for (const t of items) {
    const label = t.section?.trim()
    if (!label) continue
    const s = named.find(x => x.label === label)
    if (s) s.items.push(t)
    else named.push({ key: label, label, items: [t] })
  }
  return [...(loose.length ? [{ key: '', label: null, items: loose }] : []), ...named]
}

function byManualOrder(a: Todo, b: Todo) {
  return a.position - b.position || a.created_at.localeCompare(b.created_at)
}
function byPinnedThenDone(a: Todo, b: Todo) {
  if (a.done !== b.done) return Number(a.done) - Number(b.done)
  return Number(b.pinned) - Number(a.pinned)
}

/** Every shown job in page order: what a drag reorders. */
export function flatten(groups: TodoGroup[]): Todo[] {
  return groups.flatMap(g => g.sections.flatMap(s => s.items))
}

/** Where to put a new job so it shows at the top. */
export function topPosition(todos: Todo[]) {
  return Math.min(0, ...todos.map(t => t.position)) - 1
}

export interface TodoMove { position: number; category_id: string | null; section: string | null }

/**
 * Where a dragged job lands: it takes the category and section of the row it was dropped on,
 * and a position between its new neighbours, so only that one job is saved. Neighbours come from
 * the same bucket (category, pinned, done), because that is what the page orders within.
 */
export function resolveMove(order: Todo[], categories: TodoCategory[], activeId: string, overId: string): TodoMove | null {
  const from = order.findIndex(t => t.id === activeId)
  const to = order.findIndex(t => t.id === overId)
  if (from < 0 || to < 0 || from === to) return null
  const active = order[from]
  const over = order[to]
  const moved = [...order]
  moved.splice(from, 1)
  moved.splice(to, 0, active)

  const overKey = keyOf(over, categories)
  const adopted = { category_id: overKey === NO_CATEGORY ? null : overKey, section: over.section?.trim() || null }
  const bucket = (t: Todo) => [keyOf(t, categories), Number(t.pinned), Number(t.done)].join('|')
  const target = bucket({ ...active, ...adopted })
  const near = (start: number, step: number) => {
    for (let i = start; i >= 0 && i < moved.length; i += step) {
      if (moved[i].id !== activeId && bucket(moved[i]) === target) return moved[i]
    }
    return null
  }
  const before = near(to - 1, -1)
  const after = near(to + 1, 1)
  const position = before && after ? (before.position + after.position) / 2
    : before ? before.position + 1
    : after ? after.position - 1
    : 0
  return { ...adopted, position }
}

/** Fills {placeholders} in English: the default for `translate` (the page passes its t()). */
type Translate = (text: string, vars?: Record<string, string>) => string
const asIs: Translate = (text, vars) => text.replace(/\{(\w+)\}/g, (all, k: string) => vars?.[k] ?? all)

/** The whole list as plain text, for pasting into a message or a note. */
export function toPlainText(todos: Todo[], categories: TodoCategory[], names: Map<string, string>, business: string = msg('The business'), translate = asIs): string {
  const lines = [translate(msg('{business}: to do'), { business }), '']
  for (const g of buildBoard(todos, categories, { categoryId: null, starredOnly: false, showDone: true })) {
    lines.push((g.key === NO_CATEGORY ? translate(g.label) : g.label).toUpperCase())
    for (const s of g.sections) {
      for (const t of s.items) {
        const tags = [s.label, t.assignee_id ? names.get(t.assignee_id) : null].filter(Boolean)
        const flags = `${t.pinned ? '📌 ' : ''}${t.starred ? '★ ' : ''}`
        lines.push(`${t.done ? '[x]' : t.status === 'doing' ? '[~]' : '[ ]'} ${flags}${t.title}${tags.length ? `  (${tags.join(' / ')})` : ''}`)
      }
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

// ---------------------------------------------------------------------------------------------
// The board: the same jobs as kanban columns (to do, doing, done), seen as everyone's or one
// person's, each view with its own category filters.
// ---------------------------------------------------------------------------------------------

export const BOARD_COLUMNS: { id: TodoStatus; label: string }[] = [
  { id: 'todo', label: msg('To do') },
  { id: 'doing', label: msg('Doing') },
  { id: 'done', label: msg('Done') },
]

/** Whose jobs a board shows: everyone's, nobody's yet, or one person's (their profile id). */
export type BoardView = string
export const EVERYONE = 'everyone'
export const UNASSIGNED = 'unassigned'

export interface BoardFilters {
  /** Categories shown (NO_CATEGORY for jobs whose category was removed); none chosen shows them all. */
  categoryIds: string[]
  starredOnly: boolean
}
export const DEFAULT_BOARD_FILTERS: BoardFilters = { categoryIds: [], starredOnly: false }

export interface BoardColumn { id: TodoStatus; label: string; items: Todo[] }

const inView = (t: Todo, view: BoardView) => view === EVERYONE || (view === UNASSIGNED ? !t.assignee_id : t.assignee_id === view)

/** The jobs a view shows before its filters: what the category chips count. */
export function jobsInView(todos: Todo[], view: BoardView) {
  return todos.filter(t => inView(t, view))
}

/** How many of a view's jobs are in each category (and NO_CATEGORY), for the filter chips. */
export function countByCategory(todos: Todo[], categories: TodoCategory[], view: BoardView) {
  const counts: Record<string, number> = {}
  for (const t of jobsInView(todos, view)) {
    const k = keyOf(t, categories)
    counts[k] = (counts[k] ?? 0) + 1
  }
  return counts
}

/** The columns for a view and its filters; in each, pinned jobs first, then the shared manual order. */
export function buildColumns(todos: Todo[], categories: TodoCategory[], view: BoardView, f: BoardFilters): BoardColumn[] {
  const chosen = new Set(f.categoryIds)
  const shown = jobsInView(todos, view)
    .filter(t => (!chosen.size || chosen.has(keyOf(t, categories))) && (!f.starredOnly || t.starred))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || byManualOrder(a, b))
  return BOARD_COLUMNS.map(c => ({ ...c, items: shown.filter(t => t.status === c.id) }))
}

/** A change to a job as it will be saved: moving it between columns and ticking it off stay in step. */
export function inStep(t: Todo, patch: TodoPatch): TodoPatch {
  if (patch.status !== undefined) return { ...patch, done: patch.status === 'done' }
  if (patch.done !== undefined) return { ...patch, status: patch.done ? 'done' : t.status === 'done' ? 'todo' : t.status }
  return patch
}

/**
 * Where a card dropped on the board lands: on another card it takes that card's column and the place
 * just before it (or after it, when it was dragged down the same column); on a column's empty space
 * it goes to the bottom of that column. Only the moved card is saved: its status and a position
 * between its new neighbours.
 */
export function resolveBoardMove(columns: BoardColumn[], activeId: string, over: { card: string } | { column: TodoStatus }): { status: TodoStatus; position: number } | null {
  const from = columns.find(c => c.items.some(t => t.id === activeId))
  if (!from) return null
  const to = 'column' in over ? columns.find(c => c.id === over.column) : columns.find(c => c.items.some(t => t.id === over.card))
  if (!to) return null
  const rest = to.items.filter(t => t.id !== activeId)
  let at = rest.length
  if ('card' in over) {
    if (over.card === activeId) return null
    const target = rest.findIndex(t => t.id === over.card)
    const down = from === to && from.items.findIndex(t => t.id === activeId) < from.items.findIndex(t => t.id === over.card)
    at = target + (down ? 1 : 0)
  }
  if (from === to && 'column' in over && from.items[from.items.length - 1]?.id === activeId) return null
  // Pinned cards stay above the rest, so the neighbours are the nearest cards pinned (or not) like it.
  const pinned = from.items.find(t => t.id === activeId)!.pinned
  const before = rest.slice(0, at).reverse().find(t => t.pinned === pinned)
  const after = rest.slice(at).find(t => t.pinned === pinned)
  if (from === to && !before && !after) return null // alone among its kind in its column: nothing to reorder
  const position = before && after ? (before.position + after.position) / 2
    : before ? before.position + 1
    : after ? after.position - 1
    : 0
  return { status: to.id, position }
}
