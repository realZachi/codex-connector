import { spawn } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { BUNDLED_BRIDGE_SHA256 } from '../../src/bridge-metadata.generated'
import { pathExists, repoRoot, sha256Hex } from './helpers'

const runCli = async (args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repoRoot, 'bin/cli.mjs'), ...args], {
      cwd,
      env: process.env,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })

describe('CLI eject / hash (Angular recipe path)', () => {
  const tmp = path.join(repoRoot, 'fixtures/compat/.tmp/cli-eject')

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  it('hash matches BUNDLED_BRIDGE_SHA256', async () => {
    const result = await runCli(['hash'], repoRoot)
    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe(BUNDLED_BRIDGE_SHA256)
  })

  it('eject writes bytes that match the prompt digest', async () => {
    await rm(tmp, { recursive: true, force: true })
    await mkdir(tmp, { recursive: true })
    const out = path.join(tmp, 'public/codex')
    const result = await runCli(['eject', '--out', out], tmp)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain(BUNDLED_BRIDGE_SHA256)

    const target = path.join(out, 'codex-connector-bridge.mjs')
    expect(await pathExists(target)).toBe(true)
    const body = await readFile(target, 'utf8')
    expect(sha256Hex(body)).toBe(BUNDLED_BRIDGE_SHA256)
  })
})
