# codex-connector

**Let your users bring their own ChatGPT plan to your web app.**

Your users already pay for ChatGPT. If they have [Codex](https://openai.com/codex) installed, this package lets them use that subscription inside your website — no API key, no proxy, no AI cost on your side, and no prompt or user data passing through your servers.

[![npm](https://img.shields.io/npm/v/codex-connector?style=flat-square)](https://www.npmjs.com/package/codex-connector)
[![license](https://img.shields.io/npm/l/codex-connector?style=flat-square)](LICENSE)
[![node](https://img.shields.io/node/v/codex-connector?style=flat-square)](package.json)
[![compat](https://img.shields.io/github/actions/workflow/status/realZachi/codex-connector/compat.yml?branch=main&label=compat&style=flat-square)](https://github.com/realZachi/codex-connector/actions/workflows/compat.yml)

```bash
bun add codex-connector   # or npm / pnpm / yarn
```

![Codex Connector Studio demo showing a user connecting their ChatGPT plan and using Codex inside a web app](.github/assets/codex-connector-demo.gif)

_The complete user flow: pair a ChatGPT plan, verify the local bridge, and let Codex act on live browser state._

**[Try the live demo →](https://realzachi.github.io/codex-connector-studio/)**

---

## Why this exists

Most “AI in the browser” setups mean **you** hold the API key and pay for every turn. That gets expensive, leaks prompts through your backend, and forces users onto *your* billing.

**codex-connector flips the model:** the user connects their own ChatGPT + Codex setup. You ship product UI and tools; they bring the model access.

| You get | Users keep |
| --- | --- |
| Zero AI API cost | Their ChatGPT subscription |
| No keys or proxy to operate | Auth on their machine |
| Tools that run in *your* app state | Full control over when to connect |
| Prompt traffic that never hits your servers | Credentials that never leave Codex |

## Features

- **BYO plan, not BYO key** — users pair once; no secrets pasted into your site
- **Restricted localhost bridge** — loopback-only, origin-bound, token-authenticated RPC allowlist
- **First-class adapters** — Vite, Next.js, Nuxt inject bridge path + integrity hash
- **UI bindings** — React, Vue, Svelte, Solid hooks/stores on a shared controller
- **Browser-side tools** — call app state directly; Codex gets no shell, FS, or network via the connector
- **Framework recipes** — Astro, SvelteKit, React Router, SolidStart, Qwik, Angular
- **Security-first defaults** — empty read-only workspace, approvals off network, forced sandbox (see [SECURITY.md](SECURITY.md))

## How it works

The Codex CLI ships a local **App Server** (JSON-RPC + the user’s ChatGPT auth). Browsers cannot talk to it directly, so this package ships a small **bridge**: a loopback HTTP server the user starts once, paired to **your origin only**.

```
your website  ──HTTPS──▶  (nothing AI-related on your server)
     │
     └── fetch 127.0.0.1 ──▶ bridge ──stdio──▶ codex app-server ──▶ ChatGPT plan
                             (user's own machine)
```

The user never copies a token into your site. They run one prompt in ChatGPT, Codex sets the bridge up, and they come back and click *Check connection*.

With a first-class adapter you only configure `serviceId` and `appName`. Bridge path and SHA-256 are injected automatically.

## Quickstarts

Pick your bundler, then a UI binding. Every adapter serves the bridge from **your** origin and wires integrity into the browser core.

### Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { codexConnector } from 'codex-connector/vite'

export default defineConfig({
  plugins: [codexConnector()],
})
```

```ts
import { createCodexConnector } from 'codex-connector'

export const codex = createCodexConnector({
  serviceId: 'acme-studio',
  appName: 'Acme Studio',
})
```

### Next.js

```ts
// next.config.ts
import type { NextConfig } from 'next'
import { withCodexConnector } from 'codex-connector/next'

const nextConfig: NextConfig = {
  // your options
}

export default withCodexConnector(nextConfig)
```

```ts
import { createCodexConnector } from 'codex-connector'

export const codex = createCodexConnector({
  serviceId: 'acme-studio',
  appName: 'Acme Studio',
})
```

`basePath` is folded into the served bridge URL. With `output: 'standalone'`,
copy Next's `public/` folder into the deployment as usual so
`/codex/codex-connector-bridge.mjs` stays available.

### Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['codex-connector/nuxt'],
})
```

```ts
import { createCodexConnector } from 'codex-connector'

export const codex = createCodexConnector({
  serviceId: 'acme-studio',
  appName: 'Acme Studio',
})
```

`app.baseURL` is applied to the bridge path automatically.

### UI bindings

| Framework | Import | API |
| --- | --- | --- |
| React | `codex-connector/react` | `useCodexConnector(config)` |
| Vue | `codex-connector/vue` | `useCodexConnector(config)` (readonly refs) |
| Svelte | `codex-connector/svelte` | `createCodexConnectorStore(config)` |
| Solid | `codex-connector/solid` | `createCodexConnector(config)` |
| Any | `codex-connector` | `createCodexConnector` / `createCodexConnectorController` |

React example:

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
single-quoted one-liner for terminal users. Bring your own UI — bindings only
carry state.

### CLI fallback (no adapter)

For frameworks without a first-class adapter, or custom static hosting:

```bash
bunx codex-connector eject --out public/codex
# prints the SHA-256 — optional when using the default path + BUNDLED_BRIDGE_SHA256
```

```ts
import { BUNDLED_BRIDGE_SHA256, createCodexConnector } from 'codex-connector'

export const codex = createCodexConnector({
  serviceId: 'acme-studio',
  appName: 'Acme Studio',
  // Default path is /codex/codex-connector-bridge.mjs; bundled digest applies
  // automatically. Pass bridgeSha256 only for a custom/forked bridge file.
  bridgeSha256: BUNDLED_BRIDGE_SHA256,
})
```

### Other frameworks (recipes)

Tested recipes (Vite or Angular assets + CLI eject where needed) live under
[`docs/recipes/`](docs/recipes/):

- [Astro 7](docs/recipes/astro.md)
- [SvelteKit 2](docs/recipes/sveltekit.md)
- [React Router 8](docs/recipes/react-router.md)
- [SolidStart 2](docs/recipes/solid-start.md)
- [Qwik 1](docs/recipes/qwik.md)
- [Angular 22](docs/recipes/angular.md)

## Complete example apps

The Vite/React demo in [`example/`](example/) and the native apps under
[`examples/`](examples/) implement the same end-to-end sticky-note board:

- Next.js + React
- Nuxt + Vue
- SvelteKit + Svelte
- SolidStart + Solid

Each is independently installable and has a fixed loopback dev port, so you can
compare adapter and binding setup without losing functionality between
frameworks.

```bash
cd example && bun install && bun run dev   # http://127.0.0.1:4180
```

## Run a turn

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

Integrity uses the bundled digest (`BUNDLED_BRIDGE_SHA256`) or an adapter inject.
Your app needs HTTPS to pair (loopback origins are allowed for local dev).

## Compatibility

Tested matrix (see `bun run test:compat` and
[`.github/workflows/compat.yml`](.github/workflows/compat.yml)). Each entry is
installed in an isolated consumer project from the packed npm tarball; adapters
and recipe frameworks also produce a real production build:

| Layer | Versions |
| --- | --- |
| Vite | 7, 8 |
| Next.js | 15, 16 |
| Nuxt | 3, 4 |
| React | 18, 19 |
| Svelte | 4, 5 |
| Vue | 3 |
| Solid | 1 |

Recipe majors: Astro 7, SvelteKit 2, React Router 8, SolidStart 2, Qwik 1,
Angular 22.

## API

- `createCodexConnector(config)` → `getConnection`, `createSetup`, `getSetup`,
  `checkConnection`, `disconnect`, `listModels`, `run`
- `createCodexConnectorController(config)` — framework-neutral reactive store
- `BUNDLED_BRIDGE_SHA256`, `resolveBridgeConfig(input?)`
- Bindings: `codex-connector/react|vue|svelte|solid`
- Adapters: `codexConnector()` / `withCodexConnector()` /
  `modules: ['codex-connector/nuxt']`
- CLI: `bunx codex-connector eject|hash`
- Lower level: `CodexConnectorClient`, `runCodexTurn`, `listCodexModels`,
  `readCodexAccount`, `buildSetupPrompt`, `buildDesktopDeepLink`, `buildCliCommand`

## License

[MIT](LICENSE)
