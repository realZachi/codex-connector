#!/usr/bin/env node
// codex-connector CLI
//
// For projects that do not use the Vite plugin: copy the bridge module into your
// static directory so it is served from your own origin, and print its SHA-256.

import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const bridgeSource = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'bridge',
  'codex-connector-bridge.mjs',
)

const usage = `codex-connector

Commands:
  eject [--out <dir>]   Copy the bridge module into a static directory
                        (default: public/codex) and print its SHA-256.
  hash                  Print the SHA-256 of the bundled bridge module.
`

const readFlag = (args, flag) => {
  const index = args.indexOf(flag)
  if (index < 0) return null
  return args[index + 1] ?? null
}

const hashBridge = async () => {
  const source = await readFile(bridgeSource)
  return createHash('sha256').update(source).digest('hex')
}

const eject = async (args) => {
  const outDirectory = path.resolve(process.cwd(), readFlag(args, '--out') ?? 'public/codex')
  const target = path.join(outDirectory, 'codex-connector-bridge.mjs')
  await mkdir(outDirectory, { recursive: true })
  await copyFile(bridgeSource, target)
  const digest = await hashBridge()
  process.stdout.write(`Wrote ${path.relative(process.cwd(), target)}\n`)
  process.stdout.write(`SHA-256: ${digest}\n\n`)
  process.stdout.write('Pass this to the connector so Codex verifies the download:\n')
  process.stdout.write(`  bridgeSha256: '${digest}'\n`)
}

const main = async () => {
  const [command = 'help', ...args] = process.argv.slice(2)
  if (command === 'eject') {
    await eject(args)
    return
  }
  if (command === 'hash') {
    process.stdout.write(`${await hashBridge()}\n`)
    return
  }
  process.stdout.write(usage)
}

main().catch((error) => {
  console.error(`codex-connector: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
