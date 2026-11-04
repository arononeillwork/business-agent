// The demo's daily checklists: Easy Beans' own for the start and the end of the day, in English and
// Spanish, with a few things already ticked off this morning. Mirrors the `day_checklists` migration's
// rules: the team reads and ticks, whoever ticked something (or an admin) unticks it, admins change the lists.
import type { Api } from './api'
import {
  EASY_BEANS_CHECKLISTS, checklistItemProblem, type ChecklistItem, type ChecklistList, type ChecklistTick,
} from '../../shared/checklists'

interface Who {
  isStaff: () => boolean
  isAdmin: () => boolean
  me: () => string | null
  uid: () => string
  nowIso: () => string
  /** Today's date where the business is (YYYY-MM-DD). */
  today: () => string
}

type ChecklistApi = Pick<Api, 'checklistItems' | 'saveChecklistItem' | 'deleteChecklistItem' | 'orderChecklistItems' | 'checklistTicks' | 'setChecklistTicks'>

const clone = <T,>(x: T): T => structuredClone(x)
const tidy = (s: string | null | undefined) => (s ?? '').trim() || null

/** `opened`: who opened up this morning, with what they've ticked off so far. */
export function demoChecklistApi(w: Who, opened: { by: string; at: string } | null): ChecklistApi {
  const items: ChecklistItem[] = []
  for (const list of ['opening', 'closing'] as ChecklistList[]) {
    EASY_BEANS_CHECKLISTS[list].forEach((x, i) => {
      const id = `check-${list}-${i + 1}`
      items.push({ id, list, parent_id: null, text_en: x.en, text_es: x.es, sort: i + 1 })
      x.steps?.forEach((s, j) => items.push({ id: `${id}-${j + 1}`, list, parent_id: id, text_en: s.en, text_es: s.es, sort: j + 1 }))
    })
  }
  // This morning: the shutters, the alarm, clocking in and the tables are done.
  const done = ['Open the 2 shutters', 'Turn off the alarm', 'Clock in on the app', 'Take out and lay out the tables outside']
  const ticks: ChecklistTick[] = opened
    ? items.filter(i => i.list === 'opening' && done.includes(i.text_en ?? ''))
      .map(i => ({ item_id: i.id, day: w.today(), done_by: opened.by, done_at: opened.at }))
    : []

  const requireAdmin = () => { if (!w.isAdmin()) throw new Error('new row violates row-level security policy for table "checklist_items"') }
  const hasSteps = (id: string) => items.some(i => i.parent_id === id)

  return {
    async checklistItems() { return w.isStaff() ? clone(items) : [] },
    async saveChecklistItem({ id, ...i }) {
      requireAdmin()
      const was = id ? items.find(x => x.id === id) : undefined
      if (id && !was) throw new Error('That isn’t on the checklist any more')
      const base: ChecklistItem = was ?? { id: w.uid(), list: i.list ?? 'opening', parent_id: null, text_en: null, text_es: null,
        sort: Math.max(0, ...items.filter(x => x.list === (i.list ?? 'opening') && x.parent_id === (i.parent_id ?? null)).map(x => x.sort)) + 1 }
      const next: ChecklistItem = { ...base, ...i,
        text_en: 'text_en' in i ? tidy(i.text_en) : base.text_en, text_es: 'text_es' in i ? tidy(i.text_es) : base.text_es }
      const problem = checklistItemProblem(next)
      if (problem) throw new Error(problem)
      if (next.parent_id) {
        const parent = items.find(x => x.id === next.parent_id)
        if (!parent || parent.parent_id || parent.list !== next.list || parent.id === next.id) throw new Error('A step goes under an item of the same checklist')
        if (was && hasSteps(was.id)) throw new Error('An item with steps can’t be a step itself')
      }
      if (was && next.list !== was.list && hasSteps(was.id)) throw new Error('An item with steps stays on its checklist')
      if (was) Object.assign(was, next)
      else items.push(next)
      return next.id
    },
    async deleteChecklistItem(id) {
      requireAdmin()
      const gone = new Set(items.filter(x => x.id === id || x.parent_id === id).map(x => x.id))
      for (let i = items.length - 1; i >= 0; i--) if (gone.has(items[i].id)) items.splice(i, 1)
      for (let i = ticks.length - 1; i >= 0; i--) if (gone.has(ticks[i].item_id)) ticks.splice(i, 1)
    },
    async orderChecklistItems(ids) {
      requireAdmin()
      ids.forEach((id, sort) => { const x = items.find(i => i.id === id); if (x) x.sort = sort })
    },
    async checklistTicks(day) { return w.isStaff() ? clone(ticks.filter(t => t.day === day)) : [] },
    async setChecklistTicks(itemIds, day, done) {
      if (!w.isStaff()) throw new Error('new row violates row-level security policy for table "checklist_ticks"')
      for (const id of itemIds) {
        if (!items.some(i => i.id === id)) throw new Error('That isn’t on the checklist')
        if (hasSteps(id)) throw new Error('Tick off its steps')
        const i = ticks.findIndex(t => t.item_id === id && t.day === day)
        if (done) { if (i < 0) ticks.push({ item_id: id, day, done_by: w.me(), done_at: w.nowIso() }) }
        else if (i >= 0 && (ticks[i].done_by === w.me() || w.isAdmin())) ticks.splice(i, 1)
      }
    },
  }
}
