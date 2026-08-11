<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useCodexConnector } from 'codex-connector/vue'
import type { CodexModel, CodexRunEvent, ReasoningEffort } from 'codex-connector'
import {
  APP_NAME,
  EXAMPLES,
  STATUS_LABEL,
  createBoardTools,
  shortExample,
  type LogEntry,
  type Note,
} from '../shared/demo'

const {
  connector,
  status,
  isConnected,
  setup,
  createSetup,
  checkConnection,
  disconnect,
} = useCodexConnector({
  serviceId: 'codex-connector-demo-nuxt',
  appName: `${APP_NAME} · Nuxt`,
})

const title = ref('Untitled board')
const notes = ref<Note[]>([])
const models = ref<CodexModel[]>([])
const model = ref('')
const effort = ref<ReasoningEffort>('low')
const prompt = ref(EXAMPLES[0])
const isRunning = ref(false)
const answer = ref('')
const reasoning = ref('')
const error = ref<string | null>(null)
const log = ref<LogEntry[]>([])
const showPrompt = ref(false)
const copied = ref('')
let abortController: AbortController | null = null
let logId = 0

const tools = createBoardTools({
  getNotes: () => notes.value,
  addNote: (note) => {
    notes.value = [...notes.value, note]
    return notes.value.length
  },
  deleteNote: (id) => {
    const exists = notes.value.some((note) => note.id === id)
    if (exists) notes.value = notes.value.filter((note) => note.id !== id)
    return exists
  },
  setTitle: (next) => { title.value = next },
})

const selectedModel = computed(() => models.value.find((item) => item.id === model.value))
const efforts = computed(() => selectedModel.value?.supportedReasoningEfforts ?? [])
const statusMessage = computed(() => 'message' in status.value ? status.value.message : null)

watch(isConnected, (connected, _previous, onCleanup) => {
  if (!connected) {
    models.value = []
    model.value = ''
    return
  }
  let cancelled = false
  onCleanup(() => { cancelled = true })
  void connector.listModels().then(
    (available) => {
      if (cancelled) return
      models.value = available
      model.value ||= available[0]?.id ?? ''
    },
    (listError: unknown) => {
      if (!cancelled) error.value = listError instanceof Error ? listError.message : String(listError)
    },
  )
}, { immediate: true })

onBeforeUnmount(() => abortController?.abort())

const append = (kind: string, text: string) => {
  logId += 1
  log.value = [...log.value, { id: logId, kind, text }]
}

const handleEvent = (event: CodexRunEvent) => {
  if (event.type === 'text-delta') answer.value += event.delta
  else if (event.type === 'reasoning-delta') reasoning.value += event.delta
  else if (event.type === 'segment-end' && event.source === 'reasoning') reasoning.value += '\n\n'
  else if (event.type === 'tool-call') append('tool', `${event.name}(${JSON.stringify(event.arguments)})`)
  else if (event.type === 'tool-result') append(event.success ? 'ok' : 'fail', `${event.name} → ${event.success ? 'ok' : 'failed'}`)
  else if (event.type === 'status') append('status', event.message)
  else if (event.type === 'account') append('status', `ChatGPT ${event.account.planType}`)
}

const run = async () => {
  if (!prompt.value.trim() || !model.value) return
  const controller = new AbortController()
  abortController = controller
  isRunning.value = true
  answer.value = ''
  reasoning.value = ''
  error.value = null
  log.value = []
  try {
    await connector.run({
      model: model.value,
      input: prompt.value,
      ...(efforts.value.length === 0 || efforts.value.includes(effort.value)
        ? { reasoningEffort: effort.value }
        : {}),
      tools,
      developerInstructions:
        'You are managing a sticky-note board in a demo app. Prefer calling list_notes before deleting or editing anything. Keep your final reply to one short sentence.',
      signal: controller.signal,
      onEvent: handleEvent,
    })
  } catch (runError) {
    const isAbort = runError instanceof DOMException && runError.name === 'AbortError'
    error.value = isAbort
      ? 'Cancelled.'
      : runError instanceof Error ? runError.message : String(runError)
  } finally {
    abortController = null
    isRunning.value = false
  }
}

const resetBoard = () => {
  notes.value = []
  title.value = 'Untitled board'
}

const copy = async (value: string, key: string) => {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = key
    setTimeout(() => { if (copied.value === key) copied.value = '' }, 1500)
  } catch {
    copied.value = ''
  }
}
</script>

