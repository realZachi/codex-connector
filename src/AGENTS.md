# src — browser SDK

## Package Identity

Core TypeScript library for pairing, connection status, model listing, and
tool-enabled turns against the local bridge. Entry: `createCodexConnector` in
`connector.ts`. Public barrel: `index.ts`. Reactive store:
`createCodexConnectorController` in `controller.ts`.

## Setup & Run

```bash
# from repo root
bun run typecheck
bun run test
bun run build          # emits dist/ via tsconfig.build.json
bun run generate:bridge-metadata   # after editing the bridge file
```

Consumers import from `codex-connector` (built `dist/`). The example aliases to
this `src/` tree for zero-build iteration.

## Patterns & Conventions

### Module map

| Concern | File |
| --- | --- |
| Public API / facade | `connector.ts` |
| Bridge path/hash resolve | `bridge-resolve.ts` |
| Bundled digest | `bridge-metadata.generated.ts` |
| Reactive controller | `controller.ts` |
| HTTP + JSON-RPC client | `client.ts` |
| Pairing + localStorage | `connection.ts` |
| serviceId / ports | `service.ts` |
| Setup prompt + deep link | `setup-prompt.ts` |
| Account probe | `account.ts` |
| Models | `models.ts` |
| Turns + events | `run.ts` |
| Browser-side tools | `tools.ts` |
| Node asset helpers | `node/bridge-assets.ts` |
| React / Vue / Svelte / Solid | `react/`, `vue/`, `svelte/`, `solid/` |
| Vite / Next / Nuxt (Node) | `vite/`, `next/`, `nuxt/` |

### DO / DON'T

- DO: Keep the high-level flow in `connector.ts` and push protocol details down
  (`client.ts`, `run.ts`). Mirror status handling from `ConnectorStatus` there.
- DO: Resolve bridge path/hash only via `resolveBridgeConfig` (explicit → adapter
  inject → default + `BUNDLED_BRIDGE_SHA256`).
- DO: Validate `serviceId` with `assertValidServiceId` (`service.ts`) —
  lowercase, digits, dashes, 3–40 chars (`acme-studio`).
- DO: Derive ports with `serviceCandidatePorts` — must stay identical to the
  bridge (`bridge/codex-connector-bridge.mjs`).
- DO: For optional config under `exactOptionalPropertyTypes`, omit keys instead
  of passing `undefined` (pattern in `react/index.ts`).
- DO: Use `type` imports for types (`import type { ... }`) with
  `verbatimModuleSyntax`.
- DON'T: Import Node builtins (`fs`, `crypto`, `path`) from browser modules —
  only `vite/`, `next/`, `nuxt/`, `node/`, or `bin/` may.
- DON'T: Hard-code model ids in product code; call `listModels()` and filter
  (see README).
- DON'T: Widen turn sandbox or tools to grant shell/filesystem/network — tools
  run in the **browser** only (`tools.ts`).
- DON'T: Reimplement revision guards in UI bindings — use the controller.

### Controller (`controller.ts`)

- Snapshot: `status`, `setup`, `isConnected`, `isChecking`.
- Actions: `createSetup`, `checkConnection`, `disconnect` + `connector`.
- First client `subscribe` starts the auto-check; `getServerSnapshot` is inert.

### UI bindings

- React: thin `useSyncExternalStore` over the controller; public API unchanged.
- Vue / Svelte / Solid: same snapshot + actions, framework-native reactivity.

### Build adapters

- Share `src/node/bridge-assets.ts` for resolve/hash/write/path join.
- Vite/Nuxt inject `__CODEX_BRIDGE_*`; Next injects the allowed
  `NEXT_PUBLIC_CODEX_BRIDGE_*` equivalents. The browser core reads both.
- Never serve the bridge from a foreign CDN origin.

## Key Files

- Facade: `connector.ts`
- Barrel: `index.ts`
- Pairing storage key: `connection.ts` → `connectionStorageKey`
- Prompt builders: `setup-prompt.ts` (`buildSetupPrompt`, `buildDesktopDeepLink`, `buildCliCommand`)
- Turn loop + tool dispatch: `run.ts`, `tools.ts`

## JIT Index Hints

```bash
rg -n "export (const|type|async function|function)" .
rg -n "ConnectorStatus|SetupInstructions|createCodexConnectorController" .
rg -n "localStorage|pairingToken" connection.ts
rg -n "onEvent|tool-call|reasoning-delta" run.ts
rg -n "codexConnector|withCodexConnector|bridgeSha256|emitFile" vite next nuxt
```

## Common Gotchas

- Outside the browser, set `appOrigin` explicitly or `createCodexConnector` throws.
- Pairing requires HTTPS (loopback HTTP exempt) — keep example on `127.0.0.1`.
- Protocol version (`CONNECTOR_PROTOCOL_VERSION` in `service.ts`) must match
  `BRIDGE_PROTOCOL_VERSION` in the bridge.
- Changing port hashing or `SERVICE_ID_PATTERN` requires a matching bridge change
  and tests on both sides.
- After editing the bridge file, run `bun run generate:bridge-metadata`.

## Pre-PR Checks

```bash
bun run check
```
