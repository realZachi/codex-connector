import { createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const bridgeFilePath = path.join(repoRoot, 'bridge', 'codex-connector-bridge.mjs')

export const DEFAULT_BRIDGE_ASSET_PATH = '/codex/codex-connector-bridge.mjs'

export const sha256Hex = (source: string | Buffer): string =>
  createHash('sha256').update(source).digest('hex')

export const readBridgeBytes = async (): Promise<string> => readFile(bridgeFilePath, 'utf8')

export const pathExists = async (target: string): Promise<boolean> => {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

export type CompatMatrix = {
  adapters: Array<{ id: string; majors: number[]; export: string; symbol: string }>
  bindings: Array<{ id: string; majors: number[]; export: string; symbol: string }>
  recipes: Array<{ id: string; major: number; doc: string; fixture: string }>
  bridgeAssetPath: string
}

export const loadMatrix = async (): Promise<CompatMatrix> => {
  const raw = await readFile(path.join(repoRoot, 'fixtures/compat/matrix.json'), 'utf8')
  return JSON.parse(raw) as CompatMatrix
}

export const clearAdapterGlobals = (): void => {
  const globalRecord = globalThis as Record<string, unknown>
  delete globalRecord.__CODEX_BRIDGE_PATH__
  delete globalRecord.__CODEX_BRIDGE_SHA256__
}
