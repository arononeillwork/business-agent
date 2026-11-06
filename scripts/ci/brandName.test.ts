// The product is "The Business Agent" in everything people see (since November 2026): a page, an
// email, a message or a translation that says plain "Business Agent" fails here, so text added later
// keeps the name too. Comments, tests and migrations already on main are left alone.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOTS = ['src', 'shared', 'worker', 'public', 'cameras', 'index.html']
/** Lines that may still say it: the Drive/OneDrive folder's old name (renamed in place), and the
 *  phone's home-screen label, which a phone cuts off at about 12 letters. */
const ALLOWED: [RegExp, RegExp][] = [
  [/^shared\/appFolder\.ts$/, /OLD_APP_FOLDER/],
  [/^index\.html$/, /apple-mobile-web-app-title/],
  [/^public\/manifest\.webmanifest$/, /"short_name"/],
]

const files = (p: string): string[] => statSync(p).isDirectory()
  ? readdirSync(p).flatMap(f => files(join(p, f)))
  : /\.(tsx?|mjs|js|html|json|webmanifest)$/.test(p) && !/\.test\.tsx?$|[\\/]test[\\/]|\.d\.ts$/.test(p) ? [p] : []

describe('the product’s name', () => {
  it('is The Business Agent, never plain Business Agent, in what people see', () => {
    const found: string[] = []
    for (const f of ROOTS.flatMap(files)) {
      const name = f.replace(/\\/g, '/')
      let inBlock = false
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const s = line.trim()
        const comment = inBlock || s.startsWith('//') || s.startsWith('*') || s.startsWith('/*') || s.startsWith('<!--')
        if (s.startsWith('/*') && !s.includes('*/')) inBlock = true
        if (inBlock && s.includes('*/') && !s.startsWith('/*')) inBlock = false
        if (comment || !/(?<!The )Business Agent/.test(line)) return
        if (ALLOWED.some(([file, ok]) => file.test(name) && ok.test(line))) return
        found.push(`${name}:${i + 1}  ${s.slice(0, 120)}`)
      })
    }
    expect(found, 'Say “The Business Agent” (scripts/ci/brandName.test.ts)').toEqual([])
  })
})
