import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

export const DEFAULT_BRIDGE_ASSET_PATH = '/codex/codex-connector-bridge.mjs'

export type CodexConnectorPluginOptions = {
  /** Public path to serve the bridge from. Must match your `bridgePath`. */
  path?: string
  /**
   * Name of a define/env constant that receives the bridge SHA-256, so you can
   * pass it to the connector as `bridgeSha256`. Defaults to
   * `__CODEX_BRIDGE_SHA256__`. Set to `false` to skip the define.
   */
  defineSha256As?: string | false
}

export const resolveBridgePath = (): string => {
  try {
    return createRequire(import.meta.url).resolve('codex-connector/bridge')
  } catch {
    // Running from source (this repo, or a linked checkout).
    return fileURLToPath(new URL('../../bridge/codex-connector-bridge.mjs', import.meta.url))
  }
}

export const readBridgeSource = async (): Promise<string> =>
  readFile(resolveBridgePath(), 'utf8')

export const bridgeSha256 = (source: string): string =>
  createHash('sha256').update(source, 'utf8').digest('hex')

/**
 * Serves the connector bridge from your own origin in dev and build, and exposes
 * its SHA-256 so the setup prompt can tell Codex to verify the download.
 */
export const codexConnector = (options: CodexConnectorPluginOptions = {}): Plugin => {
  const assetPath = options.path ?? DEFAULT_BRIDGE_ASSET_PATH
  if (!assetPath.startsWith('/')) throw new Error('codexConnector({ path }) must start with "/"')
  const defineName = options.defineSha256As === false
    ? null
    : options.defineSha256As ?? '__CODEX_BRIDGE_SHA256__'
  let source: string | null = null
  const loadSource = async () => {
    source ??= await readBridgeSource()
    return source
  }

  return {
    name: 'codex-connector',
    async config() {
      if (!defineName) return {}
      return { define: { [defineName]: JSON.stringify(bridgeSha256(await loadSource())) } }
    },
    async buildStart() {
      this.emitFile({
        type: 'asset',
        fileName: assetPath.slice(1),
        source: await loadSource(),
      })
    },
    configureServer(server) {
      server.middlewares.use(assetPath, (_request, response) => {
        void loadSource().then((bridge) => {
          response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.end(bridge)
        }).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Bridge read failed'
          console.error(`codex-connector: unable to serve the bridge (${message})`)
          response.statusCode = 500
          response.end('Bridge unavailable')
        })
      })
    },
  }
}

export default codexConnector
