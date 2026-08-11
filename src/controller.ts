import {
  createCodexConnector,
  type CodexConnector,
  type CodexConnectorConfig,
  type ConnectorStatus,
  type SetupInstructions,
} from './connector.js'

export type ReactiveConnectorStatus = ConnectorStatus | { state: 'checking' }

export type CodexConnectorSnapshot = {
  status: ReactiveConnectorStatus
  setup: SetupInstructions | null
  isConnected: boolean
  isChecking: boolean
}

export type CodexConnectorController = {
  readonly connector: CodexConnector
  getSnapshot: () => CodexConnectorSnapshot
  /** SSR-safe snapshot: never touches window/localStorage. */
  getServerSnapshot: () => CodexConnectorSnapshot
  subscribe: (onStoreChange: () => void) => () => void
  createSetup: (options?: { rotateToken?: boolean }) => SetupInstructions
  checkConnection: () => Promise<void>
  disconnect: () => void
}

const SSR_SNAPSHOT: CodexConnectorSnapshot = Object.freeze({
  status: { state: 'notPaired' as const },
  setup: null,
  isConnected: false,
  isChecking: false,
})

const toSnapshot = (
  status: ReactiveConnectorStatus,
  setup: SetupInstructions | null,
): CodexConnectorSnapshot => ({
  status,
  setup,
  isConnected: status.state === 'connected',
  isChecking: status.state === 'checking',
})

const isBrowser = (): boolean => typeof window !== 'undefined'

/**
 * Framework-neutral store over `createCodexConnector`. Bindings subscribe to
 * immutable snapshots; the first client subscriber triggers the initial check.
 */
export const createCodexConnectorController = (
  config: CodexConnectorConfig,
): CodexConnectorController => {
  const connector = createCodexConnector(config)
  const listeners = new Set<() => void>()
  let revision = 0
  let snapshot: CodexConnectorSnapshot = isBrowser()
    ? toSnapshot(
      connector.getConnection() ? { state: 'checking' } : { state: 'notPaired' },
      connector.getSetup(),
    )
    : SSR_SNAPSHOT
  let autoCheckStarted = false

  const emit = () => {
    for (const listener of listeners) listener()
  }

  const setSnapshot = (next: CodexConnectorSnapshot) => {
    snapshot = next
    emit()
  }

  const checkConnection = async (): Promise<void> => {
    const current = revision + 1
    revision = current
    if (!isBrowser() || !connector.getConnection()) {
      setSnapshot(toSnapshot({ state: 'notPaired' }, null))
      return
    }
    setSnapshot(toSnapshot({ state: 'checking' }, snapshot.setup ?? connector.getSetup()))
    const next = await connector.checkConnection()
    if (revision !== current) return
    setSnapshot(toSnapshot(next, connector.getSetup()))
  }

  const ensureAutoCheck = () => {
    if (autoCheckStarted || !isBrowser()) return
    autoCheckStarted = true
    if (!connector.getConnection()) {
      setSnapshot(toSnapshot({ state: 'notPaired' }, connector.getSetup()))
      return
    }
    void checkConnection()
  }

  return {
    connector,

    getSnapshot: () => snapshot,

    getServerSnapshot: () => SSR_SNAPSHOT,

    subscribe: (onStoreChange) => {
      listeners.add(onStoreChange)
      if (listeners.size === 1) ensureAutoCheck()
      return () => {
        listeners.delete(onStoreChange)
      }
    },

    createSetup: (options) => {
      revision += 1
      const instructions = connector.createSetup(options)
      setSnapshot(toSnapshot(
        {
          state: 'offline',
          message: 'Run the setup prompt in ChatGPT, then check the connection.',
        },
        instructions,
      ))
      return instructions
    },

    checkConnection,

    disconnect: () => {
      revision += 1
      connector.disconnect()
      setSnapshot(toSnapshot({ state: 'notPaired' }, null))
    },
  }
}
