import { describe, expect, it } from 'vitest'
import { createMcpHandler } from '@modelcontextprotocol/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildMcpServer } from './mcp'
import { TOOLS, runTool, toolsFor } from './tools'
import { findAgent } from './agentTools'
import { agentsFrom, type AgentViews } from '../shared/agents'
import type { Profile } from '../shared/types'

const owner: Profile = {
  id: 'u1', full_name: 'Aron', email: 'a@test', role: 'admin', can_see_pay: true, colour: '#000', active: true, phone: null, birth_date: null,
  preferences: { language: 'en', agentView: 'marketing' },
}
const manager: Profile = { ...owner, id: 'u2', full_name: 'Mark', can_see_pay: false, preferences: {} }
const employee: Profile = { ...owner, id: 'u3', full_name: 'Julio', role: 'employee', can_see_pay: false, preferences: {} }

/** A stand-in for Supabase: each table's row, and the updates asked for. */
function fakeDb(views: AgentViews | null, preferences: Profile['preferences'] = owner.preferences) {
  const updates: { table: string; patch: unknown; id?: unknown }[] = []
  const rows: Record<string, unknown> = {
    business: { name: 'Easy Beans', timezone: 'Europe/Madrid', country: 'ES' },
    settings: { agent_views: views },
    profiles: { preferences },
  }
  const sb = {
    from(table: string) {
      const b: Record<string, unknown> = {}
      let update: { table: string; patch: unknown; id?: unknown } | undefined
      for (const m of ['select', 'single', 'maybeSingle', 'order']) b[m] = () => b
      b.update = (patch: unknown) => { update = { table, patch }; updates.push(update); return b }
      b.eq = (_: string, id: unknown) => { if (update) update.id = id; return b }
      b.then = (resolve: (v: unknown) => void) => resolve({ data: update ? null : rows[table], error: null })
      return b
    },
  } as unknown as SupabaseClient
  return { sb, updates }
}

const whoami = TOOLS.find(t => t.name === 'whoami')!
const switchAgent = TOOLS.find(t => t.name === 'switch_agent')!

type Listed = { agents?: { picked: string | null; how: string; list: { agent: string; name: string; pages: { page: string; title: string }[]; asks_first: { question: string; page: string }[] }[] } }

describe('agents for AI assistants', () => {
  it('whoami lists an owner’s agents, with their pages, first questions and the one picked in the app', async () => {
    const out = await runTool(whoami, { sb: fakeDb(null).sb, me: owner }, {}) as Listed
    expect(out.agents!.picked).toBe('marketing')
    expect(out.agents!.list.map(a => a.agent)).toEqual(['finance', 'marketing', 'sales', 'investor', 'operations', 'people', 'stock'])
    const finance = out.agents!.list[0]
    expect(finance.name).toBe('Finance agent')
    // Its pages are ones read_page opens, with their titles.
    expect(finance.pages.map(p => p.page)).toEqual(['finances', 'pnl', 'invoices', 'credit', 'expenses', 'tax', 'grants', 'sales', 'documents'])
    expect(finance.pages.every(p => p.title)).toBe(true)
    expect(finance.asks_first[0]).toEqual({ question: 'How much did we take this week?', page: 'sales' })
    expect(out.agents!.how).toContain('switch_agent')
  })

  it('whoami follows the owners’ changes: agents off, renamed and their own', async () => {
    const views: AgentViews = [
      { key: 'finance', off: true }, { key: 'sales', name: 'Ventas' },
      { key: 'own-1', name: 'Coffee buyer', description: 'Beans and milk', icon: 'stock', pages: ['stock', 'suppliers'] },
    ]
    const out = await runTool(whoami, { sb: fakeDb(views).sb, me: { ...owner, preferences: { agentView: 'finance' } } }, {}) as Listed
    expect(out.agents!.list.map(a => a.name)).not.toContain('Finance agent')
    expect(out.agents!.list.map(a => a.name)).toEqual(expect.arrayContaining(['Ventas', 'Coffee buyer']))
    expect(out.agents!.list.find(a => a.agent === 'own-1')).toMatchObject({ pages: [{ page: 'stock' }, { page: 'suppliers' }], asks_first: [] })
    // The one they picked is off now: everything.
    expect(out.agents!.picked).toBeNull()
  })

  it('whoami has no agents for anyone but an owner', async () => {
    for (const me of [manager, employee, { ...owner, role: 'partner' as const, partner_access: [] }]) {
      expect(await runTool(whoami, { sb: fakeDb(null).sb, me }, {})).not.toHaveProperty('agents')
    }
  })

  it('finds an agent by key or name, whole or part; "owner" is everything', () => {
    const agents = agentsFrom([{ key: 'own-1', name: 'Coffee buyer', pages: ['stock'] }])
    expect(findAgent(agents, 'finance')!.key).toBe('finance')
    expect(findAgent(agents, 'Marketing Agent')!.key).toBe('marketing')
    expect(findAgent(agents, 'HR agent')!.key).toBe('people')
    expect(findAgent(agents, 'purchasing')!.key).toBe('stock')
    expect(findAgent(agents, 'coffee buyer')!.key).toBe('own-1')
    expect(findAgent(agents, 'Owner')).toBeNull()
    expect(findAgent(agents, 'everything')).toBeNull()
    expect(() => findAgent(agents, 'legal')).toThrow('No agent matches "legal"')
    expect(() => findAgent(agents, 'agent')).toThrow('several')
  })

  it('switch_agent changes the agent the owner views the app as, keeping their other preferences', async () => {
    const { sb, updates } = fakeDb(null)
    const out = await runTool(switchAgent, { sb, me: { ...owner } }, { agent: 'Finance agent' })
    expect(out).toMatchObject({ ok: true, viewing_as: { agent: 'finance', name: 'Finance agent' }, note: expect.stringContaining('Finance agent') })
    expect(updates).toEqual([{ table: 'profiles', patch: { preferences: { language: 'en', agentView: 'finance' } }, id: 'u1' }])

    await expect(runTool(switchAgent, { sb, me: { ...owner } }, { agent: 'owner' })).resolves.toMatchObject({ ok: true, viewing_as: 'everything' })
    expect(updates[1].patch).toEqual({ preferences: { language: 'en', agentView: null } })

    await expect(runTool(switchAgent, { sb, me: { ...owner } }, { agent: 'legal' })).rejects.toThrow('No agent matches')
    expect(updates).toHaveLength(2)
  })

  it('switch_agent is the owners’ alone', async () => {
    const { sb, updates } = fakeDb(null)
    await expect(runTool(switchAgent, { sb, me: manager }, { agent: 'finance' })).rejects.toThrow('owners')
    await expect(runTool(switchAgent, { sb, me: employee }, { agent: 'finance' })).rejects.toThrow('Only admins')
    expect(toolsFor(employee).map(t => t.name)).not.toContain('switch_agent')
    expect(updates).toHaveLength(0)
  })

  it('tells Claude over MCP to answer as the agent that fits, and offers switch_agent', async () => {
    const handler = createMcpHandler(() => buildMcpServer(toolsFor(owner), { sb: fakeDb(null).sb, me: owner }))
    const res = await handler.fetch(new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }),
    }))
    const text = await res.text()
    const init = JSON.parse(text.startsWith('{') ? text : text.split('\n').find(l => l.startsWith('data:'))!.slice(5))
    expect(init.result.instructions).toContain('Answer as the agent whose area fits')
    expect(init.result.instructions).toContain('switch_agent')
    expect(toolsFor(owner).map(t => t.name)).toContain('switch_agent')
  })
})
