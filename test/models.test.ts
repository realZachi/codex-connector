import { describe, expect, it } from 'vitest'
import { parseCodexModels } from '../src/models'

// Trimmed from a real `model/list` response.
const payload = {
  data: [
    {
      id: 'gpt-5.5',
      displayName: 'gpt-5.5',
      description: 'OpenAI native model.',
      hidden: false,
      supportedReasoningEfforts: [
        { reasoningEffort: 'low', description: 'Fast' },
        { reasoningEffort: 'high', description: 'Deep' },
      ],
      defaultReasoningEffort: 'low',
      inputModalities: ['text', 'image'],
    },
    {
      id: 'internal-preview',
      displayName: 'Internal preview',
      hidden: true,
      supportedReasoningEfforts: ['medium'],
      inputModalities: ['text'],
    },
  ],
}

describe('model parsing', () => {
  it('reads the fields a picker needs', () => {
    expect(parseCodexModels(payload)[0]).toEqual({
      id: 'gpt-5.5',
      displayName: 'gpt-5.5',
      description: 'OpenAI native model.',
      hidden: false,
      supportedReasoningEfforts: ['low', 'high'],
      defaultReasoningEffort: 'low',
      supportsImageInput: true,
    })
  })

  it('accepts both object and plain-string effort lists', () => {
    expect(parseCodexModels(payload)[1]?.supportedReasoningEfforts).toEqual(['medium'])
  })

  it('marks hidden models and missing image support', () => {
    const hidden = parseCodexModels(payload)[1]
    expect(hidden?.hidden).toBe(true)
    expect(hidden?.supportsImageInput).toBe(false)
    expect(hidden?.defaultReasoningEffort).toBeNull()
    expect(hidden?.description).toBeNull()
  })

  it('skips malformed entries instead of throwing', () => {
    expect(parseCodexModels({ data: [{ displayName: 'no id' }, 'nope', null] })).toEqual([])
    expect(parseCodexModels({})).toEqual([])
    expect(parseCodexModels(null)).toEqual([])
  })
})
