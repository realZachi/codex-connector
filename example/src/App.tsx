import { useCallback, useEffect, useRef, useState } from 'react'
import { useCodexConnector } from 'codex-connector/react'
import { ConnectPanel } from './ConnectPanel'
import { useBoard } from './board'
import type { CodexModel, CodexRunEvent, ReasoningEffort } from 'codex-connector'

const SERVICE_ID = 'codex-connector-demo'
const APP_NAME = 'Codex Connector Demo'

const EXAMPLES = [
  'Add three sticky notes with ideas for a weekend project, each a different color.',
  'Rename the board to "Sprint 12" and add one note per day of the work week.',
  'Read the board, then delete every note that mentions a colour.',
  'Call fail_on_purpose once and tell me what happened.',
]

type LogEntry = { id: number; kind: string; text: string }

export const App = () => {
  const board = useBoard()
  const {
    connector,
    status,
    isConnected,
    setup,
    createSetup,
    checkConnection,
    disconnect,
  } = useCodexConnector({
    serviceId: SERVICE_ID,
    appName: APP_NAME,
    // In your own app: bridgeSha256: __CODEX_BRIDGE_SHA256__
    bridgeSha256: __CODEX_BRIDGE_SHA256__,
  })

  const [models, setModels] = useState<CodexModel[]>([])
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState<ReasoningEffort>('low')
  const [prompt, setPrompt] = useState(EXAMPLES[0] ?? '')
  const [isRunning, setIsRunning] = useState(false)
  const [answer, setAnswer] = useState('')
  const [reasoning, setReasoning] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const logIdRef = useRef(0)

  const append = useCallback((kind: string, text: string) => {
    logIdRef.current += 1
    setLog((current) => [...current, { id: logIdRef.current, kind, text }])
  }, [])

  useEffect(() => {
    if (!isConnected) {
      setModels([])
      return
    }
    let cancelled = false
    void connector.listModels().then(
      (available) => {
        if (cancelled) return
        setModels(available)
        setModel((current) => current || available[0]?.id || '')
      },
      (listError: unknown) => {
        if (!cancelled) setError(listError instanceof Error ? listError.message : String(listError))
      },
    )
    return () => { cancelled = true }
  }, [connector, isConnected])

  const selectedModel = models.find((item) => item.id === model)
  const efforts = selectedModel?.supportedReasoningEfforts ?? []

  const handleEvent = useCallback((event: CodexRunEvent) => {
    if (event.type === 'text-delta') setAnswer((current) => current + event.delta)
    else if (event.type === 'reasoning-delta') setReasoning((current) => current + event.delta)
    else if (event.type === 'segment-end' && event.source === 'reasoning') {
      setReasoning((current) => `${current}\n\n`)
    } else if (event.type === 'tool-call') {
      append('tool', `${event.name}(${JSON.stringify(event.arguments)})`)
    } else if (event.type === 'tool-result') {
      append(event.success ? 'ok' : 'fail', `${event.name} → ${event.success ? 'ok' : 'failed'}`)
    } else if (event.type === 'status') append('status', event.message)
    else if (event.type === 'account') append('status', `ChatGPT ${event.account.planType}`)
  }, [append])

  const run = async () => {
    if (!prompt.trim() || !model) return
    const controller = new AbortController()
    abortRef.current = controller
    setIsRunning(true)
    setAnswer('')
    setReasoning('')
    setError(null)
    setLog([])
    try {
      await connector.run({
        model,
        input: prompt,
        ...(efforts.length === 0 || efforts.includes(effort) ? { reasoningEffort: effort } : {}),
        tools: board.tools,
        developerInstructions:
          'You are managing a sticky-note board in a demo app. Prefer calling list_notes before deleting or editing anything. Keep your final reply to one short sentence.',
        signal: controller.signal,
        onEvent: handleEvent,
      })
    } catch (runError) {
      const isAbort = runError instanceof DOMException && runError.name === 'AbortError'
      setError(isAbort ? 'Cancelled.' : runError instanceof Error ? runError.message : String(runError))
    } finally {
      abortRef.current = null
      setIsRunning(false)
    }
  }

  return (
    <main>
      <header className="site">
        <h1>Codex Connector demo</h1>
        <p className="muted">
          A test page for the loopback bridge. Everything runs on your machine, on your own ChatGPT plan.
        </p>
      </header>

      <ConnectPanel
        status={status}
        setup={setup}
        onCreateSetup={() => createSetup()}
        onCheckConnection={() => void checkConnection()}
        onDisconnect={disconnect}
      />

      <section className="panel">
        <header className="panel__head">
          <h2>Ask Codex</h2>
          {isRunning && (
            <button type="button" className="ghost" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          )}
        </header>

        {!isConnected
          ? <p className="muted">Connect above to enable this.</p>
          : (
              <>
                <div className="row">
                  <label>
                    Model
                    <select value={model} onChange={(event) => setModel(event.target.value)}>
                      {models.map((item) => (
                        <option key={item.id} value={item.id}>{item.displayName}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Effort
                    <select
                      value={effort}
                      onChange={(event) => setEffort(event.target.value as ReasoningEffort)}
                    >
                      {(efforts.length > 0 ? efforts : ['low', 'medium', 'high']).map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <textarea
                  value={prompt}
                  rows={3}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Tell Codex what to do with the board…"
                />

                <div className="row wrap">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      className="chip"
                      onClick={() => setPrompt(example)}
                    >
                      {example.length > 42 ? `${example.slice(0, 42)}…` : example}
                    </button>
                  ))}
                </div>

                <div className="row">
                  <button type="button" onClick={() => void run()} disabled={isRunning || !prompt.trim()}>
                    {isRunning ? 'Running…' : 'Run'}
                  </button>
                  <button type="button" className="ghost" onClick={board.reset} disabled={isRunning}>
                    Clear board
                  </button>
                </div>

                {error && <p className="notice notice--error">{error}</p>}
                {reasoning.trim() && (
                  <details className="reasoning" open>
                    <summary>Reasoning</summary>
                    <pre>{reasoning.trim()}</pre>
                  </details>
                )}
                {answer.trim() && <p className="answer">{answer.trim()}</p>}
                {log.length > 0 && (
                  <ul className="log">
                    {log.map((entry) => (
                      <li key={entry.id} className={`log__${entry.kind}`}>
                        <code>{entry.text}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
      </section>

      <section className="panel">
        <header className="panel__head">
          <h2>{board.title}</h2>
          <span className="muted small">{board.notes.length} notes</span>
        </header>
        {board.notes.length === 0
          ? <p className="muted">Empty. Ask Codex to add a note; tools run right here in the browser.</p>
          : (
              <ul className="notes">
                {board.notes.map((note) => (
                  <li key={note.id} className={`note note--${note.color}`}>
                    <span>{note.text}</span>
                    <code>{note.id}</code>
                  </li>
                ))}
              </ul>
            )}
      </section>
    </main>
  )
}
