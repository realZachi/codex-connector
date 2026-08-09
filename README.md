# codex-connector

Let your users bring their own ChatGPT plan to your web app.

Your users already pay for ChatGPT. If they have Codex installed, this package lets
them use that subscription inside your website — no API key, no proxy, no AI cost
on your side, and no prompt or user data passing through your servers.

```bash
bun add codex-connector   # or npm / pnpm
```

## How it works

The Codex CLI ships a local **App Server** that speaks JSON-RPC and owns the
user's ChatGPT authentication. Browsers cannot talk to it directly, so this
package ships a small **bridge**: a loopback HTTP server the user starts once,
paired to your origin only.

```
your website  ──HTTPS──▶  (nothing AI-related on your server)
     │
     └── fetch 127.0.0.1 ──▶ bridge ──stdio──▶ codex app-server ──▶ ChatGPT plan
                             (user's own machine)
```

The user never copies a token into your site. They run one prompt in ChatGPT,
Codex sets the bridge up, and they come back and click *Check connection*.

## Setup for developers

### 1. Serve the bridge from your own origin

The setup prompt tells Codex to download the bridge from **your** HTTPS origin, so
the user never fetches code from a third party.

With Vite:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { codexConnector } from 'codex-connector/vite'

export default defineConfig({
  plugins: [codexConnector()],
})
```

That serves `/codex/codex-connector-bridge.mjs` in dev and build, and defines
`__CODEX_BRIDGE_SHA256__` with its checksum.

Without Vite, copy the file into your static directory:

```bash
bunx codex-connector eject --out public/codex
# prints the SHA-256 to pass as bridgeSha256
```

### 2. Create a connector

```ts
import { createCodexConnector } from 'codex-connector'

export const codex = createCodexConnector({
  serviceId: 'acme-studio',   // stable, lowercase; scopes port + storage
  appName: 'Acme Studio',     // shown to the user inside ChatGPT
  bridgeSha256: __CODEX_BRIDGE_SHA256__,  // optional but recommended
})
```

`serviceId` is what keeps two connector-enabled sites apart: each gets its own
bridge process, its own port, its own config directory and its own pairing token.

### 3. Let the user connect

```tsx
import { useCodexConnector } from 'codex-connector/react'

const ConnectButton = () => {
  const { status, setup, createSetup, checkConnection } = useCodexConnector({
    serviceId: 'acme-studio',
    appName: 'Acme Studio',
  })

  if (status.state === 'connected') return <p>Connected · ChatGPT {status.planType}</p>
  if (!setup) return <button onClick={() => createSetup()}>Use my ChatGPT plan</button>

  return (
    <>
      <a href={setup.desktopDeepLink}>Open in ChatGPT</a>
      <button onClick={() => navigator.clipboard.writeText(setup.prompt)}>Copy prompt</button>
      <button onClick={() => void checkConnection()}>Check connection</button>
      {status.state !== 'checking' && 'message' in status && <p>{status.message}</p>}
    </>
  )
}
```

`setup.desktopDeepLink` opens the prompt prefilled in the ChatGPT desktop app.
`setup.prompt` is the copy-paste fallback, and `setup.cliCommand` is a
single-quoted one-liner for terminal users. Bring your own UI — the hook only
carries state.

There is no React requirement: `createCodexConnector` works in any framework.

### 4. Run a turn

```ts
const models = await codex.listModels()

const { text } = await codex.run({
  model: models[0].id,
  input: 'Summarise the current board in one sentence.',
  reasoningEffort: 'low',
  tools: {
    read_board: {
      description: 'Read the notes currently on the board',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => ({ notes: store.getNotes() }),
    },
    add_note: {
      description: 'Add a note to the board',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
      execute: ({ text }) => {
        store.addNote(text)
        return { ok: true }
      },
    },
  },
  onEvent: (event) => {
    if (event.type === 'reasoning-delta') showThinking(event.delta)
    if (event.type === 'text-delta') showAnswer(event.delta)
    if (event.type === 'tool-call') showActivity(event.name)
  },
})
```

Tools run **in the browser**, so they can touch your app state directly. Codex
gets no shell, filesystem, network or MCP access through this connector.

Return a string, any JSON-serialisable value, or mixed content including images:

```ts
execute: async () => ({
  content: [
    { type: 'text', text: 'Current canvas:' },
    { type: 'image', dataUrl: await captureCanvas() },
  ],
})
```

Pass `signal` to cancel; the connector interrupts the turn and deletes the thread.

## Models

Call `listModels()` instead of hard-coding an id: availability depends on the
user's plan. Note that the list reflects the user's **local Codex configuration**,
so it can include non-OpenAI providers they configured themselves. Filter to what
your product supports:

```ts
const models = (await codex.listModels()).filter((model) => model.id.startsWith('gpt-'))
```

`supportedReasoningEfforts` differs per model, so read it rather than assuming.

## What the user experiences

1. Clicks *Use my ChatGPT plan* in your app.
2. Clicks *Open in ChatGPT* — the setup prompt is already filled in; they press Send.
3. Codex downloads the bridge from your origin, reviews it, and starts it.
4. They return and click *Check connection*.

Requirements on their machine: the Codex CLI, signed in with ChatGPT
(`codex login`), plus Node or Bun. Pairing persists in `localStorage`; the bridge
keeps running until they stop it or reboot. To stop it:

```bash
node ~/.local/share/codex-connector-bridge/<serviceId>/codex-connector-bridge.mjs stop --service-id <serviceId>
```

## Status handling

| `status.state` | Meaning |
| --- | --- |
| `notPaired` | No pairing yet — show *Use my ChatGPT plan* |
| `checking` | Probing the bridge |
| `offline` | Not paired successfully or bridge not running — show the setup prompt |
| `signedOut` | Codex installed but not signed in (`codex login`) |
| `apiKey` | Codex is on an API key, not a ChatGPT plan |
| `unsupported` | Account could not be verified |
| `connected` | Ready; `planType` and `email` available |

## Security

Read [SECURITY.md](SECURITY.md) before shipping. In short: the bridge binds
`127.0.0.1` only, serves exactly one origin, requires a 256-bit bearer token,
allowlists seven RPC methods, forces an empty read-only workspace with approvals
and network access off, and never reads or forwards ChatGPT credentials.

Your app needs HTTPS to pair (loopback origins are allowed for local dev).

## API

- `createCodexConnector(config)` → `getConnection`, `createSetup`, `getSetup`,
  `checkConnection`, `disconnect`, `listModels`, `run`
- `useCodexConnector(config)` from `codex-connector/react`
- `codexConnector(options)` from `codex-connector/vite`
- Lower level: `CodexConnectorClient`, `runCodexTurn`, `listCodexModels`,
  `readCodexAccount`, `buildSetupPrompt`, `buildDesktopDeepLink`, `buildCliCommand`

## License

MIT
