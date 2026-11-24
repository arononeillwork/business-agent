// Customer suggestions for AI assistants: the ideas customers give the business, which the owners mostly
// add through their AI ("a customer suggested free oat milk"). An idea goes in the section that already
// says the same thing, so its counter goes up; a new idea starts a section, or waits in "not sorted yet".
// Same rules as the app (the `customer_suggestions` migration): the team reads, adds and sorts them; only
// admins delete one (through delete_page_record on the Suggestions page).
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolDef } from './tools'
import { today } from '../shared/time'
import {
  SUGGESTION_LIMITS, USUAL_SOURCES, boardOf, findGroup, groupProblem, matchesSuggestion, sourceToKeep, suggestionProblem, tidyGroupName, tidySuggestion,
  type CustomerSuggestion, type SuggestionGroup,
} from '../shared/suggestions'

const tool = <S extends z.ZodType>(def: ToolDef<S>) => def as unknown as ToolDef

function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message)
  return res.data as NonNullable<T>
}

const IDEA_COLUMNS = 'id, text, customer, source, heard_on, group_id, created_at'
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

async function readAll(sb: SupabaseClient) {
  const [ideas, groups] = await Promise.all([
    sb.from('customer_suggestions').select(IDEA_COLUMNS).order('created_at', { ascending: false }).then(r => check(r) as CustomerSuggestion[]),
    sb.from('suggestion_groups').select('id, name, created_at').order('name').then(r => check(r) as SuggestionGroup[]),
  ])
  return { ideas, groups }
}

const describeIdea = (i: CustomerSuggestion) => ({ id: i.id, text: i.text, customer: i.customer, source: i.source, heard_on: i.heard_on })

/** The section named, made when there's none by that name yet. */
async function sectionFor(sb: SupabaseClient, groups: SuggestionGroup[], name: string): Promise<{ group: SuggestionGroup; started: boolean }> {
  const found = findGroup(groups, name)
  if (found) return { group: found, started: false }
  const problem = groupProblem(name)
  if (problem) throw new Error(problem)
  const group = check(await sb.from('suggestion_groups').insert({ name: tidyGroupName(name) }).select('id, name, created_at').single()) as SuggestionGroup
  return { group, started: true }
}

const sectionArg = z.string().max(SUGGESTION_LIMITS.group)

