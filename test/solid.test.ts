import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCodexConnector as createCoreConnector } from '../src/connector'
import { bindingConfig, hasStoredPairing, installLocalStorage } from './binding-helpers'

const solid = vi.hoisted(() => {
  type Disposer = () => void
  const cleanups: Disposer[] = []
  let owner: object | null = null

  const createSignal = <T>(value: T) => {
    let current = value
    const read = () => current
    const write = (next: T | ((prev: T) => T)) => {
      current = typeof next === 'function' ? (next as (prev: T) => T)(current) : next
    }
    return [read, write] as const
  }

  const getOwner = () => owner
  const onCleanup = (fn: Disposer) => { cleanups.push(fn) }

  const createRoot = <T>(fn: () => T): { result: T; dispose: () => void } => {
    owner = {}
    const start = cleanups.length
    const result = fn()
    return {
      result,
      dispose: () => {
        for (const cleanup of cleanups.splice(start).reverse()) cleanup()
        owner = null
      },
    }
  }

  return { createSignal, getOwner, onCleanup, createRoot }
})

vi.mock('solid-js', () => ({
  createSignal: solid.createSignal,
  getOwner: solid.getOwner,
  onCleanup: solid.onCleanup,
}))

describe('createCodexConnector (solid)', () => {
  beforeEach(() => {
    installLocalStorage()
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    vi.unstubAllGlobals()
  })

  const mount = async () => {
    const { createCodexConnector } = await import('../src/solid')
    return solid.createRoot(() => createCodexConnector(bindingConfig))
  }

  it('exposes SSR snapshot fields without touching storage', async () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    vi.stubGlobal('window', undefined)
    const { result, dispose } = await mount()
    expect(result.status()).toEqual({ state: 'notPaired' })
    expect(result.setup()).toBeNull()
    expect(result.isConnected()).toBe(false)
    expect(result.isChecking()).toBe(false)
    dispose()
  })

  it('starts auto-check after subscribe/mount when paired', async () => {
    createCoreConnector(bindingConfig).createSetup()
    const { result, dispose } = await mount()
    expect(result.setup()).not.toBeNull()

    await vi.waitFor(() => {
      expect(result.isChecking()).toBe(false)
      expect(result.status().state).not.toBe('notPaired')
    })
    expect(result.status().state).toBe('offline')
    expect(result.connector.serviceId).toBe('acme-studio')
    dispose()
  })

  it('updates setup on createSetup and clears on disconnect', async () => {
    const entries = installLocalStorage()
    const { result, dispose } = await mount()
    const setup = result.createSetup()
    expect(result.setup()?.connection.pairingToken).toBe(setup.connection.pairingToken)
    expect(result.status().state).toBe('offline')
    expect(hasStoredPairing(entries)).toBe(true)

    const rotated = result.createSetup({ rotateToken: true })
    expect(result.setup()?.connection.pairingToken).toBe(rotated.connection.pairingToken)
    expect(rotated.connection.pairingToken).not.toBe(setup.connection.pairingToken)

    result.disconnect()
    expect(result.status()).toEqual({ state: 'notPaired' })
    expect(result.setup()).toBeNull()
    expect(result.isConnected()).toBe(false)
    expect(hasStoredPairing(entries)).toBe(false)
    dispose()
  })

  it('ignores stale check results after disconnect', async () => {
    const { result, dispose } = await mount()
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

    expect(result.status()).toEqual({ state: 'notPaired' })
    expect(result.setup()).toBeNull()
    dispose()
  })
})
