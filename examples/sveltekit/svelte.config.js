import adapter from '@sveltejs/adapter-static'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default {
  kit: {
    adapter: adapter(),
    alias: {
      'codex-connector/svelte': path.resolve(root, '../../src/svelte/index.ts'),
      'codex-connector': path.resolve(root, '../../src/index.ts'),
    },
  },
}
