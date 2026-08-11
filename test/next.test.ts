import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { NextConfig } from 'next'
import {
  hashBridgeSource,
  readBridgeSource,
} from '../src/node/bridge-assets'
import {
  nextBridgePublicFile,
  withCodexConnector,
  type NextConfigFunction,
  type NextConfigObject,
} from '../src/next/index'

const tempRoots: string[] = []

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-next-'))
  tempRoots.push(root)
  await mkdir(path.join(root, 'public'), { recursive: true })
  return root
}

const resolveConfig = async (
  config: NextConfig | NextConfigFunction,
  root: string,
  bridgePath?: string,
): Promise<NextConfigObject> => {
  const options = {
    root,
    ...(bridgePath ? { path: bridgePath } : {}),
  }
  const wrapped = typeof config === 'function'
    ? withCodexConnector(config, options)
    : withCodexConnector(config, options)
  return wrapped('phase-production-build', { defaultConfig: {} })
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('withCodexConnector', () => {
  it('accepts and enhances an actual NextConfig object', async () => {
    const root = await makeRoot()
    const source = await readBridgeSource()
    const digest = hashBridgeSource(source)
    const config: NextConfig = {
      reactStrictMode: true,
      headers: async () => [{ source: '/x', headers: [{ key: 'X-Test', value: '1' }] }],
    }

    const enhanced = await resolveConfig(config, root)

    expect(enhanced.reactStrictMode).toBe(true)
    expect(enhanced.headers).toBeTypeOf('function')
    expect(enhanced.env?.NEXT_PUBLIC_CODEX_BRIDGE_PATH).toBe('/codex/codex-connector-bridge.mjs')
    expect(enhanced.env?.NEXT_PUBLIC_CODEX_BRIDGE_SHA256).toBe(digest)
    expect(await readFile(nextBridgePublicFile(root), 'utf8')).toBe(source)
  })

  it('wraps synchronous and asynchronous Next config functions', async () => {
    const root = await makeRoot()
    const syncFn: NextConfigFunction = () => ({ basePath: '/app' })
    const wrappedSync = withCodexConnector(syncFn, { root })
    const syncResult = await wrappedSync('phase-production-build', { defaultConfig: {} })
    expect(syncResult.env?.NEXT_PUBLIC_CODEX_BRIDGE_PATH).toBe('/app/codex/codex-connector-bridge.mjs')

    const asyncFn: NextConfigFunction = async () => ({ basePath: '/async' })
    const wrappedAsync = withCodexConnector(asyncFn, { root })
    const asyncResult = await wrappedAsync('phase-development-server', { defaultConfig: {} })
    expect(asyncResult.env?.NEXT_PUBLIC_CODEX_BRIDGE_PATH).toBe('/async/codex/codex-connector-bridge.mjs')
  })

  it('prefixes basePath, ignores assetPrefix, and preserves existing config', async () => {
    const root = await makeRoot()
    const enhanced = await resolveConfig({
      basePath: '/docs',
      assetPrefix: 'https://cdn.example/assets',
      env: { MY_FLAG: '1' },
      compiler: { define: { OTHER: 'x' }, removeConsole: true },
    }, root)

    expect(enhanced.env?.NEXT_PUBLIC_CODEX_BRIDGE_PATH).toBe('/docs/codex/codex-connector-bridge.mjs')
    expect(enhanced.env?.MY_FLAG).toBe('1')
    expect(enhanced.assetPrefix).toBe('https://cdn.example/assets')
    expect(enhanced.compiler?.define?.OTHER).toBe('x')
    expect(enhanced.compiler?.removeConsole).toBe(true)
  })

  it('writes the bridge only when content changes on repeated runs', async () => {
    const root = await makeRoot()
    const first = await resolveConfig({}, root)
    const target = nextBridgePublicFile(root)
    const before = await readFile(target, 'utf8')

    await writeFile(target, before, 'utf8')
    const second = await resolveConfig({}, root)
    expect(await readFile(target, 'utf8')).toBe(before)
    expect(second.env?.NEXT_PUBLIC_CODEX_BRIDGE_SHA256)
      .toBe(first.env?.NEXT_PUBLIC_CODEX_BRIDGE_SHA256)

    await writeFile(target, '// tampered\n', 'utf8')
    await resolveConfig({}, root)
    expect(await readFile(target, 'utf8')).toBe(before)
  })

  it('writes and injects the exact custom path', async () => {
    const root = await makeRoot()
    const bridgePath = '/static/custom-bridge.mjs'
    const enhanced = await resolveConfig({}, root, bridgePath)
    expect(enhanced.env?.NEXT_PUBLIC_CODEX_BRIDGE_PATH).toBe(bridgePath)
    expect(await readFile(nextBridgePublicFile(root, bridgePath), 'utf8'))
      .toContain('codex app-server')
  })

  it('rejects a relative custom path', async () => {
    const root = await makeRoot()
    await expect(resolveConfig({}, root, 'relative.mjs')).rejects.toThrow(/must start with/)
  })
})
