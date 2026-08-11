# codex-connector

## Project Snapshot

Single TypeScript package (not a monorepo): a browser SDK plus a localhost bridge so
web apps can use a user's ChatGPT Codex plan without API keys or server-side AI.

Stack: TypeScript (strict), Bun for scripts, Vitest, optional React/Vue/Svelte/Solid
bindings and Vite/Next/Nuxt adapters. Published exports: `.`, `./react`, `./vue`,
`./svelte`, `./solid`, `./vite`, `./next`, `./nuxt`, `./bridge`. Node `>=20.11`.

Deep, area-specific guidance lives in subfolder `AGENTS.md` files (nearest wins).

## Root Setup Commands

```bash
bun install
bun run typecheck
bun run test
bun run build
bun run check          # verify bridge metadata + typecheck + test + build
bun run test:compat    # framework/recipe matrix (heavier)
bun run generate:bridge-metadata   # refresh BUNDLED_BRIDGE_SHA256 after bridge edits
cd example && bun install && bun run dev   # demo at http://127.0.0.1:4180
```

CLI (non-adapter apps): `bunx codex-connector eject --out public/codex` or `hash`.

## Universal Conventions

- ESM only (`"type": "module"`); prefer named exports; keep `sideEffects: false`.
- Strict TS: `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`.
- Spread optional fields instead of assigning `undefined` (see React hook pattern).
- Public surface is re-exported from `src/index.ts`; add new public APIs there.
- Keep browser code free of Node builtins; Node-only code belongs in `src/vite/`,
  `src/next/`, `src/nuxt/`, `src/node/`, or `bin/`.
- Bridge security model is documented in `SECURITY.md` — read before changing auth, RPC, or sandbox.
- Commit style: short imperative sentences describing why (see recent git history).

## Shared architecture (do not fork)

| Concern | Module |
| --- | --- |
| Bundled digest | `src/bridge-metadata.generated.ts` (`BUNDLED_BRIDGE_SHA256`) |
| Path/hash priority | `src/bridge-resolve.ts` → `resolveBridgeConfig` |
| Reactive store | `src/controller.ts` → `createCodexConnectorController` |
| Node asset helpers | `src/node/bridge-assets.ts` |

Adapters inject `__CODEX_BRIDGE_PATH__` / `__CODEX_BRIDGE_SHA256__` (bundler define or
`globalThis`). Explicit `CodexConnectorConfig` fields always win. UI bindings must
consume the controller; they must not reimplement revision guards.

## Security & Secrets

- Never commit pairing tokens, control secrets, or `~/.codex` / bridge config dumps.
- Do not widen the bridge RPC allowlist or relax sandbox/origin/token checks.
- Prefer `--pairing-token-stdin` over argv when documenting or changing bridge start.
- Serve the bridge from the app origin; integrity uses adapter inject or `BUNDLED_BRIDGE_SHA256`.
- Details: [SECURITY.md](SECURITY.md).

## JIT Index

### Package Structure

- Library (browser SDK): `src/` → [src/AGENTS.md](src/AGENTS.md)
- Localhost bridge: `bridge/` → [bridge/AGENTS.md](bridge/AGENTS.md)
- Tests: `test/` → [test/AGENTS.md](test/AGENTS.md)
- Vite demo: `example/` → [example/AGENTS.md](example/AGENTS.md)
- Native framework demos: `examples/` → [examples/README.md](examples/README.md)
- CLI eject/hash: `bin/cli.mjs`
- Docs: `README.md`, `SECURITY.md`

### Quick Find Commands

```bash
rg -n "export (const|type|function)" src --glob '*.ts'
rg -n "ALLOWED_RPC|isAuthorized|normalizeOrigin" bridge
rg -n "describe\\(|it\\(" test
rg -n "createCodexConnector|useCodexConnector|codexConnector|withCodexConnector" src example
```

## Definition of Done

Before PR: `bun run check` passes. Bridge/security changes need coverage in
`test/bridge.test.ts` (and related client/setup tests). Adapter/binding changes need
their focused tests; framework matrix via `bun run test:compat` when touching DX.
Keep public API and `SECURITY.md` aligned with behavior.
