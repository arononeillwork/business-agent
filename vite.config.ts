import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

// The demo build becomes one self-contained HTML file, so it keeps all pages in one bundle.
const demoOnly = process.env.VITE_DEMO_ONLY === '1'

export default defineConfig({
  plugins: [react(), cloudflare()],
  ...(demoOnly ? { build: { assetsInlineLimit: 200_000, rollupOptions: { output: { inlineDynamicImports: true } } } } : {}),
})
