import { accountErrorMessage, readCodexAccount, type CodexAccount } from './account.js'
import { resolveBridgeConfig } from './bridge-resolve.js'
import {
  createConnection,
  readConnection,
  removeConnection,
  writeConnection,
  type CodexConnection,
} from './connection.js'
import { listCodexModels, type CodexModel } from './models.js'
import { runCodexTurn, type CodexRunResult, type RunCodexTurnOptions } from './run.js'
import { assertValidServiceId } from './service.js'
import {
  DEFAULT_BRIDGE_PATH,
  buildCliCommand,
  buildDesktopDeepLink,
  buildSetupPrompt,
} from './setup-prompt.js'

export type CodexConnectorConfig = {
  /** Stable id for your app; scopes the port, config directory and storage. */
  serviceId: string
  /** Product name shown to the user in Codex and in your UI. */
  appName: string
  /** Where you serve the bridge module. Defaults to `/codex/codex-connector-bridge.mjs`. */
  bridgePath?: string
  /** SHA-256 hex of the served bridge file; adds an integrity check to the prompt. */
  bridgeSha256?: string
  extraInstructions?: string
  /** Defaults to `window.location.origin`. */
  appOrigin?: string
}

export type ConnectorStatus =
  | { state: 'notPaired' }
  | { state: 'offline'; message: string }
  | { state: 'signedOut'; message: string }
  | { state: 'apiKey'; message: string }
  | { state: 'unsupported'; message: string }
  | { state: 'connected'; planType: string; email: string | null }

export type SetupInstructions = {
  connection: CodexConnection
  prompt: string
  /** `codex://` link that opens the prompt prefilled in the ChatGPT desktop app. */
  desktopDeepLink: string
  /** Terminal fallback for users without the desktop app. */
  cliCommand: string
}

const CHECK_TIMEOUT_MS = 6_000

const resolveOrigin = (config: CodexConnectorConfig): string => {
  if (config.appOrigin) return config.appOrigin
  if (typeof window === 'undefined') {
    throw new Error('Set appOrigin when creating the connector outside a browser')
  }
  return window.location.origin
}

const offlineMessage = (error: unknown): string => {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'The local Codex connector did not respond in time.'
  }
  if (error instanceof Error && !error.message.includes('Failed to fetch')) return error.message
  return 'The local Codex connector is not running yet.'
}

const statusFromAccount = (account: CodexAccount): ConnectorStatus => {
  if (account.status === 'connected') {
    return { state: 'connected', planType: account.planType, email: account.email }
  }
  const message = accountErrorMessage(account) ?? 'The Codex account could not be verified.'
  if (account.status === 'signedOut') return { state: 'signedOut', message }
  if (account.status === 'apiKey') return { state: 'apiKey', message }
  return { state: 'unsupported', message }
}

export type CodexConnector = {
  readonly serviceId: string
  readonly appName: string
  getConnection: () => CodexConnection | null
  /** Creates (or reuses) a pairing and returns everything needed for your UI. */
  createSetup: (options?: { rotateToken?: boolean }) => SetupInstructions
  getSetup: () => SetupInstructions | null
  checkConnection: (options?: { signal?: AbortSignal }) => Promise<ConnectorStatus>
  disconnect: () => void
  /** Models this user's plan can run, for a picker in your UI. */
  listModels: (options?: {
    signal?: AbortSignal
    includeHidden?: boolean
  }) => Promise<CodexModel[]>
  run: (
    options: Omit<RunCodexTurnOptions, 'connection'>,
  ) => Promise<CodexRunResult>
}

/**
 * Entry point for developers. Everything the browser needs lives here; nothing
 * touches your server, and no API key is involved at any point.
 */
export const createCodexConnector = (config: CodexConnectorConfig): CodexConnector => {
  const serviceId = assertValidServiceId(config.serviceId)
  const appName = config.appName.trim() || serviceId
  const bridgeInput = {
    ...(config.bridgePath !== undefined ? { bridgePath: config.bridgePath } : {}),
    ...(config.bridgeSha256 !== undefined ? { bridgeSha256: config.bridgeSha256 } : {}),
  }
  const promptOptions = (connection: CodexConnection) => {
    // Nuxt installs its adapter values from a client plugin. Resolve lazily so
    // connectors created while modules are evaluated still see those values by
    // the time the user opens the setup flow.
    const bridge = resolveBridgeConfig(bridgeInput)
    return {
      connection,
      appName,
      bridgePath: bridge.bridgePath,
      ...(bridge.bridgeSha256 ? { bridgeSha256: bridge.bridgeSha256 } : {}),
      ...(config.extraInstructions ? { extraInstructions: config.extraInstructions } : {}),
    }
  }

  const toSetup = (connection: CodexConnection): SetupInstructions => {
    const options = promptOptions(connection)
    return {
      connection,
      prompt: buildSetupPrompt(options),
      desktopDeepLink: buildDesktopDeepLink(options),
      cliCommand: buildCliCommand(options),
    }
  }

  const requireConnection = (): CodexConnection => {
    const connection = readConnection(serviceId)
    if (!connection) throw new Error('Codex is not paired with this browser yet. Run createSetup() first.')
    return connection
  }

  return {
    serviceId,
    appName,

    getConnection: () => readConnection(serviceId),

    createSetup: (options) => {
      const existing = options?.rotateToken ? null : readConnection(serviceId)
      const connection = existing ?? createConnection({
        serviceId,
        appOrigin: resolveOrigin(config),
      })
      writeConnection(connection)
      return toSetup(connection)
    },

    getSetup: () => {
      const connection = readConnection(serviceId)
      return connection ? toSetup(connection) : null
    },

    checkConnection: async (options) => {
      const connection = readConnection(serviceId)
      if (!connection) return { state: 'notPaired' }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
      const forwardAbort = () => controller.abort()
      options?.signal?.addEventListener('abort', forwardAbort, { once: true })
      try {
        const { account, port } = await readCodexAccount({
          connection,
          signal: controller.signal,
        })
        if (port !== connection.port) writeConnection({ ...connection, port })
        return statusFromAccount(account)
      } catch (error) {
        return { state: 'offline', message: offlineMessage(error) }
      } finally {
        clearTimeout(timeout)
        options?.signal?.removeEventListener('abort', forwardAbort)
      }
    },

    disconnect: () => {
      removeConnection(serviceId)
    },

    listModels: async (options) => listCodexModels({
      connection: requireConnection(),
      ...(options?.signal ? { signal: options.signal } : {}),
      ...(options?.includeHidden ? { includeHidden: true } : {}),
    }),

    // async so a missing pairing rejects instead of throwing synchronously.
    run: async (options) => runCodexTurn({ ...options, connection: requireConnection() }),
  }
}

export { DEFAULT_BRIDGE_PATH }