export const SUGGESTION_TOOLS: ToolDef[] = [
  tool({
    name: 'list_customer_suggestions',
    title: 'Customer suggestions',
    description: 'The ideas customers have given the business (kept for the team, not shown to customers), in sections of the same idea, the most asked for first: each section\'s name, how many times customers asked (`count`) and its ideas (who suggested it, where it was heard, when); then the ideas not sorted into a section yet. `search` finds ideas and sections mentioning it. Read it before add_customer_suggestion, to file a new idea in the section that already says the same thing.',
    readOnly: true,
    input: z.object({
      search: z.string().max(100).optional().describe('e.g. "oat milk", "opening hours"'),
    }),
    async run({ sb }, a) {
      const { ideas, groups } = await readAll(sb)
      const board = boardOf(ideas, groups)
      const q = a.search ?? ''
      const sections = board.sections
        // A section whose name matches shows all its ideas; otherwise only the ideas that do.
        .map(s => ({ s, shown: s.ideas.filter(i => matchesSuggestion(i, q, s.group)) }))
        .filter(x => !q || x.shown.length)
        .map(({ s, shown }) => ({ section_id: s.group.id, section: s.group.name, count: s.ideas.length, ideas: shown.map(describeIdea) }))
      const unsorted = board.unsorted.filter(i => matchesSuggestion(i, q)).map(describeIdea)
      return {
        total: board.total, sections, not_sorted_yet: unsorted,
        ...(q && !sections.length && !unsorted.length ? { note: `Nothing mentions "${q}". Sections: ${board.sections.map(s => s.group.name).join(', ') || 'none yet'}` } : {}),
      }
    },
  }),

  tool({
    name: 'add_customer_suggestion',
    title: 'Add a customer suggestion',
    description: 'Keep an idea a customer gave the business ("oat milk at no extra cost", "open earlier on Saturdays"), in their words or close to them. Put it in a `section`: the name of the one that already says the same thing (list_customer_suggestions shows them), so its counter goes up, or a short name for a new idea, which starts a section. Leave `section` out when unsure: it waits in "not sorted yet" for the team to drag into place. Several customers asking the same thing are an idea each.',
    input: z.object({
      text: z.string().min(1).max(SUGGESTION_LIMITS.text).describe('The idea'),
      section: sectionArg.optional().describe('The section: an existing one\'s name (or id), or a new one\'s short name, e.g. "Oat milk at no extra cost"'),
      customer: z.string().max(SUGGESTION_LIMITS.customer).optional().describe('Who suggested it, when known: "Lucía, a regular"'),
      source: z.string().max(SUGGESTION_LIMITS.source).optional().describe(`Where it was heard: ${USUAL_SOURCES.join(', ')}, or anything else`),
      heard_on: date.optional().describe('The day it was heard; leave it out for today (the business\'s day)'),
    }),
    async run({ sb }, a) {
      // A usual place by its usual name ("word of mouth" is Word of mouth); no day is today, the business's.
      const row = tidySuggestion({ text: a.text, customer: a.customer, source: sourceToKeep(a.source), heard_on: a.heard_on ?? today() })
      const problem = suggestionProblem(row)
      if (problem) throw new Error(problem)
      const { groups } = await readAll(sb)
      const placed = a.section?.trim() ? await sectionFor(sb, groups, a.section) : null
      const saved = check(await sb.from('customer_suggestions').insert({ ...row, group_id: placed?.group.id ?? null }).select(IDEA_COLUMNS).single()) as CustomerSuggestion
      if (!placed) return { added: describeIdea(saved), section: null, note: 'It waits in "not sorted yet" on the Suggestions page' }
      const { count } = await sb.from('customer_suggestions').select('id', { count: 'exact', head: true }).eq('group_id', placed.group.id)
      return { added: describeIdea(saved), section: placed.group.name, started_section: placed.started || undefined, section_count: count ?? undefined }
    },
  }),

  tool({
    name: 'sort_customer_suggestions',
    title: 'Sort customer suggestions',
    description: 'Move ideas (by their ids from list_customer_suggestions) into a section, by an existing one\'s name or id or a new one\'s name (which starts it), or back to "not sorted yet" with `section: null`. `rename` renames the section they go into. To merge two sections, move every idea of one into the other.',
    input: z.object({
      ids: z.array(z.string()).min(1).max(200).describe('The ideas to move'),
      section: sectionArg.nullable().describe('Where they go; null for not sorted yet'),
      rename: sectionArg.optional().describe('A new name for that section'),
    }),
    async run({ sb }, a) {
      const { ideas, groups } = await readAll(sb)
      const missing = a.ids.filter(id => !ideas.some(i => i.id === id))
      if (missing.length) throw new Error(`No idea ${missing.join(', ')}: list_customer_suggestions gives each one's id`)
      const placed = a.section?.trim() ? await sectionFor(sb, groups, a.section) : null
      if (a.rename !== undefined) {
        if (!placed) throw new Error('Name the section to rename')
        const problem = groupProblem(a.rename)
        if (problem) throw new Error(problem)
        check(await sb.from('suggestion_groups').update({ name: tidyGroupName(a.rename) }).eq('id', placed.group.id))
      }
      check(await sb.from('customer_suggestions').update({ group_id: placed?.group.id ?? null }).in('id', a.ids))
      const after = await readAll(sb)
      const section = placed ? boardOf(after.ideas, after.groups).sections.find(s => s.group.id === placed.group.id) : null
      return {
        moved: a.ids.length,
        section: section ? section.group.name : null,
        started_section: placed?.started || undefined,
        section_count: section?.ideas.length,
      }
    },
  }),
]
