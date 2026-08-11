import { describe, expect, it } from 'vitest'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { loadMatrix, repoRoot } from './helpers'

const srcExists = async (relative: string): Promise<boolean> => {
  try {
    await access(path.join(repoRoot, relative))
    return true
  } catch {
    return false
  }
}

describe('compatibility matrix manifest', () => {
  it('declares the guaranteed adapter / binding majors', async () => {
    const matrix = await loadMatrix()

    expect(matrix.bridgeAssetPath).toBe('/codex/codex-connector-bridge.mjs')

    const vite = matrix.adapters.find((item) => item.id === 'vite')
    const next = matrix.adapters.find((item) => item.id === 'next')
    const nuxt = matrix.adapters.find((item) => item.id === 'nuxt')
    expect(vite?.majors).toEqual([7, 8])
    expect(next?.majors).toEqual([15, 16])
    expect(nuxt?.majors).toEqual([3, 4])

    const react = matrix.bindings.find((item) => item.id === 'react')
    const vue = matrix.bindings.find((item) => item.id === 'vue')
    const svelte = matrix.bindings.find((item) => item.id === 'svelte')
    const solid = matrix.bindings.find((item) => item.id === 'solid')
    expect(react?.majors).toEqual([18, 19])
    expect(vue?.majors).toEqual([3])
    expect(svelte?.majors).toEqual([4, 5])
    expect(solid?.majors).toEqual([1])
  })

  it('requires every first-class module source', async () => {
    const expected = [
      'src/vite/index.ts',
      'src/next/index.ts',
      'src/nuxt/index.ts',
      'src/react/index.ts',
      'src/vue/index.ts',
      'src/svelte/index.ts',
      'src/solid/index.ts',
    ]

    const missing: string[] = []
    for (const relative of expected) {
      if (!(await srcExists(relative))) missing.push(relative)
    }

    expect(missing).toEqual([])
  })
})
