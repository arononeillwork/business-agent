// Every page of the app for AI assistants, without a tool written for each: list_pages says what
// each page in the menu holds, read_page reads it (its tables, with the columns the page itself
// asks for, and what it reads live through the Worker), get_page_file hands over a photo or file
// kept on a page, and save_page_record / delete_page_record change a page's rows.
//
// What a page holds is worked out from the app's own code (scripts/connector/pages.ts), so a page
// added to the menu is here on the next deploy. Everything runs as the signed-in person: row
// security decides what they can read and change, exactly as on the page. Partners don't get these
// (their access is limited to the areas the business gave them, through the specific tools).
import { z } from 'zod'
import type { Profile } from '../shared/types'
import { PRIVATE_LIVE, SECRET_COLUMN, cleanRow, cleanValue, findPage, type ConnectorPage, type PageTable } from '../shared/connectorPages'
import { CONNECTOR_PAGES } from '../shared/connectorPages.generated'
import { getAppFetch } from './appFetch'
import type { ToolContext, ToolDef } from './tools'

const tool = <S extends z.ZodType>(def: ToolDef<S>) => def as unknown as ToolDef

/** Columns the AI may not set: the database fills them in. */
const SET_BY_DATABASE = new Set(['id', 'business_id', 'created_at', 'updated_at', 'created_by', 'updated_by'])

/** The pages this person sees in their menu. */
export function pagesFor(me: Profile, pages: ConnectorPage[] = CONNECTOR_PAGES): ConnectorPage[] {
  if (me.role === 'partner') return []
  return pages.filter(p => p.who === 'all' || (me.role === 'admin' && (p.who === 'admin' || me.can_see_pay)))
}

function pageFor(me: Profile, name: string, pages?: ConnectorPage[]): ConnectorPage {
  const mine = pagesFor(me, pages)
  const page = findPage(mine, name)
  if (page) return page
  if (findPage(pages ?? CONNECTOR_PAGES, name)) throw new Error(`You don't have the ${name} page in your menu`)
  throw new Error(`No page called "${name}". Pages: ${mine.map(p => p.key).join(', ')}`)
}

function tableOf(page: ConnectorPage, table: string): PageTable {
  const t = page.tables.find(x => x.table === table)
  if (!t) throw new Error(`The ${page.title} page keeps nothing in "${table}". Its tables: ${page.tables.map(x => x.table).join(', ') || 'none'}`)
  return t
}

const columnList = (t: PageTable) => (t.columns === '*' ? null : t.columns.split(', '))
/** The columns asked for, minus secrets (with '*' the secrets are hidden after reading). */
const selectFor = (t: PageTable) => columnList(t)?.filter(c => !SECRET_COLUMN.test(c)).join(', ') || '*'

async function readTable(ctx: ToolContext, t: PageTable, limit: number, search?: string) {
  const cols = columnList(t)
  const take = search ? 500 : limit
  const base = () => ctx.sb.from(t.table).select(selectFor(t))
  // In the page's order where we know it; newest first otherwise.
  const order = cols?.includes('sort') ? 'sort' : (!cols || cols.includes('created_at')) ? 'created_at' : null
  let res = order ? await base().order(order, { ascending: order === 'sort' }).limit(take) : await base().limit(take)
  // The table has no such column to order by: read it unordered.
  if (res.error && order && res.error.message.includes(order)) res = await base().limit(take)
  if (res.error) return { table: t.table, error: res.error.message }
  let rows = (res.data ?? []) as unknown as Record<string, unknown>[]
  if (search) {
    const s = search.toLowerCase()
    rows = rows.filter(r => JSON.stringify(cleanRow(r)).toLowerCase().includes(s))
  }
  return { table: t.table, can_change: t.writes, rows: rows.slice(0, limit).map(cleanRow), more: rows.length > limit || undefined }
}

/** What the page reads live through the Worker, read the same way, as this person. */
async function readLive(ctx: ToolContext, path: string) {
  const appFetch = getAppFetch()
  if (!appFetch || !ctx.env || !ctx.accessToken) return { live: path, error: 'Live data is read through the MCP connection or the API' }
  try {
    const res = await appFetch(new Request(`${ctx.origin ?? 'https://app.local'}${path}`, { headers: { authorization: `Bearer ${ctx.accessToken}` } }), ctx.env,
      { waitUntil: () => {}, passThroughOnException: () => {}, props: {} })
    const body = await res.json().catch(() => null) as unknown
    if (!res.ok) return { live: path, error: (body as { error?: string } | null)?.error ?? `Failed (${res.status})` }
    return { live: path, data: cleanValue(body) }
  } catch (e) {
    return { live: path, error: e instanceof Error ? e.message : String(e) }
  }
}

const describe = (p: ConnectorPage) => ({
  page: p.key, title: p.title, section: p.section || undefined, address: p.path,
  holds: p.tables.map(t => t.table),
  can_change: p.tables.filter(t => t.writes).map(t => t.table),
  live: p.live.filter(l => !PRIVATE_LIVE.some(r => r.test(l))),
})

const pageName = z.string().min(1).describe('The page: its name in the menu ("Coffees", "Social planner"), its key or its address')

