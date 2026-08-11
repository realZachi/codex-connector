export type JsonSchema = Record<string, unknown>

export type ToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUrl: string }

/**
 * A tool your page exposes to Codex. `execute` runs in the browser, so it can
 * touch your app state directly. Codex never gets shell, filesystem or network
 * access through this.
 */
export type ConnectorTool<Input = unknown> = {
  description: string
  /** JSON Schema for the arguments. Objects with `properties` work best. */
  inputSchema: JsonSchema
  /** Optional guard; return a typed value or throw to reject the call. */
  parseInput?: (input: unknown) => Input
  execute: (input: Input, context: ToolExecutionContext) => Promise<unknown> | unknown
}

export type ToolExecutionContext = {
  toolCallId: string
  signal: AbortSignal | undefined
}

// A set is intentionally heterogeneous: every entry may parse a different
// input shape. `any` is the existential boundary here; each individual
// ConnectorTool<Input> remains fully typed for consumers.
export type ConnectorToolSet = Record<string, ConnectorTool<any>>

const TOOL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/

export type DynamicToolSpec = {
  type: 'function'
  name: string
  description: string
  inputSchema: JsonSchema
}

export const buildDynamicToolSpecs = (tools: ConnectorToolSet): DynamicToolSpec[] => {
  const specs: DynamicToolSpec[] = []
  for (const [name, tool] of Object.entries(tools)) {
    if (!TOOL_NAME_PATTERN.test(name)) {
      throw new Error(`Invalid Codex tool name "${name}": use letters, digits, underscores and dashes`)
    }
    if (!tool.description.trim()) throw new Error(`Codex tool "${name}" needs a description`)
    specs.push({
      type: 'function',
      name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })
  }
  return specs
}

export type ToolCallRequest = {
  requestId: string | number
  callId: string
  threadId: string
  turnId: string
  toolName: string
  arguments: unknown
}

type ToolCallResponse = {
  success: boolean
  contentItems: ({ type: 'inputText'; text: string } | { type: 'inputImage'; imageUrl: string })[]
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const parseToolCallRequest = (message: Record<string, unknown>): ToolCallRequest | null => {
  if (message['method'] !== 'item/tool/call') return null
  const requestId = message['id']
  const params = message['params']
  if (
    (typeof requestId !== 'string' && typeof requestId !== 'number')
    || !isObject(params)
    || typeof params['callId'] !== 'string'
    || typeof params['threadId'] !== 'string'
    || typeof params['turnId'] !== 'string'
    || typeof params['tool'] !== 'string'
  ) return null
  return {
    requestId,
    callId: params['callId'],
    threadId: params['threadId'],
    turnId: params['turnId'],
    toolName: params['tool'],
    arguments: params['arguments'],
  }
}

const toContentItems = (content: ToolResultContent[]): ToolCallResponse['contentItems'] =>
  content.map((item) => item.type === 'text'
    ? { type: 'inputText' as const, text: item.text }
    : { type: 'inputImage' as const, imageUrl: item.dataUrl })

/** Structured results, plain strings and `{ content: [...] }` all work. */
export const serializeToolOutput = (output: unknown): ToolCallResponse => {
  if (typeof output === 'string') {
    return { success: true, contentItems: [{ type: 'inputText', text: output }] }
  }
  if (isObject(output) && Array.isArray(output['content'])) {
    const content = output['content'].filter((item): item is ToolResultContent =>
      isObject(item)
      && ((item['type'] === 'text' && typeof item['text'] === 'string')
        || (item['type'] === 'image' && typeof item['dataUrl'] === 'string')))
    if (content.length > 0) return { success: true, contentItems: toContentItems(content) }
  }
  return {
    success: true,
    contentItems: [{ type: 'inputText', text: JSON.stringify(output ?? { ok: true }) }],
  }
}

export const serializeToolFailure = (error: unknown): ToolCallResponse => ({
  success: false,
  contentItems: [{
    type: 'inputText',
    text: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  }],
})

export const executeTool = async (options: {
  request: ToolCallRequest
  tools: ConnectorToolSet
  signal?: AbortSignal
}): Promise<ToolCallResponse> => {
  const { request, tools } = options
  const tool: ConnectorTool<any> | undefined = Object.hasOwn(tools, request.toolName)
    ? tools[request.toolName]
    : undefined
  if (!tool) return serializeToolFailure(new Error(`Unknown tool: ${request.toolName}`))
  try {
    const input = tool.parseInput
      ? tool.parseInput(request.arguments)
      : (request.arguments as never)
    const output: unknown = await tool.execute(input, {
      toolCallId: request.callId,
      signal: options.signal,
    })
    if (output && typeof output === 'object' && Symbol.asyncIterator in output) {
      return serializeToolFailure(new Error('Streaming tool results are not supported'))
    }
    return serializeToolOutput(output)
  } catch (error) {
    return serializeToolFailure(error)
  }
}
