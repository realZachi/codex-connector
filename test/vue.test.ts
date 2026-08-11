import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCodexConnector } from '../src/connector'
import { bindingConfig, hasStoredPairing, installLocalStorage } from './binding-helpers'

const vue = vi.hoisted(() => {
  type Disposer = () => void
  const disposers: Disposer[] = []
  let scopeActive = false

  const shallowRef = <T>(value: T) => {
    let current = value
    return {
      get value() { return current },
      set value(next: T) { current = next },
    }
  }

  const computed = <T>(getter: () => T) => ({
    get value() { return getter() },
  })

  const readonly = <T>(ref: T) => ref
  const getCurrentScope = () => (scopeActive ? {} : undefined)
  const onScopeDispose = (fn: Disposer) => { disposers.push(fn) }

  const runInScope = <T>(fn: () => T): { result: T; dispose: () => void } => {
    scopeActive = true
    const start = disposers.length
    try {
      const result = fn()
      return {
        result,
        dispose: () => {
          for (const disposer of disposers.splice(start).reverse()) disposer()
        },
      }
    } finally {
      scopeActive = false
    }
  }

  return {
    shallowRef,
    computed,
    readonly,
    getCurrentScope,
    onScopeDispose,
    runInScope,
  }
})

vi.mock('vue', () => ({
  shallowRef: vue.shallowRef,
  computed: vue.computed,
  readonly: vue.readonly,
  getCurrentScope: vue.getCurrentScope,
  onScopeDispose: vue.onScopeDispose,
}))

describe('useCodexConnector (vue)', () => {
  beforeEach(() => {
    installLocalStorage()
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    vi.unstubAllGlobals()
  })

  const mount = async () => {
    const { useCodexConnector } = await import('../src/vue')
    return vue.runInScope(() => useCodexConnector(bindingConfig))
  }

  it('exposes SSR snapshot fields without touching storage', async () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    vi.stubGlobal('window', undefined)
    const { result, dispose } = await mount()
    expect(result.status.value).toEqual({ state: 'notPaired' })
    expect(result.setup.value).toBeNull()
    expect(result.isConnected.value).toBe(false)
    expect(result.isChecking.value).toBe(false)
    dispose()
  })

  it('starts auto-check after subscribe/mount when paired', async () => {
    createCodexConnector(bindingConfig).createSetup()
    const { result, dispose } = await mount()
    expect(result.setup.value).not.toBeNull()

    await vi.waitFor(() => {
      expect(result.isChecking.value).toBe(false)
      expect(result.status.value.state).not.toBe('notPaired')
    })
    expect(result.status.value.state).toBe('offline')
    dispose()
  })

  it('updates setup on createSetup and clears on disconnect', async () => {
    const entries = installLocalStorage()
    const { result, dispose } = await mount()
    const setup = result.createSetup()
    expect(result.setup.value?.connection.pairingToken).toBe(setup.connection.pairingToken)
    expect(result.status.value.state).toBe('offline')
    expect(hasStoredPairing(entries)).toBe(true)

    const rotated = result.createSetup({ rotateToken: true })
    expect(result.setup.value?.connection.pairingToken).toBe(rotated.connection.pairingToken)
    expect(rotated.connection.pairingToken).not.toBe(setup.connection.pairingToken)

    result.disconnect()
    expect(result.status.value).toEqual({ state: 'notPaired' })
    expect(result.setup.value).toBeNull()
    expect(result.isConnected.value).toBe(false)
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

    expect(result.status.value).toEqual({ state: 'notPaired' })
    expect(result.setup.value).toBeNull()
    dispose()
  })
})
