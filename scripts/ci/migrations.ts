// Migration files are supabase/migrations/<YYYYMMDD><NNNNNN>_<name>.sql: a date, then a running
// number the code and docs refer to ("migration 47"). Two branches written at the same time pick
// the same next number; when the merge queue lands the second one, its new migrations get the
// next free numbers instead, after everything already on main, so they also run last.

export interface Migration { file: string; date: string; number: number; name: string }

const FILE = /^(\d{8})(\d{6})_(.+)\.sql$/

export function parseMigration(file: string): Migration | null {
  const m = FILE.exec(file)
  return m ? { file, date: m[1], number: Number(m[2]), name: m[3] } : null
}

const version = (m: Pick<Migration, 'date' | 'number'>) => m.date + String(m.number).padStart(6, '0')

export interface Rename { from: string; to: string; fromNumber: number; toNumber: number }

/** New names for the added migrations whose number is already taken, or that would sort before
 *  one that's there (and so run in a different order on a fresh database than in production). */
export function renumber(existing: string[], added: string[]): Rename[] {
  const have = existing.map(parseMigration).filter(m => m !== null)
  const taken = new Set(have.map(m => m.number))
  let last = have.reduce((a, m) => (version(m) > version(a) ? m : a), { date: '00000000', number: 0 } as Pick<Migration, 'date' | 'number'>)
  let top = Math.max(0, ...taken)
  const renames: Rename[] = []
  for (const m of added.map(parseMigration).filter(m => m !== null).sort((a, b) => version(a).localeCompare(version(b)))) {
    if (!taken.has(m.number) && version(m) > version(last)) {
      taken.add(m.number); top = Math.max(top, m.number); last = m
      continue
    }
    const next = { date: m.date > last.date ? m.date : last.date, number: top + 1 }
    renames.push({ from: m.file, to: `${version(next)}_${m.name}.sql`, fromNumber: m.number, toNumber: next.number })
    taken.add(next.number); top = next.number; last = next
  }
  return renames
}

/** The text with "migration 66" (or "migrations 66") pointing at the new number. */
export function renumberReferences(text: string, renames: Rename[]): string {
  const map = new Map(renames.map(r => [r.fromNumber, r.toNumber]))
  return text.replace(/\b(migrations?\s+)(\d+)\b/gi, (all, word: string, n: string) =>
    map.has(Number(n)) ? word + String(map.get(Number(n))) : all)
}
