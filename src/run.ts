import { accountErrorMessage, parseAccount, type CodexAccount } from './account'
import { CodexConnectorClient, type RpcMessage } from './client'
import { buildDynamicToolSpecs, executeTool, parseToolCallRequest, type ConnectorToolSet, type ToolCallRequest } from './tools'
import type { CodexConnection } from './connection'

export type CodexRunInput =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUrl: string; detail?: 'low' | 'high' }

/**
 * Which values a given account actually accepts differs per model; read
 * `supportedReasoningEfforts` from `listCodexModels()` instead of assuming.
 */
export type ReasoningEffort =
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'ultra'

export type CodexRunEvent =
  | { type: 'status'; message: string }
  | { type: 'account'; account: Extract<CodexAccount, { status: 'connected' }> }
  | { type: 'text-delta'; delta: string }
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'segment-end'; source: 'text' | 'reasoning' }
  | { type: 'tool-call'; name: string; arguments: unknown; toolCallId: string }
  | { type: 'tool-result'; name: string; toolCallId: string; success: boolean }
  | { type: 'done'; text: string }

export type RunCodexTurnOptions = {
  connection: CodexConnection
  /** Codex model id, e.g. `gpt-5.6-codex`. */
  model: string
  input: string | CodexRunInput[]
  tools?: ConnectorToolSet
  /** Replaces Codex's base instructions for this thread. */
  instructions?: string
  /** Additional developer-role guidance layered on top. */
  developerInstructions?: string
  reasoningEffort?: ReasoningEffort
  reasoningSummary?: 'auto' | 'concise' | 'detailed'
  signal?: AbortSignal
  onEvent?: (event: CodexRunEvent) => void
  /** Injected in tests. */
  client?: Pick<CodexConnectorClient, 'connect' | 'request' | 'respond' | 'subscribe' | 'close'>
}

export type CodexRunResult = { text: string; account: Extract<CodexAccount, { status: 'connected' }> }

const DEFAULT_DEVELOPER_INSTRUCTIONS =
  'You are embedded in a web app and reached over a restricted local connector. Use only the provided dynamic tools. Never use shell, filesystem, network, MCP, skills, plugins or subagents.'
const THREAD_CLEANUP_TIMEOUT_MS = 1_500

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const createAbortError = () => new DOMException('The Codex run was cancelled', 'AbortError')

const toCodexInput = (input: string | CodexRunInput[]) => {
  const items = typeof input === 'string' ? [{ type: 'text' as const, text: input }] : input
  return items.map((item) => item.type === 'text'
    ? { type: 'text', text: item.text }
    : { type: 'image', url: item.dataUrl, detail: item.detail ?? 'high' })
}

const readThreadId = (value: unknown): string => {
  if (!isObject(value) || !isObject(value['thread']) || typeof value['thread']['id'] !== 'string') {
    throw new Error('Codex App Server did not return a thread id')
  }
  return value['thread']['id']
}

const readTurnId = (value: unknown): string => {
  if (!isObject(value) || !isObject(value['turn']) || typeof value['turn']['id'] !== 'string') {
    throw new Error('Codex App Server did not return a turn id')
  }
  return value['turn']['id']
}

type NarrationUpdate = { source: 'text' | 'reasoning'; segmentId: string; delta?: string }

const parseNarrationUpdate = (message: RpcMessage): NarrationUpdate | null => {
  const params = message['params']
  if (!isObject(params) || typeof params['itemId'] !== 'string') return null
  if (message['method'] === 'item/agentMessage/delta') {
    return typeof params['delta'] === 'string'
      ? { source: 'text', segmentId: `agent:${params['itemId']}`, delta: params['delta'] }
      : null
  }
  if (
    message['method'] !== 'item/reasoning/summaryPartAdded'
    && message['method'] !== 'item/reasoning/summaryTextDelta'
  ) return null
  if (!Number.isSafeInteger(params['summaryIndex'])) return null
  const segmentId = `reasoning:${params['itemId']}:${String(params['summaryIndex'])}`
  return message['method'] === 'item/reasoning/summaryTextDelta' && typeof params['delta'] === 'string'
    ? { source: 'reasoning', segmentId, delta: params['delta'] }
    : { source: 'reasoning', segmentId }
}

/** Emits a `segment-end` when Codex moves to a new message or summary part. */
export const createNarrationForwarder = (
  onEvent: (event: Extract<CodexRunEvent, { type: 'text-delta' | 'reasoning-delta' | 'segment-end' }>) => void,
): ((message: RpcMessage) => void) => {
  const activeSegments: Record<'text' | 'reasoning', string> = { text: '', reasoning: '' }
  return (message) => {
    const update = parseNarrationUpdate(message)
    if (!update) return
    const previous = activeSegments[update.source]
    if (previous && previous !== update.segmentId) {
      onEvent({ type: 'segment-end', source: update.source })
    }
    activeSegments[update.source] = update.segmentId
    if (update.delta !== undefined) {
      onEvent(update.source === 'text'
        ? { type: 'text-delta', delta: update.delta }
        : { type: 'reasoning-delta', delta: update.delta })
    }
  }
}

const isMatchingTurn = (message: RpcMessage, threadId: string, turnId: string): boolean => {
  const params = message['params']
  if (!isObject(params)) return false
  if (typeof params['threadId'] === 'string' && params['threadId'] !== threadId) return false
  if (typeof params['turnId'] === 'string' && params['turnId'] !== turnId) return false
  return true
}

