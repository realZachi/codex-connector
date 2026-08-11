import type { Plugin, ResolvedConfig } from 'vite'
import {
  DEFAULT_BRIDGE_ASSET_PATH,
  assertAbsolutePublicPath,
  hashBridgeSource,
  joinBaseAndAssetPath,
  publicFileNameFromAssetPath,
  readBridgeSource,
  resolvePackagedBridgePath,
} from '../node/bridge-assets.js'

export {
  DEFAULT_BRIDGE_ASSET_PATH,
  readBridgeSource,
}

/** Kept for existing `codex-connector/vite` consumers. */
export const resolveBridgePath = resolvePackagedBridgePath

/** Kept for existing `codex-connector/vite` consumers. */
export const bridgeSha256 = hashBridgeSource

export type CodexConnectorPluginOptions = {
  /**
   * Final public path to serve the bridge from. When omitted, the default path
   * is prefixed with Vite `base`. Explicit values preserve the pre-0.2
   * semantics and bypass `base`.
   */
  path?: string
  /**
   * Name of a define/env constant that receives the bridge SHA-256, so you can
   * pass it to the connector as `bridgeSha256`. Defaults to
   * `__CODEX_BRIDGE_SHA256__`. Set to `false` to skip the sha256 define
   * (path inject still happens). Official setups no longer need this option —
   * the plugin injects `__CODEX_BRIDGE_PATH__` / `__CODEX_BRIDGE_SHA256__` for
   * the browser core automatically.
   */
  defineSha256As?: string | false
}

type ConnectResponse = {
  setHeader: (name: string, value: string) => void
  end: (body: string) => void
  statusCode: number
}

/**
 * Serves the connector bridge from your own origin in dev and build, derives the
 * final path from Vite `base`, and injects path + SHA-256 into the browser SDK.
 */
export const codexConnector = (options: CodexConnectorPluginOptions = {}): Plugin => {
  const assetPath = assertAbsolutePublicPath(
    options.path ?? DEFAULT_BRIDGE_ASSET_PATH,
    'codexConnector({ path })',
  )
  const defineName = options.defineSha256As === false
    ? null
    : options.defineSha256As ?? '__CODEX_BRIDGE_SHA256__'

  // Cache only across a production build. In serve mode the middleware re-reads
  // the file every request so bridge edits are picked up without a restart.
  let buildSource: string | null = null
  let isBuild = false
  let browserPath = assetPath
  let fileName = publicFileNameFromAssetPath(assetPath)

  const loadSource = async (force = false) => {
    if (!force && buildSource !== null) return buildSource
    const next = await readBridgeSource()
    if (isBuild) buildSource = next
    return next
  }

  const resolveFromBase = (base: string | undefined) => {
    // Vite-based frameworks such as SvelteKit may resolve `base` to `./`, and
    // apps may send their JS chunks to a CDN. The bridge must remain an
    // absolute same-origin URL, so retain the historical root path in those
    // cases. Same-origin absolute bases still prefix the default path.
    const canPrefix = base === undefined || base === '' || base.startsWith('/')
    browserPath = options.path === undefined && canPrefix
      ? joinBaseAndAssetPath(base, assetPath)
      : assetPath
    fileName = publicFileNameFromAssetPath(assetPath)
  }

  return {
    name: 'codex-connector',
    async config(userConfig) {
      resolveFromBase(userConfig.base)
      const digest = hashBridgeSource(await readBridgeSource())
      const define: Record<string, string> = {
        __CODEX_BRIDGE_PATH__: JSON.stringify(browserPath),
      }
      if (defineName) {
        define[defineName] = JSON.stringify(digest)
        if (defineName !== '__CODEX_BRIDGE_SHA256__') {
          define.__CODEX_BRIDGE_SHA256__ = JSON.stringify(digest)
        }
      }
      return { define }
    },
    configResolved(resolved: ResolvedConfig) {
      isBuild = resolved.command === 'build'
      resolveFromBase(resolved.base)
    },
    async buildStart() {
      // emitFile() does not exist in serve mode; dev is handled by the middleware.
      if (!isBuild) return
      this.emitFile({
        type: 'asset',
        fileName,
        source: await loadSource(),
      })
    },
    configureServer(server) {
      server.middlewares.use(browserPath, (_request, response) => {
        const res = response as ConnectResponse
        void loadSource(true).then((bridge) => {
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(bridge)
        }).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Bridge read failed'
          console.error(`codex-connector: unable to serve the bridge (${message})`)
          res.statusCode = 500
          res.end('Bridge unavailable')
        })
      })
    },
  }
}

export default codexConnector
