import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadMatrix, pathExists, repoRoot } from './helpers'

const requiredSnippets = [
  'serviceId',
  'appName',
  'codex-connector',
  '/codex/codex-connector-bridge.mjs',
]

describe('recipe documentation', () => {
  it('matrix recipes have docs + fixture directories with required content', async () => {
    const matrix = await loadMatrix()
    expect(matrix.recipes.length).toBeGreaterThanOrEqual(6)

    for (const recipe of matrix.recipes) {
      const docPath = path.join(repoRoot, recipe.doc)
      const fixturePath = path.join(repoRoot, recipe.fixture)
      expect(await pathExists(docPath), `missing doc ${recipe.doc}`).toBe(true)
      expect(await pathExists(fixturePath), `missing fixture ${recipe.fixture}`).toBe(true)

      const doc = await readFile(docPath, 'utf8')
      for (const snippet of requiredSnippets) {
        expect(doc, `${recipe.id} doc missing ${snippet}`).toContain(snippet)
      }

      const packageJson = path.join(fixturePath, 'package.json')
      expect(await pathExists(packageJson), `${recipe.id} fixture package.json`).toBe(true)
    }
  })

  it('docs/recipes/README indexes every matrix recipe', async () => {
    const matrix = await loadMatrix()
    const index = await readFile(path.join(repoRoot, 'docs/recipes/README.md'), 'utf8')
    for (const recipe of matrix.recipes) {
      const fileName = path.basename(recipe.doc)
      expect(index).toContain(fileName)
    }
  })
})
