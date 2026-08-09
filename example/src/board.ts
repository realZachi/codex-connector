import { useCallback, useMemo, useRef, useState } from 'react'
import type { ConnectorToolSet } from 'codex-connector'

export type Note = { id: string; text: string; color: string }

const COLORS = ['amber', 'sky', 'violet', 'emerald', 'rose'] as const
const isColor = (value: unknown): value is (typeof COLORS)[number] =>
  typeof value === 'string' && (COLORS as readonly string[]).includes(value)

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

const requireText = (value: unknown, field: string): string => {
  const raw = asRecord(value)[field]
  if (typeof raw !== 'string' || !raw.trim()) throw new Error(`"${field}" must be a non-empty string`)
  return raw.trim().slice(0, 200)
}

export type Board = {
  title: string
  notes: Note[]
  tools: ConnectorToolSet
  reset: () => void
}

/**
 * The demo's app state plus the tools Codex may call against it. Tools run in
 * the browser, so they mutate React state directly — that is the whole point.
 */
export const useBoard = (): Board => {
  const [title, setTitle] = useState('Untitled board')
  const [notes, setNotes] = useState<Note[]>([])
  // Tools read through a ref so the tool set never goes stale mid-run.
  const notesRef = useRef<Note[]>([])
  notesRef.current = notes

  const reset = useCallback(() => {
    setNotes([])
    setTitle('Untitled board')
  }, [])

  const tools = useMemo<ConnectorToolSet>(() => ({
    list_notes: {
      description: 'List the notes currently on the board, with their ids and colors.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => ({ notes: notesRef.current }),
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
      execute: ({ text, color }: { text: string; color: string }) => {
        const note: Note = { id: crypto.randomUUID().slice(0, 8), text, color }
        setNotes((current) => [...current, note])
        return { ok: true, id: note.id, noteCount: notesRef.current.length + 1 }
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
      execute: ({ id }: { id: string }) => {
        if (!notesRef.current.some((note) => note.id === id)) {
          // Returning an error object teaches the model to re-read the board
          // instead of retrying blindly.
          return { ok: false, error: `No note with id "${id}". Call list_notes first.` }
        }
        setNotes((current) => current.filter((note) => note.id !== id))
        return { ok: true }
      },
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
      execute: ({ title: next }: { title: string }) => {
        setTitle(next.slice(0, 60))
        return { ok: true }
      },
    },

    fail_on_purpose: {
      description: 'Always fails. Only call this when the user explicitly asks to test error handling.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => { throw new Error('This tool fails on purpose') },
    },
  }), [])

  return { title, notes, tools, reset }
}
