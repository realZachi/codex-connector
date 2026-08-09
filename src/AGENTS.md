# src — browser SDK

## Package Identity

Core TypeScript library for pairing, connection status, model listing, and
tool-enabled turns against the local bridge. Entry: `createCodexConnector` in
`connector.ts`. Public barrel: `index.ts`.

## Setup & Run

```bash
# from repo root
bun run typecheck
bun run test
bun run build          # emits dist/ via tsconfig.build.json
```

Consumers import from `codex-connector` (built `dist/`). The example aliases to
this `src/` tree for zero-build iteration.

## Patterns & Conventions

### Module map

| Concern | File |
| --- | --- |
| Public API / facade | `connector.ts` |
| HTTP + JSON-RPC client | `client.ts` |
| Pairing + localStorage | `connection.ts` |
| serviceId / ports | `service.ts` |
| Setup prompt + deep link | `setup-prompt.ts` |
| Account probe | `account.ts` |
| Models | `models.ts` |
| Turns + events | `run.ts` |
| Browser-side tools | `tools.ts` |
| React hook | `react/index.ts` |
| Vite plugin (Node) | `vite/index.ts` |

### DO / DON'T

- DO: Keep the high-level flow in `connector.ts` and push protocol details down
  (`client.ts`, `run.ts`). Mirror status handling from `ConnectorStatus` there.
- DO: Validate `serviceId` with `assertValidServiceId` (`service.ts`) —
  lowercase, digits, dashes, 3–40 chars (`acme-studio`).
- DO: Derive ports with `serviceCandidatePorts` — must stay identical to the
  bridge (`bridge/codex-connector-bridge.mjs`).
- DO: For optional config under `exactOptionalPropertyTypes`, omit keys instead
  of passing `undefined` (pattern in `react/index.ts`).
- DO: Use `type` imports for types (`import type { ... }`) with
  `verbatimModuleSyntax`.
- DON'T: Import Node builtins (`fs`, `crypto`, `path`) from browser modules —
  only `vite/index.ts` / build tooling may.
- DON'T: Hard-code model ids in product code; call `listModels()` and filter
  (see README).
- DON'T: Widen turn sandbox or tools to grant shell/filesystem/network — tools
  run in the **browser** only (`tools.ts`).

### React (`react/index.ts`)

- Thin state wrapper over `createCodexConnector`.
- Expose `status`, `setup`, `createSetup`, `checkConnection`, `disconnect`.
- Use a revision counter so stale `checkConnection` results do not overwrite UI.
- Example UI (bring-your-own): `example/src/ConnectPanel.tsx`.

### Vite (`vite/index.ts`)

- Serves `/codex/codex-connector-bridge.mjs` in dev (no-store) and emits it on build.
- Defines `__CODEX_BRIDGE_SHA256__` by default (`defineSha256As`).
- Resolve bridge via package export, with source fallback for this repo
  (`resolveBridgePath`).

## Key Files

- Facade: `connector.ts`
- Barrel: `index.ts`
- Pairing storage key: `connection.ts` → `connectionStorageKey`
- Prompt builders: `setup-prompt.ts` (`buildSetupPrompt`, `buildDesktopDeepLink`, `buildCliCommand`)
- Turn loop + tool dispatch: `run.ts`, `tools.ts`

## JIT Index Hints

```bash
rg -n "export (const|type|async function|function)" .
rg -n "ConnectorStatus|SetupInstructions" .
rg -n "localStorage|pairingToken" connection.ts
rg -n "onEvent|tool-call|reasoning-delta" run.ts
rg -n "codexConnector|bridgeSha256|emitFile" vite
```

## Common Gotchas

- Outside the browser, set `appOrigin` explicitly or `createCodexConnector` throws.
- Pairing requires HTTPS (loopback HTTP exempt) — keep example on `127.0.0.1`.
- Protocol version (`CONNECTOR_PROTOCOL_VERSION` in `service.ts`) must match
  `BRIDGE_PROTOCOL_VERSION` in the bridge.
- Changing port hashing or `SERVICE_ID_PATTERN` requires a matching bridge change
  and tests on both sides.

## Pre-PR Checks

```bash
bun run check
```
