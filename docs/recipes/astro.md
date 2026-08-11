# Astro 7

Astro uses Vite under the hood. Add the first-class Vite plugin via
`vite.plugins` — no Astro-specific adapter.

## Install

```bash
bun add codex-connector
```

## Config

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config'
import { codexConnector } from 'codex-connector/vite'

export default defineConfig({
  vite: {
    plugins: [codexConnector()],
  },
})
```

## App code

```ts
import { createCodexConnector } from 'codex-connector'
// or: import { useCodexConnector } from 'codex-connector/react' inside a React island

export const codex = createCodexConnector({
  serviceId: 'acme-astro',
  appName: 'Acme Astro',
})
```

## Verify

1. Dev: open `http://127.0.0.1:<port>/codex/codex-connector-bridge.mjs` — body
   matches the packaged bridge.
2. `createSetup()` prompt URL equals `{origin}/codex/codex-connector-bridge.mjs`
   and includes the adapter / bundled SHA-256.
3. Prefer loopback (`127.0.0.1`) for local pairing without HTTPS.

## Notes

- SSR pages must not call pairing APIs during SSR; use client islands or
  `createCodexConnectorController` only after mount.
- Custom `base` must be a same-origin absolute path (`/app/`), not a CDN URL.
