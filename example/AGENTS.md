# example — Vite + React demo

## Package Identity

Private demo app showing connect UI, board tools, and a live turn against the
local bridge. Uses source aliases into `../src` so package edits appear without
a library rebuild.

## Setup & Run

```bash
bun install
bun run dev        # http://127.0.0.1:4180 (strictPort)
bun run build
bun run preview
```

Requires Codex CLI logged in with ChatGPT on the machine exercising Connect.

## Patterns & Conventions

### Wiring

- Vite plugin from source: `vite.config.ts` → `codexConnector()` from
  `../src/vite`.
- Aliases: `codex-connector` → `../src/index.ts`,
  `codex-connector/react` → `../src/react/index.ts`.
- Server **must** stay on loopback (`host: '127.0.0.1'`) — pairing rejects plain
  non-loopback HTTP. Changing host/port invalidates existing pairings.

### DO / DON'T

- DO: Keep UI bring-your-own — `ConnectPanel.tsx` only renders hook state
  (`status`, `setup`, deep link, copy prompt, check connection).
- DO: Demonstrate browser tools that touch app state (`board.ts` + tool defs in
  `App.tsx`), matching the README `run({ tools })` story.
- DO: Pass `__CODEX_BRIDGE_SHA256__` through when wiring the connector (via the
  Vite define from the plugin).
- DON'T: Point the example at a third-party bridge URL.
- DON'T: Switch `server.host` to `0.0.0.0` or a LAN hostname if you still expect
  pairing to work without HTTPS.

## Key Files

- Vite config / aliases: `vite.config.ts`
- Hook usage: `src/App.tsx`
- Connect UI: `src/ConnectPanel.tsx`
- Sample tool state: `src/board.ts`
- Env typings for define: `src/env.d.ts`

## JIT Index Hints

```bash
rg -n "useCodexConnector|createSetup|checkConnection" src
rg -n "codexConnector|alias|127.0.0.1" vite.config.ts
rg -n "tools:|execute" src/App.tsx
```

## Common Gotchas

- Separate `bun.lock` / `node_modules` from the package root — install inside
  `example/`.
- After changing the bridge file, hard-refresh; dev middleware uses `no-store`
  but the ChatGPT-side copy is whatever was downloaded at setup time (re-run
  setup if the checksum should change).
- `serviceId` in the example should stay stable while iterating, or users must
  re-pair.

## Pre-PR Checks

```bash
bun run build
# from repo root, also:
bun run check
```
