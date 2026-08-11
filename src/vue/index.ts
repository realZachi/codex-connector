import {
  computed,
  getCurrentScope,
  onScopeDispose,
  readonly,
  shallowRef,
  type ComputedRef,
} from 'vue'
import { createCodexConnectorController } from '../controller.js'
import type {
  CodexConnector,
  CodexConnectorConfig,
  ConnectorStatus,
  SetupInstructions,
} from '../connector.js'

export type UseCodexConnectorResult = {
  connector: CodexConnector
  status: ComputedRef<ConnectorStatus | { state: 'checking' }>
  isConnected: ComputedRef<boolean>
  isChecking: ComputedRef<boolean>
  setup: ComputedRef<SetupInstructions | null>
  /** Creates the pairing and the setup prompt. Safe to call repeatedly. */
  createSetup: (options?: { rotateToken?: boolean }) => SetupInstructions
  checkConnection: () => Promise<void>
  disconnect: () => void
}

/**
 * Vue composable over the shared connector controller. Snapshot fields are
 * readonly computed refs; call from `setup()` so dispose unsubscribes cleanly.
 */
export const useCodexConnector = (config: CodexConnectorConfig): UseCodexConnectorResult => {
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

  const snapshot = shallowRef(
    typeof window === 'undefined'
      ? controller.getServerSnapshot()
      : controller.getSnapshot(),
  )

  const unsubscribe = controller.subscribe(() => {
    snapshot.value = controller.getSnapshot()
  })
  snapshot.value = controller.getSnapshot()

  if (getCurrentScope()) {
    onScopeDispose(unsubscribe)
  }

  return {
    connector: controller.connector,
    status: readonly(computed(() => snapshot.value.status)) as ComputedRef<
      ConnectorStatus | { state: 'checking' }
    >,
    isConnected: readonly(computed(() => snapshot.value.isConnected)) as ComputedRef<boolean>,
    isChecking: readonly(computed(() => snapshot.value.isChecking)) as ComputedRef<boolean>,
    setup: readonly(computed(() => snapshot.value.setup)) as ComputedRef<SetupInstructions | null>,
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
