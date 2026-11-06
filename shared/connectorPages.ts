// What each page of the app holds, for the AI connector's page tools (worker/pageTools.ts).
// Worked out from the app's own code by scripts/connector/pages.ts on every build, typecheck and
// test run, into shared/connectorPages.generated.ts (not kept in git): a new page in the menu
// reaches the AI without anyone writing a tool for it.

export interface PageTable {
  table: string
  /** The columns the app reads, or '*' when it reads them all or builds the list at run time. */
  columns: string
  /** The page changes rows here (insert, update, upsert or delete). */
  writes: boolean
}

export interface ConnectorPage {
  /** The menu item's key, e.g. "coffees". */
  key: string
  /** Its address in the app, e.g. "/coffees". */
  path: string
  /** Its name in the menu, e.g. "Coffees". */
  title: string
  /** The menu section it's in, e.g. "Menu". */
  section: string
  /** Who sees it in the menu: everyone, admins, or admins who see pay. */
  who: 'all' | 'admin' | 'pay'
  tables: PageTable[]
  /** Storage buckets the page keeps files in. */
  buckets: string[]
  /** Worker addresses the page reads live data from (GET, no parameters). */
  live: string[]
}

/** Live reads the connector never makes: they hand out sign-in tokens or secret links. */
export const PRIVATE_LIVE = [/picker/, /api-keys/, /push\/key/, /calendar-feed/]

/** Columns never shown, whatever page they're on. */
export const SECRET_COLUMN = /(^|_)(token|secret|password|passcode|api_key|key_hash|pin|pin_hash|refresh_token|access_token|private_key)(_|$)/i

/** Find a page by its key, address or menu name. */
export function findPage<P extends Pick<ConnectorPage, 'key' | 'path' | 'title'>>(pages: P[], name: string): P | undefined {
  const n = name.trim().toLowerCase().replace(/^\//, '')
  return pages.find(p => p.key.toLowerCase() === n)
    ?? pages.find(p => p.path.toLowerCase().replace(/^\//, '') === n)
    ?? pages.find(p => p.title.toLowerCase() === n)
    ?? pages.find(p => p.title.toLowerCase().includes(n) || p.key.toLowerCase().includes(n))
}

/** A value made ready for the AI: files kept inside a row become a short note, long text is cut. */
export function cleanValue(v: unknown): unknown {
  if (typeof v === 'string') {
    const file = v.match(/^data:([\w/+.-]+)?(;base64)?,/)
    if (file) return `[file kept in the app: ${file[1] ?? 'data'}, ${Math.round((v.length * 3) / 4 / 1024)} KB; get it with get_page_file]`
    return v.length > 2000 ? `${v.slice(0, 2000)}… [${v.length - 2000} more characters]` : v
  }
  if (Array.isArray(v)) return v.map(cleanValue)
  if (v && typeof v === 'object') return cleanRow(v as Record<string, unknown>)
  return v
}

export function cleanRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[k] = SECRET_COLUMN.test(k) ? (v == null ? v : '[hidden]') : cleanValue(v)
  return out
}
