import { defineConfig } from 'vitest/config'

/**
 * Framework / recipe compatibility matrix.
 * Uses `*.compat.ts` so the fast `bun run test` gate stays lean
 * (main vitest include is test slash-star-star slash-star.test.ts).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/compat/**/*.compat.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
