<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { createCodexConnectorStore } from 'codex-connector/svelte'
  import type { CodexModel, CodexRunEvent, ReasoningEffort } from 'codex-connector'
  import {
    APP_NAME,
    EXAMPLES,
    STATUS_LABEL,
    createBoardTools,
    shortExample,
    type LogEntry,
    type Note,
  } from '../../../shared/demo'

  const codexStore = createCodexConnectorStore({
    serviceId: 'codex-connector-demo-sveltekit',
    appName: `${APP_NAME} · SvelteKit`,
  })

  let title = 'Untitled board'
  let notes: Note[] = []
  let models: CodexModel[] = []
  let model = ''
  let effort: ReasoningEffort = 'low'
  let prompt: string = EXAMPLES[0]
  let isRunning = false
  let answer = ''
  let reasoning = ''
  let error: string | null = null
  let log: LogEntry[] = []
  let showPrompt = false
  let copied = ''
  let abortController: AbortController | null = null
  let logId = 0

  $: selectedModel = models.find((item) => item.id === model)
  $: efforts = selectedModel?.supportedReasoningEfforts ?? []
  $: statusMessage = 'message' in $codexStore.status ? $codexStore.status.message : null

  const tools = createBoardTools({
    getNotes: () => notes,
    addNote: (note) => {
      notes = [...notes, note]
      return notes.length
    },
    deleteNote: (id) => {
      const exists = notes.some((note) => note.id === id)
      if (exists) notes = notes.filter((note) => note.id !== id)
      return exists
    },
    setTitle: (next) => { title = next },
  })

  const loadModels = async () => {
    try {
      const available = await codexStore.connector.listModels()
      models = available
      model ||= available[0]?.id ?? ''
    } catch (listError) {
      error = listError instanceof Error ? listError.message : String(listError)
    }
  }

  onMount(() => {
    let connected = false
    return codexStore.subscribe((snapshot) => {
      if (snapshot.isConnected && !connected) void loadModels()
      if (!snapshot.isConnected) {
        models = []
        model = ''
      }
      connected = snapshot.isConnected
    })
  })

  onDestroy(() => abortController?.abort())

  const append = (kind: string, text: string) => {
    logId += 1
    log = [...log, { id: logId, kind, text }]
  }

  const handleEvent = (event: CodexRunEvent) => {
    if (event.type === 'text-delta') answer += event.delta
    else if (event.type === 'reasoning-delta') reasoning += event.delta
    else if (event.type === 'segment-end' && event.source === 'reasoning') reasoning += '\n\n'
    else if (event.type === 'tool-call') append('tool', `${event.name}(${JSON.stringify(event.arguments)})`)
    else if (event.type === 'tool-result') append(event.success ? 'ok' : 'fail', `${event.name} → ${event.success ? 'ok' : 'failed'}`)
    else if (event.type === 'status') append('status', event.message)
    else if (event.type === 'account') append('status', `ChatGPT ${event.account.planType}`)
  }

  const run = async () => {
    if (!prompt.trim() || !model) return
    const controller = new AbortController()
    abortController = controller
    isRunning = true
    answer = ''
    reasoning = ''
    error = null
    log = []
    try {
      await codexStore.connector.run({
        model,
        input: prompt,
        ...(efforts.length === 0 || efforts.includes(effort) ? { reasoningEffort: effort } : {}),
        tools,
        developerInstructions:
          'You are managing a sticky-note board in a demo app. Prefer calling list_notes before deleting or editing anything. Keep your final reply to one short sentence.',
        signal: controller.signal,
        onEvent: handleEvent,
      })
    } catch (runError) {
      const isAbort = runError instanceof DOMException && runError.name === 'AbortError'
      error = isAbort ? 'Cancelled.' : runError instanceof Error ? runError.message : String(runError)
    } finally {
      abortController = null
      isRunning = false
    }
  }

  const resetBoard = () => {
    notes = []
    title = 'Untitled board'
  }

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value)
      copied = key
      setTimeout(() => { if (copied === key) copied = '' }, 1500)
    } catch {
      copied = ''
    }
  }
</script>

<svelte:head><title>Codex Connector demo · SvelteKit</title></svelte:head>

