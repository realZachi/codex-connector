import { createCodexConnectorController } from '../controller.js'
import type { CodexConnectorSnapshot } from '../controller.js'
import type {
  CodexConnector,
  CodexConnectorConfig,
  SetupInstructions,
} from '../connector.js'

/**
 * Readable store value — the controller snapshot.
 * Subscribe with `$store` (Svelte 4/5) or `store.subscribe`.
 * Actions live on the store object: `store.createSetup()`, `store.checkConnection()`,
 * `store.disconnect()`. The core connector is `store.connector`.
 */
export type CodexConnectorStoreValue = CodexConnectorSnapshot

export type CodexConnectorStore = {
  /** Svelte store contract (Svelte 4/5 compatible). */
  subscribe: (run: (value: CodexConnectorStoreValue) => void) => () => void
  readonly connector: CodexConnector
  createSetup: (options?: { rotateToken?: boolean }) => SetupInstructions
  checkConnection: () => Promise<void>
  disconnect: () => void
}

/**
 * Svelte-readable store over the shared connector controller.
 * First subscriber starts the auto-check on the client; SSR uses an inert snapshot.
 */
export const createCodexConnectorStore = (
  config: CodexConnectorConfig,
): CodexConnectorStore => {
  const {
    serviceId,
    appName,
    appOrigin,
    bridgePath,
    bridgeSha256,
    extraInstructions,
  } = config

  const controller = createCodexConnectorController({
    serviceId,
    appName,
    ...(appOrigin ? { appOrigin } : {}),
    ...(bridgePath ? { bridgePath } : {}),
    ...(bridgeSha256 ? { bridgeSha256 } : {}),
    ...(extraInstructions ? { extraInstructions } : {}),
  })

  return {
    subscribe: (run) => {
      const stop = controller.subscribe(() => {
        run(controller.getSnapshot())
      })
      run(
        typeof window === 'undefined'
          ? controller.getServerSnapshot()
          : controller.getSnapshot(),
      )
      return stop
    },
    get connector() {
      return controller.connector
    },
    createSetup: controller.createSetup,
    checkConnection: controller.checkConnection,
    disconnect: controller.disconnect,
  }
}

export type {
  CodexConnector,
  CodexConnectorConfig,
  ConnectorStatus,
  SetupInstructions,
} from '../connector.js'
export type {
  CodexConnectorSnapshot,
  ReactiveConnectorStatus,
} from '../controller.js'
