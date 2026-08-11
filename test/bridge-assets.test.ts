import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertAbsolutePublicPath,
  hashBridgeSource,
  joinBaseAndAssetPath,
  publicFileNameFromAssetPath,
  readBridgeSource,
  resolvePackagedBridgePath,
  writeBridgeAtomically,
} from '../src/node/bridge-assets'

describe('node bridge assets', () => {
  it('resolves and hashes the packaged bridge', async () => {
    expect(resolvePackagedBridgePath()).toMatch(/codex-connector-bridge\.mjs$/)
    const source = await readBridgeSource()
    expect(source).toContain('codex app-server')
    expect(hashBridgeSource(source)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects relative, traversing, and external bases', () => {
    expect(assertAbsolutePublicPath('/codex/bridge.mjs')).toBe('/codex/bridge.mjs')
    expect(() => assertAbsolutePublicPath('codex/bridge.mjs')).toThrow(/must start with/)
    expect(() => assertAbsolutePublicPath('/codex/../secret.mjs')).toThrow(/\.\./)
    expect(joinBaseAndAssetPath('/app/', '/codex/x.mjs')).toBe('/app/codex/x.mjs')
    expect(joinBaseAndAssetPath('/', '/codex/x.mjs')).toBe('/codex/x.mjs')
    expect(() => joinBaseAndAssetPath('./', '/codex/x.mjs')).toThrow(/relative base/)
    expect(() => joinBaseAndAssetPath('https://cdn.example/', '/codex/x.mjs')).toThrow(/external URL/)
    expect(publicFileNameFromAssetPath('/codex/x.mjs')).toBe('codex/x.mjs')
  })

  it('writes the bridge atomically and skips identical content', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'codex-bridge-'))
    const source = await readBridgeSource()
    const first = await writeBridgeAtomically({ directory, source })
    expect(first.changed).toBe(true)
    expect(await readFile(first.targetPath, 'utf8')).toBe(source)

    const second = await writeBridgeAtomically({ directory, source })
    expect(second.changed).toBe(false)
    expect(second.sha256).toBe(first.sha256)

    await writeFile(first.targetPath, `${source}\n// dirty\n`, 'utf8')
    const third = await writeBridgeAtomically({ directory, source })
    expect(third.changed).toBe(true)
    expect(await readFile(third.targetPath, 'utf8')).toBe(source)
  })
})
