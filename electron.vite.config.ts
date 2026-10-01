import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Shared path aliases so the spec's top-level module directories
 * (/core /providers /platforms /analytics /research /seo /ai /database
 *  /auth /jobs /export /prompts) can be imported from any process.
 */
const alias = {
  '@app': resolve('app/src'),
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
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: resolve('desktop/main.ts'),
        output: { entryFileNames: 'index.js' },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: resolve('desktop/preload.ts'),
        output: { entryFileNames: 'index.mjs', format: 'es' },
      },
    },
  },
  renderer: {
    root: resolve('app'),
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: { input: resolve('app/index.html') },
    },
  },
})
