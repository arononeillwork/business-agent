// An owner's export (worker/account.ts): every table with anything in it as a CSV file in one zip, read a
// part at a time from public.export_part() with the business's own client, owners only.
import { inflateRawSync } from 'node:zlib'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { account, EXPORT_ROWS } from './account'
import type { Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'

const APP = 'https://app.test'
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' } as unknown as Env

/** The files in a zip, read back as any unzip would (central directory, then each file inflated). */
function unzip(buf: Uint8Array) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const end = buf.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const out = new Map<string, string>()
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(at + 10, true), packed = view.getUint32(at + 20, true), size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true), local = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(buf.slice(at + 46, at + 46 + nameLength))
    const start = local + 30 + view.getUint16(local + 26, true)
    expect(method).toBe(8)
    const data = inflateRawSync(buf.slice(start, start + packed))
    expect(data.length).toBe(size)
    out.set(name, new TextDecoder('utf-8', { ignoreBOM: true, fatal: false }).decode(data))
    at += 46 + nameLength
  }
  return out
}

describe('exporting everything', () => {
  let db: FakeSupabase
  let parts: Row[]
  const tables = [
    { name: 'business', columns: ['id', 'name', 'opening_hours'] },
    { name: 'audit_log', columns: ['id', 'table_name'] },
    { name: 'profiles', columns: ['id', 'full_name', 'email'] },
    { name: 'shifts', columns: ['id', 'starts_at'] },
  ]
  /** The table rows the database would give, by table. */
  const data: Record<string, Row[]> = {
    business: [{ id: 1, name: 'Café Ñandú, S.L.', opening_hours: { mon: { open: '08:00' } } }],
    audit_log: Array.from({ length: EXPORT_ROWS * 2 + 5 }, (_, i) => ({ id: i + 1, table_name: 'shifts' })),
    profiles: [{ id: 'a', full_name: 'Aron "the boss"', email: 'aron@example.com' }, { id: 'b', full_name: 'Maria\nJosé', email: null }],
    shifts: [],
  }
  beforeEach(() => {
    db = new FakeSupabase()
    parts = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => db.handle(String(input instanceof Request ? input.url : input), init)!))
    db.rpcs.export_tables = () => tables
    // public.export_part(): from table p_from, row p_offset, up to p_rows rows, one part per table with rows.
    db.rpcs.export_part = a => {
      parts.push(a)
      let left = Number(a.p_rows), offset = Number(a.p_offset)
      const out: Row[] = []
      for (let n = Number(a.p_from); n <= tables.length && left > 0; n++, offset = 0) {
        const rows = data[tables[n - 1].name].slice(offset, offset + left)
        if (rows.length) out.push({ n, name: tables[n - 1].name, first_row: offset, rows })
        left -= rows.length
      }
      return out
    }
  })

  it('a CSV file per table with rows in it, in a zip named after the business and the day, a few requests in all', async () => {
    const res = await account.request(`${APP}/api/account/export`, { headers: { authorization: 'Bearer admin-token' } }, env)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="cafe-nandu-s-l-\d{4}-\d{2}-\d{2}\.zip"$/)
    const files = unzip(new Uint8Array(await res.arrayBuffer()))
    expect([...files.keys()]).toEqual(['README.txt', 'business.csv', 'audit_log.csv', 'profiles.csv'])
    expect(files.get('business.csv')).toBe('﻿id,name,opening_hours\r\n1,"Café Ñandú, S.L.","{""mon"":{""open"":""08:00""}}"\r\n')
    expect(files.get('profiles.csv')).toBe('﻿id,full_name,email\r\na,"Aron ""the boss""",aron@example.com\r\nb,"Maria\nJosé",\r\n')
    expect(files.get('audit_log.csv')!.split('\r\n')).toHaveLength(EXPORT_ROWS * 2 + 5 + 2)
    expect(files.get('README.txt')).toMatch(/^Café Ñandú, S\.L\.: everything kept in The Business Agent/)
    expect(files.get('README.txt')).toContain('audit_log.csv: 20005 rows')
    expect(files.get('README.txt')).toContain('Left out: passwords, PIN and access-key hashes, and sign-in tokens')
    // Three parts: 10,000 rows, 10,000 more, then the rest of the log and the people (short: the end).
    expect(parts).toEqual([
      { p_from: 1, p_offset: 0, p_rows: EXPORT_ROWS },
      { p_from: 2, p_offset: EXPORT_ROWS - 1, p_rows: EXPORT_ROWS },
      { p_from: 2, p_offset: EXPORT_ROWS * 2 - 1, p_rows: EXPORT_ROWS },
    ])
  })

  it('owners only: not a shop manager, not an employee, not signed out', async () => {
    db.people.set('manager-token', { id: 'admin-2', role: 'admin' })
    for (const auth of ['Bearer manager-token', 'Bearer staff-token', '']) {
      const res = await account.request(`${APP}/api/account/export`, { headers: auth ? { authorization: auth } : {} }, env)
      expect(res.status).toBe(auth ? 403 : 401)
    }
    expect(parts).toEqual([])
  })
})
