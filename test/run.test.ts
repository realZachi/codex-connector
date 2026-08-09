import { describe, expect, it, vi } from 'vitest'
import { createConnection } from '../src/connection'
import { createNarrationForwarder, runCodexTurn, type CodexRunEvent } from '../src/run'
import type { RpcMessage } from '../src/client'
import type { ConnectorToolSet } from '../src/tools'

const connection = createConnection({ serviceId: 'acme-studio', appOrigin: 'https://acme.example' })

const connectedAccount = { account: { type: 'chatgpt', email: 'a@b.c', planType: 'plus' } }

/** Minimal in-memory stand-in for the bridge client. */
const createFakeClient = (options: {
  account?: unknown
  onTurnStart?: (emit: (message: RpcMessage) => void) => void
  ready?: boolean
} = {}) => {
  const listeners = new Set<(message: RpcMessage) => void>()
  const emit = (message: RpcMessage) => { for (const listener of listeners) listener(message) }
  const requests: { method: string; params: unknown }[] = []
  const responses: { id: string | number; result: unknown }[] = []
  const client = {
    connect: vi.fn(async () => ({
      bridgeVersion: 1,
      serviceId: 'acme-studio',
      port: 47_600,
      appServerReady: options.ready ?? true,
      appServerError: options.ready === false ? 'still starting' : null,
      sequence: 0,
    })),
    request: vi.fn(async (method: string, params: unknown) => {
      requests.push({ method, params })
      if (method === 'account/read') return options.account ?? connectedAccount
      if (method === 'thread/start') return { thread: { id: 'thread-1' } }
      if (method === 'turn/start') {
        setTimeout(() => options.onTurnStart?.(emit), 0)
        return { turn: { id: 'turn-1' } }
      }
      return {}
    }),
    respond: vi.fn(async (id: string | number, result: unknown) => { responses.push({ id, result }) }),
    subscribe: vi.fn((listener: (message: RpcMessage) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }),
    close: vi.fn(),
  }
  return { client, emit, requests, responses }
}

const completeTurn = (emit: (message: RpcMessage) => void) => {
  emit({
    method: 'turn/completed',
    params: { threadId: 'thread-1', turnId: 'turn-1', turn: { status: 'completed' } },
  })
}

