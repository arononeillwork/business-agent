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
    expect(employee).not.toContain('list_customers')
    // The till side of rewards and the kitty are the whole team's; approving, paying in and out are the admins'.
    expect(employee).toEqual(expect.arrayContaining(['list_sales_reps', 'log_reward', 'use_reward_balance', 'staff_kitty']))
    expect(employee).not.toContain('decide_reward')
    expect(employee).not.toContain('kitty_put_in')
    expect(toolsFor(person('admin')).length).toBe(TOOLS.length)
  })

  it('gives partners only read-only tools for the areas they were given', () => {
    const gestoria: Profile = { ...person('partner'), partner_company: 'Gestoría', partner_access: ['payroll', 'finances'] }
    const names = toolsFor(gestoria).map(t => t.name)
    expect(names).toEqual(expect.arrayContaining(['whoami', 'get_business_details', 'list_timecards', 'labour_summary', 'list_expenses']))
    expect(names).not.toContain('list_calendar_events')
    expect(names).not.toContain('clock')
    expect(names).not.toContain('request_time_off')
    expect(names).not.toContain('save_expense')
    expect(names).toContain('credit_and_debit')
    expect(names).not.toContain('record_credit_debit_payment')
    expect(names).not.toContain('list_customers')
    expect(toolsFor(gestoria).every(t => t.readOnly)).toBe(true)

    const supplier: Profile = { ...person('partner'), partner_access: ['calendar'] }
    expect(toolsFor(supplier).map(t => t.name)).toEqual(expect.arrayContaining(['list_calendar_events']))
    expect(toolsFor(supplier).map(t => t.name)).not.toContain('list_timecards')
    expect(toolsFor({ ...person('partner'), partner_access: [] }).map(t => t.name).sort())
      .toEqual(['get_business_details', 'get_settings', 'whoami'])
  })

  it('refuses tools outside a partner’s areas even if called directly', async () => {
    const supplier: Profile = { ...person('partner'), partner_access: ['calendar'] }
    const call = (name: string, args: unknown = {}) => runTool(TOOLS.find(x => x.name === name)!, { sb: fakeSb([]), me: supplier }, args)
    await expect(call('list_expenses')).rejects.toThrow('read-only')
    await expect(call('add_calendar_event', { title: 'Hack', category: 'event', starts_on: '2026-10-01' })).rejects.toThrow('read-only')
    await expect(call('clock', {})).rejects.toThrow('read-only')
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

  it('credit_and_debit: what’s left to pay back and to come in, grants included, with the totals', async () => {
    const rows: Record<string, unknown> = {
      credit_debit_items: [
        { id: 'i1', direction: 'debit', kind: 'loan', name: 'Loan from Jeremy', party: 'Jeremy', amount: '1000.00', instalment: '100.00', every_months: 1,
          next_due: '2099-11-01', possible: false, done: false, notes: null, payments: [{ id: 'p1', item_id: 'i1', paid_on: '2026-10-01', amount: '100.00', note: null }] },
        { id: 'i2', direction: 'credit', kind: 'sale', name: 'Old coffee machine', party: null, amount: '1200.00', instalment: null, every_months: null,
          next_due: null, possible: true, done: false, notes: null, payments: [] },
      ],
      grant_applications: [
        { id: 'g1', grant_id: 'talento-joven', grant_name: 'Hiring grant: Talento Joven', stage: 'awarded', amount_requested: '5000.00', amount_awarded: '4000.00',
          amount_received: '1000.00', deadline: null, deadline_label: null, notes: null },
        { id: 'g2', grant_id: 'linea-2', grant_name: 'Línea 2', stage: 'rejected', amount_requested: '3000.00', amount_awarded: null, amount_received: null,
          deadline: null, deadline_label: null, notes: null },
      ],
    }
    const builder = (data: unknown) => {
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order']) b[m] = () => b
      b.then = (resolve: (v: unknown) => void) => resolve({ data, error: null })
      return b
    }
    const sb = { from: (table: string) => builder(rows[table]) } as unknown as SupabaseClient
    const out = await runTool(TOOLS.find(x => x.name === 'credit_and_debit')!, { sb, me: person('admin') }, {}) as {
      totals_eur: Record<string, number>; lines: { name: string; left_eur: number; status: string; direction: string }[]
    }
    expect(out.totals_eur).toEqual({ to_pay_back: 900, paid_out_a_month: 100, coming_in: 3000, could_raise: 1200 })
    expect(out.lines.map(l => [l.name, l.direction, l.left_eur, l.status])).toEqual([
      ['Loan from Jeremy', 'to pay back', 900, 'open'], ['Old coffee machine', 'coming in', 1200, 'possible'], ['Hiring grant: Talento Joven', 'coming in', 3000, 'open'],
    ])
    // Without pay access there's nothing to read, and changes need pay access too.
    await expect(runTool(TOOLS.find(x => x.name === 'credit_and_debit')!, { sb, me: { ...person('admin'), can_see_pay: false } }, {})).rejects.toThrow('pay access')
    await expect(runTool(TOOLS.find(x => x.name === 'record_credit_debit_payment')!, { sb, me: person('admin') }, { amount_eur: 100 })).rejects.toThrow('one of them')
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
