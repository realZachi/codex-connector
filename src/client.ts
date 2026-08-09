import { CONNECTOR_PROTOCOL_VERSION, bridgeOrigin, serviceCandidatePorts } from './service'
import type { CodexConnection } from './connection'

export type BridgeStatus = {
  bridgeVersion: number
  serviceId: string
  port: number
  appServerReady: boolean
  appServerError: string | null
  sequence: number
}

export type RpcMessage = Record<string, unknown>
export type RpcMessageListener = (message: RpcMessage) => void
export type Fetcher = typeof fetch

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  cleanup: () => void
}

// Safari rejects an extracted `window.fetch` invoked with another receiver.
const defaultFetcher: Fetcher = (input, init) => globalThis.fetch(input, init)

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const baseRequestInit = {
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
} as const satisfies RequestInit

const responseError = async (response: Response): Promise<Error> => {
  let detail = ''
  try {
    const value: unknown = await response.json()
    if (isObject(value) && typeof value['error'] === 'string') detail = `: ${value['error']}`
  } catch {
    // The status code stays actionable when the body is not JSON.
  }
  return new Error(`Codex connector request failed (${String(response.status)})${detail}`)
}

const rpcError = (value: unknown): Error => {
  if (!isObject(value)) return new Error('Codex App Server returned an unknown error')
  return new Error(typeof value['message'] === 'string'
    ? value['message']
    : 'Codex App Server request failed')
}

const parseStatus = (value: unknown, port: number, serviceId: string): BridgeStatus => {
  if (!isObject(value) || typeof value['bridgeVersion'] !== 'number') {
    throw new Error('The Codex connector returned an invalid status')
  }
  if (value['bridgeVersion'] !== CONNECTOR_PROTOCOL_VERSION) {
    throw new Error(
      `The installed Codex connector speaks protocol ${String(value['bridgeVersion'])}; run the setup prompt again to update it`,
    )
  }
  if (value['serviceId'] !== serviceId) throw new Error('The Codex connector is paired with another app')
  const appServer = value['appServer']
  if (
    !isObject(appServer)
    || typeof appServer['ready'] !== 'boolean'
    || typeof appServer['sequence'] !== 'number'
    || (appServer['error'] !== null && typeof appServer['error'] !== 'string')
  ) throw new Error('The Codex connector returned an invalid App Server status')
  return {
    bridgeVersion: value['bridgeVersion'],
    serviceId,
    port,
    appServerReady: appServer['ready'],
    appServerError: appServer['error'],
    sequence: appServer['sequence'],
  }
}

/** Ports to try, cached port first. */
export const discoveryPorts = (connection: CodexConnection): number[] => {
  const candidates = serviceCandidatePorts(connection.serviceId)
  if (connection.port === null || !candidates.includes(connection.port)) return candidates
  return [connection.port, ...candidates.filter((port) => port !== connection.port)]
}

/**
 * Finds the port this app's bridge listens on. `/v1/hello` is unauthenticated on
 * purpose so the pairing token is only ever sent to a bridge that already
 * identified itself with the matching service id.
 */
export const discoverBridgePort = async (options: {
  connection: CodexConnection
  fetcher?: Fetcher
  signal?: AbortSignal
}): Promise<number | null> => {
  const fetcher = options.fetcher ?? defaultFetcher
  for (const port of discoveryPorts(options.connection)) {
    try {
      const response = await fetcher(`${bridgeOrigin(port)}/v1/hello`, {
        ...baseRequestInit,
        ...(options.signal ? { signal: options.signal } : {}),
      })
      if (!response.ok) continue
      const body: unknown = await response.json()
      if (isObject(body) && body['serviceId'] === options.connection.serviceId) return port
    } catch (error) {
      if (options.signal?.aborted) throw error
    }
  }
  return null
}

const authorizedHeaders = (connection: CodexConnection): Record<string, string> => ({
  Authorization: `Bearer ${connection.pairingToken}`,
})

export const probeBridge = async (options: {
  connection: CodexConnection
  fetcher?: Fetcher
  signal?: AbortSignal
}): Promise<BridgeStatus> => {
  const fetcher = options.fetcher ?? defaultFetcher
  const port = await discoverBridgePort(options)
  if (port === null) throw new Error('The local Codex connector is not running yet')
  const response = await fetcher(`${bridgeOrigin(port)}/v1/status`, {
    ...baseRequestInit,
    headers: authorizedHeaders(options.connection),
    ...(options.signal ? { signal: options.signal } : {}),
  })
  if (!response.ok) throw await responseError(response)
  return parseStatus(await response.json(), port, options.connection.serviceId)
}

const parseEventBatch = (value: unknown): {
  events: { sequence: number; message: RpcMessage }[]
  sequence: number
  droppedThrough: number
} => {
  if (!isObject(value) || !Array.isArray(value['events']) || typeof value['sequence'] !== 'number') {
    throw new Error('The Codex connector returned an invalid event batch')
  }
  const droppedThrough = value['droppedThrough'] ?? 0
  if (typeof droppedThrough !== 'number' || !Number.isSafeInteger(droppedThrough) || droppedThrough < 0) {
    throw new Error('The Codex connector returned an invalid event range')
  }
  const events: { sequence: number; message: RpcMessage }[] = []
  for (const item of value['events']) {
    if (!isObject(item) || typeof item['sequence'] !== 'number' || !isObject(item['message'])) {
      throw new Error('The Codex connector returned an invalid event')
    }
    events.push({ sequence: item['sequence'], message: item['message'] })
  }
  return { events, sequence: value['sequence'], droppedThrough }
}

