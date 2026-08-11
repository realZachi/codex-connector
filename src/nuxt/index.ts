import path from 'node:path'
import {
  addPlugin,
  addTemplate,
  defineNuxtModule,
  type Nuxt,
} from 'nuxt/kit'
import {
  DEFAULT_BRIDGE_ASSET_PATH,
  assertAbsolutePublicPath,
  hashBridgeSource,
  joinBaseAndAssetPath,
  publicFileNameFromAssetPath,
  readBridgeSource,
} from '../node/bridge-assets.js'

export type CodexConnectorNuxtOptions = {
  /**
   * Absolute public path for the bridge relative to `app.baseURL`.
   * Defaults to `/codex/codex-connector-bridge.mjs`.
   */
  path?: string
}

export type NitroPublicAssetDir = {
  dir: string
  baseURL?: string
  maxAge?: number
}

export type NitroConfigLike = {
  publicAssets?: NitroPublicAssetDir[]
}

/** Pure helper — exported for unit tests without a full Nuxt app. */
export const resolveNuxtBridgeBrowserPath = (
  baseURL: string | undefined,
  assetPath: string = DEFAULT_BRIDGE_ASSET_PATH,
): string => joinBaseAndAssetPath(baseURL ?? '/', assertAbsolutePublicPath(assetPath))

/** Pure helper — client plugin source that installs adapter globals. */
export const buildNuxtBridgePluginSource = (bridgePath: string, bridgeSha256: string): string =>
  `import { defineNuxtPlugin } from 'nuxt/app'

export default defineNuxtPlugin(() => {
  globalThis.__CODEX_BRIDGE_PATH__ = ${JSON.stringify(bridgePath)}
  globalThis.__CODEX_BRIDGE_SHA256__ = ${JSON.stringify(bridgeSha256)}
})
`

/** Pure helper — register Nitro publicAssets for the generated bridge directory. */
export const applyNuxtBridgePublicAssets = (
  nitroConfig: NitroConfigLike,
  bridgeDirectory: string,
  publicBaseURL: string,
): void => {
  nitroConfig.publicAssets ??= []
  const assets = nitroConfig.publicAssets
  const already = assets.some((entry) => entry.dir === bridgeDirectory)
  if (!already) {
    assets.push({
      dir: bridgeDirectory,
      baseURL: publicBaseURL,
      // The URL is stable while bytes change between package releases. Force
      // revalidation so a stale body never disagrees with the injected digest.
      maxAge: 0,
    })
  }
}

const setupCodexConnectorModule = async (
  options: CodexConnectorNuxtOptions,
  nuxt: Nuxt,
): Promise<{ bridgePath: string; bridgeSha256: string; bridgeDirectory: string }> => {
  const assetPath = assertAbsolutePublicPath(
    options.path ?? DEFAULT_BRIDGE_ASSET_PATH,
    'codexConnector({ path })',
  )
  const bridgePath = resolveNuxtBridgeBrowserPath(nuxt.options.app.baseURL, assetPath)
  const source = await readBridgeSource()
  const bridgeSha256 = hashBridgeSource(source)
  const relativeFile = publicFileNameFromAssetPath(assetPath)
  const relativeDirectory = path.posix.dirname(relativeFile)
  const publicBaseURL = relativeDirectory === '.' ? '/' : `/${relativeDirectory}`

  const bridgeDirectory = path.join(
    nuxt.options.buildDir,
    'codex-connector',
    'public',
    relativeDirectory,
  )

  addTemplate({
    filename: `codex-connector/public/${relativeFile}`,
    getContents: () => source,
    write: true,
  })

  const plugin = addTemplate({
    filename: 'codex-connector/plugin.client.mjs',
    getContents: () => buildNuxtBridgePluginSource(bridgePath, bridgeSha256),
    write: true,
  })

  addPlugin({
    src: plugin.dst,
    mode: 'client',
  })

  nuxt.hook('nitro:config', (...args: unknown[]) => {
    const nitroConfig = args[0] as NitroConfigLike
    applyNuxtBridgePublicAssets(nitroConfig, bridgeDirectory, publicBaseURL)
  })

  return { bridgePath, bridgeSha256, bridgeDirectory }
}

/**
 * Nuxt module: serves the bridge via Nitro `publicAssets` (does not touch the
 * app `public/` folder), prefixes `app.baseURL`, and installs a tiny client
 * plugin that sets `__CODEX_BRIDGE_PATH__` / `__CODEX_BRIDGE_SHA256__` for the
 * browser core.
 *
 * Compatible with Nuxt 3/4, SSR, `nuxt generate`, and typical Nitro deployments.
 */
export const codexConnector = defineNuxtModule<CodexConnectorNuxtOptions>({
  meta: {
    name: 'codex-connector',
    configKey: 'codexConnector',
    compatibility: {
      nuxt: '>=3.5.0 <5',
    },
  },
  defaults: {},
  async setup(options, nuxt) {
    await setupCodexConnectorModule(options, nuxt)
  },
})

export default codexConnector

/** @internal Exported for focused unit tests. */
export const __test__ = {
  setupCodexConnectorModule,
}
