// The demo café's customer suggestions: three sections of ideas customers keep giving (oat milk, opening
// earlier, more seats in the shade) and a few not sorted yet. Mirrors the `customer_suggestions`
// migration's rules: the team reads, adds and sorts them and names and removes sections; only admins
// delete an idea.
import type { Api } from './api'
import { addDays, today } from '../../shared/time'
import {
  groupProblem, suggestionProblem, tidyGroupName, tidySuggestion, type CustomerSuggestion, type SuggestionGroup,
} from '../../shared/suggestions'

interface Who { isStaff: () => boolean; isAdmin: () => boolean; uid: () => string; nowIso: () => string }

type SuggestionsApi = Pick<Api, 'customerSuggestions' | 'saveSuggestion' | 'deleteSuggestion' | 'moveSuggestions' | 'saveSuggestionGroup' | 'deleteSuggestionGroup'>

const RLS = (table: string) => `new row violates row-level security policy for table "${table}"`

export function demoSuggestionsApi(w: Who): SuggestionsApi {
  const day = today()
  const ago = (days: number) => addDays(day, -days)
  const groups: SuggestionGroup[] = [
    { id: 'sg-oat', name: 'Oat milk at no extra cost', created_at: `${ago(20)}T10:00:00Z` },
    { id: 'sg-early', name: 'Open earlier on weekdays', created_at: `${ago(12)}T10:00:00Z` },
    { id: 'sg-shade', name: 'More seats in the shade', created_at: `${ago(6)}T10:00:00Z` },
  ]
  let n = 0
  const idea = (text: string, days: number, x: Partial<CustomerSuggestion> = {}): CustomerSuggestion => ({
    id: `cs-${++n}`, text, customer: null, source: null, heard_on: ago(days), group_id: null, created_at: `${ago(days)}T09:${String(10 + n).padStart(2, '0')}:00Z`, ...x,
  })
  const ideas: CustomerSuggestion[] = [
    idea('Oat milk shouldn’t cost extra', 20, { customer: 'Lucía, a regular', source: 'In the café', group_id: 'sg-oat' }),
    idea('Plant milks free like in Málaga cafés', 14, { source: 'Google review', group_id: 'sg-oat' }),
    idea('Why is oat milk 50 cents more?', 9, { customer: 'Tom', source: 'In the café', group_id: 'sg-oat' }),
    idea('Free oat milk would make me come every day', 2, { source: 'Instagram', group_id: 'sg-oat' }),
    idea('Open at 7:30 so I can grab a coffee before work', 12, { customer: 'Javier', source: 'In the café', group_id: 'sg-early' }),
    idea('Opening at 8 is too late for the school run', 5, { source: 'Google review', group_id: 'sg-early' }),
    idea('A parasol over the corner tables', 6, { customer: 'Ingrid', source: 'In the café', group_id: 'sg-shade' }),
    idea('Sunday brunch with eggs', 3, { customer: 'Marta', source: 'WhatsApp' }),
    idea('Water bowl for dogs by the door', 1, { source: 'Word of mouth' }),
    idea('Start opening earlier, like 7am', 0, { customer: 'Pedro', source: 'In the café' }),
  ]

  const needStaff = (table: string) => { if (!w.isStaff()) throw new Error(RLS(table)) }
  const groupHere = (id: string | null | undefined) => {
    if (id && !groups.some(g => g.id === id)) throw new Error('That section isn’t here any more')
  }

  return {
    async customerSuggestions() {
      return w.isStaff() ? { ideas: structuredClone(ideas), groups: structuredClone(groups) } : { ideas: [], groups: [] }
    },
    async saveSuggestion({ id, ...input }) {
      needStaff('customer_suggestions')
      const was = id ? ideas.find(i => i.id === id) : undefined
      if (id && !was) throw new Error('That isn’t here any more')
      const next = tidySuggestion({
        id: was?.id ?? w.uid(), text: '', customer: null, source: null, heard_on: today(), group_id: null, created_at: w.nowIso(),
        ...was, ...input,
      }) as CustomerSuggestion
      const problem = suggestionProblem(next)
      if (problem) throw new Error(problem)
      groupHere(next.group_id)
      if (was) Object.assign(was, next)
      else ideas.push(next)
      return next.id
    },
    async deleteSuggestion(id) {
      const i = ideas.findIndex(x => x.id === id)
      if (w.isAdmin() && i >= 0) ideas.splice(i, 1)
    },
    async moveSuggestions(ids, groupId) {
      needStaff('customer_suggestions')
      groupHere(groupId)
      for (const i of ideas) if (ids.includes(i.id)) i.group_id = groupId
    },
    async saveSuggestionGroup({ id, name }) {
      needStaff('suggestion_groups')
      const problem = groupProblem(name)
      if (problem) throw new Error(problem)
      if (id) {
        const g = groups.find(x => x.id === id)
        if (!g) throw new Error('That section isn’t here any more')
        g.name = tidyGroupName(name)
        return id
      }
      const g: SuggestionGroup = { id: w.uid(), name: tidyGroupName(name), created_at: w.nowIso() }
      groups.push(g)
      return g.id
    },
    async deleteSuggestionGroup(id) {
      if (!w.isStaff()) return
      const i = groups.findIndex(g => g.id === id)
      if (i < 0) return
      groups.splice(i, 1)
      for (const x of ideas) if (x.group_id === id) x.group_id = null
    },
  }
}
