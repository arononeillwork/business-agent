import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

// The demo build becomes one self-contained HTML file, so it keeps all pages in one bundle.
const demoOnly = process.env.VITE_DEMO_ONLY === '1'

// Code files are named after their content and browsers keep them for a year (public/_headers).
// The suffix gave every one a new address once, so browsers that had kept the app's page in place
// of a code file (worker/index.ts, /assets/*) fetch them all fresh. Change it to do that again.
const fresh = 'r2'
const names = {
  entryFileNames: `assets/[name]-[hash]-${fresh}.js`,
  chunkFileNames: `assets/[name]-[hash]-${fresh}.js`,
  assetFileNames: `assets/[name]-[hash]-${fresh}[extname]`,
}

export default defineConfig({
  plugins: [react(), cloudflare()],
  // Pre-bundle the brand-logo set at start-up; found later, it makes the dev server reload the page.
  optimizeDeps: { include: ['simple-icons'] },
  build: demoOnly
    ? { assetsInlineLimit: 200_000, rollupOptions: { output: { inlineDynamicImports: true } } }
    : { rollupOptions: { output: names } },
})
