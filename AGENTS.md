# codex-connector

## Project Snapshot

Single TypeScript package (not a monorepo): a browser SDK plus a localhost bridge so
web apps can use a user's ChatGPT Codex plan without API keys or server-side AI.

Stack: TypeScript (strict), Bun for scripts, Vitest, optional React hook and Vite
plugin. Published exports: `.`, `./react`, `./vite`, `./bridge`. Node `>=20.11`.

Deep, area-specific guidance lives in subfolder `AGENTS.md` files (nearest wins).

## Root Setup Commands

```bash
bun install
bun run typecheck
bun run test
bun run build
bun run check          # typecheck + test + build
cd example && bun install && bun run dev   # demo at http://127.0.0.1:4180
```

CLI (non-Vite apps): `bunx codex-connector eject --out public/codex` or `hash`.

## Universal Conventions

- ESM only (`"type": "module"`); prefer named exports; keep `sideEffects: false`.
- Strict TS: `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`.
- Spread optional fields instead of assigning `undefined` (see React hook pattern).
- Public surface is re-exported from `src/index.ts`; add new public APIs there.
- Keep browser code free of Node builtins; Node-only code belongs in `src/vite/` or `bin/`.
- Bridge security model is documented in `SECURITY.md` — read before changing auth, RPC, or sandbox.
- Commit style: short imperative sentences describing why (see recent git history).

## Security & Secrets

- Never commit pairing tokens, control secrets, or `~/.codex` / bridge config dumps.
- Do not widen the bridge RPC allowlist or relax sandbox/origin/token checks.
- Prefer `--pairing-token-stdin` over argv when documenting or changing bridge start.
- Serve the bridge from the app origin; pass `bridgeSha256` so Codex can verify downloads.
- Details: [SECURITY.md](SECURITY.md).

## JIT Index

### Package Structure

- Library (browser SDK): `src/` → [src/AGENTS.md](src/AGENTS.md)
- Localhost bridge: `bridge/` → [bridge/AGENTS.md](bridge/AGENTS.md)
- Tests: `test/` → [test/AGENTS.md](test/AGENTS.md)
- Demo app: `example/` → [example/AGENTS.md](example/AGENTS.md)
- CLI eject/hash: `bin/cli.mjs`
- Docs: `README.md`, `SECURITY.md`

### Quick Find Commands

```bash
rg -n "export (const|type|function)" src --glob '*.ts'
rg -n "ALLOWED_RPC|isAuthorized|normalizeOrigin" bridge
rg -n "describe\\(|it\\(" test
rg -n "createCodexConnector|useCodexConnector|codexConnector" src example
```

## Definition of Done

Before PR: `bun run check` passes. Bridge/security changes need coverage in
`test/bridge.test.ts` (and related client/setup tests). Keep public API and
`SECURITY.md` aligned with behavior.
