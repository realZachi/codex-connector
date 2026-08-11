import { createSignal, getOwner, onCleanup } from 'solid-js'
import { createCodexConnectorController } from '../controller.js'
import type {
  CodexConnector,
  CodexConnectorConfig,
  ConnectorStatus,
  SetupInstructions,
} from '../connector.js'

export type CodexConnectorSolid = {
  /** Core `CodexConnector` from `codex-connector` (not this Solid factory). */
  connector: CodexConnector
  status: () => ConnectorStatus | { state: 'checking' }
  isConnected: () => boolean
  isChecking: () => boolean
  setup: () => SetupInstructions | null
  createSetup: (options?: { rotateToken?: boolean }) => SetupInstructions
  checkConnection: () => Promise<void>
  disconnect: () => void
}

/**
 * Solid binding over the shared connector controller.
 * Named `createCodexConnector` in the `codex-connector/solid` entry — distinct from
 * the core factory on `codex-connector`; use `.connector` for the core instance.
 * Call under a reactive root so `onCleanup` unsubscribes.
 */
export const createCodexConnector = (config: CodexConnectorConfig): CodexConnectorSolid => {
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

  const [snapshot, setSnapshot] = createSignal(
    typeof window === 'undefined'
      ? controller.getServerSnapshot()
      : controller.getSnapshot(),
  )

  const unsubscribe = controller.subscribe(() => {
    setSnapshot(() => controller.getSnapshot())
  })
  setSnapshot(() => controller.getSnapshot())

  if (getOwner()) {
    onCleanup(unsubscribe)
  }

  return {
    connector: controller.connector,
    status: () => snapshot().status,
    isConnected: () => snapshot().isConnected,
    isChecking: () => snapshot().isChecking,
    setup: () => snapshot().setup,
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
