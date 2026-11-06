import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so unit tests don't start the Workers runtime.
export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'worker/**/*.test.ts', 'src/**/*.test.ts', 'scripts/**/*.test.ts', 'render/**/*.test.ts', 'cameras/**/*.test.ts'],
    server: { deps: { inline: ['@cloudflare/workers-oauth-provider'] } },
    // The connector's page list, worked out from the app before the tests run.
    globalSetup: ['scripts/connector/vitest-setup.ts'],
  },
  // The OAuth provider imports the Workers runtime; tests use a stand-in.
  resolve: { alias: { 'cloudflare:workers': new URL('./worker/test/cloudflareWorkers.ts', import.meta.url).pathname } },
})
