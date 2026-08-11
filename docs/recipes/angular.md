# Angular 22

Angular has no first-class adapter. Copy the bridge into the app's static assets
with the CLI, then rely on the default path + `BUNDLED_BRIDGE_SHA256` (or the
printed eject hash).

## Install

```bash
bun add codex-connector
bunx codex-connector eject --out public/codex
```

Ensure `public/` (or your `assets` folder mapped as site root) is served at the
application origin so `/codex/codex-connector-bridge.mjs` is reachable.

## angular.json (assets)

If your static root is not `public/`, copy into the configured assets directory
and keep the URL path `/codex/codex-connector-bridge.mjs`, or pass a matching
`bridgePath` + `bridgeSha256`.

```json
{
  "glob": "**/*",
  "input": "public/codex",
  "output": "/codex"
}
```

## App code

```ts
import { BUNDLED_BRIDGE_SHA256, createCodexConnector } from 'codex-connector'

export const codex = createCodexConnector({
  serviceId: 'acme-angular',
  appName: 'Acme Angular',
  // Optional when using the default path — bundled digest applies automatically.
  bridgeSha256: BUNDLED_BRIDGE_SHA256,
})
```

Wire connect UI with your own Angular components; call `createSetup` /
`checkConnection` from the browser only (e.g. after `afterNextRender`).

## Verify

1. `curl` / browser: `{origin}/codex/codex-connector-bridge.mjs` returns the
   ejected file.
2. `shasum -a 256` of that file equals the digest embedded in `createSetup().prompt`.
3. Re-run `eject` after package upgrades so bytes and digest stay aligned.

## Notes

- Prefer HTTPS (or `http://127.0.0.1`) origins for pairing.
- Do not host the bridge on a CDN host different from the app origin.
