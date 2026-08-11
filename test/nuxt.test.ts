import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_BRIDGE_ASSET_PATH,
  hashBridgeSource,
  readBridgeSource,
} from '../src/node/bridge-assets'

const {
  addTemplate,
  addPlugin,
  defineNuxtModule,
} = vi.hoisted(() => {
  const addTemplate = vi.fn((template: {
    filename?: string
    dst?: string
    getContents?: () => string | Promise<string>
    write?: boolean
  }) => ({
    dst: `/virtual/build/${template.filename ?? 'template.mjs'}`,
    filename: template.filename ?? 'template.mjs',
  }))
  const addPlugin = vi.fn()
  const defineNuxtModule = vi.fn((definition: unknown) => definition)
  return { addTemplate, addPlugin, defineNuxtModule }
})

vi.mock('nuxt/kit', () => ({
  addTemplate,
  addPlugin,
  defineNuxtModule,
}))

const makeNuxt = (baseURL = '/site/') => {
  const hooks: Record<string, (arg: unknown) => void> = {}
  return {
    hooks,
    nuxt: {
      options: {
        buildDir: '/tmp/nuxt-build',
        app: { baseURL },
      },
      hook: (name: string, fn: (arg: unknown) => void) => { hooks[name] = fn },
    },
  }
}

describe('nuxt module helpers', () => {
  beforeEach(() => {
    addTemplate.mockClear()
    addPlugin.mockClear()
  })

  it('resolves app.baseURL into the browser bridge path', async () => {
    const { resolveNuxtBridgeBrowserPath } = await import('../src/nuxt/index')
    expect(resolveNuxtBridgeBrowserPath('/')).toBe(DEFAULT_BRIDGE_ASSET_PATH)
    expect(resolveNuxtBridgeBrowserPath('/portal/')).toBe('/portal/codex/codex-connector-bridge.mjs')
    expect(resolveNuxtBridgeBrowserPath('/portal/', '/static/bridge.mjs'))
      .toBe('/portal/static/bridge.mjs')
  })

  it('builds a client plugin that installs adapter globals', async () => {
    const { buildNuxtBridgePluginSource } = await import('../src/nuxt/index')
    const source = buildNuxtBridgePluginSource('/app/codex/codex-connector-bridge.mjs', 'abc123')
    expect(source).toContain("import { defineNuxtPlugin } from 'nuxt/app'")
    expect(source).toContain('globalThis.__CODEX_BRIDGE_PATH__ = "/app/codex/codex-connector-bridge.mjs"')
    expect(source).toContain('globalThis.__CODEX_BRIDGE_SHA256__ = "abc123"')
  })

  it('registers revalidated Nitro public assets without touching user public/', async () => {
    const { applyNuxtBridgePublicAssets } = await import('../src/nuxt/index')
    const nitroConfig: {
      publicAssets?: { dir: string; baseURL?: string; maxAge?: number }[]
    } = { publicAssets: [{ dir: '/app/public' }] }

    applyNuxtBridgePublicAssets(nitroConfig, '/build/codex-connector/codex', '/codex')
    expect(nitroConfig.publicAssets).toEqual([
      { dir: '/app/public' },
      {
        dir: '/build/codex-connector/codex',
        baseURL: '/codex',
        maxAge: 0,
      },
    ])
    applyNuxtBridgePublicAssets(nitroConfig, '/build/codex-connector/codex', '/codex')
    expect(nitroConfig.publicAssets).toHaveLength(2)
  })

  it('wires the default template, client plugin, and bridge body', async () => {
    const { __test__ } = await import('../src/nuxt/index')
    const bridgeSource = await readBridgeSource()
    const digest = hashBridgeSource(bridgeSource)
    const { hooks, nuxt } = makeNuxt()

    const result = await __test__.setupCodexConnectorModule({}, nuxt as never)
    expect(result.bridgePath).toBe('/site/codex/codex-connector-bridge.mjs')
    expect(result.bridgeSha256).toBe(digest)
    expect(result.bridgeDirectory).toBe('/tmp/nuxt-build/codex-connector/public/codex')

    const bridgeTemplate = addTemplate.mock.calls.find((call) =>
      String(call[0]?.filename).endsWith('codex-connector-bridge.mjs'))?.[0]
    expect(bridgeTemplate?.filename).toBe(
      'codex-connector/public/codex/codex-connector-bridge.mjs',
    )
    expect(await bridgeTemplate?.getContents?.()).toContain('codex app-server')

    const pluginTemplate = addTemplate.mock.calls.find((call) =>
      String(call[0]?.filename).includes('plugin.client'))?.[0]
    const pluginSource = await pluginTemplate?.getContents?.()
    expect(pluginSource).toContain('/site/codex/codex-connector-bridge.mjs')
    expect(pluginSource).toContain(digest)
    expect(addPlugin).toHaveBeenCalledWith(expect.objectContaining({ mode: 'client' }))

    const nitroConfig: { publicAssets?: unknown[] } = {}
    hooks['nitro:config']?.(nitroConfig)
    expect(nitroConfig.publicAssets).toEqual([{
      dir: '/tmp/nuxt-build/codex-connector/public/codex',
      baseURL: '/codex',
      maxAge: 0,
    }])
  })

  it('uses a custom path for template, public asset, and injected URL', async () => {
    const { __test__ } = await import('../src/nuxt/index')
    const { hooks, nuxt } = makeNuxt()
    const result = await __test__.setupCodexConnectorModule(
      { path: '/static/custom-bridge.mjs' },
      nuxt as never,
    )

    expect(result.bridgePath).toBe('/site/static/custom-bridge.mjs')
    expect(result.bridgeDirectory).toBe('/tmp/nuxt-build/codex-connector/public/static')
    expect(addTemplate.mock.calls.some((call) =>
      call[0]?.filename === 'codex-connector/public/static/custom-bridge.mjs')).toBe(true)

    const nitroConfig: { publicAssets?: unknown[] } = {}
    hooks['nitro:config']?.(nitroConfig)
    expect(nitroConfig.publicAssets).toEqual([{
      dir: '/tmp/nuxt-build/codex-connector/public/static',
      baseURL: '/static',
      maxAge: 0,
    }])
  })

  it('exports default and named module definitions', async () => {
    const mod = await import('../src/nuxt/index')
    expect(mod.codexConnector).toBeDefined()
    expect(mod.default).toBe(mod.codexConnector)
    expect(defineNuxtModule.mock.calls.length).toBeGreaterThan(0)
  })
})
