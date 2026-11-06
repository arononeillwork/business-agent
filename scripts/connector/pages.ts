// Works out, from the app's own code, what each page in the menu shows: the tables it reads and
// writes (with the columns the page asks for), the files it keeps, and the Worker addresses it reads
// live data from. The connector's page tools (worker/pageTools.ts) use the result, so every page
// reaches the AI, including pages added later, with no tool to write.
//
// Runs whenever Vite starts (vite.config.ts), before every typecheck (package.json) and test run
// (vitest.config.ts), and writes shared/connectorPages.generated.ts, which is not kept in git.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ConnectorPage } from '../../shared/connectorPages'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const OUT = join(ROOT, 'shared/connectorPages.generated.ts')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Parts of the app shared by many pages (the shell, pickers): their data isn't any one page's. */
const SHARED_IF_USED_BY = 6

// ---- the menu --------------------------------------------------------------------------------

interface NavItem { key: string; to: string; label: string; section: string; who: ConnectorPage['who'] }

export function menuItems(src = read('src/app/AppShell.tsx')): NavItem[] {
  const items: NavItem[] = []
  let section = ''
  for (const line of src.split('\n')) {
    const sec = line.match(/^\s*\{ key: '[\w-]+', label: (?:msg\('([^']+)'\)|null), items: \[/)
    if (sec) { section = sec[1] ?? ''; continue }
    for (const m of line.matchAll(/\{ key: '([\w-]+)', to: '(\/[^']*)', label: msg\('((?:[^'\\]|\\.)+)'\)([^}]*)/g)) {
      const who = /who: 'pay'/.test(m[4]) ? 'pay' : /who: 'admin'/.test(m[4]) ? 'admin' : 'all'
      if (!items.some(i => i.to === m[2])) items.push({ key: m[1], to: m[2], label: m[3].replace(/\\'/g, "'"), section, who })
    }
  }
  return items
}

// ---- routes → page files --------------------------------------------------------------------

export function routeFiles(src = read('src/App.tsx')): Map<string, string> {
  const files = new Map<string, string>()
  for (const m of src.matchAll(/const (\w+) = page\(\(\) => import\('(\.\/[^']+)'\)/g)) { const f = resolveImport('src/App.tsx', m[2]); if (f) files.set(m[1], f) }
  for (const m of src.matchAll(/^import (?:\{ )?(\w+)(?: \})? from '(\.\/pages\/[^']+)'/gm)) { const f = resolveImport('src/App.tsx', m[2]); if (f) files.set(m[1], f) }
  const routes = new Map<string, string>()
  for (const m of src.matchAll(/<Route path="([^"*]+)" element=\{([^}]*)\}/g)) {
    const comps = [...m[2].matchAll(/<(\w+)\s*\/>/g)].map(x => x[1]).filter(c => files.has(c))
    const path = `/${m[1].replace(/^\//, '')}`
    if (comps.length && !routes.has(path)) routes.set(path, files.get(comps[comps.length - 1])!)
  }
  return routes
}

// ---- page file → api methods it calls ---------------------------------------------------------

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = join(dirname(from), spec)
  for (const f of [base, `${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (/\.tsx?$/.test(f) && existsSync(join(ROOT, f))) return f
  }
  return null
}

const importsOf = (file: string) => [...read(file).matchAll(/(?:^|\n)\s*import\s[^'"]*?from\s+'([^']+)'|import\('([^']+)'\)/g)]
  .map(m => resolveImport(file, m[1] ?? m[2]))
  .filter((f): f is string => !!f && (f.startsWith('src/pages/') || f.startsWith('src/components/') || f.startsWith('src/app/')))

/** Every app file a page pulls in (its own components and their components). */
function reach(file: string): Set<string> {
  const seen = new Set<string>([file])
  const todo = [file]
  while (todo.length) {
    for (const f of importsOf(todo.pop()!)) if (!seen.has(f)) { seen.add(f); todo.push(f) }
  }
  return seen
}

const apiCalls = (file: string) => new Set([...read(file).matchAll(/\bapi\.(\w+)\b/g)].map(m => m[1]))

// ---- api methods → tables -----------------------------------------------------------------------

interface MethodUse { tables: Map<string, { columns: Set<string> | '*'; writes: boolean }>; buckets: Set<string>; live: Set<string> }

/** The body of each method of the live api object (src/data/supabaseApi.ts), by name. */
export function methodBodies(src = read('src/data/supabaseApi.ts')): Map<string, string> {
  const start = src.indexOf('const api: Api = {')
  const body = src.slice(start)
  const bodies = new Map<string, string>()
  const heads = [...body.matchAll(/^ {4}(?:async )?(\w+)(?:\s*:\s*(?:async )?(?:\([^)]*\)|\w+)\s*=>|\s*\()/gm)]
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index! : body.length
    bodies.set(h[1], (bodies.get(h[1]) ?? '') + body.slice(h.index!, end))
  })
  return bodies
}

/** String constants in the api file and the shared modules it reads column lists from. */
function constants(): Map<string, string> {
  const files = ['src/data/supabaseApi.ts', ...[...read('src/data/supabaseApi.ts').matchAll(/from '\.\.\/\.\.\/(shared\/[\w/]+)'/g)].map(m => `${m[1]}.ts`)]
  const out = new Map<string, string>()
  for (const f of files) {
    if (!existsSync(join(ROOT, f))) continue
    for (const m of read(f).matchAll(/(?:export )?const ([A-Z_]+) = ('([^']*)'|`([^`]*)`)/g)) out.set(m[1], m[3] ?? m[4])
  }
  // Templates that use other constants: `${A}, b, c`.
  for (let pass = 0; pass < 3; pass++) {
    for (const [k, v] of out) out.set(k, v.replace(/\$\{([A-Z_]+)\}/g, (_, n) => out.get(n) ?? '${?}'))
  }
  return out
}

/** The argument of a call starting at `open` (the index of its opening parenthesis). */
function argAt(src: string, open: number): string {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')' && --depth === 0) return src.slice(open + 1, i)
  }
  return ''
}

function columnsOf(arg: string, consts: Map<string, string>): Set<string> | '*' {
  const a = arg.trim()
  if (!a) return '*'
  let text: string | undefined
  if (/^'[^']*'$/.test(a)) text = a.slice(1, -1)
  else if (/^`[^`]*`$/.test(a)) text = a.slice(1, -1).replace(/\$\{([A-Z_]+)\}/g, (_, n) => consts.get(n) ?? '${?}')
  else if (/^[A-Z_]+$/.test(a)) text = consts.get(a)
  else {
    const m = a.match(/^'([^']*)'(?:\s*,|$)/) ?? a.match(/^([A-Z_]+)\s*,/)
    if (m) text = /^[A-Z_]+$/.test(m[1]) ? consts.get(m[1]) : m[1]
  }
  if (text == null || text.includes('${') || text.includes('*')) return '*'
  // Plain columns only: drop embedded rows (`stock_items(name)`) and renames (`a:b`).
  let depth = 0, cur = ''
  const cols = new Set<string>()
  const flush = () => { const c = cur.trim(); if (/^\w+$/.test(c)) cols.add(c); cur = '' }
  for (const ch of text) {
    if (ch === '(') depth++
    if (depth === 0 && ch === ',') flush(); else if (depth === 0 && ch !== ')') cur += ch
    if (ch === ')') { depth--; cur = '\u0000' }
  }
  flush()
  return cols.size ? cols : '*'
}

export function methodUses(bodies = methodBodies()): Map<string, MethodUse> {
  const consts = constants()
  const out = new Map<string, MethodUse>()
  for (const [name, body] of bodies) {
    const use: MethodUse = { tables: new Map(), buckets: new Set(), live: new Set() }
    for (const m of body.matchAll(/(storage\s*\.\s*)?\.?from\('([\w-]+)'\)/g)) {
      if (m[1]) { use.buckets.add(m[2]); continue }
      const table = m[2]
      const rest = body.slice(m.index! + m[0].length, m.index! + m[0].length + 4000)
      const t = use.tables.get(table) ?? { columns: new Set<string>(), writes: false }
      // The chain that follows: up to the next statement.
      const chain = rest.slice(0, (() => { const i = rest.search(/\)\s*(?:;|\n\s*\n|\)\s*(?:as|,|\]))/); return i < 0 ? 600 : i + 1 })())
      const verb = chain.match(/^\s*\.(select|insert|update|upsert|delete)\(/)
      if (verb && verb[1] !== 'select') t.writes = true
      const sel = chain.indexOf('.select(')
      if (sel >= 0 && (!verb || verb[1] === 'select')) {
        const cols = columnsOf(argAt(chain, sel + 7), consts)
        if (cols === '*' || t.columns === '*') t.columns = '*'
        else for (const c of cols) t.columns.add(c)
      } else if (!verb) t.columns = '*'
      use.tables.set(table, t)
    }
    // Live reads through the Worker: worker('/api/x') with no method, or fetch('/api/x') likewise.
    for (const m of body.matchAll(/(?:worker(?:<[^>]*>)?|fetch)\('(\/api\/[\w/-]+)'(\s*,\s*\{[^}]*method:)?/g)) if (!m[2]) use.live.add(m[1])
    out.set(name, use)
  }
  return out
}

// ---- put together --------------------------------------------------------------------------------

export function buildPages(): ConnectorPage[] {
  const nav = menuItems()
  const routes = routeFiles()
  const uses = methodUses()

  const reached = new Map<string, Set<string>>()
  for (const item of nav) {
    const file = routes.get(item.to)
    if (file) reached.set(item.to, reach(file))
  }
  // Files many pages pull in (the shell, pickers, shared dialogs) don't make their data any one page's.
  const count = new Map<string, number>()
  for (const files of reached.values()) for (const f of files) count.set(f, (count.get(f) ?? 0) + 1)

  return nav.map(item => {
    const files = [...(reached.get(item.to) ?? [])].filter((f, i) => i === 0 || (count.get(f) ?? 0) < SHARED_IF_USED_BY)
    const methods = new Set<string>()
    for (const f of files) for (const m of apiCalls(f)) methods.add(m)
    const tables = new Map<string, { columns: Set<string> | '*'; writes: boolean }>()
    const buckets = new Set<string>(), live = new Set<string>()
    for (const m of methods) {
      const u = uses.get(m)
      if (!u) continue
      for (const [t, v] of u.tables) {
        const cur = tables.get(t) ?? { columns: new Set<string>(), writes: false }
        cur.writes ||= v.writes
        if (v.columns === '*' || cur.columns === '*') cur.columns = '*'
        else for (const c of v.columns) cur.columns.add(c)
        tables.set(t, cur)
      }
      u.buckets.forEach(b => buckets.add(b))
      u.live.forEach(l => live.add(l))
    }
    return {
      key: item.key, path: item.to, title: item.label, section: item.section, who: item.who,
      tables: [...tables].sort(([a], [b]) => a.localeCompare(b)).map(([table, v]) => ({
        table, writes: v.writes,
        // Columns read only to write (insert(...).select('id')) leave an empty set: read them all.
        columns: v.columns === '*' || v.columns.size === 0 ? '*' : [...v.columns].sort().join(', '),
      })),
      buckets: [...buckets].sort(),
      live: [...live].sort(),
    }
  })
}

export function render(pages: ConnectorPage[]): string {
  return `// Generated by scripts/connector/pages.ts from the app's menu, routes and data calls: do not edit.
// Run \`npm run connector:pages\` after adding or changing a page.
import type { ConnectorPage } from './connectorPages'

export const CONNECTOR_PAGES: ConnectorPage[] = ${JSON.stringify(pages, null, 2)}
`
}

/** Write shared/connectorPages.generated.ts, only when it changes (so a watching dev server doesn't reload). */
export function writeConnectorPages(): number {
  const pages = buildPages()
  const text = render(pages)
  if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== text) writeFileSync(OUT, text)
  return pages.length
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Connector: ${writeConnectorPages()} pages`)
}
