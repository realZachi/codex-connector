# Framework examples

Every app below implements the same complete demo: pairing with the localhost
bridge, model and reasoning-effort selection, streamed events, browser tools,
and a sticky-note board that Codex can read and modify.

| App | Binding | Build adapter | URL |
| --- | --- | --- | --- |
| [`../example/`](../example/) | React | Vite | `http://127.0.0.1:4180` |
| [`next/`](next/) | React | Next.js | `http://127.0.0.1:4181` |
| [`nuxt/`](nuxt/) | Vue | Nuxt | `http://127.0.0.1:4182` |
| [`sveltekit/`](sveltekit/) | Svelte | Vite/SvelteKit | `http://127.0.0.1:4183` |
| [`solid-start/`](solid-start/) | Solid | Vite/SolidStart | `http://127.0.0.1:4184` |

Run one app at a time from the repository root:

```bash
cd examples/next       # or nuxt, sveltekit, solid-start
bun install
bun run dev
```

The ports and `serviceId` values are deliberately different, so the apps can
also run in parallel without sharing a pairing or bridge process. All dev
servers bind to `127.0.0.1`; plain HTTP pairing is intentionally restricted to
loopback origins.

These repository examples resolve the connector from the parent checkout. In a
separate application, install `codex-connector` normally and keep the same
framework configuration shown here.
