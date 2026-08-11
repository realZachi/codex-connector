import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import { codexConnector } from 'codex-connector/vite'

export default defineConfig({
  plugins: [sveltekit(), codexConnector()],
})
