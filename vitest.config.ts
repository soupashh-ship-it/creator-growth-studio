import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Unit/integration tests run in Node (not the renderer) and target the pure
 * domain layers. External APIs are always mocked (spec §90).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve('core'),
      '@providers': resolve('providers'),
      '@platforms': resolve('platforms'),
      '@analytics': resolve('analytics'),
      '@research': resolve('research'),
      '@seo': resolve('seo'),
      '@ai': resolve('ai'),
      '@database': resolve('database'),
      '@auth': resolve('auth'),
      '@jobs': resolve('jobs'),
      '@export': resolve('export'),
      '@prompts': resolve('prompts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', '{core,providers,platforms,analytics,research,seo,ai,database,auth,jobs,export,prompts}/**/*.test.ts'],
    globals: true,
  },
})
