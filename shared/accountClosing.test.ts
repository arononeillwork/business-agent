// Closing an account: when it closes, and until when an owner can keep it (the same 30 days as the database).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLOSING_DAYS, canStillKeep, closesAt, daysUntilClosing } from './accountClosing'

describe('closing an account', () => {
  const asked = '2026-11-07T10:00:00.000Z'

  it('closes 30 days after the owner asks, and can be kept until then', () => {
    expect(closesAt(asked)).toBe('2026-12-07T10:00:00.000Z')
    expect(daysUntilClosing(asked, Date.parse('2026-11-07T10:00:00Z'))).toBe(30)
    expect(daysUntilClosing(asked, Date.parse('2026-12-06T12:00:00Z'))).toBe(1)
    expect(canStillKeep(asked, Date.parse('2026-12-07T09:59:59Z'))).toBe(true)
    expect(canStillKeep(asked, Date.parse('2026-12-07T10:00:00Z'))).toBe(false)
    expect(daysUntilClosing(asked, Date.parse('2027-01-01T00:00:00Z'))).toBe(0)
  })

  it('the database counts the same days', () => {
    const dir = join(import.meta.dirname, '../supabase/migrations')
    const sql = readFileSync(join(dir, readdirSync(dir).find(f => f.endsWith('_close_account.sql'))!), 'utf8')
    const days = [...sql.matchAll(/interval '(\d+) days'/g)].map(m => Number(m[1]))
    expect(days.length).toBeGreaterThan(3)
    expect(new Set(days)).toEqual(new Set([CLOSING_DAYS]))
  })
})