export const PAGE_TOOLS: ToolDef[] = [
  tool({
    name: 'list_pages', title: 'Pages of the app',
    description: 'Every page in your menu and what it holds: the tables it reads and can change, and the live data it shows. Read any of them with read_page. Use it whenever there is no specific tool for what you need (coffees, brand, social planner, menu, content, stock, and pages added later).',
    readOnly: true,
    input: z.object({}),
    async run(ctx) {
      return { pages: pagesFor(ctx.me).map(describe) }
    },
  }),
  tool({
    name: 'read_page', title: 'Read a page',
    description: 'What a page of the app shows, as rows from its tables (the same columns the page uses) and, unless live is false, what it reads live (reviews, integrations…). Narrow it with table or search. Photos and files kept in a row show as a note: get them with get_page_file. Each row has its id, for get_page_file, save_page_record and delete_page_record.',
    readOnly: true,
    input: z.object({
      page: pageName,
      table: z.string().optional().describe('Only this table of the page'),
      search: z.string().max(200).optional().describe('Only rows mentioning this'),
      limit: z.number().int().min(1).max(200).default(50).describe('Rows per table (default 50)'),
      live: z.boolean().default(true).describe('Also read what the page shows live'),
    }),
    async run(ctx, { page: name, table, search, limit, live }) {
      const page = pageFor(ctx.me, name)
      const tables = table ? [tableOf(page, table)] : page.tables
      const data = await Promise.all(tables.map(t => readTable(ctx, t, limit, search)))
      const liveReads = live && !table ? await Promise.all(page.live.filter(l => !PRIVATE_LIVE.some(r => r.test(l))).map(l => readLive(ctx, l))) : []
      return { page: page.title, address: page.path, tables: data, live: liveReads.length ? liveReads : undefined }
    },
  }),
  tool({
    name: 'get_page_file', title: 'Get a photo or file from a page',
    description: 'A photo or file kept on a page (a coffee\'s photo, the logo, a brand document): pass the page, table, the row\'s id and the column read_page showed it in. Images come back to you as images; a file kept at a web address comes back as its link.',
    readOnly: true,
    input: z.object({ page: pageName, table: z.string(), id: z.union([z.string(), z.number()]), column: z.string() }),
    async run(ctx, { page: name, table, id, column }) {
      const page = pageFor(ctx.me, name)
      const t = tableOf(page, table)
      const cols = columnList(t)
      if (SECRET_COLUMN.test(column) || (cols && !cols.includes(column))) throw new Error(`The ${page.title} page shows no "${column}" in ${table}${cols ? `. Its columns: ${cols.join(', ')}` : ''}`)
      const res = await ctx.sb.from(table).select(column).eq('id', id).maybeSingle()
      if (res.error) throw new Error(res.error.message)
      if (!res.data) throw new Error(`No row ${id} in ${table}`)
      const value = (res.data as unknown as Record<string, unknown>)[column]
      if (typeof value !== 'string' || !value) return { page: page.title, table, id, column, file: null }
      const data = value.match(/^data:([\w/+.-]+);base64,(.*)$/s)
      if (data) {
        const result = { page: page.title, table, id, column, file: { type: data[1], kb: Math.round((data[2].length * 3) / 4 / 1024) } }
        // The MCP connection hands the file itself over (not counted in the JSON answer).
        Object.defineProperty(result, 'mcpContent', {
          enumerable: false,
          value: data[1].startsWith('image/')
            ? [{ type: 'image', data: data[2], mimeType: data[1] }]
            : [{ type: 'resource', resource: { uri: `business-agent://${table}/${id}/${column}`, mimeType: data[1], blob: data[2] } }],
        })
        return result
      }
      return { page: page.title, table, id, column, file: { url: value } }
    },
  }),
  tool({
    name: 'save_page_record', title: 'Change a page',
    description: 'Add a row to a page, or change one (pass its id): only tables the page itself changes (list_pages: can_change), only the columns the page uses, and as you: what you couldn\'t change in the app, this can\'t either. Prefer a specific tool when there is one. Summarise what will change and get a yes before saving.',
    input: z.object({
      page: pageName,
      table: z.string(),
      id: z.union([z.string(), z.number()]).optional().describe('The row to change; leave out to add one'),
      values: z.record(z.string(), z.unknown()).describe('Column: value. Only what changes.'),
    }),
    async run(ctx, { page: name, table, id, values }) {
      const page = pageFor(ctx.me, name)
      const t = tableOf(page, table)
      if (!t.writes) throw new Error(`The ${page.title} page only shows ${table}; it doesn't change it`)
      const cols = columnList(t)
      const bad = Object.keys(values).filter(k => SET_BY_DATABASE.has(k) || SECRET_COLUMN.test(k) || (cols && !cols.includes(k)))
      if (bad.length) throw new Error(`Can't set ${bad.join(', ')}${cols ? `. The page uses: ${cols.filter(c => !SET_BY_DATABASE.has(c)).join(', ')}` : ''}`)
      if (!Object.keys(values).length) throw new Error('Nothing to change')
      const res = id == null
        ? await ctx.sb.from(table).insert(values).select('id').single()
        : await ctx.sb.from(table).update(values).eq('id', id).select('id').maybeSingle()
      if (res.error) throw new Error(res.error.message)
      if (!res.data) throw new Error(`No row ${id} in ${table} that you can change`)
      return { ok: true, page: page.title, table, id: (res.data as { id: unknown }).id, [id == null ? 'added' : 'changed']: Object.keys(values) }
    },
  }),
  tool({
    name: 'delete_page_record', title: 'Delete from a page',
    description: 'Delete a row from a page (only tables the page itself changes). It can\'t be undone: say exactly what will go and get a yes first.',
    destructive: true,
    input: z.object({ page: pageName, table: z.string(), id: z.union([z.string(), z.number()]) }),
    async run(ctx, { page: name, table, id }) {
      const page = pageFor(ctx.me, name)
      const t = tableOf(page, table)
      if (!t.writes) throw new Error(`The ${page.title} page only shows ${table}; it doesn't change it`)
      const res = await ctx.sb.from(table).delete().eq('id', id).select('id')
      if (res.error) throw new Error(res.error.message)
      if (!res.data?.length) throw new Error(`No row ${id} in ${table} that you can delete`)
      return { ok: true, page: page.title, table, deleted: id }
    },
  }),
]
