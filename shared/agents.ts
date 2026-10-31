// Agents: ways for an owner to see the app. The Agents button at the top right (owners only: admins
// with pay access) switches to one, and their menu then shows just that agent's pages (and Settings),
// with a line at the top saying whose view it is and a Focus card leading Today. "Owner" is everything.
// The usual agents are here; the owners change them for the business on Roles & responsibilities →
// Agents (settings.agent_views, the `agent_views` migration, which lets only an owner change them):
// which are on, their names, what they're for and their pages, and agents of their own. The choice of
// agent is each owner's own (preferences.agentView).
import { msg } from './i18n'

export type AgentIcon = 'finance' | 'marketing' | 'sales' | 'investor' | 'operations' | 'people' | 'stock' | 'custom'

/** A question the agent asks first, and the menu page that answers it (a page's key in the menu, src/app/AppShell.tsx). */
export interface AgentFocus { page: string; question?: string }

export interface Agent {
  key: string
  /** The usual agents' names and descriptions are English, shown with t(); the owners' own are shown as written. */
  name: string
  description: string
  icon: AgentIcon
  /** The menu pages it shows, by key (Settings always shows too). */
  pages: string[]
  /** What it leads Today with. */
  focus: AgentFocus[]
  on: boolean
  /** One the owners added, not one of the usual ones. */
  custom: boolean
}

/**
 * What the owners changed (settings.agent_views; null: the usual agents as they are). A usual agent is
 * there only with what differs; one of their own has all of it.
 */
export interface AgentSetting { key: string; name?: string; description?: string; icon?: AgentIcon; pages?: string[]; off?: boolean }
export type AgentViews = AgentSetting[]

const usual = (key: string, icon: AgentIcon, name: string, description: string, pages: string[], focus: AgentFocus[]): Agent =>
  ({ key, name, description, icon, pages, focus, on: true, custom: false })

/** The usual agents, in the order they're offered. */
export const AGENTS: readonly Agent[] = [
  usual('finance', 'finance', msg('Finance agent'), msg('What a finance lead needs: takings, costs, P&L, cash'),
    ['finances', 'pnl', 'invoices', 'credit', 'expenses', 'tax', 'grants', 'sales', 'documents'], [
      { page: 'sales', question: msg('How much did we take this week?') },
      { page: 'pnl', question: msg('Are we making a profit this month?') },
      { page: 'invoices', question: msg('Which bills are waiting to be paid?') },
      { page: 'tax', question: msg('What tax is due next?') },
    ]),
  usual('marketing', 'marketing', msg('Marketing agent'), msg('What a marketing lead needs: posts, offers, campaigns, ads, reviews'),
    ['social', 'offers', 'competitions', 'campaigns', 'ads', 'analytics', 'reviews', 'website', 'competitors', 'customers', 'brand'], [
      { page: 'social', question: msg('What are we posting this week?') },
      { page: 'reviews', question: msg('What are customers saying about us?') },
      { page: 'campaigns', question: msg('Which campaign goes out next?') },
      { page: 'ads', question: msg('Are the ads paying for themselves?') },
    ]),
  usual('sales', 'sales', msg('Sales agent'), msg('What a sales lead needs: takings, best sellers, customers, leads, loyalty'),
    ['sales', 'customers', 'leads', 'loyalty', 'reps', 'offers', 'menu'], [
      { page: 'sales', question: msg('What sold best this week?') },
      { page: 'leads', question: msg('Which enquiries need an answer?') },
      { page: 'customers', question: msg('Who are our regulars?') },
      { page: 'offers', question: msg('Which offers are on now?') },
    ]),
  usual('investor', 'investor', msg('Investor'), msg('What an investor asks: growth, profit, customers and how we compare'),
    ['dashboards', 'advisor', 'sales', 'pnl', 'finances', 'customers', 'reviews', 'competitors'], [
      { page: 'dashboards', question: msg('How is the business doing at a glance?') },
      { page: 'pnl', question: msg('Is it profitable?') },
      { page: 'sales', question: msg('Are takings growing?') },
      { page: 'competitors', question: msg('How do we compare with the places around us?') },
    ]),
  usual('operations', 'operations', msg('Operations agent'), msg('What runs the shop day to day: the rota, hours, jobs, stock and food safety'),
    ['rota', 'timecards', 'todo', 'stock', 'wholesale', 'suppliers', 'foodsafety', 'waste', 'hours', 'calendar'], [
      { page: 'rota', question: msg('Who is working this week?') },
      { page: 'todo', question: msg('What jobs are left to do?') },
      { page: 'stock', question: msg('What is running low?') },
      { page: 'foodsafety', question: msg('Are the food safety checks done?') },
    ]),
  usual('people', 'people', msg('People & HR agent'), msg('What looking after the team needs: the rota, time off, hours, hiring, roles and rules'),
    ['people', 'team', 'rota', 'timeoff', 'benefits', 'kitty', 'timecards', 'hiring', 'roles', 'rules', 'outsourcing'], [
      { page: 'timeoff', question: msg('Who is off, and who has asked?') },
      { page: 'timecards', question: msg('Are the timecards approved?') },
      { page: 'hiring', question: msg('Who has applied for a job?') },
      { page: 'rules', question: msg('Has everyone read the staff rules?') },
    ]),
  usual('stock', 'stock', msg('Stock & purchasing agent'), msg('What buying needs: stock, orders, suppliers, what the menu costs and waste'),
    ['stock', 'wholesale', 'suppliers', 'recipes', 'allergens', 'waste', 'invoices'], [
      { page: 'stock', question: msg('What do we need to order?') },
      { page: 'suppliers', question: msg('Who do we order from?') },
      { page: 'recipes', question: msg('What does each dish cost us to make?') },
      { page: 'waste', question: msg('What are we throwing away?') },
    ]),
]

