import { qwikVite } from '@builder.io/qwik/optimizer'
import { qwikCity } from '@builder.io/qwik-city/vite'
import { defineConfig } from 'vite'
import { codexConnector } from 'codex-connector/vite'

export default defineConfig({
  plugins: [qwikCity(), qwikVite(), codexConnector()],
})
