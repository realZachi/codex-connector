import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BRIDGE_ASSET_PATH,
  bridgeSha256,
  codexConnector,
  readBridgeSource,
  resolveBridgePath,
} from '../src/vite/index'

type DefineConfig = { define?: Record<string, string> }

const runConfig = async (
  plugin: ReturnType<typeof codexConnector>,
  userConfig: { base?: string } = {},
): Promise<DefineConfig> =>
  (plugin.config as (config: { base?: string }) => Promise<DefineConfig>)(userConfig)

describe('vite plugin', () => {
  it('finds the bridge when running from source', () => {
    expect(resolveBridgePath()).toMatch(/bridge\/codex-connector-bridge\.mjs$/)
  })

  it('reads a bridge that actually looks like the bridge', async () => {
    const source = await readBridgeSource()
    expect(source).toContain('codex app-server')
    expect(source).toContain('127.0.0.1')
  })

  it('hashes the source the same way the CLI does', async () => {
    const source = await readBridgeSource()
    expect(bridgeSha256(source)).toBe(createHash('sha256').update(source).digest('hex'))
  })

  it('injects path and checksum defines by default', async () => {
    const plugin = codexConnector()
    const config = await runConfig(plugin)
    expect(JSON.parse(String(config.define?.['__CODEX_BRIDGE_PATH__']))).toBe(DEFAULT_BRIDGE_ASSET_PATH)
    const defined = config.define?.['__CODEX_BRIDGE_SHA256__']
    expect(defined).toBeDefined()
    expect(JSON.parse(String(defined))).toMatch(/^[a-f0-9]{64}$/)
  })

  it('allows a custom define name and skipping the sha256 define', async () => {
    const named = codexConnector({ defineSha256As: '__MY_HASH__' })
    const config = await runConfig(named)
    expect(config.define?.['__MY_HASH__']).toBeDefined()
    expect(config.define?.['__CODEX_BRIDGE_SHA256__']).toBeDefined()
    expect(config.define?.['__CODEX_BRIDGE_PATH__']).toBeDefined()

    const skipped = codexConnector({ defineSha256As: false })
    const empty = await runConfig(skipped)
    expect(empty.define?.['__CODEX_BRIDGE_PATH__']).toBeDefined()
    expect(empty.define?.['__CODEX_BRIDGE_SHA256__']).toBeUndefined()
  })

  it('prefixes Vite base onto the injected bridge path', async () => {
    const plugin = codexConnector()
    const config = await runConfig(plugin, { base: '/app/' })
    expect(JSON.parse(String(config.define?.['__CODEX_BRIDGE_PATH__']))).toBe(
      '/app/codex/codex-connector-bridge.mjs',
    )
  })

  it('preserves a custom final path while still emitting it', async () => {
    const emitted: { fileName?: string; source?: unknown }[] = []
    const plugin = codexConnector({ path: '/static/bridge.mjs' })
    const config = await runConfig(plugin, { base: '/docs/' })
    expect(JSON.parse(String(config.define?.['__CODEX_BRIDGE_PATH__']))).toBe('/static/bridge.mjs')

    ;(plugin.configResolved as (c: { command: string; base: string }) => void)({
      command: 'build',
      base: '/docs/',
    })
    await (plugin.buildStart as unknown as (this: {
      emitFile: (file: { fileName?: string; source?: unknown }) => void
    }) => Promise<void>).call({ emitFile: (file) => emitted.push(file) })
    expect(emitted[0]?.fileName).toBe('static/bridge.mjs')
  })

  it('keeps the bridge on the app-origin root for relative and CDN bases', async () => {
    const relative = await runConfig(codexConnector(), { base: './' })
    expect(JSON.parse(String(relative.define?.['__CODEX_BRIDGE_PATH__'])))
      .toBe('/codex/codex-connector-bridge.mjs')

    const cdn = await runConfig(codexConnector(), { base: 'https://cdn.example/assets/' })
    expect(JSON.parse(String(cdn.define?.['__CODEX_BRIDGE_PATH__'])))
      .toBe('/codex/codex-connector-bridge.mjs')
  })

  it('treats an empty Vite base as the app root for framework integrations', async () => {
    const config = await runConfig(codexConnector(), { base: '' })
    expect(JSON.parse(String(config.define?.['__CODEX_BRIDGE_PATH__'])))
      .toBe('/codex/codex-connector-bridge.mjs')
  })

  it('lets an explicit final path bypass relative or external Vite bases', async () => {
    const relativeConfig = await runConfig(
      codexConnector({ path: '/local/bridge.mjs' }),
      { base: './' },
    )
    expect(JSON.parse(String(relativeConfig.define?.['__CODEX_BRIDGE_PATH__'])))
      .toBe('/local/bridge.mjs')

    const externalConfig = await runConfig(
      codexConnector({ path: '/local/bridge.mjs' }),
      { base: 'https://cdn.example/assets/' },
    )
    expect(JSON.parse(String(externalConfig.define?.['__CODEX_BRIDGE_PATH__'])))
      .toBe('/local/bridge.mjs')
  })

  it('emits the bridge as an asset at the default path', async () => {
    const emitted: { fileName?: string; source?: unknown }[] = []
    const plugin = codexConnector()
    await runConfig(plugin)
    ;(plugin.configResolved as (c: { command: string; base: string }) => void)({
      command: 'build',
      base: '/',
    })
    await (plugin.buildStart as unknown as (this: {
      emitFile: (file: { fileName?: string; source?: unknown }) => void
    }) => Promise<void>).call({ emitFile: (file) => emitted.push(file) })
    expect(emitted[0]?.fileName).toBe('codex/codex-connector-bridge.mjs')
    expect(String(emitted[0]?.source)).toContain('codex app-server')
    expect(DEFAULT_BRIDGE_ASSET_PATH).toBe('/codex/codex-connector-bridge.mjs')
  })

  it('does not emit an asset in serve mode, where emitFile is unavailable', async () => {
    const emitted: unknown[] = []
    const plugin = codexConnector()
    await runConfig(plugin)
    ;(plugin.configResolved as (c: { command: string; base: string }) => void)({
      command: 'serve',
      base: '/',
    })
    await (plugin.buildStart as unknown as (this: {
      emitFile: (file: unknown) => void
    }) => Promise<void>).call({ emitFile: (file) => emitted.push(file) })
    expect(emitted).toEqual([])
  })

  it('registers a dev middleware on the resolved browser path', async () => {
    const mounted: string[] = []
    const plugin = codexConnector()
    await runConfig(plugin, { base: '/portal/' })
    ;(plugin.configResolved as (c: { command: string; base: string }) => void)({
      command: 'serve',
      base: '/portal/',
    })
    ;(plugin.configureServer as (server: {
      middlewares: { use: (path: string, handler: unknown) => void }
    }) => void)({
      middlewares: {
        use: (mountPath) => {
          mounted.push(mountPath)
        },
      },
    })
    expect(mounted).toEqual(['/portal/codex/codex-connector-bridge.mjs'])
  })

  it('serves the bridge body from the dev middleware', async () => {
    const plugin = codexConnector()
    await runConfig(plugin)
    ;(plugin.configResolved as (c: { command: string; base: string }) => void)({
      command: 'serve',
      base: '/',
    })

    let handler: ((req: unknown, res: {
      setHeader: (n: string, v: string) => void
      end: (body: string) => void
      statusCode: number
    }) => void) | undefined

    ;(plugin.configureServer as (server: {
      middlewares: { use: (path: string, h: typeof handler) => void }
    }) => void)({
      middlewares: {
        use: (_path, h) => {
          handler = h
        },
      },
    })

    expect(handler).toBeTypeOf('function')
    const headers: Record<string, string> = {}
    let body = ''
    await new Promise<void>((resolve, reject) => {
      handler?.({}, {
        setHeader: (name, value) => {
          headers[name] = value
        },
        end: (value) => {
          body = value
          resolve()
        },
        statusCode: 200,
      })
      setTimeout(() => reject(new Error('middleware timed out')), 2000)
    })
    expect(headers['Content-Type']).toMatch(/javascript/)
    expect(body).toContain('codex app-server')
  })

  it('honours a custom path and rejects a relative one', async () => {
    const emitted: { fileName?: string }[] = []
    const plugin = codexConnector({ path: '/static/bridge.mjs' })
    await runConfig(plugin)
    ;(plugin.configResolved as (c: { command: string; base: string }) => void)({
      command: 'build',
      base: '/',
    })
    await (plugin.buildStart as unknown as (this: {
      emitFile: (file: { fileName?: string }) => void
    }) => Promise<void>).call({ emitFile: (file) => emitted.push(file) })
    expect(emitted[0]?.fileName).toBe('static/bridge.mjs')
    expect(() => codexConnector({ path: 'static/bridge.mjs' })).toThrow(/must start with/)
  })
})
