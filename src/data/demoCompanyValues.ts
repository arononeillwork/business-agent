// The demo's company values: Easy Beans' own values and the words nobody says, in English and Spanish.
// Mirrors the `company_values` migration's rules: the team reads them, admins change them.
import type { Api } from './api'
import { EASY_BEANS_VALUES, valueProblem, type CompanyValue, type ValueKind } from '../../shared/companyValues'

interface Who { isStaff: () => boolean; isAdmin: () => boolean; uid: () => string }

type ValuesApi = Pick<Api, 'companyValues' | 'saveCompanyValue' | 'deleteCompanyValue' | 'orderCompanyValues'>

const clone = <T,>(x: T): T => structuredClone(x)
const tidy = (s: string | null | undefined) => (s ?? '').trim() || null

export function demoCompanyValuesApi(w: Who): ValuesApi {
  const items: CompanyValue[] = []
  for (const kind of ['value', 'word'] as ValueKind[]) {
    EASY_BEANS_VALUES[kind === 'value' ? 'values' : 'words'].forEach((v, i) => {
      const id = `${kind}-${i + 1}`
      items.push({ id, kind, parent_id: null, text_en: v.en, text_es: v.es, sort: i + 1 })
      v.points?.forEach((p, j) => items.push({ id: `${id}-${j + 1}`, kind, parent_id: id, text_en: p.en, text_es: p.es, sort: j + 1 }))
    })
  }
  const requireAdmin = () => { if (!w.isAdmin()) throw new Error('new row violates row-level security policy for table "company_values"') }
  const hasPoints = (id: string) => items.some(i => i.parent_id === id)

  return {
    async companyValues() { return w.isStaff() ? clone(items) : [] },
    async saveCompanyValue({ id, ...v }) {
      requireAdmin()
      const was = id ? items.find(x => x.id === id) : undefined
      if (id && !was) throw new Error('That isn’t here any more')
      const kind = v.kind ?? was?.kind ?? 'value'
      const base: CompanyValue = was ?? { id: w.uid(), kind, parent_id: null, text_en: null, text_es: null,
        sort: Math.max(0, ...items.filter(x => x.kind === kind && x.parent_id === (v.parent_id ?? null)).map(x => x.sort)) + 1 }
      const next: CompanyValue = { ...base, ...v,
        text_en: 'text_en' in v ? tidy(v.text_en) : base.text_en, text_es: 'text_es' in v ? tidy(v.text_es) : base.text_es }
      const problem = valueProblem(next)
      if (problem) throw new Error(problem)
      if (next.parent_id) {
        const parent = items.find(x => x.id === next.parent_id)
        if (!parent || parent.parent_id || parent.kind !== 'value' || next.kind !== 'value' || parent.id === next.id) throw new Error('A point goes under one of the values')
        if (was && hasPoints(was.id)) throw new Error('A value with points can’t be a point itself')
      }
      if (was) Object.assign(was, next)
      else items.push(next)
      return next.id
    },
    async deleteCompanyValue(id) {
      requireAdmin()
      for (let i = items.length - 1; i >= 0; i--) if (items[i].id === id || items[i].parent_id === id) items.splice(i, 1)
    },
    async orderCompanyValues(ids) {
      requireAdmin()
      ids.forEach((id, sort) => { const x = items.find(i => i.id === id); if (x) x.sort = sort })
    },
  }
}
