import { describe, expect, it } from 'vitest'
import { createMcpHandler } from '@modelcontextprotocol/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from '../shared/types'
import { buildMcpServer } from './mcp'
import { PAGE_TOOLS, pagesFor } from './pageTools'
import { TOOLS, runTool, toolsFor } from './tools'

const person = (role: Profile['role'], can_see_pay = role === 'admin'): Profile => ({
  id: 'u1', full_name: 'Aron', email: 'a@test', role, can_see_pay, colour: '#000', active: true, phone: null, birth_date: null,
})

const PHOTO = `data:image/jpeg;base64,${'A'.repeat(400)}`

/** A Supabase stand-in that answers with fixed rows and remembers what was asked. */
function fakeSb(rows: Record<string, unknown>[]) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = []
  const sb = {
    from(table: string) {
      const call = { table, ops: [] as [string, unknown[]][] }
      calls.push(call)
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'delete', 'single', 'maybeSingle']) {
        b[m] = (...args: unknown[]) => { call.ops.push([m, args]); return b }
      }
      b.then = (resolve: (v: unknown) => void) => {
        const one = call.ops.some(([m]) => m === 'single' || m === 'maybeSingle')
        resolve({ data: one ? rows[0] ?? null : rows, error: null })
      }
      return b
    },
  }
  return { sb: sb as unknown as SupabaseClient, calls }
}

const call = (name: string, me: Profile, sb: SupabaseClient, args: unknown) => runTool(TOOLS.find(t => t.name === name)!, { sb, me }, args)

describe('page tools', () => {
  it('are offered to the team but not to partners', () => {
    const names = PAGE_TOOLS.map(t => t.name)
    expect(toolsFor(person('employee')).map(t => t.name)).toEqual(expect.arrayContaining(names))
    const partner: Profile = { ...person('partner'), partner_access: ['finances'] }
    expect(toolsFor(partner).map(t => t.name)).not.toContain('read_page')
    expect(pagesFor(partner)).toEqual([])
  })

  it('show each person only the pages in their menu', () => {
    const employee = pagesFor(person('employee')).map(p => p.key)
    expect(employee).toContain('coffees')
    expect(employee).not.toContain('customers')
    expect(pagesFor(person('admin', false)).map(p => p.key)).not.toContain('contacts')
    expect(pagesFor(person('admin')).map(p => p.key)).toEqual(expect.arrayContaining(['contacts', 'customers', 'brand', 'social']))
  })

  it('reads a page with its own columns, photos as notes and secrets hidden', async () => {
    const { sb, calls } = fakeSb([{ id: 'c1', name: 'Colombia Decaf', photo: PHOTO, api_token: 'abc' }])
    const out = await call('read_page', person('employee'), sb, { page: 'Coffees', table: 'coffees' }) as { tables: { rows: Record<string, unknown>[] }[] }
    const row = out.tables[0].rows[0]
    expect(row.name).toBe('Colombia Decaf')
    expect(row.photo).toMatch(/^\[file kept in the app: image\/jpeg/)
    expect(row.api_token).toBe('[hidden]')
    const select = calls.find(c => c.table === 'coffees')!.ops.find(([m]) => m === 'select')![1][0] as string
    expect(select).toContain('photo')
    expect(select).not.toBe('*')
  })

  it('finds pages by name, key or address and refuses ones outside the menu', async () => {
    const { sb } = fakeSb([])
    await expect(call('read_page', person('employee'), sb, { page: '/coffees', live: false })).resolves.toMatchObject({ page: 'Coffees' })
    await expect(call('read_page', person('employee'), sb, { page: 'customers' })).rejects.toThrow(/don't have/)
    await expect(call('read_page', person('employee'), sb, { page: 'coffees', table: 'profiles' })).rejects.toThrow(/keeps nothing/)
  })

  it('hands over a kept photo as an image, outside the JSON answer', async () => {
    const { sb } = fakeSb([{ photo: PHOTO }])
    const out = await call('get_page_file', person('employee'), sb, { page: 'coffees', table: 'coffees', id: 'c1', column: 'photo' }) as { mcpContent: unknown[] }
    expect(out.mcpContent).toEqual([{ type: 'image', data: 'A'.repeat(400), mimeType: 'image/jpeg' }])
    expect(JSON.stringify(out)).not.toContain('AAAA')
  })

  it('changes only what the page changes, in the columns it uses', async () => {
    const { sb, calls } = fakeSb([{ id: 'c1' }])
    const admin = person('admin')
    await expect(call('save_page_record', admin, sb, { page: 'coffees', table: 'coffees', id: 'c1', values: { tasting_notes: 'Almond' } }))
      .resolves.toMatchObject({ ok: true, id: 'c1', changed: ['tasting_notes'] })
    expect(calls.at(-1)!.ops.find(([m]) => m === 'update')![1][0]).toEqual({ tasting_notes: 'Almond' })
    await expect(call('save_page_record', admin, sb, { page: 'coffees', table: 'coffees', values: { business_id: 2 } })).rejects.toThrow(/Can't set business_id/)
    await expect(call('save_page_record', admin, sb, { page: 'coffees', table: 'coffees', values: { nonsense: 1 } })).rejects.toThrow(/Can't set nonsense/)
    const readOnly = pagesFor(admin).flatMap(p => p.tables.filter(t => !t.writes).map(t => [p.key, t.table])).at(0)!
    await expect(call('save_page_record', admin, sb, { page: readOnly[0], table: readOnly[1], values: { x: 1 } })).rejects.toThrow(/only shows/)
  })

  it('hands images over the MCP connection', async () => {
    const { sb } = fakeSb([{ photo: PHOTO }])
    const handler = createMcpHandler(() => buildMcpServer(toolsFor(person('employee')), { sb, me: person('employee') }))
    const res = await handler.fetch(new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_page_file', arguments: { page: 'coffees', table: 'coffees', id: 'c1', column: 'photo' } } }),
    }))
    const text = await res.text()
    const json = JSON.parse(text.startsWith('{') ? text : text.split('\n').find(l => l.startsWith('data:'))!.slice(5))
    expect(json.result.content.map((c: { type: string }) => c.type)).toEqual(['text', 'image'])
  })
})
