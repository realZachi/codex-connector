# Qwik 1

Qwik City uses Vite. Add `codexConnector()` to `vite.config.ts`. Prefer the
framework-neutral controller or `createCodexConnector` inside `$` / browser
tasks — there is no first-class Qwik binding yet.

## Install

```bash
bun add codex-connector
```

## Config

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { qwikVite } from '@builder.io/qwik/optimizer'
import { qwikCity } from '@builder.io/qwik-city/vite'
import { codexConnector } from 'codex-connector/vite'

export default defineConfig({
  plugins: [qwikCity(), qwikVite(), codexConnector()],
})
```

## App code

```ts
import { createCodexConnectorController } from 'codex-connector'

// Inside a browser-only Qwik task / click handler:
const controller = createCodexConnectorController({
  serviceId: 'acme-qwik',
  appName: 'Acme Qwik',
})
const setup = controller.createSetup()
```

## Verify

Confirm `/codex/codex-connector-bridge.mjs` is served, the response body matches
the packaged bridge, and the prompt SHA-256 agrees. Keep the app origin on
loopback for local pairing.

## Notes

- Never serialize pairing tokens into resumable SSR state.
- Use `useVisibleTask$` / event handlers for connection checks.
