import { createHash } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { BUNDLED_BRIDGE_SHA256 } from '../../src/bridge-metadata.generated'
import {
  DEFAULT_BRIDGE_ASSET_PATH,
  bridgeSha256,
  codexConnector,
  readBridgeSource,
} from '../../src/vite/index'
import { build } from 'vite'
import { pathExists, repoRoot, sha256Hex } from './helpers'

describe('vite adapter smoke', () => {
  const outDir = path.join(repoRoot, 'fixtures/compat/.tmp/vite-plugin-unit')

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true })
  })

  it('plugin define digest matches bridge body and bundled constant', async () => {
    const source = await readBridgeSource()
    const digest = bridgeSha256(source)
    expect(digest).toBe(sha256Hex(source))
    expect(digest).toBe(BUNDLED_BRIDGE_SHA256)

    const plugin = codexConnector()
    const configHook = plugin.config as (
      userConfig: { base?: string },
    ) => Promise<{ define?: Record<string, string> }>
    const config = await configHook({ base: '/' })
    const defined = config.define?.['__CODEX_BRIDGE_SHA256__']
    expect(defined).toBeDefined()
    expect(JSON.parse(String(defined))).toBe(digest)
    expect(DEFAULT_BRIDGE_ASSET_PATH).toBe('/codex/codex-connector-bridge.mjs')
  })

  it('production build emits bridge asset whose body matches the digest', async () => {
    await rm(outDir, { recursive: true, force: true })
    await mkdir(outDir, { recursive: true })

    const fixtureRoot = path.join(repoRoot, 'fixtures/compat/vite-app')
    await build({
      configFile: path.join(fixtureRoot, 'vite.config.ts'),
      logLevel: 'error',
    })

    const assetPath = path.join(
      repoRoot,
      'fixtures/compat/.tmp/vite-app',
      'codex/codex-connector-bridge.mjs',
    )
    expect(await pathExists(assetPath)).toBe(true)
    const body = await readFile(assetPath, 'utf8')
    expect(createHash('sha256').update(body, 'utf8').digest('hex')).toBe(BUNDLED_BRIDGE_SHA256)
    expect(body).toContain('codex app-server')
  })
})
