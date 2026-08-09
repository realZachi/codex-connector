import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BRIDGE_ASSET_PATH,
  bridgeSha256,
  codexConnector,
  readBridgeSource,
  resolveBridgePath,
} from '../src/vite/index'

describe('vite plugin', () => {
  it('finds the bridge when running from source', () => {
    expect(resolveBridgePath()).toMatch(/bridge\/codex-connector-bridge\.mjs$/)
  })

  it('reads a bridge that actually looks like the bridge', async () => {
    const source = await readBridgeSource()
    expect(source).toContain('codex app-server')
    expect(source).toContain('127.0.0.1')
  })

  it('hashes the source the same way the CLI does', async () => {
    const source = await readBridgeSource()
    expect(bridgeSha256(source)).toBe(createHash('sha256').update(source, 'utf8').digest('hex'))
  })

  it('defines the checksum constant by default', async () => {
    const plugin = codexConnector()
    const config = await (plugin.config as () => Promise<{ define?: Record<string, string> }>)()
    const defined = config.define?.['__CODEX_BRIDGE_SHA256__']
    expect(defined).toBeDefined()
    expect(JSON.parse(String(defined))).toMatch(/^[a-f0-9]{64}$/)
  })

  it('allows a custom define name and skipping the define', async () => {
    const named = codexConnector({ defineSha256As: '__MY_HASH__' })
    const config = await (named.config as () => Promise<{ define?: Record<string, string> }>)()
    expect(config.define?.['__MY_HASH__']).toBeDefined()

    const skipped = codexConnector({ defineSha256As: false })
    const empty = await (skipped.config as () => Promise<{ define?: Record<string, string> }>)()
    expect(empty.define).toBeUndefined()
  })

  it('emits the bridge as an asset at the default path', async () => {
    const emitted: { fileName?: string; source?: unknown }[] = []
    const plugin = codexConnector()
    await (plugin.buildStart as unknown as (this: {
      emitFile: (file: { fileName?: string; source?: unknown }) => void
    }) => Promise<void>).call({ emitFile: (file) => emitted.push(file) })
    expect(emitted[0]?.fileName).toBe('codex/codex-connector-bridge.mjs')
    expect(String(emitted[0]?.source)).toContain('codex app-server')
    expect(DEFAULT_BRIDGE_ASSET_PATH).toBe('/codex/codex-connector-bridge.mjs')
  })

  it('honours a custom path and rejects a relative one', async () => {
    const emitted: { fileName?: string }[] = []
    const plugin = codexConnector({ path: '/static/bridge.mjs' })
    await (plugin.buildStart as unknown as (this: {
      emitFile: (file: { fileName?: string }) => void
    }) => Promise<void>).call({ emitFile: (file) => emitted.push(file) })
    expect(emitted[0]?.fileName).toBe('static/bridge.mjs')
    expect(() => codexConnector({ path: 'static/bridge.mjs' })).toThrow(/must start with/)
  })
})
