import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCodexConnectorController } from '../src/controller'
import { connectionStorageKey } from '../src/connection'

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

describe('createCodexConnectorController', () => {
  beforeEach(() => {
    installLocalStorage()
    vi.stubGlobal('window', globalThis)
  })
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    vi.unstubAllGlobals()
  })

  it('exposes an SSR snapshot that does not touch storage', () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    vi.stubGlobal('window', undefined)
    const controller = createCodexConnectorController(config)
    expect(controller.getServerSnapshot()).toEqual({
      status: { state: 'notPaired' },
      setup: null,
      isConnected: false,
      isChecking: false,
    })
  })

  it('starts the auto-check only after the first subscriber', async () => {
    const controller = createCodexConnectorController(config)
    controller.createSetup()
    expect(controller.getSnapshot().status.state).toBe('offline')

    const check = vi.spyOn(controller.connector, 'checkConnection').mockResolvedValue({
      state: 'connected',
      planType: 'plus',
      email: 'a@example.com',
    })

    const unsub = controller.subscribe(() => {})
    await vi.waitFor(() => {
      expect(controller.getSnapshot().status).toEqual({
        state: 'connected',
        planType: 'plus',
        email: 'a@example.com',
      })
    })
    expect(check).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('ignores stale check results after disconnect or rotate', async () => {
    const controller = createCodexConnectorController(config)
    controller.createSetup()

    let resolveCheck: ((value: { state: 'connected'; planType: string; email: string }) => void) | undefined
    vi.spyOn(controller.connector, 'checkConnection').mockImplementation(
      () => new Promise((resolve) => {
        resolveCheck = resolve
      }),
    )

    const pending = controller.checkConnection()
    controller.disconnect()
    resolveCheck?.({ state: 'connected', planType: 'plus', email: 'a@example.com' })
    await pending

    expect(controller.getSnapshot().status).toEqual({ state: 'notPaired' })
    expect(controller.getSnapshot().setup).toBeNull()
  })

  it('updates setup on createSetup and clears storage on disconnect', () => {
    const entries = installLocalStorage()
    const controller = createCodexConnectorController(config)
    const setup = controller.createSetup()
    expect(controller.getSnapshot().setup?.connection.pairingToken).toBe(setup.connection.pairingToken)
    expect(entries.has(connectionStorageKey('acme-studio'))).toBe(true)

    const rotated = controller.createSetup({ rotateToken: true })
    expect(rotated.connection.pairingToken).not.toBe(setup.connection.pairingToken)

    controller.disconnect()
    expect(controller.getSnapshot()).toMatchObject({
      status: { state: 'notPaired' },
      setup: null,
      isConnected: false,
    })
    expect(entries.has(connectionStorageKey('acme-studio'))).toBe(false)
  })
})
