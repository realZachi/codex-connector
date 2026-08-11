import { useMemo, useSyncExternalStore } from 'react'
import {
  createCodexConnectorController,
} from '../controller.js'
import type {
  CodexConnector,
  CodexConnectorConfig,
  ConnectorStatus,
  SetupInstructions,
} from '../connector.js'

export type UseCodexConnectorResult = {
  connector: CodexConnector
  status: ConnectorStatus | { state: 'checking' }
  isConnected: boolean
  isChecking: boolean
  setup: SetupInstructions | null
  /** Creates the pairing and the setup prompt. Safe to call repeatedly. */
  createSetup: (options?: { rotateToken?: boolean }) => SetupInstructions
  checkConnection: () => Promise<void>
  disconnect: () => void
}

/**
 * Wires the connector into React state. Bring your own UI: render `setup.prompt`,
 * link `setup.desktopDeepLink`, then call `checkConnection`.
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
  const controller = useMemo(
    () => createCodexConnectorController({
      serviceId,
      appName,
      ...(appOrigin ? { appOrigin } : {}),
      ...(bridgePath ? { bridgePath } : {}),
      ...(bridgeSha256 ? { bridgeSha256 } : {}),
      ...(extraInstructions ? { extraInstructions } : {}),
    }),
    [serviceId, appName, appOrigin, bridgePath, bridgeSha256, extraInstructions],
  )

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  )

  return {
    connector: controller.connector,
    status: snapshot.status,
    isConnected: snapshot.isConnected,
    isChecking: snapshot.isChecking,
    setup: snapshot.setup,
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
