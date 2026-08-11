# test/compat — framework matrix

## Package Identity

Heavier compatibility suite for adapters, bindings, and recipe fixtures. Config:
`../../vitest.compat.config.ts` (`include: test/compat/**/*.compat.ts`).

## Setup & Run

```bash
bun run test:compat:static
bun run test:compat       # static gate + all isolated installs/builds
node scripts/compat-runner.mjs adapter next 15
```

Do **not** fold these into `bun run check` via renaming to `*.test.ts` without
excluding them from `vitest.config.ts`.

## Patterns

- Static: integrity (URL / body / digest), resolve precedence, recipe docs,
  Vite plugin emit, CLI eject/hash, matrix.json, and required module sources.
- Full: `scripts/compat-runner.mjs` packs the package and runs isolated consumer
  installs/builds under `fixtures/compat/.tmp/`.

## Key Files

- Matrix: `../../fixtures/compat/matrix.json`
- Recipes docs: `../../docs/recipes/`
- Vite smoke app: `../../fixtures/compat/vite-app/`