/**
 * JSON-RPC over the loopback bridge: POST to send, long-poll to receive.
 * Requests resolve when the matching response id arrives on the event stream.
 */
export class CodexConnectorClient {
  private afterSequence = 0
  private isClosed = false
  private origin: string | null = null
  private pollController: AbortController | null = null
  private failure: Error | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private listeners = new Set<RpcMessageListener>()

  constructor(
    private readonly connection: CodexConnection,
    private readonly fetcher: Fetcher = defaultFetcher,
  ) {}

  async connect(signal?: AbortSignal): Promise<BridgeStatus> {
    this.assertAvailable()
    const status = await probeBridge({
      connection: this.connection,
      fetcher: this.fetcher,
      ...(signal ? { signal } : {}),
    })
    this.origin = bridgeOrigin(status.port)
    this.afterSequence = status.sequence
    if (status.appServerReady) this.startPolling()
    return status
  }

  subscribe(listener: RpcMessageListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    this.assertAvailable()
    if (signal?.aborted) throw new DOMException('The Codex request was cancelled', 'AbortError')
    const id = `codex-connector-${crypto.randomUUID()}`
    const result = new Promise<unknown>((resolve, reject) => {
      const handleAbort = () => {
        this.pendingRequests.delete(id)
        reject(new DOMException('The Codex request was cancelled', 'AbortError'))
      }
      signal?.addEventListener('abort', handleAbort, { once: true })
      this.pendingRequests.set(id, {
        resolve,
        reject,
        cleanup: () => signal?.removeEventListener('abort', handleAbort),
      })
    })
    try {
      const [, value] = await Promise.all([this.postMessage({ id, method, params }, signal), result])
      return value
    } catch (error) {
      const pending = this.pendingRequests.get(id)
      pending?.cleanup()
      this.pendingRequests.delete(id)
      throw error
    }
  }

  async respond(id: string | number, result: unknown): Promise<void> {
    await this.postMessage({ id, result })
  }

  close(): void {
    if (this.isClosed) return
    this.isClosed = true
    this.pollController?.abort()
    const error = new Error('The Codex connector connection closed')
    for (const pending of this.pendingRequests.values()) {
      pending.cleanup()
      pending.reject(error)
    }
    this.pendingRequests.clear()
    this.listeners.clear()
  }

  private requireOrigin(): string {
    if (!this.origin) throw new Error('Call connect() before using the Codex connector client')
    return this.origin
  }

  private async postMessage(message: RpcMessage, signal?: AbortSignal): Promise<void> {
    this.assertAvailable()
    const response = await this.fetcher(`${this.requireOrigin()}/v1/rpc`, {
      ...baseRequestInit,
      method: 'POST',
      headers: { ...authorizedHeaders(this.connection), 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      ...(signal ? { signal } : {}),
    })
    if (!response.ok) throw await responseError(response)
  }

  private startPolling(): void {
    if (this.pollController || this.isClosed) return
    this.pollController = new AbortController()
    void this.pollEvents(this.pollController.signal)
  }

  private async pollEvents(signal: AbortSignal): Promise<void> {
    try {
      while (!signal.aborted && !this.isClosed) {
        const response = await this.fetcher(
          `${this.requireOrigin()}/v1/events?after=${String(this.afterSequence)}`,
          { ...baseRequestInit, headers: authorizedHeaders(this.connection), signal },
        )
        if (!response.ok) throw await responseError(response)
        const batch = parseEventBatch(await response.json())
        if (this.afterSequence < batch.droppedThrough) {
          throw new Error('The Codex connector event buffer overflowed; retry the run')
        }
        this.afterSequence = batch.sequence
        for (const event of batch.events) this.dispatch(event.message)
      }
    } catch (error) {
      if (signal.aborted || this.isClosed) return
      const failure = error instanceof Error ? error : new Error(String(error))
      this.failure = failure
      for (const pending of this.pendingRequests.values()) {
        pending.cleanup()
        pending.reject(failure)
      }
      this.pendingRequests.clear()
    }
  }

  private assertAvailable(): void {
    if (this.isClosed) throw new Error('The Codex connector connection is closed')
    if (this.failure) throw this.failure
  }

  private dispatch(message: RpcMessage): void {
    const id = message['id']
    if ((typeof id === 'string' || typeof id === 'number') && !('method' in message)) {
      const pending = this.pendingRequests.get(String(id))
      if (pending) {
        pending.cleanup()
        this.pendingRequests.delete(String(id))
        if ('error' in message) pending.reject(rpcError(message['error']))
        else pending.resolve(message['result'])
        return
      }
    }
    for (const listener of this.listeners) listener(message)
  }
}
