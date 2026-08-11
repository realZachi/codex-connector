import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import { codexConnector } from '../../src/vite/index.ts'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [sveltekit(), codexConnector()],
  resolve: {
    alias: {
      'codex-connector/svelte': path.resolve(root, '../../src/svelte/index.ts'),
      'codex-connector': path.resolve(root, '../../src/index.ts'),
    },
  },
})
