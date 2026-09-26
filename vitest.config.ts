import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so unit tests don't start the Workers runtime.
export default defineConfig({
  test: { include: ['shared/**/*.test.ts', 'worker/**/*.test.ts', 'src/**/*.test.ts'] },
})
