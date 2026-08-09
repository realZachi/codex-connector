import { CodexConnectorClient, type Fetcher } from './client'
import type { CodexConnection } from './connection'

export type CodexModel = {
  id: string
  displayName: string
  description: string | null
  hidden: boolean
  supportedReasoningEfforts: string[]
  defaultReasoningEffort: string | null
  supportsImageInput: boolean
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const readStringArray = (value: unknown, key?: string): string[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string') return [item]
    if (key && isObject(item) && typeof item[key] === 'string') return [item[key]]
    return []
  })
}

export const parseCodexModels = (value: unknown): CodexModel[] => {
  const data = isObject(value) ? value['data'] : null
  if (!Array.isArray(data)) return []
  const models: CodexModel[] = []
  for (const item of data) {
    if (!isObject(item) || typeof item['id'] !== 'string') continue
    models.push({
      id: item['id'],
      displayName: typeof item['displayName'] === 'string' ? item['displayName'] : item['id'],
      description: typeof item['description'] === 'string' ? item['description'] : null,
      hidden: item['hidden'] === true,
      supportedReasoningEfforts: readStringArray(item['supportedReasoningEfforts'], 'reasoningEffort'),
      defaultReasoningEffort: typeof item['defaultReasoningEffort'] === 'string'
        ? item['defaultReasoningEffort']
        : null,
      supportsImageInput: readStringArray(item['inputModalities']).includes('image'),
    })
  }
  return models
}

/**
 * Models this user's plan can actually run. Model availability depends on the
 * ChatGPT plan, so offer a picker instead of hard-coding an id.
 */
export const listCodexModels = async (options: {
  connection: CodexConnection
  signal?: AbortSignal
  includeHidden?: boolean
  /** Injected in tests. */
  fetcher?: Fetcher
}): Promise<CodexModel[]> => {
  const client = new CodexConnectorClient(options.connection, options.fetcher)
  try {
    const status = await client.connect(options.signal)
    if (!status.appServerReady) {
      throw new Error(status.appServerError ?? 'Codex App Server is still starting')
    }
    const models = parseCodexModels(await client.request('model/list', {}, options.signal))
    return options.includeHidden ? models : models.filter((model) => !model.hidden)
  } finally {
    client.close()
  }
}
