import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createCodexConnector,
  type CodexConnector,
  type CodexConnectorConfig,
  type ConnectorStatus,
  type SetupInstructions,
} from '../connector'

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
  const connector = useMemo(
    () => createCodexConnector({
      serviceId,
      appName,
      ...(appOrigin ? { appOrigin } : {}),
      ...(bridgePath ? { bridgePath } : {}),
      ...(bridgeSha256 ? { bridgeSha256 } : {}),
      ...(extraInstructions ? { extraInstructions } : {}),
    }),
    [serviceId, appName, appOrigin, bridgePath, bridgeSha256, extraInstructions],
  )

  const [setup, setSetup] = useState<SetupInstructions | null>(() => connector.getSetup())
  const [status, setStatus] = useState<ConnectorStatus | { state: 'checking' }>(
    () => connector.getConnection() ? { state: 'checking' } : { state: 'notPaired' },
  )
  const revisionRef = useRef(0)

  const checkConnection = useCallback(async () => {
    const revision = revisionRef.current + 1
    revisionRef.current = revision
    if (!connector.getConnection()) {
      setStatus({ state: 'notPaired' })
      return
    }
    setStatus({ state: 'checking' })
    const next = await connector.checkConnection()
    if (revisionRef.current === revision) setStatus(next)
  }, [connector])

  const createSetup = useCallback((options?: { rotateToken?: boolean }) => {
    revisionRef.current += 1
    const instructions = connector.createSetup(options)
    setSetup(instructions)
    setStatus({
      state: 'offline',
      message: 'Run the setup prompt in ChatGPT, then check the connection.',
    })
    return instructions
  }, [connector])

  const disconnect = useCallback(() => {
    revisionRef.current += 1
    connector.disconnect()
    setSetup(null)
    setStatus({ state: 'notPaired' })
  }, [connector])

  useEffect(() => {
    setSetup(connector.getSetup())
    if (!connector.getConnection()) {
      setStatus({ state: 'notPaired' })
      return
    }
    const timeout = setTimeout(() => void checkConnection(), 0)
    return () => clearTimeout(timeout)
  }, [connector, checkConnection])

  return {
    connector,
    status,
    isConnected: status.state === 'connected',
    isChecking: status.state === 'checking',
    setup,
    createSetup,
    checkConnection,
    disconnect,
  }
}

export type {
  CodexConnector,
  CodexConnectorConfig,
  ConnectorStatus,
  SetupInstructions,
} from '../connector'
