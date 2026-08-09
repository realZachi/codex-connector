import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
// In your own project this is `from 'codex-connector/vite'`.
import { codexConnector } from '../src/vite/index'

const packageRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), codexConnector()],
  resolve: {
    alias: {
      // Point at the package source so there is no build step between an edit
      // and the browser. In your own project you just import 'codex-connector'.
      'codex-connector/react': path.resolve(packageRoot, '../src/react/index.ts'),
      'codex-connector': path.resolve(packageRoot, '../src/index.ts'),
    },
  },
  server: {
    // Must be a loopback host: the connector only pairs with HTTPS origins or
    // 127.0.0.1/localhost. Keep this stable, because the origin is part of the
    // pairing — switching host or port means running the setup prompt again.
    host: '127.0.0.1',
    port: 4180,
    strictPort: true,
  },
})
