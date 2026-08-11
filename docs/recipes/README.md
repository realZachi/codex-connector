# Framework recipes

First-class adapters exist for **Vite**, **Next.js**, and **Nuxt**. The recipes
below cover frameworks that reuse Vite (or Angular assets) plus the CLI eject
path. Each recipe keeps `{ serviceId, appName }` in app code; bridge path and
digest come from the Vite plugin, Angular static copy, or
`BUNDLED_BRIDGE_SHA256`.

| Recipe | Major | Integration |
| --- | --- | --- |
| [Astro](astro.md) | 7 | `codex-connector/vite` in `astro.config` Vite hooks |
| [SvelteKit](sveltekit.md) | 2 | `codex-connector/vite` in `vite.config` / kit vite |
| [React Router](react-router.md) | 8 | `codex-connector/vite` (Remix Vite) |
| [SolidStart](solid-start.md) | 2 | `codex-connector/vite` in Vinxi/Vite config |
| [Qwik](qwik.md) | 1 | `codex-connector/vite` in `vite.config` |
| [Angular](angular.md) | 22 | `bunx codex-connector eject` → `public/codex` |

Static compatibility checks live under `test/compat/`. The applications under
`fixtures/compat/recipes/` are installed and built from a packed package by
`scripts/compat-runner.mjs`; CI runs each framework in its own matrix job.
