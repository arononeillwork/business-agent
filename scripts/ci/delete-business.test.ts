// Closing an account (docs/SEVERAL_BUSINESSES.md): the SQL HQ runs to delete a closed business is the
// SQL the database tests run on every business (supabase/tests/zzzzzzzzzzzzzzz_delete_business.test.sql).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const docs = readFileSync(new URL('../../docs/SEVERAL_BUSINESSES.md', import.meta.url), 'utf8')
const test = readFileSync(new URL('../../supabase/tests/zzzzzzzzzzzzzzz_delete_business.test.sql', import.meta.url), 'utf8')
const section = docs.slice(docs.indexOf('## Closing an account'))
// The SQL blocks of the section, out of their list items.
const blocks = [...section.matchAll(/ {3}```sql\n([\s\S]*?) {3}```/g)].map(m => m[1].replace(/^ {3}/gm, ''))
const between = (text: string, start: string, end: string) => {
  const from = text.indexOf(start)
  return from < 0 ? '' : text.slice(from + start.length, text.indexOf(end, from + start.length))
}

describe('deleting a closed business', () => {
  it('step 1 is the DO block the database tests run', () => {
    const doBlock = between(blocks[0] ?? '', 'do $$\n', '$$;')
    const tested = between(test, 'create function pg_temp.step_1() returns void language plpgsql as $$\n', '$$;')
    expect(doBlock).toContain('app.deleting_business')
    expect(doBlock).toBe(tested)
  })

  it('step 2 is what the database tests run', () => {
    const statements = (blocks[1] ?? '').split('\n').filter(l => l && l !== 'begin;' && l !== 'commit;')
    const tested = between(test, 'create function pg_temp.step_2(p_business int) returns void language plpgsql as $$\nbegin\n', 'end $$;')
      .split('\n').map(l => l.trim().replaceAll('p_business', '7')).filter(l => l && l !== 'drop table closing_people;')
    expect(statements).toEqual(tested)
  })
})
