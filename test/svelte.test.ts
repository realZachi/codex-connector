import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCodexConnector } from '../src/connector'
import { createCodexConnectorStore } from '../src/svelte'
import { bindingConfig, hasStoredPairing, installLocalStorage } from './binding-helpers'
import type { CodexConnectorStoreValue } from '../src/svelte'

describe('createCodexConnectorStore (svelte)', () => {
  beforeEach(() => {
    installLocalStorage()
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    vi.unstubAllGlobals()
  })

  const mount = () => {
    const store = createCodexConnectorStore(bindingConfig)
    let value: CodexConnectorStoreValue | undefined
    const unsubscribe = store.subscribe((next) => {
      value = next
    })
    return {
      store,
      get value() {
        if (!value) throw new Error('store has no value')
        return value
      },
      unsubscribe,
    }
  }

  it('exposes SSR snapshot fields without touching storage', () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    vi.stubGlobal('window', undefined)
    const bound = mount()
    expect(bound.value).toEqual({
      status: { state: 'notPaired' },
      setup: null,
      isConnected: false,
      isChecking: false,
    })
    bound.unsubscribe()
  })

  it('starts auto-check after subscribe/mount when paired', async () => {
    createCodexConnector(bindingConfig).createSetup()
    const bound = mount()
    expect(bound.value.setup).not.toBeNull()

    await vi.waitFor(() => {
      expect(bound.value.isChecking).toBe(false)
      expect(bound.value.status.state).not.toBe('notPaired')
    })
    expect(bound.value.status.state).toBe('offline')
    expect(bound.store.connector.serviceId).toBe('acme-studio')
    bound.unsubscribe()
  })

  it('updates setup on createSetup and clears on disconnect', () => {
    const entries = installLocalStorage()
    const bound = mount()
    const setup = bound.store.createSetup()
    expect(bound.value.setup?.connection.pairingToken).toBe(setup.connection.pairingToken)
    expect(bound.value.status.state).toBe('offline')
    expect(hasStoredPairing(entries)).toBe(true)

    const rotated = bound.store.createSetup({ rotateToken: true })
    expect(bound.value.setup?.connection.pairingToken).toBe(rotated.connection.pairingToken)
    expect(rotated.connection.pairingToken).not.toBe(setup.connection.pairingToken)

    bound.store.disconnect()
    expect(bound.value.status).toEqual({ state: 'notPaired' })
    expect(bound.value.setup).toBeNull()
    expect(bound.value.isConnected).toBe(false)
    expect(hasStoredPairing(entries)).toBe(false)
    bound.unsubscribe()
  })

  it('ignores stale check results after disconnect', async () => {
    const bound = mount()
    bound.store.createSetup()

    let resolveCheck: ((value: {
      state: 'connected'
      planType: string
      email: string
    }) => void) | undefined
    vi.spyOn(bound.store.connector, 'checkConnection').mockImplementation(
      () => new Promise((resolve) => {
        resolveCheck = resolve
      }),
    )

    const pending = bound.store.checkConnection()
    bound.store.disconnect()
    resolveCheck?.({ state: 'connected', planType: 'plus', email: 'a@example.com' })
    await pending

    expect(bound.value.status).toEqual({ state: 'notPaired' })
    expect(bound.value.setup).toBeNull()
    bound.unsubscribe()
  })
})