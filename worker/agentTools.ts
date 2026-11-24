// Agents for AI assistants: the owner's agents (shared/agents.ts) are ways to see the app (Finance,
// Marketing, Sales…, and the owners' own). whoami lists them for an owner, with the pages each covers and
// what it asks first, so Claude answers as the agent that fits what was asked (or the one named, by voice:
// "finance agent, how did we do this week?"). switch_agent changes the agent the owner views the app as,
// the same as the Agents button at the top of the app (their preferences.agentView).
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile, Settings } from '../shared/types'
import { agentOf, agentsFrom, focusOf, type Agent } from '../shared/agents'
import { teamRole } from '../shared/teamRoles'
import { pagesFor } from './pageTools'
import type { ToolDef } from './tools'

const tool = <S extends z.ZodType>(def: ToolDef<S>) => def as unknown as ToolDef

/** Agents are the owners' (an admin with pay access), as the Agents button is. */
const isOwner = (me: Profile) => teamRole(me) === 'owner'

/** What a name for "no agent, every page" can be: the menu's "Owner — everything". */
const EVERYTHING = ['owner', 'everything', 'all', 'none', 'no agent', 'owner — everything', 'owner - everything']

/** The business's agents that are on, with the owners' changes and their own. */
async function agentsOn(sb: SupabaseClient): Promise<Agent[]> {
  const { data, error } = await sb.from('settings').select('agent_views').maybeSingle()
  if (error) throw new Error(error.message)
  return agentsFrom((data as Pick<Settings, 'agent_views'> | null)?.agent_views).filter(a => a.on)
}

/** An agent as Claude reads it: its pages (the ones read_page opens) and the questions it starts with. */
function describe(a: Agent, me: Profile) {
  const pages = pagesFor(me)
  return {
    agent: a.key,
    name: a.name,
    for: a.description || undefined,
    pages: a.pages.flatMap(k => pages.filter(p => p.key === k).map(p => ({ page: p.key, title: p.title }))),
    asks_first: focusOf(a).flatMap(f => (f.question ? [{ question: f.question, page: f.page }] : [])),
  }
}

/** For whoami: an owner's agents and the one they're viewing the app as; nothing for anyone else. */
export async function agentsPart(sb: SupabaseClient, me: Profile) {
  if (!isOwner(me)) return {}
  const agents = await agentsOn(sb)
  if (!agents.length) return {}
  return {
    agents: {
      picked: agentOf(me.preferences?.agentView, agents)?.key ?? null,
      how: 'Answer as the agent whose area fits what was asked, or the one they name; otherwise the one picked (null: everything, as the owner). '
        + 'Say in a few words which agent is answering, and look at its pages first. "Switch to the … agent": switch_agent.',
      list: agents.map(a => describe(a, me)),
    },
  }
}

/** The agent asked for, by key or name (whole or part, any case); null: everything. */
export function findAgent(agents: Agent[], asked: string): Agent | null {
  const q = asked.trim().toLowerCase()
  if (EVERYTHING.includes(q)) return null
  const exact = agents.filter(a => a.key === q || a.name.toLowerCase() === q)
  const short = q.replace(/\s+agent$/, '')
  const matches = exact.length ? exact : agents.filter(a => a.key.includes(short) || a.name.toLowerCase().includes(short))
  if (matches.length === 1) return matches[0]
  const names = agents.map(a => `${a.name} (${a.key})`).join(', ')
  if (!matches.length) throw new Error(`No agent matches "${asked}". The agents: ${names}, or "owner" for everything`)
  throw new Error(`"${asked}" matches several agents: ${matches.map(a => `${a.name} (${a.key})`).join(', ')}`)
}

export const AGENT_TOOLS: ToolDef[] = [
  tool({
    name: 'switch_agent',
    title: 'Switch agent',
    description: 'Owners: view the app as one of the business’s agents (whoami lists them), as with the Agents button at the top of the app: '
      + 'their menu then shows just that agent’s pages and Today leads with its questions. Answer as that agent from then on. '
      + 'agent: its key or name ("finance", "Marketing agent"); "owner" goes back to everything.',
    admin: true,
    input: z.object({ agent: z.string().trim().min(1).max(80) }),
    async run({ sb, me }, a) {
      if (!isOwner(me)) throw new Error('Agents are the owners’ (an admin with pay access): ask an owner')
      const agent = findAgent(await agentsOn(sb), a.agent)
      // Their other preferences as they are now, not as they were when the connection started.
      const { data, error } = await sb.from('profiles').select('preferences').eq('id', me.id).single()
      if (error) throw new Error(error.message)
      const preferences = { ...((data as Pick<Profile, 'preferences'> | null)?.preferences ?? {}), agentView: agent?.key ?? null }
      const saved = await sb.from('profiles').update({ preferences }).eq('id', me.id)
      if (saved.error) throw new Error(saved.error.message)
      me.preferences = preferences
      const app = 'Their app shows it the next time it opens or comes back on screen.'
      return agent
        ? { ok: true, viewing_as: describe(agent, me), note: `Answer as the ${agent.name} now. ${app}` }
        : { ok: true, viewing_as: 'everything', note: `No agent: every page, as the owner. ${app}` }
    },
  }),
]
