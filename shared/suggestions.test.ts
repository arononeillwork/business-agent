import { describe, expect, it } from 'vitest'
import {
  boardOf, findGroup, groupProblem, matchesSuggestion, nameFromIdea, suggestionProblem, tidySuggestion, type CustomerSuggestion, type SuggestionGroup,
} from './suggestions'

const group = (id: string, name: string): SuggestionGroup => ({ id, name, created_at: '2026-11-01T10:00:00Z' })
const idea = (id: string, heard_on: string, group_id: string | null = null, text = id): CustomerSuggestion =>
  ({ id, text, customer: null, source: null, heard_on, group_id, created_at: `${heard_on}T10:00:00Z` })

describe('customer suggestions', () => {
  it('puts the most asked for section first, each newest first, and keeps the rest as not sorted yet', () => {
    const groups = [group('g-a', 'Brunch'), group('g-b', 'Oat milk'), group('g-c', 'Dogs')]
    const ideas = [
      idea('1', '2026-11-01', 'g-b'), idea('2', '2026-11-03', 'g-b'), idea('3', '2026-11-02', 'g-a'),
      idea('4', '2026-11-05'), idea('5', '2026-11-06'), idea('6', '2026-11-04', 'gone'),
    ]
    const board = boardOf(ideas, groups)
    expect(board.sections.map(s => [s.group.name, s.ideas.map(i => i.id)])).toEqual([
      ['Oat milk', ['2', '1']], ['Brunch', ['3']], ['Dogs', []],
    ])
    // An idea whose section has gone counts as not sorted yet.
    expect(board.unsorted.map(i => i.id)).toEqual(['5', '4', '6'])
    expect(board.total).toBe(6)
  })

  it('names a section after an idea: its first words, without the full stop', () => {
    expect(nameFromIdea('  Oat milk  at no extra cost. ')).toBe('Oat milk at no extra cost')
    expect(nameFromIdea('Could you please open a little earlier on weekdays so I can grab a coffee before the school run?'))
      .toBe('Could you please open a little earlier on weekdays so I can…')
  })

  it('finds a section by its name, accents and case aside, or the one name containing it', () => {
    const groups = [group('g-a', 'Más sombra en la terraza'), group('g-b', 'Oat milk at no extra cost'), group('g-c', 'Oat cookies')]
    expect(findGroup(groups, 'mas SOMBRA en la terraza')?.id).toBe('g-a')
    expect(findGroup(groups, 'extra cost')?.id).toBe('g-b')
    expect(findGroup(groups, 'oat')).toBeNull() // two names contain it
    expect(findGroup(groups, 'g-c')?.name).toBe('Oat cookies')
    expect(findGroup(groups, 'parking')).toBeNull()
  })

  it('checks and tidies what is typed', () => {
    expect(suggestionProblem({ text: '  ' })).toBe('Write the idea')
    expect(suggestionProblem({ text: 'x'.repeat(1001) })).toBe('Keep the idea to 1,000 characters')
    expect(suggestionProblem({ text: 'Oat milk', source: 'x'.repeat(81) })).toBe('Keep where it was heard to 80 characters')
    expect(suggestionProblem({ text: 'Oat milk' })).toBeNull()
    expect(groupProblem(' ')).toBe('Give the section a name')
    expect(tidySuggestion({ text: '  Oat   milk ', customer: ' ', source: ' Instagram ' })).toEqual({ text: 'Oat milk', customer: null, source: 'Instagram' })
  })

  it('searches the idea, who said it, where, and its section', () => {
    const i = { text: 'Leche de avena gratis', customer: 'Lucía', source: 'At the counter' }
    expect(matchesSuggestion(i, 'AVENA')).toBe(true)
    expect(matchesSuggestion(i, 'lucia')).toBe(true)
    expect(matchesSuggestion(i, 'counter')).toBe(true)
    expect(matchesSuggestion(i, 'oat', { name: 'Oat milk' })).toBe(true)
    expect(matchesSuggestion(i, 'dogs')).toBe(false)
  })
})
