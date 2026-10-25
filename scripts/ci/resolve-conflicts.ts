// Settles the merge conflicts that only look like conflicts, so the merge queue can carry on:
//  - both sides added lines at the same spot (a route, a menu entry, an API method, a test, a README
//    paragraph) and neither changed a line that was already there: both are kept, ours first;
//  - in code, both sides changed the same line but in different places on it, like two pages added
//    to the same one-line list of menu items: the line gets both changes, word by word.
// Anything else (the same words changed on both sides, a file one side deleted, a new file both
// sides created) is left for a person: resolveConflicts() returns null. Whatever it settles, the
// whole test suite runs on the result before anything lands.
//   The text must be written in diff3 style (git checkout --conflict=diff3 <file>), so the
//   original lines show between ||||||| and =======.

const marker = (line: string, char: string) => {
  const l = line.endsWith('\r') ? line.slice(0, -1) : line
  return l.startsWith(char.repeat(7)) && (l.length === 7 || l[7] === ' ')
}

/** Both sides' additions, whole: two blocks that end the same way (`  })` then `})`) each keep
 *  their own ending. The same addition on both sides is kept once. */
const combine = (ours: string[], theirs: string[]) =>
  ours.join('\n') === theirs.join('\n') ? ours : [...ours, ...theirs]

// Words, quoted strings (one token each, so 'Roles & responsibilities' stays whole), runs of spaces,
// and single characters.
const TOKEN = /\s+|[\p{L}\p{N}_$]+|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|[^]/gu
const MAX_TOKENS = 1500

interface Change { start: number; end: number; tokens: string[] }

/** What one side did to the original tokens: each change replaces original[start, end) with tokens
 *  (start === end for a pure insertion). From the longest common subsequence. */
function changes(base: string[], side: string[]): Change[] {
  const n = base.length, m = side.length
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    lcs[i][j] = base[i] === side[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  }
  const out: Change[] = []
  let i = 0, j = 0, open: Change | null = null
  while (i < n || j < m) {
    if (i < n && j < m && base[i] === side[j] && lcs[i][j] === lcs[i + 1][j + 1] + 1) {
      if (open) { out.push(open); open = null }
      i++; j++
    } else {
      open ??= { start: i, end: i, tokens: [] }
      if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) open.tokens.push(side[j++])
      else open.end = ++i
    }
  }
  if (open) out.push(open)
  return out
}

/** The original with both sides' changes, or null where they touch the same words. */
function mergeWords(base: string, ours: string, theirs: string): string | null {
  const b = base.match(TOKEN) ?? [], o = ours.match(TOKEN) ?? [], t = theirs.match(TOKEN) ?? []
  if (Math.max(b.length, o.length, t.length) > MAX_TOKENS) return null
  const all = [...changes(b, o).map(c => ({ ...c, ours: true })), ...changes(b, t).map(c => ({ ...c, ours: false }))]
    .sort((x, y) => x.start - y.start || x.end - y.end || Number(y.ours) - Number(x.ours))
  const out: string[] = []
  let at = 0
  for (let k = 0; k < all.length; k++) {
    const c = all[k], next = all[k + 1]
    if (next && next.start <= c.end && next.ours !== c.ours) {
      const same = next.start === c.start && next.end === c.end
      // Two insertions at one spot keep both (ours first); the same change twice is made once.
      if (!same || (c.start !== c.end && c.tokens.join('') !== next.tokens.join(''))) return null
      out.push(...b.slice(at, c.start), ...c.tokens)
      if (c.tokens.join('') !== next.tokens.join('')) out.push(...next.tokens)
      at = c.end; k++
      continue
    }
    out.push(...b.slice(at, c.start), ...c.tokens)
    at = c.end
  }
  out.push(...b.slice(at))
  return out.join('')
}

/** The file with every conflict settled, or null if any of them needs a person. Word-by-word
 *  merging is for code only (wordsToo); in prose it could make a sentence nobody wrote. */
export function resolveConflicts(text: string, { wordsToo = true } = {}): string | null {
  const out: string[] = []
  let ours: string[] = [], base: string[] = [], theirs: string[] = []
  let part: 'none' | 'ours' | 'base' | 'theirs' = 'none'
  let conflicts = 0
  for (const line of text.split('\n')) {
    if (part === 'none') {
      if (marker(line, '<')) { part = 'ours'; ours = []; base = []; theirs = [] }
      else if (marker(line, '|') || marker(line, '=') || marker(line, '>')) return null
      else out.push(line)
    } else if (marker(line, '<')) {
      return null // nested conflict
    } else if (part === 'ours') {
      if (marker(line, '|')) part = 'base'
      else if (marker(line, '=') || marker(line, '>')) return null // not diff3: can't tell an addition from an edit
      else ours.push(line)
    } else if (part === 'base') {
      if (marker(line, '=')) part = 'theirs'
      else if (marker(line, '>')) return null
      else base.push(line)
    } else if (marker(line, '>')) {
      if (!base.length) out.push(...combine(ours, theirs))
      else {
        const merged = wordsToo ? mergeWords(base.join('\n'), ours.join('\n'), theirs.join('\n')) : null
        if (merged === null) return null
        out.push(...merged.split('\n'))
      }
      conflicts++
      part = 'none'
    } else if (marker(line, '|') || marker(line, '=')) {
      return null
    } else {
      theirs.push(line)
    }
  }
  return part === 'none' && conflicts > 0 ? out.join('\n') : null
}
