# test — Vitest suite

## Package Identity

Node-environment Vitest tests for the SDK and bridge helpers. Config:
`../vitest.config.ts` (`include: test/**/*.test.ts`). One smoke script:
`e2e-smoke.mjs` (manual / optional live path).

## Setup & Run

```bash
bun run test
bun run test -- test/connector.test.ts
bun run test -- test/bridge.test.ts
bun run check
```

## Patterns & Conventions

### Layout

- Colocate by module name: `connector.test.ts` ↔ `src/connector.ts`.
- Bridge tests import the `.mjs` directly with `// @ts-expect-error` (no types).
- Prefer pure unit tests; mock `fetch` / `localStorage` rather than requiring a
  live Codex install.

### DO / DON'T

- DO: Install a fake `localStorage` for pairing tests (see
  `installLocalStorage` in `connector.test.ts`).
- DO: Use stable fixtures: `serviceId: 'acme-studio'`,
  `appOrigin: 'https://acme.example'`, 43-char pairing tokens.
- DO: Assert security negatives — wrong origin, wrong token, disallowed RPC,
  rejected HTTP origins (`bridge.test.ts`).
- DO: Keep port derivation tests aligned when `service.ts` or the bridge changes
  (`service.test.ts`).
- DON'T: Call real `codex app-server` in default CI unit tests.
- DON'T: Commit real pairing tokens or user config paths with secrets.

### Useful examples

- Facade + pairing reuse: `connector.test.ts`
- Origin/auth/sandbox: `bridge.test.ts`
- Tool serialize/execute: `tools.test.ts`
- Turn event forwarding: `run.test.ts`
- Vite plugin path/sha: `vite.test.ts`

## Key Files

- Vitest config: `../vitest.config.ts`
- Bridge security suite: `bridge.test.ts`
- Connector facade: `connector.test.ts`
- Optional live smoke: `e2e-smoke.mjs`

## JIT Index Hints

```bash
rg -n "describe\\(|it\\(|beforeEach" .
rg -n "localStorage|fetch|@ts-expect-error" .
find . -name '*.test.ts'
```

## Common Gotchas

- `exactOptionalPropertyTypes` applies in tests that construct config objects —
  omit optional keys rather than setting `undefined`.
- Bridge exports are runtime JS; typecheck relies on the expect-error import.
- Changing `SERVICE_ID_PATTERN` or port math requires updating both SDK and
  bridge tests.

## Pre-PR Checks

```bash
bun run test && bun run typecheck
```
