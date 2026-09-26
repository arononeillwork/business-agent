import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Demo-only build: in-memory sample data, hash routing, one JS file with no backend.
// Used to publish a clickable preview (see scripts/build-demo-page.mjs).
export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_DEMO_ONLY': JSON.stringify('1') },
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 1_000_000, // logo and icon inside the single file
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
