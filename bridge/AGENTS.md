# bridge — localhost App Server front

## Package Identity

Single reviewable ES module: `codex-connector-bridge.mjs`. Runs on the user's
machine, spawns `codex app-server` over stdio, and exposes a narrow loopback HTTP
API to exactly one paired browser origin. This is the security boundary.

## Setup & Run

```bash
# hash (also via package CLI)
bunx codex-connector hash

# unit-test exported helpers (imported from tests)
bun run test -- test/bridge.test.ts

# stop a running user bridge (on their machine)
node ~/.local/share/codex-connector-bridge/<serviceId>/codex-connector-bridge.mjs stop --service-id <serviceId>
```

Commands implemented in-file: `start`, `serve`, `stop`. Prefer
`--pairing-token-stdin` over `--pairing-token` (argv is visible in `ps`).

## Patterns & Conventions

### Invariants (do not break)

- Bind `127.0.0.1` only (`BRIDGE_HOST`).
- Authorize with exact paired `Origin` + Bearer pairing token (`timingSafeEqual`).
- Allowlist only: `account/read`, `account/rateLimits/read`, `model/list`,
  `thread/start`, `thread/delete`, `turn/start`, `turn/interrupt`.
- On `thread/start` / `turn/start`, **overwrite** sandbox fields (do not merely
  validate): empty cwd, `read-only`, `networkAccess: false`, `approvalPolicy: never`,
  `environments: []`.
- Never read `~/.codex/auth.json` or print credentials.
- Per-`serviceId` isolation: port, config dir, workspace, pairing token.

### DO / DON'T

- DO: Keep helpers testable via named `export`s (`normalizeOrigin`,
  `isAuthorizedBridgeRequest`, `serviceCandidatePorts`, sandbox forcing).
  Coverage lives in `test/bridge.test.ts`.
- DO: Keep `SERVICE_ID_PATTERN`, port range constants, and FNV-1a hashing in lockstep
  with `src/service.ts`.
- DO: Reject non-HTTPS origins except loopback (`normalizeOrigin`).
- DON'T: Add RPC methods for shell, FS, MCP, or thread listing.
- DON'T: Bind `0.0.0.0` / LAN interfaces or skip origin checks for "dev convenience".
- DON'T: Log pairing tokens or control secrets.

### HTTP surface (orient quickly)

- Unauthenticated: `/v1/hello` (service id + protocol version only).
- Authenticated RPC / long-poll: gated by origin + bearer token.
- Pairing token pattern: 43 chars URL-safe (`PAIRING_TOKEN_PATTERN`).

## Key Files

- Bridge implementation: `codex-connector-bridge.mjs`
- Threat model: [../SECURITY.md](../SECURITY.md)
- Setup prompt that installs/starts it: `../src/setup-prompt.ts`
- Vite serving / checksum: `../src/vite/index.ts`
- Eject CLI: `../bin/cli.mjs`

## JIT Index Hints

```bash
rg -n "ALLOWED_RPC_METHODS|isAuthorizedBridgeRequest|forceSandbox|normalizeOrigin" .
rg -n "BRIDGE_PROTOCOL_VERSION|PORT_RANGE|SERVICE_ID_PATTERN" .
rg -n "pairing-token-stdin|controlSecret" .
```

## Common Gotchas

- Browser SDK and bridge must agree on protocol version and candidate ports.
- `/v1/hello` must stay unauthenticated and must not leak the pairing token.
- Max body / event limits exist (`MAX_REQUEST_BYTES`, `MAX_EVENT_COUNT`) — do not
  remove without a size plan.
- File is plain JS on purpose (user-reviewable); keep it readable and commented.

## Pre-PR Checks

```bash
bun run test -- test/bridge.test.ts test/setup-prompt.test.ts test/client.test.ts && bun run check
```
