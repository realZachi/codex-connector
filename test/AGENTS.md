# test — Vitest suite

## Package Identity

Node-environment Vitest tests for the SDK and bridge helpers. Config:
`../vitest.config.ts` (`include: test/**/*.test.ts`). Heavier framework matrix:
`../vitest.compat.config.ts` via `bun run test:compat` (`test/compat/**/*.compat.ts`).
One smoke script: `e2e-smoke.mjs` (manual / optional live path).

## Setup & Run

```bash
bun run test
bun run test -- test/connector.test.ts
bun run test -- test/bridge.test.ts
bun run test:compat
bun run check
```

## Patterns & Conventions

### Layout

- Colocate by module name: `connector.test.ts` ↔ `src/connector.ts`.
- Bridge tests import the `.mjs` directly with `// @ts-expect-error` (no types).
- Prefer pure unit tests; mock `fetch` / `localStorage` rather than requiring a
  live Codex install.
- Compat suite lives under `compat/` and uses `*.compat.ts` so it stays out of
  the fast `bun run test` / `check` gate.

### DO / DON'T

- DO: Install a fake `localStorage` for pairing tests (see
  `installLocalStorage` in `connector.test.ts`).
- DO: Use stable fixtures: `serviceId: 'acme-studio'`,
  `appOrigin: 'https://acme.example'`, 43-char pairing tokens.
- DO: Assert security negatives — wrong origin, wrong token, disallowed RPC,
  rejected HTTP origins (`bridge.test.ts`).
- DO: Keep port derivation tests aligned when `service.ts` or the bridge changes
  (`service.test.ts`).
- DO: Cover new adapters/bindings with focused `*.test.ts` files; put
  multi-framework smokes in `compat/`.
- DON'T: Call real `codex app-server` in default CI unit tests.
- DON'T: Commit real pairing tokens or user config paths with secrets.
- DON'T: Rename compat files to `*.test.ts` without excluding them from the
  default Vitest config — that would pull heavy fixtures into `check`.

### Useful examples

- Facade + pairing reuse: `connector.test.ts`
- Controller / SSR: `controller.test.ts`
- Path/hash resolve: `bridge-resolve.test.ts`, `bridge-assets.test.ts`
- Origin/auth/sandbox: `bridge.test.ts`
- Vite / Next / Nuxt adapters: `vite.test.ts`, `next.test.ts`, `nuxt.test.ts`
- UI bindings: `react.test.ts`, `vue.test.ts`, `svelte.test.ts`, `solid.test.ts`
- Compat matrix: `compat/`

## Key Files

- Vitest config: `../vitest.config.ts`
- Compat config: `../vitest.compat.config.ts`
- Bridge security suite: `bridge.test.ts`
- Connector facade: `connector.test.ts`
- Optional live smoke: `e2e-smoke.mjs`

## JIT Index Hints

```bash
rg -n "describe\\(|it\\(|beforeEach" .
rg -n "localStorage|fetch|@ts-expect-error" .
find . -name '*.test.ts' -o -name '*.compat.ts'
```

## Common Gotchas

- `exactOptionalPropertyTypes` applies in tests that construct config objects —
  omit optional keys rather than setting `undefined`.
- Bridge exports are runtime JS; typecheck relies on the expect-error import.
- Changing `SERVICE_ID_PATTERN` or port math requires updating both SDK and
  bridge tests.
- Compat fixtures under `../fixtures/compat` may write to `.tmp/`; do not commit
  generated output.

## Pre-PR Checks

```bash
bun run check
# when touching adapters, recipes, or packaging:
bun run test:compat
```