const completedTurnError = (message: RpcMessage): string | null => {
  const params = message['params']
  if (!isObject(params) || !isObject(params['turn'])) return 'The Codex turn ended unexpectedly'
  const turn = params['turn']
  if (turn['status'] === 'completed') return null
  if (isObject(turn['error']) && typeof turn['error']['message'] === 'string') {
    return turn['error']['message']
  }
  return turn['status'] === 'interrupted' ? 'The Codex run was cancelled' : 'The Codex run failed'
}

const deleteThread = async (
  client: Pick<CodexConnectorClient, 'request'>,
  threadId: string,
): Promise<void> => {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      resolve()
    }, THREAD_CLEANUP_TIMEOUT_MS)
  })
  const deletion = client.request('thread/delete', { threadId }, controller.signal)
    .then(() => undefined, () => undefined)
  try {
    await Promise.race([deletion, timeout])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

const verifyAccount = async (
  client: Pick<CodexConnectorClient, 'request'>,
  signal: AbortSignal | undefined,
): Promise<Extract<CodexAccount, { status: 'connected' }>> => {
  const account = parseAccount(await client.request('account/read', { refreshToken: false }, signal))
  if (account.status !== 'connected') {
    throw new Error(accountErrorMessage(account) ?? 'The Codex account could not be verified')
  }
  return account
}

/**
 * Runs one ephemeral Codex turn on the user's own plan and resolves with the
 * final assistant text. Tool calls are executed in the browser; the thread is
 * deleted afterwards so nothing is left in the user's Codex history.
 */
export const runCodexTurn = async (options: RunCodexTurnOptions): Promise<CodexRunResult> => {
  if (options.signal?.aborted) throw createAbortError()
  const client = options.client ?? new CodexConnectorClient(options.connection)
  const tools = options.tools ?? {}
  const emit = (event: CodexRunEvent) => options.onEvent?.(event)
  let threadId = ''
  let turnId = ''
  let assistantText = ''
  let queued: RpcMessage[] = []
  let settleTurn: ((error?: Error) => void) | null = null
  const turnCompleted = new Promise<void>((resolve, reject) => {
    settleTurn = (error) => { if (error) reject(error); else resolve() }
  })
  const forwardNarration = createNarrationForwarder((event) => {
    if (event.type === 'text-delta') assistantText += event.delta
    emit(event)
  })

  const handleToolRequest = async (request: ToolCallRequest) => {
    if (request.threadId !== threadId || request.turnId !== turnId) return
    emit({
      type: 'tool-call',
      name: request.toolName,
      arguments: request.arguments,
      toolCallId: request.callId,
    })
    const result = await executeTool({
      request,
      tools,
      ...(options.signal ? { signal: options.signal } : {}),
    })
    emit({
      type: 'tool-result',
      name: request.toolName,
      toolCallId: request.callId,
      success: result.success,
    })
    await client.respond(request.requestId, result)
  }

  const handleMessage = (message: RpcMessage) => {
    const toolRequest = parseToolCallRequest(message)
    if (toolRequest) {
      void handleToolRequest(toolRequest).catch((error: unknown) => {
        settleTurn?.(error instanceof Error ? error : new Error(String(error)))
      })
      return
    }
    if (!threadId || !turnId || !isMatchingTurn(message, threadId, turnId)) return
    if (
      message['method'] === 'item/agentMessage/delta'
      || message['method'] === 'item/reasoning/summaryPartAdded'
      || message['method'] === 'item/reasoning/summaryTextDelta'
    ) {
      forwardNarration(message)
      return
    }
    if (message['method'] !== 'turn/completed') return
    const error = completedTurnError(message)
    settleTurn?.(error ? new Error(error) : undefined)
  }

  const unsubscribe = client.subscribe((message) => {
    if (!threadId || !turnId) queued.push(message)
    else handleMessage(message)
  })

  const handleAbort = () => {
    if (threadId && turnId) {
      void client.request('turn/interrupt', { threadId, turnId }).catch(() => undefined)
    }
    settleTurn?.(createAbortError())
  }
  options.signal?.addEventListener('abort', handleAbort, { once: true })

  try {
    const status = await client.connect(options.signal)
    if (!status.appServerReady) {
      throw new Error(status.appServerError ?? 'Codex App Server is still starting')
    }
    const account = await verifyAccount(client, options.signal)
    emit({ type: 'account', account })
    emit({ type: 'status', message: `Connected to Codex · ChatGPT ${account.planType}` })

    threadId = readThreadId(await client.request('thread/start', {
      model: options.model,
      ephemeral: true,
      ...(options.instructions ? { baseInstructions: options.instructions } : {}),
      developerInstructions: options.developerInstructions
        ? `${DEFAULT_DEVELOPER_INSTRUCTIONS}\n\n${options.developerInstructions}`
        : DEFAULT_DEVELOPER_INSTRUCTIONS,
      dynamicTools: buildDynamicToolSpecs(tools),
    }, options.signal))

    turnId = readTurnId(await client.request('turn/start', {
      threadId,
      input: toCodexInput(options.input),
      model: options.model,
      ...(options.reasoningEffort ? { effort: options.reasoningEffort } : {}),
      summary: options.reasoningSummary ?? 'detailed',
    }, options.signal))

    const buffered = queued
    queued = []
    for (const message of buffered) handleMessage(message)
    if (options.signal?.aborted) handleAbort()

    await turnCompleted
    const text = assistantText.trim()
    emit({ type: 'done', text })
    return { text, account }
  } finally {
    options.signal?.removeEventListener('abort', handleAbort)
    unsubscribe()
    queued = []
    if (threadId) await deleteThread(client, threadId)
    client.close()
  }
}
