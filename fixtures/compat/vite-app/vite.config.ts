import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { codexConnector } from '../../../src/vite/index'

const root = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(root, '../../..')

export default defineConfig({
  root,
  base: '/',
  plugins: [codexConnector()],
  resolve: {
    alias: {
      'codex-connector': path.join(repoRoot, 'src/index.ts'),
    },
  },
  build: {
    outDir: path.join(root, '../.tmp/vite-app'),
    emptyOutDir: true,
    write: true,
  },
})
