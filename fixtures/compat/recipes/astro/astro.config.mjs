import { defineConfig } from 'astro/config'
import { codexConnector } from 'codex-connector/vite'

export default defineConfig({
  vite: {
    plugins: [codexConnector()],
  },
})
