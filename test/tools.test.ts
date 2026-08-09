import { describe, expect, it, vi } from 'vitest'
import {
  buildDynamicToolSpecs,
  executeTool,
  parseToolCallRequest,
  serializeToolOutput,
  type ConnectorToolSet,
} from '../src/tools'

const tools = {
  add_note: {
    description: 'Add a note to the board',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
    execute: ({ text }: { text: string }) => ({ ok: true, text }),
  },
} as unknown as ConnectorToolSet

const request = {
  requestId: 1,
  callId: 'call-1',
  threadId: 'thread-1',
  turnId: 'turn-1',
  toolName: 'add_note',
  arguments: { text: 'hello' },
}

describe('dynamic tool specs', () => {
  it('maps tools to the App Server shape', () => {
    expect(buildDynamicToolSpecs(tools)).toEqual([{
      type: 'function',
      name: 'add_note',
      description: 'Add a note to the board',
      inputSchema: tools['add_note']?.inputSchema,
    }])
  })

  it('rejects an unusable tool name or empty description', () => {
    expect(() => buildDynamicToolSpecs({ 'bad name': tools['add_note'] } as ConnectorToolSet))
      .toThrow(/Invalid Codex tool name/)
    expect(() => buildDynamicToolSpecs({
      ok: { ...tools['add_note'], description: '  ' },
    } as unknown as ConnectorToolSet)).toThrow(/needs a description/)
  })
})

describe('tool call parsing', () => {
  it('parses a well-formed call', () => {
    expect(parseToolCallRequest({
      id: 5,
      method: 'item/tool/call',
      params: { callId: 'c', threadId: 't', turnId: 'u', tool: 'add_note', arguments: { text: 'x' } },
    })).toEqual({
      requestId: 5,
      callId: 'c',
      threadId: 't',
      turnId: 'u',
      toolName: 'add_note',
      arguments: { text: 'x' },
    })
  })

  it('ignores other methods and malformed params', () => {
    expect(parseToolCallRequest({ id: 5, method: 'turn/completed', params: {} })).toBeNull()
    expect(parseToolCallRequest({ method: 'item/tool/call', params: {} })).toBeNull()
    expect(parseToolCallRequest({ id: 5, method: 'item/tool/call', params: { callId: 'c' } })).toBeNull()
  })
})

describe('tool execution', () => {
  it('runs the tool and serializes the result', async () => {
    await expect(executeTool({ request, tools })).resolves.toEqual({
      success: true,
      contentItems: [{ type: 'inputText', text: JSON.stringify({ ok: true, text: 'hello' }) }],
    })
  })

  it('reports an unknown tool without throwing', async () => {
    const result = await executeTool({ request: { ...request, toolName: 'nope' }, tools })
    expect(result.success).toBe(false)
    expect(result.contentItems[0]).toMatchObject({ text: expect.stringContaining('Unknown tool') })
  })

  it('turns a thrown error into a failed result', async () => {
    const failing = {
      boom: {
        description: 'Fails',
        inputSchema: { type: 'object' },
        execute: () => { throw new Error('nope') },
      },
    } as unknown as ConnectorToolSet
    const result = await executeTool({ request: { ...request, toolName: 'boom' }, tools: failing })
    expect(result.success).toBe(false)
    expect(result.contentItems[0]).toMatchObject({ text: expect.stringContaining('nope') })
  })

  it('lets parseInput reject bad arguments', async () => {
    const guarded = {
      add_note: {
        ...tools['add_note'],
        parseInput: () => { throw new Error('text is required') },
      },
    } as unknown as ConnectorToolSet
    const result = await executeTool({ request: { ...request, arguments: {} }, tools: guarded })
    expect(result.success).toBe(false)
    expect(result.contentItems[0]).toMatchObject({ text: expect.stringContaining('text is required') })
  })

  it('passes the abort signal and call id to the tool', async () => {
    const execute = vi.fn(() => 'done')
    const controller = new AbortController()
    await executeTool({
      request,
      tools: { add_note: { ...tools['add_note'], execute } } as unknown as ConnectorToolSet,
      signal: controller.signal,
    })
    expect(execute).toHaveBeenCalledWith(
      { text: 'hello' },
      { toolCallId: 'call-1', signal: controller.signal },
    )
  })

  it('rejects streaming results', async () => {
    const streaming = {
      add_note: {
        ...tools['add_note'],
        execute: () => ({ async *[Symbol.asyncIterator]() { yield 1 } }),
      },
    } as unknown as ConnectorToolSet
    const result = await executeTool({ request, tools: streaming })
    expect(result.success).toBe(false)
    expect(result.contentItems[0]).toMatchObject({ text: expect.stringContaining('Streaming') })
  })
})

describe('tool output serialization', () => {
  it('accepts a plain string', () => {
    expect(serializeToolOutput('done')).toEqual({
      success: true,
      contentItems: [{ type: 'inputText', text: 'done' }],
    })
  })

  it('accepts mixed text and image content', () => {
    expect(serializeToolOutput({
      content: [
        { type: 'text', text: 'Here is the canvas' },
        { type: 'image', dataUrl: 'data:image/png;base64,AAA' },
      ],
    })).toEqual({
      success: true,
      contentItems: [
        { type: 'inputText', text: 'Here is the canvas' },
        { type: 'inputImage', imageUrl: 'data:image/png;base64,AAA' },
      ],
    })
  })

  it('falls back to JSON for anything else', () => {
    expect(serializeToolOutput({ a: 1 }).contentItems[0]).toEqual({
      type: 'inputText',
      text: '{"a":1}',
    })
    expect(serializeToolOutput(undefined).contentItems[0]).toEqual({
      type: 'inputText',
      text: '{"ok":true}',
    })
  })
})
