import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AGENTS, agentOf, agentProblem, agentsFrom, focusOf, hiddenByAgent, newAgentKey, viewsFrom, type Agent } from './agents'

// The menu's pages, by key, as the app shell lists them (src/app/AppShell.tsx, SECTIONS and the pages of your own).
const shell = readFileSync(join(import.meta.dirname, '../src/app/AppShell.tsx'), 'utf8')
const MENU_PAGES = [...shell.matchAll(/\{ key: '([a-z-]+)', to: '/g)].map(m => m[1])

const SECTIONS = [
  { key: 'business', items: [{ key: 'people' }, { key: 'documents' }] },
  { key: 'accounts', items: [{ key: 'finances' }, { key: 'pnl', children: [{ key: 'pnl-lines' }] }] },
  { key: 'team', items: [{ key: 'rota' }] },
  { key: 'admin', items: [{ key: 'pages' }, { key: 'notifications' }] },
]
const finance = () => agentsFrom(null).find(a => a.key === 'finance')!

describe('agents', () => {
  it('start as the usual ones, all on, each with its pages and what it asks first', () => {
    const agents = agentsFrom(null)
    expect(agents.map(a => a.key)).toEqual(['finance', 'marketing', 'sales', 'investor', 'operations', 'people', 'stock'])
    expect(agents.every(a => a.on && !a.custom && a.pages.length > 0 && a.focus.length >= 3)).toBe(true)
    expect(agentsFrom(undefined)).toEqual(agents)
    expect(viewsFrom(agents)).toBeNull()
  })

  it('only show pages that are in the menu, and ask about their own pages', () => {
    expect(MENU_PAGES).toContain('finances')
    for (const a of AGENTS) {
      expect(a.pages.filter(p => !MENU_PAGES.includes(p)), a.key).toEqual([])
      expect(a.focus.filter(f => !a.pages.includes(f.page)), a.key).toEqual([])
      expect(new Set(a.pages).size, a.key).toBe(a.pages.length)
    }
    expect(finance().pages).toEqual(expect.arrayContaining(['finances', 'pnl', 'invoices', 'credit', 'expenses', 'tax', 'grants', 'sales', 'documents']))
  })

  it('keep the owners’ changes: only what differs from the usual, and their own in full', () => {
    const agents = agentsFrom(null).map((a): Agent => (
      a.key === 'finance' ? { ...a, on: false }
        : a.key === 'sales' ? { ...a, name: 'Ventas y clientes', pages: ['sales', 'customers'] }
        : a.key === 'investor' ? { ...a, pages: [...a.pages].reverse() } // the same pages in another order: no change
        : a))
    const own: Agent = { key: 'own-1', name: ' Coffee buyer ', description: 'Beans and milk', icon: 'custom', pages: ['stock', 'suppliers'], focus: [], on: true, custom: true }
    const views = viewsFrom([...agents, own])
    expect(views).toEqual([
      { key: 'finance', off: true },
      { key: 'sales', name: 'Ventas y clientes', pages: ['sales', 'customers'] },
      { key: 'own-1', name: 'Coffee buyer', description: 'Beans and milk', icon: 'custom', pages: ['stock', 'suppliers'] },
    ])
    const back = agentsFrom(views)
    expect(back.find(a => a.key === 'finance')?.on).toBe(false)
    expect(back.find(a => a.key === 'sales')).toMatchObject({ name: 'Ventas y clientes', pages: ['sales', 'customers'], description: AGENTS[2].description })
    expect(back.at(-1)).toEqual({ ...own, name: 'Coffee buyer' })
    expect(viewsFrom(back)).toEqual(views)
  })

  it('make sense of whatever was saved', () => {
    expect(agentsFrom({ key: 'finance' } as never)).toEqual(agentsFrom(null))
    const agents = agentsFrom([null, 'x', { key: 'BAD KEY', name: 'x' }, { key: 'own-2' }, { key: 'own-3', name: 'Mine', pages: ['stock', 7, 'stock', 'Bad'] },
      { key: 'own-3', name: 'Twice' }, { key: 'marketing', name: '', pages: 'social', off: 'yes' }] as never)
    expect(agents.filter(a => a.custom)).toEqual([{ key: 'own-3', name: 'Mine', description: '', icon: 'custom', pages: ['stock'], focus: [], on: true, custom: true }])
    expect(agents.find(a => a.key === 'marketing')).toEqual(AGENTS[1])
  })

  it('show only the chosen agent’s pages in the menu, Settings always', () => {
    expect(hiddenByAgent(null, SECTIONS)).toEqual([])
    expect(hiddenByAgent({ ...finance(), pages: ['finances', 'pnl'] }, SECTIONS)).toEqual(['people', 'documents', 'pnl-lines', 'rota'])
    expect(hiddenByAgent(finance(), SECTIONS)).not.toContain('pages')
  })

  it('view as an agent only while it’s there and on', () => {
    const agents = agentsFrom([{ key: 'finance', off: true }])
    expect(agentOf('marketing', agents)?.key).toBe('marketing')
    expect(agentOf('finance', agents)).toBeNull()
    expect(agentOf('gone', agents)).toBeNull()
    expect(agentOf(null, agents)).toBeNull()
    expect(agentOf(undefined, agents)).toBeNull()
  })

  it('lead Today with the agent’s questions about its own pages, then its other pages', () => {
    expect(focusOf(finance()).map(f => f.page)).toEqual(['sales', 'pnl', 'invoices', 'tax'])
    expect(focusOf({ ...finance(), pages: ['documents', 'pnl', 'finances'] })).toEqual([
      { page: 'pnl', question: 'Are we making a profit this month?' }, { page: 'documents' }, { page: 'finances' },
    ])
  })

  it('need a name and a page', () => {
    expect(agentProblem({ name: ' ', pages: ['sales'] })).toBe('Give the agent a name')
    expect(agentProblem({ name: 'Mine', pages: [] })).toBe('Pick at least one page for it')
    expect(agentProblem({ name: 'Mine', pages: ['sales'] })).toBeNull()
    expect(newAgentKey(1_700_000_000_000)).toMatch(/^own-[a-z0-9]+$/)
  })
})
