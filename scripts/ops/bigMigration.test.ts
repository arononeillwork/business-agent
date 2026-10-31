import { describe, expect, it } from 'vitest'
// @ts-expect-error: a plain .mjs ops script, without types
import { clearSql, partSql, stageLongLiterals } from './bigMigration.mjs'

describe('a migration too big for one request', () => {
  it('leaves a small one as it is', () => {
    expect(stageLongLiterals('a.sql', "insert into t values ('x');")).toEqual({ sql: "insert into t values ('x');", parts: [] })
  })

  it('stages its long literals in parts and reads them back in order', () => {
    const data = `data:application/pdf;base64,${'A'.repeat(450)}`
    const sql = `-- Easy Beans' guidelines\ninsert into t (title, content) select 'Guide', '${data}' where true;`
    const { sql: out, parts } = stageLongLiterals('120_brand.sql', sql, { maxBody: 100, part: 200, long: 300 })
    expect(out).toBe(`-- Easy Beans' guidelines\ninsert into t (title, content) select 'Guide', `
      + `(select string_agg(chunk, '' order by part) from migration_staging.blobs where key = '120_brand.sql#0') where true;`)
    expect(parts.map((p: { part: number }) => p.part)).toEqual([0, 1, 2])
    expect(parts.map((p: { chunk: string }) => p.chunk).join('')).toBe(data)
    expect(partSql(parts[0])).toContain("values ('120_brand.sql#0', 0, 'data:application/pdf;base64,")
    expect(clearSql('120_brand.sql')).toBe("delete from migration_staging.blobs where key like '120_brand.sql#%';")
  })

  it('brings the brand guidelines migration under the limit', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const f = readdirSync('supabase/migrations').find(x => x.endsWith('_brand_guidelines.sql'))!
    const sql = readFileSync(`supabase/migrations/${f}`, 'utf8')
    const { sql: out, parts } = stageLongLiterals(f, sql)
    expect(Buffer.byteLength(out)).toBeLessThan(4096)
    expect(parts.length).toBeGreaterThan(5)
    expect(Math.max(...parts.map((p: { chunk: string }) => Buffer.byteLength(partSql(p))))).toBeLessThan(160 * 1024)
  })
})
