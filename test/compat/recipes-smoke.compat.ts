import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadMatrix, pathExists, repoRoot } from './helpers'

/**
 * Static recipe checks stay cheap here. Actual isolated installs and framework
 * builds run through scripts/compat-runner.mjs in the CI matrix.
 */
describe('recipe fixture smokes', () => {
  it('each buildable recipe fixture wires codex-connector correctly', async () => {
    const matrix = await loadMatrix()

    for (const recipe of matrix.recipes) {
      const fixtureDir = path.join(repoRoot, recipe.fixture)
      const pkg = JSON.parse(await readFile(path.join(fixtureDir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>
        scripts?: Record<string, string>
      }
      expect(pkg.dependencies?.['codex-connector'], recipe.id).toBeTruthy()

      if (recipe.id === 'angular') {
        expect(pkg.scripts?.eject ?? '').toMatch(/eject/)
        expect(await pathExists(path.join(fixtureDir, 'angular.assets.snippet.json'))).toBe(true)
        continue
      }

      // Vite-based recipes: config must reference codexConnector.
      const candidates = [
        'vite.config.ts',
        'astro.config.mjs',
        'app.config.ts',
      ]
      let configText = ''
      for (const candidate of candidates) {
        const full = path.join(fixtureDir, candidate)
        if (await pathExists(full)) {
          configText = await readFile(full, 'utf8')
          break
        }
      }
      expect(configText, `${recipe.id} missing vite/astro config`).not.toBe('')
      expect(configText).toContain('codexConnector')
      expect(configText).toContain('codex-connector/vite')
    }
  })

})