<main>
  <header class="site">
    <h1>Codex Connector demo</h1>
    <p class="muted">A real SvelteKit example. Everything runs locally, on your own ChatGPT plan.</p>
  </header>

  <section class="panel">
    <header class="panel__head">
      <h2>Your ChatGPT plan</h2>
      <span class={`badge badge--${$codexStore.status.state}`}>{STATUS_LABEL[$codexStore.status.state] ?? $codexStore.status.state}</span>
    </header>

    {#if $codexStore.status.state === 'connected'}
      <p class="muted">ChatGPT {$codexStore.status.planType}{$codexStore.status.email ? ` · ${$codexStore.status.email}` : ''}</p>
      <div class="row">
        <button type="button" on:click={() => void codexStore.checkConnection()}>Re-check</button>
        <button type="button" class="ghost" on:click={codexStore.disconnect}>Disconnect</button>
      </div>
    {:else}
      <ol class="steps">
        <li>Create the setup prompt.</li>
        <li>Open it in ChatGPT and press Send. Codex starts the local connector.</li>
        <li>Come back and check the connection.</li>
      </ol>
      {#if !$codexStore.setup}
        <button type="button" on:click={() => codexStore.createSetup()}>Use my ChatGPT plan</button>
      {:else}
        <div class="row wrap">
          <a class="button" href={$codexStore.setup.desktopDeepLink}>Open in ChatGPT</a>
          <button type="button" on:click={() => void copy($codexStore.setup?.prompt ?? '', 'prompt')}>{copied === 'prompt' ? 'Copied' : 'Copy prompt'}</button>
          <button type="button" on:click={() => void copy($codexStore.setup?.cliCommand ?? '', 'cli')}>{copied === 'cli' ? 'Copied' : 'Copy CLI command'}</button>
          <button type="button" class="ghost" on:click={() => showPrompt = !showPrompt}>{showPrompt ? 'Hide prompt' : 'Show prompt'}</button>
        </div>
        {#if showPrompt}<pre class="prompt">{$codexStore.setup.prompt}</pre>{/if}
        <div class="row">
          <button type="button" disabled={$codexStore.status.state === 'checking'} on:click={() => void codexStore.checkConnection()}>
            {$codexStore.status.state === 'checking' ? 'Checking…' : 'Check connection'}
          </button>
          <button type="button" class="ghost" on:click={codexStore.disconnect}>Reset pairing</button>
        </div>
        <p class="muted small">ChatGPT didn’t open? Copy the prompt into Codex, or use the CLI command.</p>
      {/if}
    {/if}
    {#if statusMessage}<p class="notice">{statusMessage}</p>{/if}
  </section>

  <section class="panel">
    <header class="panel__head">
      <h2>Ask Codex</h2>
      {#if isRunning}<button type="button" class="ghost" on:click={() => abortController?.abort()}>Cancel</button>{/if}
    </header>
    {#if !$codexStore.isConnected}
      <p class="muted">Connect above to enable this.</p>
    {:else}
      <div class="row">
        <label>Model<select bind:value={model}>{#each models as item}<option value={item.id}>{item.displayName}</option>{/each}</select></label>
        <label>Effort<select bind:value={effort}>{#each efforts.length ? efforts : ['low', 'medium', 'high'] as item}<option value={item}>{item}</option>{/each}</select></label>
      </div>
      <textarea bind:value={prompt} rows="3" placeholder="Tell Codex what to do with the board…"></textarea>
      <div class="row wrap">
        {#each EXAMPLES as item}<button type="button" class="chip" on:click={() => prompt = item}>{shortExample(item)}</button>{/each}
      </div>
      <div class="row">
        <button type="button" disabled={isRunning || !prompt.trim()} on:click={() => void run()}>{isRunning ? 'Running…' : 'Run'}</button>
        <button type="button" class="ghost" disabled={isRunning} on:click={resetBoard}>Clear board</button>
      </div>
      {#if error}<p class="notice notice--error">{error}</p>{/if}
      {#if reasoning.trim()}<details class="reasoning" open><summary>Reasoning</summary><pre>{reasoning.trim()}</pre></details>{/if}
      {#if answer.trim()}<p class="answer">{answer.trim()}</p>{/if}
      {#if log.length}<ul class="log">{#each log as entry}<li class={`log__${entry.kind}`}><code>{entry.text}</code></li>{/each}</ul>{/if}
    {/if}
  </section>

  <section class="panel">
    <header class="panel__head"><h2>{title}</h2><span class="muted small">{notes.length} notes</span></header>
    {#if notes.length === 0}
      <p class="muted">Empty. Ask Codex to add a note; tools run right here in the browser.</p>
    {:else}
      <ul class="notes">{#each notes as note (note.id)}<li class={`note note--${note.color}`}><span>{note.text}</span><code>{note.id}</code></li>{/each}</ul>
    {/if}
  </section>
</main>
