import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { createCodexConnector } from 'codex-connector/solid'
import type { CodexModel, CodexRunEvent, ReasoningEffort } from 'codex-connector'
import {
  APP_NAME,
  EXAMPLES,
  STATUS_LABEL,
  createBoardTools,
  shortExample,
  type LogEntry,
  type Note,
} from '../../shared/demo'
import '../../../example/src/styles.css'

const CopyButton = (props: { value: string; label: string }) => {
  const [copied, setCopied] = createSignal(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return <button type="button" onClick={() => void copy()}>{copied() ? 'Copied' : props.label}</button>
}

export default function App() {
  const codex = createCodexConnector({
    serviceId: 'codex-connector-demo-solid-start',
    appName: `${APP_NAME} · SolidStart`,
  })

  const [title, setTitle] = createSignal('Untitled board')
  const [notes, setNotes] = createSignal<Note[]>([])
  const [models, setModels] = createSignal<CodexModel[]>([])
  const [model, setModel] = createSignal('')
  const [effort, setEffort] = createSignal<ReasoningEffort>('low')
  const [prompt, setPrompt] = createSignal<string>(EXAMPLES[0])
  const [isRunning, setIsRunning] = createSignal(false)
  const [answer, setAnswer] = createSignal('')
  const [reasoning, setReasoning] = createSignal('')
  const [error, setError] = createSignal<string | null>(null)
  const [log, setLog] = createSignal<LogEntry[]>([])
  const [showPrompt, setShowPrompt] = createSignal(false)
  let abortController: AbortController | null = null
  let logId = 0

  const tools = createBoardTools({
    getNotes: notes,
    addNote: (note) => {
      const next = [...notes(), note]
      setNotes(next)
      return next.length
    },
    deleteNote: (id) => {
      const exists = notes().some((note) => note.id === id)
      if (exists) setNotes((current) => current.filter((note) => note.id !== id))
      return exists
    },
    setTitle,
  })

  const selectedModel = createMemo(() => models().find((item) => item.id === model()))
  const efforts = createMemo(() => selectedModel()?.supportedReasoningEfforts ?? [])
  const statusMessage = createMemo(() => {
    const current = codex.status()
    return 'message' in current ? current.message : null
  })

  createEffect(() => {
    if (!codex.isConnected()) {
      setModels([])
      setModel('')
      return
    }
    let cancelled = false
    onCleanup(() => { cancelled = true })
    void codex.connector.listModels().then(
      (available) => {
        if (cancelled) return
        setModels(available)
        setModel((current) => current || available[0]?.id || '')
      },
      (listError: unknown) => {
        if (!cancelled) setError(listError instanceof Error ? listError.message : String(listError))
      },
    )
  })

  onCleanup(() => abortController?.abort())

  const append = (kind: string, text: string) => {
    logId += 1
    setLog((current) => [...current, { id: logId, kind, text }])
  }

  const handleEvent = (event: CodexRunEvent) => {
    if (event.type === 'text-delta') setAnswer((current) => current + event.delta)
    else if (event.type === 'reasoning-delta') setReasoning((current) => current + event.delta)
    else if (event.type === 'segment-end' && event.source === 'reasoning') {
      setReasoning((current) => `${current}\n\n`)
    } else if (event.type === 'tool-call') append('tool', `${event.name}(${JSON.stringify(event.arguments)})`)
    else if (event.type === 'tool-result') append(event.success ? 'ok' : 'fail', `${event.name} → ${event.success ? 'ok' : 'failed'}`)
    else if (event.type === 'status') append('status', event.message)
    else if (event.type === 'account') append('status', `ChatGPT ${event.account.planType}`)
  }

  const run = async () => {
    if (!prompt().trim() || !model()) return
    const controller = new AbortController()
    abortController = controller
    setIsRunning(true)
    setAnswer('')
    setReasoning('')
    setError(null)
    setLog([])
    try {
      await codex.connector.run({
        model: model(),
        input: prompt(),
        ...(efforts().length === 0 || efforts().includes(effort())
          ? { reasoningEffort: effort() }
          : {}),
        tools,
        developerInstructions:
          'You are managing a sticky-note board in a demo app. Prefer calling list_notes before deleting or editing anything. Keep your final reply to one short sentence.',
        signal: controller.signal,
        onEvent: handleEvent,
      })
    } catch (runError) {
      const isAbort = runError instanceof DOMException && runError.name === 'AbortError'
      setError(isAbort ? 'Cancelled.' : runError instanceof Error ? runError.message : String(runError))
    } finally {
      abortController = null
      setIsRunning(false)
    }
  }

  const resetBoard = () => {
    setNotes([])
    setTitle('Untitled board')
  }

  return (
    <main>
      <header class="site">
        <h1>Codex Connector demo</h1>
        <p class="muted">A real SolidStart example. Everything runs locally, on your own ChatGPT plan.</p>
      </header>

      <section class="panel">
        <header class="panel__head">
          <h2>Your ChatGPT plan</h2>
          <span class={`badge badge--${codex.status().state}`}>
            {STATUS_LABEL[codex.status().state] ?? codex.status().state}
          </span>
        </header>

        <Show
          when={codex.status().state === 'connected' ? codex.status() : null}
          fallback={
            <>
              <ol class="steps">
                <li>Create the setup prompt.</li>
                <li>Open it in ChatGPT and press Send. Codex starts the local connector.</li>
                <li>Come back and check the connection.</li>
              </ol>
              <Show
                when={codex.setup()}
                fallback={<button type="button" onClick={() => codex.createSetup()}>Use my ChatGPT plan</button>}
              >
                {(setup) => (
                  <>
                    <div class="row wrap">
                      <a class="button" href={setup().desktopDeepLink}>Open in ChatGPT</a>
                      <CopyButton value={setup().prompt} label="Copy prompt" />
                      <CopyButton value={setup().cliCommand} label="Copy CLI command" />
                      <button type="button" class="ghost" onClick={() => setShowPrompt((current) => !current)}>
                        {showPrompt() ? 'Hide prompt' : 'Show prompt'}
                      </button>
                    </div>
                    <Show when={showPrompt()}><pre class="prompt">{setup().prompt}</pre></Show>
                    <div class="row">
                      <button type="button" disabled={codex.isChecking()} onClick={() => void codex.checkConnection()}>
                        {codex.isChecking() ? 'Checking…' : 'Check connection'}
                      </button>
                      <button type="button" class="ghost" onClick={codex.disconnect}>Reset pairing</button>
                    </div>
                    <p class="muted small">ChatGPT didn’t open? Copy the prompt into Codex, or use the CLI command.</p>
                  </>
                )}
              </Show>
            </>
          }
        >
          {(connected) => {
            const current = connected()
            if (current.state !== 'connected') return null
            return (
              <>
                <p class="muted">ChatGPT {current.planType}{current.email ? ` · ${current.email}` : ''}</p>
                <div class="row">
                  <button type="button" onClick={() => void codex.checkConnection()}>Re-check</button>
                  <button type="button" class="ghost" onClick={codex.disconnect}>Disconnect</button>
                </div>
              </>
            )
          }}
        </Show>
        <Show when={statusMessage()}>{(message) => <p class="notice">{message()}</p>}</Show>
      </section>

      <section class="panel">
        <header class="panel__head">
          <h2>Ask Codex</h2>
          <Show when={isRunning()}><button type="button" class="ghost" onClick={() => abortController?.abort()}>Cancel</button></Show>
        </header>
        <Show when={codex.isConnected()} fallback={<p class="muted">Connect above to enable this.</p>}>
          <div class="row">
            <label>Model<select value={model()} onChange={(event) => setModel(event.currentTarget.value)}><For each={models()}>{(item) => <option value={item.id}>{item.displayName}</option>}</For></select></label>
            <label>Effort<select value={effort()} onChange={(event) => setEffort(event.currentTarget.value as ReasoningEffort)}><For each={efforts().length ? efforts() : ['low', 'medium', 'high'] as const}>{(item) => <option value={item}>{item}</option>}</For></select></label>
          </div>
          <textarea value={prompt()} rows={3} onInput={(event) => setPrompt(event.currentTarget.value)} placeholder="Tell Codex what to do with the board…" />
          <div class="row wrap"><For each={EXAMPLES}>{(item) => <button type="button" class="chip" onClick={() => setPrompt(item)}>{shortExample(item)}</button>}</For></div>
          <div class="row">
            <button type="button" disabled={isRunning() || !prompt().trim()} onClick={() => void run()}>{isRunning() ? 'Running…' : 'Run'}</button>
            <button type="button" class="ghost" disabled={isRunning()} onClick={resetBoard}>Clear board</button>
          </div>
          <Show when={error()}>{(message) => <p class="notice notice--error">{message()}</p>}</Show>
          <Show when={reasoning().trim()}>{(text) => <details class="reasoning" open><summary>Reasoning</summary><pre>{text()}</pre></details>}</Show>
          <Show when={answer().trim()}>{(text) => <p class="answer">{text()}</p>}</Show>
          <Show when={log().length}><ul class="log"><For each={log()}>{(entry) => <li class={`log__${entry.kind}`}><code>{entry.text}</code></li>}</For></ul></Show>
        </Show>
      </section>

      <section class="panel">
        <header class="panel__head"><h2>{title()}</h2><span class="muted small">{notes().length} notes</span></header>
        <Show when={notes().length} fallback={<p class="muted">Empty. Ask Codex to add a note; tools run right here in the browser.</p>}>
          <ul class="notes"><For each={notes()}>{(note) => <li class={`note note--${note.color}`}><span>{note.text}</span><code>{note.id}</code></li>}</For></ul>
        </Show>
      </section>
    </main>
  )
}
