# SvelteKit 2

Use the Vite plugin in SvelteKit's Vite config. Browser binding:
`codex-connector/svelte`.

## Install

```bash
bun add codex-connector
```

## Config

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import { codexConnector } from 'codex-connector/vite'

export default defineConfig({
  plugins: [sveltekit(), codexConnector()],
})
```

## App code (Svelte 4/5)

```svelte
<script lang="ts">
  import { createCodexConnectorStore } from 'codex-connector/svelte'

  const store = createCodexConnectorStore({
    serviceId: 'acme-sveltekit',
    appName: 'Acme SvelteKit',
  })
</script>

{#if $store.status.state === 'connected'}
  <p>Connected</p>
{:else if !$store.setup}
  <button on:click={() => store.createSetup()}>Use my ChatGPT plan</button>
{:else}
  <a href={$store.setup.desktopDeepLink}>Open in ChatGPT</a>
  <button on:click={() => store.checkConnection()}>Check connection</button>
{/if}
```

## Verify

Bridge URL `/codex/codex-connector-bridge.mjs`, served body, and prompt digest
must match. Keep `kit` CSRF / origin assumptions compatible with loopback HTTPS
rules for pairing.

## Notes

- Call connector APIs from browser-only code (`+page.svelte` / `onMount`), not
  during SSR `load`.
- For Svelte 5 runes projects the store contract still works via `$store`.