/** The menu's Settings section: always in the menu, whichever agent, so nobody gets stuck. */
export const ALWAYS_IN_AGENTS = 'admin'
export const AGENT_NAME_MAX = 60
export const AGENT_DESCRIPTION_MAX = 200
const KEY = /^[a-z0-9-]{1,40}$/
const ICONS: AgentIcon[] = ['finance', 'marketing', 'sales', 'investor', 'operations', 'people', 'stock', 'custom']

const text = (x: unknown, max: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : undefined)
const keys = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((k): k is string => typeof k === 'string' && KEY.test(k)))].slice(0, 100) : undefined)

/** The business's agents: the usual ones with the owners' changes, then their own (whatever was saved, tidied). */
export function agentsFrom(views: AgentViews | null | undefined): Agent[] {
  const saved = Array.isArray(views) ? views.filter((v): v is AgentSetting => !!v && typeof v === 'object' && typeof v.key === 'string' && KEY.test(v.key)) : []
  const find = (key: string) => saved.find(v => v.key === key)
  const own = (v: AgentSetting): Agent | null => {
    const name = text(v.name, AGENT_NAME_MAX)
    return name ? {
      key: v.key, name, description: text(v.description, AGENT_DESCRIPTION_MAX) ?? '', icon: ICONS.includes(v.icon!) ? v.icon! : 'custom',
      pages: keys(v.pages) ?? [], focus: [], on: v.off !== true, custom: true,
    } : null
  }
  return [
    ...AGENTS.map(a => {
      const v = find(a.key)
      return v ? { ...a, name: text(v.name, AGENT_NAME_MAX) ?? a.name, description: text(v.description, AGENT_DESCRIPTION_MAX) ?? a.description,
        pages: keys(v.pages) ?? a.pages, on: v.off !== true } : { ...a }
    }),
    ...saved.filter((v, i) => !AGENTS.some(a => a.key === v.key) && saved.findIndex(x => x.key === v.key) === i).map(own).filter((a): a is Agent => !!a),
  ]
}

/** What to save for these agents: each usual one only as far as it differs (null when none does and there are none of their own). */
export function viewsFrom(agents: Agent[]): AgentViews | null {
  // The same pages in any order are the same (the menu keeps its own order).
  const same = (a: string[], b: string[]) => new Set(a).size === new Set(b).size && a.every(k => b.includes(k))
  const views = agents.flatMap((a): AgentSetting[] => {
    const u = AGENTS.find(x => x.key === a.key)
    if (!u) return [{ key: a.key, name: a.name.trim(), description: a.description.trim(), icon: a.icon, pages: a.pages, ...(a.on ? {} : { off: true }) }]
    const v: AgentSetting = {
      key: a.key,
      ...(a.name.trim() !== u.name ? { name: a.name.trim() } : {}),
      ...(a.description.trim() !== u.description ? { description: a.description.trim() } : {}),
      ...(same(a.pages, u.pages) ? {} : { pages: a.pages }),
      ...(a.on ? {} : { off: true }),
    }
    return Object.keys(v).length > 1 ? [v] : []
  })
  return views.length ? views : null
}

/** The agent someone is viewing the app as (their preferences.agentView), while it's still there and on; null: everything. */
export function agentOf(key: string | null | undefined, agents: Agent[]): Agent | null {
  return (key && agents.find(a => a.key === key && a.on)) || null
}

type MenuSection = { key: string; items: { key: string; children?: { key: string }[] }[] }

/** Menu pages left out while viewing as this agent: every page that isn't its own, Settings' apart. */
export function hiddenByAgent(agent: Agent | null, sections: MenuSection[]): string[] {
  if (!agent) return []
  return sections.filter(s => s.key !== ALWAYS_IN_AGENTS).flatMap(s => s.items.flatMap(n => [n, ...(n.children ?? [])]))
    .map(n => n.key).filter(k => !agent.pages.includes(k))
}

/** What the agent leads Today with: its questions about its own pages, then its other pages, four at most. */
export function focusOf(agent: Agent, max = 4): AgentFocus[] {
  const asked = agent.focus.filter(f => agent.pages.includes(f.page))
  const rest = agent.pages.filter(p => !asked.some(f => f.page === p)).map(page => ({ page }))
  return [...asked, ...rest].slice(0, max)
}

/** Why an agent can't be saved like this, if it can't. */
export function agentProblem(a: { name: string; pages: string[] }): string | null {
  if (!a.name.trim()) return msg('Give the agent a name')
  if (!a.pages.length) return msg('Pick at least one page for it')
  return null
}

/** A key for an agent the owners add. */
export const newAgentKey = (now = Date.now()) => `own-${now.toString(36)}`
