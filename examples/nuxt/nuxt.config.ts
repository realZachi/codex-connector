import path from 'node:path'
import { fileURLToPath } from 'node:url'
import codexConnector from '../../src/nuxt/index'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2026-08-09',
  telemetry: false,
  modules: [codexConnector],
  alias: {
    'codex-connector/vue': path.resolve(root, '../../src/vue/index.ts'),
    'codex-connector': path.resolve(root, '../../src/index.ts'),
  },
  css: [path.resolve(root, '../../example/src/styles.css')],
  devtools: { enabled: true },
  typescript: { strict: true },
})
