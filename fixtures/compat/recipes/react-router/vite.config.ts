import { reactRouter } from '@react-router/dev/vite'
import { defineConfig } from 'vite'
import { codexConnector } from 'codex-connector/vite'

export default defineConfig({
  plugins: [reactRouter(), codexConnector()],
})
