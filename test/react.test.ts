import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCodexConnector } from '../src/connector'
import { bindingConfig, hasStoredPairing, installLocalStorage } from './binding-helpers'
import { reactHarness } from './react-harness-mock'

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useMemo: reactHarness.useMemo,
    useSyncExternalStore: reactHarness.useSyncExternalStore,
  }
})

describe('useCodexConnector (react)', () => {
  beforeEach(() => {
    installLocalStorage()
    vi.stubGlobal('window', globalThis)
    reactHarness.reset()
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    vi.unstubAllGlobals()
    reactHarness.reset()
  })

  const read = async () => {
    const { useCodexConnector } = await import('../src/react')
    return useCodexConnector(bindingConfig)
  }

  it('exposes SSR snapshot fields without touching storage', async () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    vi.stubGlobal('window', undefined)
    const result = await read()
    expect(result.status).toEqual({ state: 'notPaired' })
    expect(result.setup).toBeNull()
    expect(result.isConnected).toBe(false)
    expect(result.isChecking).toBe(false)
  })

  it('starts auto-check after subscribe/mount when paired', async () => {
    createCodexConnector(bindingConfig).createSetup()

    let result = await read()
    expect(result.setup).not.toBeNull()

    await vi.waitFor(async () => {
      result = await read()
      expect(result.isChecking).toBe(false)
      expect(result.status.state).not.toBe('notPaired')
    })
    expect(result.status.state).toBe('offline')
  })

  it('updates setup on createSetup and clears on disconnect', async () => {
    const entries = installLocalStorage()
    let result = await read()
    const setup = result.createSetup()
    result = await read()
    expect(result.setup?.connection.pairingToken).toBe(setup.connection.pairingToken)
    expect(result.status.state).toBe('offline')
    expect(hasStoredPairing(entries)).toBe(true)

    const rotated = result.createSetup({ rotateToken: true })
    result = await read()
    expect(result.setup?.connection.pairingToken).toBe(rotated.connection.pairingToken)
    expect(rotated.connection.pairingToken).not.toBe(setup.connection.pairingToken)

    result.disconnect()
    result = await read()
    expect(result.status).toEqual({ state: 'notPaired' })
    expect(result.setup).toBeNull()
    expect(result.isConnected).toBe(false)
    expect(hasStoredPairing(entries)).toBe(false)
  })

  it('ignores stale check results after disconnect', async () => {
    let result = await read()
    result.createSetup()

    let resolveCheck: ((value: {
      state: 'connected'
      planType: string
      email: string
    }) => void) | undefined
    vi.spyOn(result.connector, 'checkConnection').mockImplementation(
      () => new Promise((resolve) => {
        resolveCheck = resolve
      }),
    )

    const pending = result.checkConnection()
    result.disconnect()
    resolveCheck?.({ state: 'connected', planType: 'plus', email: 'a@example.com' })
    await pending

    result = await read()
    expect(result.status).toEqual({ state: 'notPaired' })
    expect(result.setup).toBeNull()
  })
})
