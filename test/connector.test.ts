import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCodexConnector } from '../src/connector'
import { connectionStorageKey, readConnection } from '../src/connection'
import { serviceCandidatePorts } from '../src/service'

const config = {
  serviceId: 'acme-studio',
  appName: 'Acme Studio',
  appOrigin: 'https://acme.example',
}

const installLocalStorage = () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) },
    clear: () => entries.clear(),
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() { return entries.size },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
  return entries
}

describe('createCodexConnector', () => {
  let entries: Map<string, string>

  beforeEach(() => { entries = installLocalStorage() })
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    vi.unstubAllGlobals()
  })

  it('rejects an unusable service id', () => {
    expect(() => createCodexConnector({ ...config, serviceId: 'Acme Studio' })).toThrow(/serviceId/)
  })

  it('starts unpaired', async () => {
    const connector = createCodexConnector(config)
    expect(connector.getConnection()).toBeNull()
    expect(connector.getSetup()).toBeNull()
    await expect(connector.checkConnection()).resolves.toEqual({ state: 'notPaired' })
  })

  it('creates a pairing with a prompt, deep link and CLI fallback', () => {
    const setup = createCodexConnector(config).createSetup()
    expect(setup.prompt).toContain(setup.connection.pairingToken)
    expect(setup.desktopDeepLink.startsWith('codex://threads/new?prompt=')).toBe(true)
    expect(setup.cliCommand.startsWith("codex '")).toBe(true)
    expect(entries.has(connectionStorageKey('acme-studio'))).toBe(true)
  })

  it('reuses the pairing so a reload does not invalidate a running bridge', () => {
    const connector = createCodexConnector(config)
    const first = connector.createSetup()
    expect(connector.createSetup().connection.pairingToken).toBe(first.connection.pairingToken)
    expect(connector.getSetup()?.connection.pairingToken).toBe(first.connection.pairingToken)
  })

  it('rotates the token on request', () => {
    const connector = createCodexConnector(config)
    const first = connector.createSetup()
    const rotated = connector.createSetup({ rotateToken: true })
    expect(rotated.connection.pairingToken).not.toBe(first.connection.pairingToken)
  })

  it('scopes storage per service so two connectors cannot read each other', () => {
    createCodexConnector(config).createSetup()
    createCodexConnector({ ...config, serviceId: 'other-app' }).createSetup()
    const first = readConnection('acme-studio')
    const second = readConnection('other-app')
    expect(first?.pairingToken).not.toBe(second?.pairingToken)
    expect(serviceCandidatePorts('acme-studio')[0]).not.toBe(serviceCandidatePorts('other-app')[0])
  })

  it('reports offline when no bridge answers', async () => {
    const connector = createCodexConnector(config)
    connector.createSetup()
    const status = await connector.checkConnection()
    expect(status.state).toBe('offline')
  })

  it('forgets the pairing on disconnect', () => {
    const connector = createCodexConnector(config)
    connector.createSetup()
    connector.disconnect()
    expect(connector.getConnection()).toBeNull()
    expect(entries.has(connectionStorageKey('acme-studio'))).toBe(false)
  })

  it('refuses to run before pairing', async () => {
    await expect(createCodexConnector(config).run({ model: 'gpt-5.5', input: 'hi' }))
      .rejects.toThrow(/not paired/)
  })

  it('passes the bridge path and checksum into the prompt', () => {
    const setup = createCodexConnector({
      ...config,
      bridgePath: '/static/bridge.mjs',
      bridgeSha256: 'a'.repeat(64),
    }).createSetup()
    expect(setup.prompt).toContain('https://acme.example/static/bridge.mjs')
    expect(setup.prompt).toContain('a'.repeat(64))
  })

  it('resolves runtime adapter globals lazily when setup is created', () => {
    const connector = createCodexConnector(config)

    vi.stubGlobal('__CODEX_BRIDGE_PATH__', '/late/codex-connector-bridge.mjs')
    vi.stubGlobal('__CODEX_BRIDGE_SHA256__', 'b'.repeat(64))

    const setup = connector.createSetup()
    expect(setup.prompt).toContain('https://acme.example/late/codex-connector-bridge.mjs')
    expect(setup.prompt).toContain('b'.repeat(64))
  })
})
