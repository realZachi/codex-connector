import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { solidStart } from '@solidjs/start/config'
import { codexConnector } from '../../src/vite/index.ts'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [solidStart(), codexConnector(), nitro()],
  resolve: {
    alias: {
      'codex-connector/solid': path.resolve(root, '../../src/solid/index.ts'),
      'codex-connector': path.resolve(root, '../../src/index.ts'),
    },
  },
  server: {
    fs: {
      // The demo intentionally reuses the exact stylesheet from `example/`.
      allow: [path.resolve(root, '../..')],
    },
  },
})
