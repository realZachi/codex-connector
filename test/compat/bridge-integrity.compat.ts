import { describe, expect, it } from 'vitest'
import { BUNDLED_BRIDGE_SHA256 } from '../../src/bridge-metadata.generated'
import { resolveBridgeConfig } from '../../src/bridge-resolve'
import { CONNECTOR_PROTOCOL_VERSION } from '../../src/service'
import { buildSetupPrompt } from '../../src/setup-prompt'
import {
  DEFAULT_BRIDGE_ASSET_PATH,
  clearAdapterGlobals,
  readBridgeBytes,
  sha256Hex,
} from './helpers'

describe('bridge integrity (URL / body / digest)', () => {
  it('BUNDLED_BRIDGE_SHA256 matches the packaged bridge bytes', async () => {
    const body = await readBridgeBytes()
    expect(sha256Hex(body)).toBe(BUNDLED_BRIDGE_SHA256)
    expect(body).toContain('codex app-server')
    expect(body).toContain('127.0.0.1')
  })

  it('default resolve embeds the bundled digest for the default path', () => {
    clearAdapterGlobals()
    const resolved = resolveBridgeConfig()
    expect(resolved.bridgePath).toBe(DEFAULT_BRIDGE_ASSET_PATH)
    expect(resolved.bridgeSha256).toBe(BUNDLED_BRIDGE_SHA256)
  })

  it('setup prompt URL and digest match served path + bridge body', async () => {
    clearAdapterGlobals()
    const body = await readBridgeBytes()
    const digest = sha256Hex(body)
    const origin = 'https://acme.example'
    const resolved = resolveBridgeConfig()

    const prompt = buildSetupPrompt({
      appName: 'Acme',
      bridgePath: resolved.bridgePath,
      ...(resolved.bridgeSha256 ? { bridgeSha256: resolved.bridgeSha256 } : {}),
      connection: {
        version: CONNECTOR_PROTOCOL_VERSION,
        serviceId: 'acme-studio',
        appOrigin: origin,
        pairingToken: 'a'.repeat(43),
        port: null,
      },
    })

    expect(resolved.bridgeSha256).toBe(digest)
    expect(prompt).toContain(`Connector source: ${origin}${DEFAULT_BRIDGE_ASSET_PATH}`)
    expect(prompt).toContain(digest)
    expect(prompt).toContain('shasum -a 256')
  })

  it('adapter inject wins over bundled digest but explicit config wins over both', () => {
    clearAdapterGlobals()
    const globalRecord = globalThis as Record<string, unknown>
    globalRecord.__CODEX_BRIDGE_PATH__ = '/cdn/bridge.mjs'
    globalRecord.__CODEX_BRIDGE_SHA256__ = 'b'.repeat(64)

    expect(resolveBridgeConfig()).toEqual({
      bridgePath: '/cdn/bridge.mjs',
      bridgeSha256: 'b'.repeat(64),
    })

    expect(
      resolveBridgeConfig({
        bridgePath: '/custom/bridge.mjs',
        bridgeSha256: 'c'.repeat(64),
      }),
    ).toEqual({
      bridgePath: '/custom/bridge.mjs',
      bridgeSha256: 'c'.repeat(64),
    })

    // Explicit path without hash → manual review (no digest).
    expect(resolveBridgeConfig({ bridgePath: '/custom/bridge.mjs' })).toEqual({
      bridgePath: '/custom/bridge.mjs',
    })

    clearAdapterGlobals()
  })
})
