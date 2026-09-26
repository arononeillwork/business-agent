import { describe, expect, it } from 'vitest'
import { createMcpHandler } from '@modelcontextprotocol/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildMcpServer } from './mcp'
import { TOOLS, runTool, toolsFor } from './tools'
import type { Profile } from '../shared/types'

const person = (role: Profile['role']): Profile => ({
  id: 'u1', full_name: 'Aron', email: 'a@test', role, can_see_pay: role === 'admin', colour: '#000',
  active: true, phone: null, birth_date: null,
})

/** Minimal stand-in for a Supabase query builder that resolves to fixed data. */
const fakeSb = (data: unknown) => {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'single', 'maybeSingle', 'order', 'gte', 'lt', 'lte']) builder[m] = () => builder
  builder.then = (resolve: (v: unknown) => void) => resolve({ data, error: null })
  return { from: () => builder } as unknown as SupabaseClient
}

async function rpc(handler: ReturnType<typeof createMcpHandler>, id: number, method: string, params: unknown) {
  const res = await handler.fetch(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  }))
  const text = await res.text()
  const json = text.startsWith('{') ? text : text.split('\n').find(l => l.startsWith('data:'))!.slice(5)
  return JSON.parse(json)
}

describe('AI connector tools', () => {
  it('hides admin tools from employees', () => {
    const employee = toolsFor(person('employee')).map(t => t.name)
    expect(employee).toContain('get_schedule')
    expect(employee).toContain('request_timecard_correction')
    expect(employee).not.toContain('create_shift')
    expect(employee).not.toContain('update_business_details')
    expect(toolsFor(person('admin')).length).toBe(TOOLS.length)
  })

  it('refuses admin tools for employees even if called directly', async () => {
    const t = TOOLS.find(x => x.name === 'delete_shift')!
    await expect(runTool(t, { sb: fakeSb(null), me: person('employee') }, {})).rejects.toThrow('Only admins')
  })

  it('validates input and requires confirmation for deletes', async () => {
    const t = TOOLS.find(x => x.name === 'delete_shift')!
    await expect(runTool(t, { sb: fakeSb(null), me: person('admin') },
      { shift_id: '6f1c1f3e-8d2a-4c47-9d61-2b8f3c1e0a11' })).rejects.toThrow('confirm')
  })

  it('serves tools over MCP and runs them', async () => {
    const me = person('employee')
    const handler = createMcpHandler(() => buildMcpServer(toolsFor(me),
      { sb: fakeSb({ name: 'Test Café', timezone: 'Europe/Madrid' }), me }))
    const init = await rpc(handler, 1, 'initialize', {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' },
    })
    expect(init.result.serverInfo.name).toBe('business-agent')

    const list = await rpc(handler, 2, 'tools/list', {})
    const names = list.result.tools.map((t: { name: string }) => t.name)
    expect(names).toContain('whoami')
    expect(names).not.toContain('create_shift')
    const schedule = list.result.tools.find((t: { name: string }) => t.name === 'get_schedule')
    expect(schedule.inputSchema.properties).toHaveProperty('from')

    const call = await rpc(handler, 3, 'tools/call', { name: 'whoami', arguments: {} })
    const out = JSON.parse(call.result.content[0].text)
    expect(out).toMatchObject({ name: 'Aron', role: 'employee', business: 'Test Café' })
  })
})
