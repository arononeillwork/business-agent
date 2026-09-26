// Builds the demo app into a single self-contained HTML page (inline script, no external
// requests) for sharing as a clickable preview. Output: dist-demo/easy-beans-demo.html
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

execSync('npx vite build --config vite.demo.config.ts', { stdio: 'inherit' })
const js = readdirSync('dist-demo/assets').filter(f => f.endsWith('.js'))
if (js.length !== 1) throw new Error(`Expected one JS bundle, found: ${js.join(', ')}`)
// Escape non-ASCII (€, ñ, –) so the page renders the same whatever encoding it is served with.
const code = readFileSync(`dist-demo/assets/${js[0]}`, 'utf8')
  .replace(/<\/script/gi, '<\\/script')
  .replace(/[\u0080-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)

const page = `<title>Easy Beans Team</title>
<style>
  :root { color-scheme: light; }
  html, body { background: #faf7f2; color: #1f1a17; }
  body { margin: 0; }
</style>
<div id="root"></div>
<script type="module">${code}</script>
`
writeFileSync('dist-demo/easy-beans-demo.html', page)
console.log(`dist-demo/easy-beans-demo.html (${(page.length / 1024).toFixed(0)} kB)`)
