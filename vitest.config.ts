import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so unit tests don't start the Workers runtime.
export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'worker/**/*.test.ts', 'src/**/*.test.ts'],
    server: { deps: { inline: ['@cloudflare/workers-oauth-provider'] } },
  },
  // The OAuth provider imports the Workers runtime; tests use a stand-in.
  resolve: { alias: { 'cloudflare:workers': new URL('./worker/test/cloudflareWorkers.ts', import.meta.url).pathname } },
})
