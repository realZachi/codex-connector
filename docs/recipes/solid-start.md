# SolidStart 2

SolidStart 2 uses Vite directly. Register `codexConnector()` next to the
SolidStart and Nitro plugins, then use `codex-connector/solid` in the client.

## Install

```bash
bun add codex-connector
```

## Config

```ts
// vite.config.ts
import { solidStart } from '@solidjs/start/config'
import { codexConnector } from 'codex-connector/vite'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [solidStart(), codexConnector(), nitro()],
})
```

## App code

```tsx
import { createCodexConnector } from 'codex-connector/solid'

export default function Connect() {
  const codex = createCodexConnector({
    serviceId: 'acme-solidstart',
    appName: 'Acme SolidStart',
  })

  return (
    <button type="button" onClick={() => codex.createSetup()}>
      Use my ChatGPT plan
    </button>
  )
}
```

## Verify

Confirm `/codex/codex-connector-bridge.mjs` in dev and the client bundle resolve
path/digest via adapter inject. Prompt digest must equal the file hash.

## Notes

- Solid's `onCleanup` / owner lifecycle should dispose the binding.
- Do not invoke connector setup during SSR.
