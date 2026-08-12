# Security model

This package asks users to run a local server that fronts their ChatGPT
subscription. That deserves an explicit threat model. Read this before shipping.

## What the bridge is

A single-file Node/Bun script the user downloads **from your origin** and starts
once. It spawns `codex app-server` over stdio and exposes a narrow HTTP surface on
loopback.

## Controls

**Network exposure.** Binds `127.0.0.1` only. Never a routable interface, so it is
not reachable from the LAN.

**Origin binding.** Every authenticated request must carry `Origin` matching the
exact origin the bridge was paired with. Another site in the same browser gets 401
even though it can reach the same port.

**Pairing token.** A 256-bit token generated in the browser via
`crypto.getRandomValues`, compared with `timingSafeEqual`. Stored in the user's
config file with `0600` permissions.

**Only HTTPS origins pair.** A plain-HTTP site cannot pair (loopback is exempt for
local development), so a network attacker cannot spoof your origin and inherit a
bridge's trust.

**RPC allowlist.** Exactly seven methods pass: `account/read`,
`account/rateLimits/read`, `model/list`, `thread/start`, `thread/delete`,
`turn/start`, `turn/interrupt`. Everything else — command execution, file access,
thread listing — is rejected with `RPC method is not allowed`.

**Forced sandbox.** The bridge overwrites the sandbox params on every
`thread/start` and `turn/start` regardless of what the page asked for:

- `cwd` → a dedicated empty directory per service
- `sandbox` → `read-only`, `sandboxPolicy` → `{ readOnly, networkAccess: false }`
- `approvalPolicy` → `never`
- `environments` → `[]`

A compromised page cannot widen this, because the values are replaced rather than
validated.

**No credential access.** The bridge never reads `~/.codex/auth.json` or any token
store. Authentication stays entirely inside Codex App Server. The setup prompt also
instructs the agent not to print or inspect tokens.

**Service isolation.** Each `serviceId` gets its own port, config directory,
workspace and pairing token. Two connector-enabled sites cannot read each other's
pairing or reach each other's bridge; the `/v1/hello` service id check makes the
browser refuse a bridge belonging to another app.

**Token is not leaked during discovery.** Port discovery uses unauthenticated
`/v1/hello`, which returns only a service id and protocol version. The pairing
token is sent only after a bridge identifies itself as the matching service.

**Ephemeral threads.** The bridge overwrites `thread/start` with
`ephemeral: true`, and the client deletes the thread afterwards, so a custom or
compromised client cannot leave app prompts in the user's Codex history.

**Supply chain.** The bridge is served from your origin over HTTPS. Pass
`bridgeSha256` and the setup prompt makes Codex verify the checksum before running
it, which turns a wrong URL or a tampered response into a hard stop. The prompt
also tells the agent to read the file first and never to pipe it into a shell.

### Bundled digest

The published package includes `BUNDLED_BRIDGE_SHA256`: the SHA-256 of
`bridge/codex-connector-bridge.mjs` at publish time. `bun run check` verifies that
this generated constant still matches the packaged bridge file (generate with
`bun run generate:bridge-metadata` after intentional bridge edits).

When the resolved bridge path is the default
(`/codex/codex-connector-bridge.mjs`) and no adapter or config hash is present,
the browser core uses `BUNDLED_BRIDGE_SHA256` so the setup prompt still contains
an integrity check without a manual constant in app code.

### Adapter path and digest resolution

Official adapters (`codex-connector/vite`, `/next`, `/nuxt`) serve the packaged
bridge from the app origin and inject `__CODEX_BRIDGE_PATH__` /
`__CODEX_BRIDGE_SHA256__` (bundler define or equivalent runtime install).

`resolveBridgeConfig` applies a fixed priority:

1. Explicit `CodexConnectorConfig.bridgePath` / `bridgeSha256` (always wins).
2. Adapter-injected path and digest.
3. Default path plus `BUNDLED_BRIDGE_SHA256`.

Adapters must never load the bridge from a third-party CDN or foreign origin.
Relative or external `base` / `basePath` / `assetPrefix` values that would force
a cross-origin bridge URL are rejected; pass an explicit same-origin path instead.

### Custom bridges

- Forking or editing the bridge file means you must serve that exact bytes and
  pass the matching `bridgeSha256` (or re-run `eject` / `hash`).
- An explicit custom `bridgePath` **without** `bridgeSha256` keeps the historical
  manual-review prompt (read the file; no checksum step). Prefer supplying a
  digest.
- For the unmodified packaged bridge at a non-default path, you may pass
  `bridgeSha256: BUNDLED_BRIDGE_SHA256` explicitly.
- Do not widen the RPC allowlist, relax sandbox overwrites, skip origin checks,
  or accept pairing tokens from query/argv in documentation or forks intended for
  production use. Prefer `--pairing-token-stdin`.

## Residual risks

Be honest with your users about these.

**A local process fronts a paid subscription.** Any process on the user's machine
that can already make loopback HTTP requests *and* set an arbitrary `Origin`
header can use the bridge — browsers forbid setting `Origin`, but native code does
not. The pairing token is the real barrier; it lives in a `0600` file readable by
anything running as that user. This is inherent to loopback bridges, not specific
to this design. Users who do not want a persistent bridge should stop it after use.

**The setup step is agent-driven.** Codex performs the download and start. The
prompt is written to be verifiable (exact URL, exact command, checksum, review
step), but an agent can still misread instructions. Never widen the prompt with
steps that install software or run with `sudo`.

**Quota is the user's.** Runs consume the user's ChatGPT limits. Show what you are
about to spend, and surface rate-limit errors from `run()` rather than retrying.

**Your tools are the real attack surface.** Codex has no shell through this
connector, but it can call every tool you expose. Treat tool inputs as untrusted:
validate them (`parseInput`), scope them narrowly, and do not expose a tool that
performs an irreversible or outward-facing action without user confirmation.

**Prompt injection reaches your tools.** If the content you pass to Codex includes
untrusted text, that text can influence which tools get called. Keep destructive
capability out of the tool set.

## Reporting

Report suspected vulnerabilities privately to the maintainers rather than in a
public issue.