describe('runCodexTurn', () => {
  it('streams text, returns it and deletes the ephemeral thread', async () => {
    const events: CodexRunEvent[] = []
    const { client, requests } = createFakeClient({
      onTurnStart: (emit) => {
        emit({
          method: 'item/agentMessage/delta',
          params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'i1', delta: 'Hello ' },
        })
        emit({
          method: 'item/agentMessage/delta',
          params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'i1', delta: 'world' },
        })
        completeTurn(emit)
      },
    })
    const result = await runCodexTurn({
      connection,
      model: 'gpt-5.6-codex',
      input: 'hi',
      client,
      onEvent: (event) => events.push(event),
    })
    expect(result.text).toBe('Hello world')
    expect(result.account.planType).toBe('plus')
    expect(events).toContainEqual({ type: 'text-delta', delta: 'Hello ' })
    expect(events.at(-1)).toEqual({ type: 'done', text: 'Hello world' })
    expect(requests.map(({ method }) => method)).toEqual([
      'account/read',
      'thread/start',
      'turn/start',
      'thread/delete',
    ])
    expect(client.close).toHaveBeenCalled()
  })

  it('starts an ephemeral thread with the dynamic tools and hardened instructions', async () => {
    const tools = {
      add_note: {
        description: 'Add a note',
        inputSchema: { type: 'object' },
        execute: () => 'ok',
      },
    } as unknown as ConnectorToolSet
    const { client, requests } = createFakeClient({ onTurnStart: completeTurn })
    await runCodexTurn({ connection, model: 'gpt-5.6-codex', input: 'hi', tools, client })
    const threadStart = requests.find(({ method }) => method === 'thread/start')
      ?.params as Record<string, unknown>
    expect(threadStart['ephemeral']).toBe(true)
    expect(threadStart['dynamicTools']).toEqual([{
      type: 'function',
      name: 'add_note',
      description: 'Add a note',
      inputSchema: { type: 'object' },
    }])
    expect(String(threadStart['developerInstructions'])).toContain('Never use shell')
  })

  it('executes a tool call and answers the App Server request', async () => {
    const execute = vi.fn(() => ({ ok: true }))
    const tools = {
      add_note: { description: 'Add a note', inputSchema: { type: 'object' }, execute },
    } as unknown as ConnectorToolSet
    const { client, responses } = createFakeClient({
      onTurnStart: (emit) => {
        emit({
          id: 42,
          method: 'item/tool/call',
          params: {
            callId: 'call-1',
            threadId: 'thread-1',
            turnId: 'turn-1',
            tool: 'add_note',
            arguments: { text: 'x' },
          },
        })
        setTimeout(() => completeTurn(emit), 0)
      },
    })
    const events: CodexRunEvent[] = []
    await runCodexTurn({
      connection,
      model: 'gpt-5.6-codex',
      input: 'hi',
      tools,
      client,
      onEvent: (event) => events.push(event),
    })
    expect(execute).toHaveBeenCalled()
    expect(responses).toEqual([{
      id: 42,
      result: { success: true, contentItems: [{ type: 'inputText', text: '{"ok":true}' }] },
    }])
    expect(events).toContainEqual({
      type: 'tool-call',
      name: 'add_note',
      arguments: { text: 'x' },
      toolCallId: 'call-1',
    })
    expect(events).toContainEqual({
      type: 'tool-result',
      name: 'add_note',
      toolCallId: 'call-1',
      success: true,
    })
  })

  it('ignores messages from another turn', async () => {
    const events: CodexRunEvent[] = []
    const { client } = createFakeClient({
      onTurnStart: (emit) => {
        emit({
          method: 'item/agentMessage/delta',
          params: { threadId: 'thread-1', turnId: 'other-turn', itemId: 'i1', delta: 'leak' },
        })
        completeTurn(emit)
      },
    })
    const result = await runCodexTurn({
      connection,
      model: 'gpt-5.6-codex',
      input: 'hi',
      client,
      onEvent: (event) => events.push(event),
    })
    expect(result.text).toBe('')
  })

  it('rejects when the user is signed out', async () => {
    const { client } = createFakeClient({ account: { account: null } })
    await expect(runCodexTurn({ connection, model: 'gpt-5.6-codex', input: 'hi', client }))
      .rejects.toThrow(/signed out/)
  })

  it('rejects when Codex runs on an API key', async () => {
    const { client } = createFakeClient({ account: { account: { type: 'apiKey' } } })
    await expect(runCodexTurn({ connection, model: 'gpt-5.6-codex', input: 'hi', client }))
      .rejects.toThrow(/API key/)
  })

  it('rejects when the App Server is not ready yet', async () => {
    const { client } = createFakeClient({ ready: false })
    await expect(runCodexTurn({ connection, model: 'gpt-5.6-codex', input: 'hi', client }))
      .rejects.toThrow(/still starting/)
  })

  it('surfaces a failed turn', async () => {
    const { client } = createFakeClient({
      onTurnStart: (emit) => {
        emit({
          method: 'turn/completed',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            turn: { status: 'failed', error: { message: 'rate limited' } },
          },
        })
      },
    })
    await expect(runCodexTurn({ connection, model: 'gpt-5.6-codex', input: 'hi', client }))
      .rejects.toThrow('rate limited')
  })

  it('interrupts the turn and cleans up when cancelled', async () => {
    const controller = new AbortController()
    const { client, requests } = createFakeClient({
      onTurnStart: () => controller.abort(),
    })
    await expect(runCodexTurn({
      connection,
      model: 'gpt-5.6-codex',
      input: 'hi',
      client,
      signal: controller.signal,
    })).rejects.toThrow(/cancelled/)
    expect(requests.map(({ method }) => method)).toContain('turn/interrupt')
    expect(requests.map(({ method }) => method)).toContain('thread/delete')
  })

  it('refuses to start when the signal is already aborted', async () => {
    const { client } = createFakeClient()
    await expect(runCodexTurn({
      connection,
      model: 'gpt-5.6-codex',
      input: 'hi',
      client,
      signal: AbortSignal.abort(),
    })).rejects.toThrow(/cancelled/)
    expect(client.connect).not.toHaveBeenCalled()
  })

  it('maps image input to the App Server shape', async () => {
    const { client, requests } = createFakeClient({ onTurnStart: completeTurn })
    await runCodexTurn({
      connection,
      model: 'gpt-5.6-codex',
      input: [
        { type: 'text', text: 'Describe this' },
        { type: 'image', dataUrl: 'data:image/png;base64,AAA' },
      ],
      client,
    })
    const turnStart = requests.find(({ method }) => method === 'turn/start')
      ?.params as Record<string, unknown>
    expect(turnStart['input']).toEqual([
      { type: 'text', text: 'Describe this' },
      { type: 'image', url: 'data:image/png;base64,AAA', detail: 'high' },
    ])
  })
})

describe('narration forwarder', () => {
  it('marks a boundary when Codex moves to a new segment', () => {
    const events: CodexRunEvent[] = []
    const forward = createNarrationForwarder((event) => events.push(event))
    forward({ method: 'item/agentMessage/delta', params: { itemId: 'a', delta: 'one' } })
    forward({ method: 'item/agentMessage/delta', params: { itemId: 'b', delta: 'two' } })
    forward({ method: 'item/reasoning/summaryTextDelta', params: { itemId: 'r', summaryIndex: 0, delta: 'think' } })
    expect(events).toEqual([
      { type: 'text-delta', delta: 'one' },
      { type: 'segment-end', source: 'text' },
      { type: 'text-delta', delta: 'two' },
      { type: 'reasoning-delta', delta: 'think' },
    ])
  })

  it('ignores unrelated messages', () => {
    const events: CodexRunEvent[] = []
    const forward = createNarrationForwarder((event) => events.push(event))
    forward({ method: 'turn/completed', params: { turn: { status: 'completed' } } })
    forward({ method: 'item/agentMessage/delta', params: {} })
    expect(events).toEqual([])
  })
})
