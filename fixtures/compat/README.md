# Compatibility fixtures

Isolated consumer projects for the framework / recipe matrix. They are **not**
installed by the root `bun install`.

| Path | Role |
| --- | --- |
| `matrix.json` | Tested majors + export symbols |
| `recipes/*` | Minimal applications used for real framework builds |
| `vite-app/` | Real Vite plugin smoke (source alias; builds under `.tmp/`) |

## Running

```bash
# Static integrity, documentation, and local Vite checks
bun run test:compat:static

# Pack the package, install every declared version in isolation, and build
bun run test:compat

# Run one CI job locally
bun run build
node scripts/compat-runner.mjs adapter next 15
```

The runner installs the packed tarball, not source aliases. Build output and
per-job lockfiles stay under `fixtures/compat/.tmp/` (gitignored).
