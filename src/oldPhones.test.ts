// The app's code must start on the phones staff actually carry, older iPhones included. A regular
// expression with a look-behind ((?<= or (?<!) is a syntax error on Safari before 16.4 (every iPhone
// on iOS 15, e.g. a 6s, 7 or first SE): made as a file loads, it stops the whole app, and the phone
// shows a blank page while a laptop works. Use "start of text or a non-letter" instead
// (shared/reviews.ts). The Worker (worker/) runs on Cloudflare, not phones, so it may use them.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const DIRS = ['src', 'shared']

const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f)
  if (statSync(p).isDirectory()) return files(p)
  return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith('.d.ts') ? [p] : []
})

describe('code that runs on phones', () => {
  it('has no regular-expression look-behinds (older iPhones refuse the whole file)', () => {
    const found = DIRS.flatMap(d => files(join(ROOT, d))).flatMap(p =>
      readFileSync(p, 'utf8').split('\n').flatMap((line, i) =>
        /\(\?<[=!]/.test(line) ? [`${relative(ROOT, p)}:${i + 1}`] : []))
    expect(found).toEqual([])
  })
})
