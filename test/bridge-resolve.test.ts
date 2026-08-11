import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUNDLED_BRIDGE_SHA256 } from '../src/bridge-metadata'
import { resolveBridgeConfig } from '../src/bridge-resolve'
import { DEFAULT_BRIDGE_PATH } from '../src/setup-prompt'

describe('resolveBridgeConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('uses the bundled digest for the default package path', () => {
    expect(resolveBridgeConfig()).toEqual({
      bridgePath: DEFAULT_BRIDGE_PATH,
      bridgeSha256: BUNDLED_BRIDGE_SHA256,
    })
  })

  it('lets explicit config override adapter injects', () => {
    vi.stubGlobal('__CODEX_BRIDGE_PATH__', '/from-adapter/bridge.mjs')
    vi.stubGlobal('__CODEX_BRIDGE_SHA256__', 'b'.repeat(64))
    expect(resolveBridgeConfig({
      bridgePath: '/explicit/bridge.mjs',
      bridgeSha256: 'c'.repeat(64),
    })).toEqual({
      bridgePath: '/explicit/bridge.mjs',
      bridgeSha256: 'c'.repeat(64),
    })
  })

  it('prefers adapter path and digest when config omits both', () => {
    vi.stubGlobal('__CODEX_BRIDGE_PATH__', '/app/codex/codex-connector-bridge.mjs')
    vi.stubGlobal('__CODEX_BRIDGE_SHA256__', 'd'.repeat(64))
    expect(resolveBridgeConfig()).toEqual({
      bridgePath: '/app/codex/codex-connector-bridge.mjs',
      bridgeSha256: 'd'.repeat(64),
    })
  })

  it('reads Next build-time environment replacements', () => {
    vi.stubEnv('NEXT_PUBLIC_CODEX_BRIDGE_PATH', '/next/codex/bridge.mjs')
    vi.stubEnv('NEXT_PUBLIC_CODEX_BRIDGE_SHA256', 'f'.repeat(64))
    expect(resolveBridgeConfig()).toEqual({
      bridgePath: '/next/codex/bridge.mjs',
      bridgeSha256: 'f'.repeat(64),
    })
  })

  it('keeps the manual-review fallback for an explicit custom path without a hash', () => {
    vi.stubGlobal('__CODEX_BRIDGE_SHA256__', 'e'.repeat(64))
    expect(resolveBridgeConfig({ bridgePath: '/custom/bridge.mjs' })).toEqual({
      bridgePath: '/custom/bridge.mjs',
    })
  })

  it('honours an explicit digest for a custom path', () => {
    expect(resolveBridgeConfig({
      bridgePath: '/custom/bridge.mjs',
      bridgeSha256: BUNDLED_BRIDGE_SHA256,
    })).toEqual({
      bridgePath: '/custom/bridge.mjs',
      bridgeSha256: BUNDLED_BRIDGE_SHA256,
    })
  })
})
