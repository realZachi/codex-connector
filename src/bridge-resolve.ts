import { BUNDLED_BRIDGE_SHA256 } from './bridge-metadata.generated.js'
import { DEFAULT_BRIDGE_PATH } from './setup-prompt.js'

/**
 * Build adapters inject these compile-time globals so the browser core can
 * pick up the served path and digest without the app passing them manually.
 * Declared loosely so apps without an adapter still typecheck.
 */
declare const __CODEX_BRIDGE_PATH__: string | undefined
declare const __CODEX_BRIDGE_SHA256__: string | undefined

export type BridgeResolveInput = {
  bridgePath?: string
  bridgeSha256?: string
}

export type ResolvedBridgeConfig = {
  bridgePath: string
  /** Absent when a custom path was chosen without a digest (manual review). */
  bridgeSha256?: string
}

const readGlobalString = (name: string): string | undefined => {
  const value = (globalThis as Record<string, unknown>)[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Prefer bundler-injected bare identifiers (Vite `define`), then Next's
 * build-time `process.env` replacement, and finally runtime globals (Nuxt and
 * tests).
 */
const readAdapterPath = (): string | undefined => {
  try {
    const value = __CODEX_BRIDGE_PATH__
    if (typeof value === 'string' && value.length > 0) return value
  } catch {
    // Undeclared in this environment.
  }
  if (typeof process !== 'undefined') {
    const value = process.env.NEXT_PUBLIC_CODEX_BRIDGE_PATH ?? process.env.__CODEX_BRIDGE_PATH__
    if (typeof value === 'string' && value.length > 0) return value
  }
  return readGlobalString('__CODEX_BRIDGE_PATH__')
}

const readAdapterSha256 = (): string | undefined => {
  try {
    const value = __CODEX_BRIDGE_SHA256__
    if (typeof value === 'string' && value.length > 0) return value
  } catch {
    // Undeclared in this environment.
  }
  if (typeof process !== 'undefined') {
    const value = process.env.NEXT_PUBLIC_CODEX_BRIDGE_SHA256 ??
      process.env.__CODEX_BRIDGE_SHA256__
    if (typeof value === 'string' && value.length > 0) return value
  }
  return readGlobalString('__CODEX_BRIDGE_SHA256__')
}

/**
 * Resolve bridge path + integrity digest.
 *
 * Priority for path: explicit config → adapter inject → default.
 * Priority for sha256:
 * 1. explicit config.bridgeSha256
 * 2. if config.bridgePath was set explicitly without a hash → omit (manual review)
 * 3. adapter inject
 * 4. bundled digest when the resolved path is the default package path
 */
export const resolveBridgeConfig = (input: BridgeResolveInput = {}): ResolvedBridgeConfig => {
  const explicitPath = input.bridgePath
  const adapterPath = readAdapterPath()
  const bridgePath = explicitPath ?? adapterPath ?? DEFAULT_BRIDGE_PATH

  if (input.bridgeSha256 !== undefined) {
    return input.bridgeSha256
      ? { bridgePath, bridgeSha256: input.bridgeSha256 }
      : { bridgePath }
  }

  // Explicit custom path without hash keeps the historical manual-review prompt.
  if (explicitPath !== undefined) {
    return { bridgePath }
  }

  const adapterSha = readAdapterSha256()
  if (adapterSha) return { bridgePath, bridgeSha256: adapterSha }

  if (bridgePath === DEFAULT_BRIDGE_PATH) {
    return { bridgePath, bridgeSha256: BUNDLED_BRIDGE_SHA256 }
  }

  return { bridgePath }
}
