// Supabase's Management API refuses a request body over about a megabyte, and a migration that
// carries a file (a PDF kept as a data: URL, like the `brand_guidelines` one) is bigger than that. So
// such a migration goes in two steps: its long string literals first, in parts small enough for one
// request each, into migration_staging.blobs; then the migration itself, which reads each literal back
// from there instead of carrying it. The parts are deleted once the migration is applied.

/** Requests at most this big are sent as they are. */
export const MAX_BODY = 512 * 1024
/** Each part of a long literal staged on its own: under the 185 KB the API already took in one migration (`pet_photos`). */
export const PART = 150 * 1024
/** A single-quoted literal at least this long (with no quote inside) is staged. */
const LONG = 64 * 1024

export const STAGING_SETUP = `create schema if not exists migration_staging;
revoke all on schema migration_staging from public;
create table if not exists migration_staging.blobs (
  key text not null, part int not null, chunk text not null, primary key (key, part));`

/** The SQL to send for a part (its text has no quotes, so it goes in as it is). */
export const partSql = p => `insert into migration_staging.blobs (key, part, chunk) values ('${p.key}', ${p.part}, '${p.chunk}')
  on conflict (key, part) do update set chunk = excluded.chunk;`

/** Clearing a migration's parts, before staging them and once it's applied. */
export const clearSql = file => `delete from migration_staging.blobs where key like '${file.replace(/'/g, "''")}#%';`

/**
 * A migration small enough to send as it is comes back unchanged with no parts. A bigger one comes
 * back with each long literal replaced by a read from migration_staging.blobs, and the parts to stage.
 */
export function stageLongLiterals(file, sql, { maxBody = MAX_BODY, part = PART, long = LONG } = {}) {
  if (Buffer.byteLength(sql, 'utf8') <= maxBody) return { sql, parts: [] }
  const parts = []
  let n = 0
  const safe = file.replace(/'/g, "''")
  const out = sql.replace(new RegExp(`'([^']{${long},})'`, 'g'), (_, text) => {
    const key = `${safe}#${n++}`
    for (let i = 0, k = 0; i < text.length; i += part, k++) parts.push({ key, part: k, chunk: text.slice(i, i + part) })
    return `(select string_agg(chunk, '' order by part) from migration_staging.blobs where key = '${key}')`
  })
  return { sql: out, parts }
}
