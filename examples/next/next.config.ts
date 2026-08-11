import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import { withCodexConnector } from 'codex-connector/next'

const root = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  agentRules: false,
  turbopack: {
    root: path.resolve(root, '../..'),
    resolveAlias: {
      'codex-connector/react': '../../dist/react/index.js',
      'codex-connector': '../../dist/index.js',
    },
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'codex-connector/react': path.resolve(root, 'node_modules/codex-connector/dist/react/index.js'),
      'codex-connector': path.resolve(root, 'node_modules/codex-connector/dist/index.js'),
    }
    return config
  },
}

export default withCodexConnector(nextConfig)
