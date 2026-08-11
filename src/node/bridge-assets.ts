import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_BRIDGE_ASSET_PATH = '/codex/codex-connector-bridge.mjs'
export const DEFAULT_BRIDGE_FILENAME = 'codex-connector-bridge.mjs'
export const DEFAULT_BRIDGE_PUBLIC_SEGMENT = 'codex'

/**
 * Resolve the packaged bridge module path. Prefers the package export, then
 * falls back to the source tree next to this file (repo / linked checkout).
 */
export const resolvePackagedBridgePath = (): string => {
  try {
    return createRequire(import.meta.url).resolve('codex-connector/bridge')
  } catch {
    return fileURLToPath(new URL('../../bridge/codex-connector-bridge.mjs', import.meta.url))
  }
}

export const readBridgeSource = async (bridgeFilePath = resolvePackagedBridgePath()): Promise<string> =>
  readFile(bridgeFilePath, 'utf8')

export const hashBridgeSource = (source: string | Uint8Array): string =>
  createHash('sha256').update(source).digest('hex')

export const assertAbsolutePublicPath = (assetPath: string, label = 'bridge path'): string => {
  if (!assetPath.startsWith('/')) {
    throw new Error(`${label} must start with "/"`)
  }
  if (assetPath.includes('\\') || assetPath.includes('\0')) {
    throw new Error(`${label} contains invalid characters`)
  }
  if (assetPath.includes('..')) {
    throw new Error(`${label} must not contain ".."`)
  }
  return assetPath
}

/**
 * Join a framework base path (`/app`, `/app/`) with an absolute asset path.
 * Treats Vite's empty base as app root. Rejects relative bases (`./`) and
 * absolute external URL bases — the bridge
 * must be served from the app origin.
 */
export const joinBaseAndAssetPath = (base: string | undefined, assetPath: string): string => {
  const normalizedAsset = assertAbsolutePublicPath(assetPath)
  const rawBase = base ?? '/'

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(rawBase)) {
    throw new Error(
      'codex-connector: base/basePath must be a same-origin path, not an external URL. ' +
        `Pass an explicit bridge path instead (received base ${JSON.stringify(rawBase)}).`,
    )
  }

  const trimmed = rawBase.trim()
  if (trimmed === './' || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    throw new Error(
      'codex-connector: relative base/basePath is not supported because the bridge must be ' +
        'served from the app origin. Set an absolute base (e.g. "/") or pass an explicit path.',
    )
  }

  const basePath = trimmed === '/' || trimmed === '' ? '' : trimmed.replace(/\/+$/, '')
  if (basePath && !basePath.startsWith('/')) {
    throw new Error(
      'codex-connector: base/basePath must start with "/". ' +
        `Received ${JSON.stringify(rawBase)}.`,
    )
  }

  return `${basePath}${normalizedAsset}`
}

/** Relative path under the build output / public root (no leading slash). */
export const publicFileNameFromAssetPath = (assetPath: string): string =>
  assertAbsolutePublicPath(assetPath).slice(1)

/**
 * Write the bridge only when content changed. Uses a temp file + rename so
 * readers never observe a partial write.
 */
export const writeBridgeAtomically = async (options: {
  /** Directory that should contain `codex-connector-bridge.mjs`. */
  directory: string
  source?: string
  fileName?: string
}): Promise<{ targetPath: string; sha256: string; changed: boolean }> => {
  const fileName = options.fileName ?? DEFAULT_BRIDGE_FILENAME
  const source = options.source ?? await readBridgeSource()
  const sha256 = hashBridgeSource(source)
  const targetPath = path.join(options.directory, fileName)
  await mkdir(options.directory, { recursive: true })

  try {
    const existing = await readFile(targetPath, 'utf8')
    if (existing === source) {
      return { targetPath, sha256, changed: false }
    }
  } catch {
    // missing → write
  }

  const tempPath = path.join(
    options.directory,
    `.${fileName}.${process.pid}.${Date.now()}.tmp`,
  )
  await writeFile(tempPath, source, 'utf8')
  await rename(tempPath, targetPath)
  return { targetPath, sha256, changed: true }
}
