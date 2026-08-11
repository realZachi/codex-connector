import type { ConnectorToolSet } from 'codex-connector'

export const APP_NAME = 'Codex Connector Demo'

export const EXAMPLES = [
  'Add three sticky notes with ideas for a weekend project, each a different color.',
  'Rename the board to "Sprint 12" and add one note per day of the work week.',
  'Read the board, then delete every note that mentions a colour.',
  'Call fail_on_purpose once and tell me what happened.',
] as const

export const STATUS_LABEL: Record<string, string> = {
  notPaired: 'Not connected',
  checking: 'Checking…',
  offline: 'Connector not running',
  signedOut: 'Codex signed out',
  apiKey: 'Codex on API key',
  unsupported: 'Account unsupported',
  connected: 'Connected',
}

export type NoteColor = 'amber' | 'sky' | 'violet' | 'emerald' | 'rose'
export type Note = { id: string; text: string; color: NoteColor }
export type LogEntry = { id: number; kind: string; text: string }

const COLORS: readonly NoteColor[] = ['amber', 'sky', 'violet', 'emerald', 'rose']

const isColor = (value: unknown): value is NoteColor =>
  typeof value === 'string' && COLORS.includes(value as NoteColor)

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

const requireText = (value: unknown, field: string): string => {
  const raw = asRecord(value)[field]
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`"${field}" must be a non-empty string`)
  }
  return raw.trim().slice(0, 200)
}

export type BoardPort = {
  getNotes: () => readonly Note[]
  addNote: (note: Note) => number
  deleteNote: (id: string) => boolean
  setTitle: (title: string) => void
}

/** Framework-neutral tools; each example supplies only its native state updates. */
export const createBoardTools = (board: BoardPort): ConnectorToolSet => ({
  list_notes: {
    description: 'List the notes currently on the board, with their ids and colors.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: () => ({ notes: board.getNotes() }),
  },

  add_note: {
    description: 'Add a sticky note to the board. Returns the new note id.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The note text, max 200 characters.' },
        color: { type: 'string', enum: [...COLORS], description: 'Sticky note color.' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    parseInput: (input) => {
      const record = asRecord(input)
      return {
        text: requireText(input, 'text'),
        color: isColor(record['color']) ? record['color'] : 'amber',
      }
    },
    execute: ({ text, color }: { text: string; color: NoteColor }) => {
      const note: Note = { id: crypto.randomUUID().slice(0, 8), text, color }
      return { ok: true, id: note.id, noteCount: board.addNote(note) }
    },
  },

  delete_note: {
    description: 'Delete one note by its id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    parseInput: (input) => ({ id: requireText(input, 'id') }),
    execute: ({ id }: { id: string }) => board.deleteNote(id)
      ? { ok: true }
      : { ok: false, error: `No note with id "${id}". Call list_notes first.` },
  },

  set_board_title: {
    description: 'Rename the board.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' } },
      required: ['title'],
      additionalProperties: false,
    },
    parseInput: (input) => ({ title: requireText(input, 'title') }),
    execute: ({ title }: { title: string }) => {
      board.setTitle(title.slice(0, 60))
      return { ok: true }
    },
  },

  fail_on_purpose: {
    description: 'Always fails. Only call this when the user explicitly asks to test error handling.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: () => { throw new Error('This tool fails on purpose') },
  },
})

export const shortExample = (value: string): string =>
  value.length > 42 ? `${value.slice(0, 42)}…` : value

