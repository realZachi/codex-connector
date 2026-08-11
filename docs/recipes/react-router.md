# React Router 8 (Remix Vite)

React Router 7+/8 apps that use the Vite plugin stack take
`codex-connector/vite` the same way as any Vite SPA.

## Install

```bash
bun add codex-connector
```

## Config

```ts
// vite.config.ts
import { reactRouter } from '@react-router/dev/vite'
import { defineConfig } from 'vite'
import { codexConnector } from 'codex-connector/vite'

export default defineConfig({
  plugins: [reactRouter(), codexConnector()],
})
```

## App code

```tsx
import { useCodexConnector } from 'codex-connector/react'

export function Connect() {
  const { status, setup, createSetup, checkConnection } = useCodexConnector({
    serviceId: 'acme-rr',
    appName: 'Acme React Router',
  })
  // bring-your-own UI…
  return null
}
```

## Verify

After `vite build` / `react-router build`, the production asset must include
`/codex/codex-connector-bridge.mjs`. Prompt URL + digest must match that file.

## Notes

- Use client loaders / client components for pairing; avoid calling
  `createSetup` in SSR loaders.
- `basename` / Vite `base` must stay same-origin absolute paths.