<template>
  <main>
    <header class="site">
      <h1>Codex Connector demo</h1>
      <p class="muted">A real Nuxt + Vue example. Everything runs locally, on your own ChatGPT plan.</p>
    </header>

    <section class="panel">
      <header class="panel__head">
        <h2>Your ChatGPT plan</h2>
        <span :class="`badge badge--${status.state}`">{{ STATUS_LABEL[status.state] ?? status.state }}</span>
      </header>

      <template v-if="status.state === 'connected'">
        <p class="muted">ChatGPT {{ status.planType }}{{ status.email ? ` · ${status.email}` : '' }}</p>
        <div class="row">
          <button type="button" @click="checkConnection">Re-check</button>
          <button type="button" class="ghost" @click="disconnect">Disconnect</button>
        </div>
      </template>
      <template v-else>
        <ol class="steps">
          <li>Create the setup prompt.</li>
          <li>Open it in ChatGPT and press Send. Codex starts the local connector.</li>
          <li>Come back and check the connection.</li>
        </ol>
        <button v-if="!setup" type="button" @click="createSetup()">Use my ChatGPT plan</button>
        <template v-else>
          <div class="row wrap">
            <a class="button" :href="setup.desktopDeepLink">Open in ChatGPT</a>
            <button type="button" @click="copy(setup.prompt, 'prompt')">{{ copied === 'prompt' ? 'Copied' : 'Copy prompt' }}</button>
            <button type="button" @click="copy(setup.cliCommand, 'cli')">{{ copied === 'cli' ? 'Copied' : 'Copy CLI command' }}</button>
            <button type="button" class="ghost" @click="showPrompt = !showPrompt">{{ showPrompt ? 'Hide prompt' : 'Show prompt' }}</button>
          </div>
          <pre v-if="showPrompt" class="prompt">{{ setup.prompt }}</pre>
          <div class="row">
            <button type="button" :disabled="status.state === 'checking'" @click="checkConnection">
              {{ status.state === 'checking' ? 'Checking…' : 'Check connection' }}
            </button>
            <button type="button" class="ghost" @click="disconnect">Reset pairing</button>
          </div>
          <p class="muted small">ChatGPT didn’t open? Copy the prompt into Codex, or use the CLI command.</p>
        </template>
      </template>
      <p v-if="statusMessage" class="notice">{{ statusMessage }}</p>
    </section>

    <section class="panel">
      <header class="panel__head">
        <h2>Ask Codex</h2>
        <button v-if="isRunning" type="button" class="ghost" @click="abortController?.abort()">Cancel</button>
      </header>
      <p v-if="!isConnected" class="muted">Connect above to enable this.</p>
      <template v-else>
        <div class="row">
          <label>Model<select v-model="model"><option v-for="item in models" :key="item.id" :value="item.id">{{ item.displayName }}</option></select></label>
          <label>Effort<select v-model="effort"><option v-for="item in efforts.length ? efforts : ['low', 'medium', 'high']" :key="item" :value="item">{{ item }}</option></select></label>
        </div>
        <textarea v-model="prompt" rows="3" placeholder="Tell Codex what to do with the board…" />
        <div class="row wrap">
          <button v-for="item in EXAMPLES" :key="item" type="button" class="chip" @click="prompt = item">{{ shortExample(item) }}</button>
        </div>
        <div class="row">
          <button type="button" :disabled="isRunning || !prompt.trim()" @click="run">{{ isRunning ? 'Running…' : 'Run' }}</button>
          <button type="button" class="ghost" :disabled="isRunning" @click="resetBoard">Clear board</button>
        </div>
        <p v-if="error" class="notice notice--error">{{ error }}</p>
        <details v-if="reasoning.trim()" class="reasoning" open><summary>Reasoning</summary><pre>{{ reasoning.trim() }}</pre></details>
        <p v-if="answer.trim()" class="answer">{{ answer.trim() }}</p>
        <ul v-if="log.length" class="log">
          <li v-for="entry in log" :key="entry.id" :class="`log__${entry.kind}`"><code>{{ entry.text }}</code></li>
        </ul>
      </template>
    </section>

    <section class="panel">
      <header class="panel__head"><h2>{{ title }}</h2><span class="muted small">{{ notes.length }} notes</span></header>
      <p v-if="notes.length === 0" class="muted">Empty. Ask Codex to add a note; tools run right here in the browser.</p>
      <ul v-else class="notes">
        <li v-for="note in notes" :key="note.id" :class="`note note--${note.color}`"><span>{{ note.text }}</span><code>{{ note.id }}</code></li>
      </ul>
    </section>
  </main>
</template>
