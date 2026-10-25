// Keeps the Spanish complete without anyone keeping a list: every text passed to t(), tn(), tr() or
// msg() must have Spanish in src/i18n/es/ with the same {placeholders}, and no text may be written
// straight into a page (JSX text, or a label/title/placeholder… attribute) without going through t().
// Text that is the same in every language (a brand name) can be written as {'WhatsApp'}.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'
import { spanish } from './es'

const ROOT = join(import.meta.dirname, '../..')
const DIRS = ['src', 'shared']
// Attributes that show text to people (screen readers included).
const TEXT_PROPS = new Set(['label', 'title', 'placeholder', 'helperText', 'aria-label', 'alt', 'eyebrow', 'note', 'caption',
  'subtitle', 'description', 'tooltip', 'primary', 'secondary', 'noOptionsText', 'aria-description', 'heading', 'hint', 'empty'])

const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f)
  if (statSync(p).isDirectory()) return p.endsWith(join('i18n', 'es')) ? [] : files(p)
  return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith('.d.ts') ? [p] : []
})

type Node = { type?: string; start: number; [k: string]: unknown }
function walk(node: unknown, visit: (n: Node) => void) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach(n => walk(n, visit)); return }
  const n = node as Node
  if (typeof n.type === 'string') visit(n)
  for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v, visit)
}

/** The literal strings an argument can be (both sides of `a ? 'x' : 'y'`). */
function literals(n: Node | undefined): string[] {
  if (!n) return []
  if (n.type === 'Literal' && typeof n.value === 'string') return [n.value]
  if (n.type === 'TemplateLiteral' && (n.expressions as unknown[]).length === 0) return [(n.quasis as { value: { cooked: string } }[])[0].value.cooked]
  if (n.type === 'ConditionalExpression') return [...literals(n.consequent as Node), ...literals(n.alternate as Node)]
  return []
}

const keys = new Map<string, string>() // text → where it's used
const loose: string[] = []
for (const file of DIRS.flatMap(d => files(join(ROOT, d)))) {
  const code = readFileSync(file, 'utf8')
  const where = (n: Node) => `${relative(ROOT, file)}:${code.slice(0, n.start).split('\n').length}`
  const ast = parseSync(file, code)
  walk(ast.program, n => {
    if (n.type === 'CallExpression' && (n.callee as Node).type === 'Identifier') {
      const name = (n.callee as { name: string }).name
      const args = n.arguments as Node[]
      const texts = name === 't' || name === 'tr' || name === 'msg' ? literals(args[0]) : name === 'tn' ? [...literals(args[1]), ...literals(args[2])]
        : name === 'tc' ? literals(args[0]).flatMap(context => literals(args[1]).map(text => `${context}|${text}`)) : []
      for (const text of texts) if (!keys.has(text)) keys.set(text, where(n))
    }
    if (!file.endsWith('.tsx')) return
    if (n.type === 'JSXText' && /\p{L}/u.test(String(n.value))) loose.push(`${where(n)}  ${String(n.value).trim().slice(0, 60)}`)
    if (n.type === 'JSXAttribute') {
      const attr = (n.name as { name?: string }).name
      const value = n.value as Node | null
      if (attr && TEXT_PROPS.has(attr) && value?.type === 'Literal' && /\p{L}/u.test(String(value.value))) loose.push(`${where(n)}  ${attr}="${String(value.value).slice(0, 60)}"`)
    }
  })
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')

describe('Spanish', () => {
  it('has every text the app shows', () => {
    const missing = [...keys].filter(([k]) => /\p{L}/u.test(k) && !(k in spanish)).map(([k, at]) => `${at}  ${JSON.stringify(k)}`)
    expect(missing, `Add these to a file in src/i18n/es/:\n${missing.join('\n')}`).toEqual([])
  })

  it('keeps the same {placeholders} as the English', () => {
    const wrong = Object.entries(spanish).filter(([en, es]) => placeholders(en) !== placeholders(es)).map(([en, es]) => `${en}  →  ${es}`)
    expect(wrong).toEqual([])
  })

  it('gives the same English the same Spanish in every file', () => {
    const files = import.meta.glob<Record<string, string>>(['./es/*.ts', '!./es/index.ts'], { eager: true, import: 'default' })
    const seen = new Map<string, { es: string; file: string }>()
    const clashes: string[] = []
    for (const [file, entries] of Object.entries(files)) {
      for (const [en, es] of Object.entries(entries)) {
        const before = seen.get(en)
        if (before && before.es !== es) clashes.push(`${JSON.stringify(en)}: ${before.file} says ${JSON.stringify(before.es)}, ${file} says ${JSON.stringify(es)}`)
        else seen.set(en, { es, file })
      }
    }
    expect(clashes, 'Pick one Spanish for each and use it in both files').toEqual([])
  })

  it('has no text written straight into a page', () => {
    expect(loose, `Wrap these in t() (or {'Brand'} when it's the same in every language):\n${loose.join('\n')}`).toEqual([])
  })
})
