// To Do List board logic, kept apart from the page so it can be unit tested: grouping by
// category, the order jobs show in, where a dragged job lands, and the plain-text copy.
import type { Todo, TodoCategory } from './types'

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
    { key: NO_CATEGORY, label: 'No category', hint: 'Jobs whose category was removed', colour: '#8A7E76' },
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

/** The whole list as plain text, for pasting into a message or a note. */
export function toPlainText(todos: Todo[], categories: TodoCategory[], names: Map<string, string>, business = 'The business'): string {
  const lines = [`${business}: to do`, '']
  for (const g of buildBoard(todos, categories, { categoryId: null, starredOnly: false, showDone: true })) {
    lines.push(g.label.toUpperCase())
    for (const s of g.sections) {
      for (const t of s.items) {
        const tags = [s.label, t.assignee_id ? names.get(t.assignee_id) : null].filter(Boolean)
        const flags = `${t.pinned ? '📌 ' : ''}${t.starred ? '★ ' : ''}`
        lines.push(`${t.done ? '[x]' : '[ ]'} ${flags}${t.title}${tags.length ? `  (${tags.join(' / ')})` : ''}`)
      }
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}
