import path from 'node:path'
import type { NextConfig } from 'next'
import {
  DEFAULT_BRIDGE_ASSET_PATH,
  assertAbsolutePublicPath,
  joinBaseAndAssetPath,
  publicFileNameFromAssetPath,
  writeBridgeAtomically,
} from '../node/bridge-assets.js'

export type CodexConnectorNextOptions = {
  /**
   * Absolute public path for the bridge relative to `basePath`.
   * Defaults to `/codex/codex-connector-bridge.mjs`. The same relative path is
   * written below the project's `public/` directory.
   */
  path?: string
  /** Project root that contains `public/`. Defaults to `process.cwd()`. */
  root?: string
}

export type NextConfigObject = NextConfig

export type NextConfigFunction = (
  phase: string,
  context: { defaultConfig: NextConfig },
) => NextConfigObject | Promise<NextConfigObject>

export type NextConfigInput = NextConfigObject | NextConfigFunction

const BRIDGE_PATH_ENV = 'NEXT_PUBLIC_CODEX_BRIDGE_PATH'
const BRIDGE_SHA_ENV = 'NEXT_PUBLIC_CODEX_BRIDGE_SHA256'

const nextBridgeRelativeFile = (assetPath = DEFAULT_BRIDGE_ASSET_PATH): string =>
  publicFileNameFromAssetPath(assetPath)

export const nextBridgePublicDirectory = (
  root = process.cwd(),
  assetPath = DEFAULT_BRIDGE_ASSET_PATH,
): string => path.join(root, 'public', path.dirname(nextBridgeRelativeFile(assetPath)))

export const nextBridgePublicFile = (
  root = process.cwd(),
  assetPath = DEFAULT_BRIDGE_ASSET_PATH,
): string => path.join(root, 'public', nextBridgeRelativeFile(assetPath))

const enhance = async (
  config: NextConfigObject,
  options: CodexConnectorNextOptions,
): Promise<NextConfigObject> => {
  const assetPath = assertAbsolutePublicPath(
    options.path ?? DEFAULT_BRIDGE_ASSET_PATH,
    'withCodexConnector({ path })',
  )
  const root = options.root ?? process.cwd()
  const relativeFile = nextBridgeRelativeFile(assetPath)
  const written = await writeBridgeAtomically({
    directory: path.join(root, 'public', path.dirname(relativeFile)),
    fileName: path.basename(relativeFile),
  })

  // `assetPrefix` is intentionally ignored: files in `public/` are served from
  // the app origin, not the CDN asset prefix.
  const bridgePath = joinBaseAndAssetPath(config.basePath || '/', assetPath)
  const digest = written.sha256

  return {
    ...config,
    env: {
      ...config.env,
      // Next inlines static process.env access for Webpack and Turbopack. The
      // browser core reads these exact properties as a fallback, which also
      // keeps Next 15.0 working before compiler.define was introduced.
      [BRIDGE_PATH_ENV]: bridgePath,
      [BRIDGE_SHA_ENV]: digest,
    },
  }
}

/**
 * Next.js config wrapper: copies the bridge into `public/codex/` (atomically,
 * only when contents change), prefixes `basePath`, and injects path + SHA-256
 * through Next's build-time `env` so the browser SDK picks them up on Webpack
 * and Turbopack.
 *
 * Supports object, function, and async Next configs. Works with App Router,
 * Pages Router, Turbopack, Webpack, and `output: 'export'`.
 *
 * With `output: 'standalone'`, copy the `public` folder into the deployment
 * artifact as documented by Next.js — the bridge lives there.
 */
export function withCodexConnector(
  nextConfig?: NextConfigObject,
  options?: CodexConnectorNextOptions,
): NextConfigFunction
export function withCodexConnector(
  nextConfig: NextConfigFunction,
  options?: CodexConnectorNextOptions,
): NextConfigFunction
export function withCodexConnector(
  nextConfig: NextConfigInput = {},
  options: CodexConnectorNextOptions = {},
): NextConfigFunction {
  if (typeof nextConfig === 'function') {
    const wrapped: NextConfigFunction = async (phase, context) => {
      const resolved = await nextConfig(phase, context)
      return enhance(resolved, options)
    }
    return wrapped
  }
  return async () => enhance(nextConfig, options)
}

export default withCodexConnector
