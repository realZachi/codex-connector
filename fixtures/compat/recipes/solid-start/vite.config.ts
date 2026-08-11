import { solidStart } from '@solidjs/start/config'
import { codexConnector } from 'codex-connector/vite'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [solidStart(), codexConnector(), nitro()],
})
