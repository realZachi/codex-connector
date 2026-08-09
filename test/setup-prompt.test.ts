import { describe, expect, it } from 'vitest'
import { createConnection, type CodexConnection } from '../src/connection'
import { serviceCandidatePorts } from '../src/service'
import {
  bridgeInstallPath,
  buildCliCommand,
  buildDesktopDeepLink,
  buildSetupPrompt,
  computeBridgeSha256,
} from '../src/setup-prompt'

const connection: CodexConnection = createConnection({
  serviceId: 'acme-studio',
  appOrigin: 'https://acme.example',
})
const options = { connection, appName: 'Acme Studio' }

describe('setup prompt', () => {
  it('includes the pairing facts Codex needs and nothing more', () => {
    const prompt = buildSetupPrompt(options)
    expect(prompt).toContain('https://acme.example')
    expect(prompt).toContain(connection.pairingToken)
    expect(prompt).toContain('acme-studio')
    expect(prompt).toContain('https://acme.example/codex/codex-connector-bridge.mjs')
    expect(prompt).toContain(String(serviceCandidatePorts('acme-studio')[0]))
    expect(prompt).toContain(bridgeInstallPath('acme-studio'))
  })

  it('tells the agent not to touch credentials', () => {
    const prompt = buildSetupPrompt(options)
    expect(prompt).toContain('Do not copy, print or inspect ChatGPT/Codex access tokens')
    expect(prompt).toContain('read-only workspace')
  })

  it('forbids an HTTPS downgrade for a production origin', () => {
    const prompt = buildSetupPrompt(options)
    expect(prompt).toContain('Do not downgrade it to HTTP')
    expect(prompt).not.toContain('loopback-only local development origin')
  })

  it('authorizes the HTTP fetch only for a loopback dev origin', () => {
    const prompt = buildSetupPrompt({
      connection: createConnection({ serviceId: 'acme-studio', appOrigin: 'http://localhost:5173' }),
      appName: 'Acme Studio',
    })
    expect(prompt).toContain('loopback-only local development origin')
    expect(prompt).toContain('Do not rewrite the URL to HTTPS')
  })

  it('pipes the token into stdin instead of argv', () => {
    const prompt = buildSetupPrompt(options)
    expect(prompt).toContain(`printf '%s\\n' "<PAIRING_TOKEN>" |`)
    expect(prompt).toContain('--pairing-token-stdin')
    expect(prompt).not.toContain('--pairing-token <PAIRING_TOKEN>')
  })

  it('tells the agent not to echo the token', () => {
    const prompt = buildSetupPrompt(options)
    expect(prompt).toContain('do not echo the token')
  })

  it('asks for a checksum when one is supplied', async () => {
    const digest = await computeBridgeSha256('bridge source')
    const prompt = buildSetupPrompt({ ...options, bridgeSha256: digest })
    expect(prompt).toContain(`shasum -a 256`)
    expect(prompt).toContain(digest)
    expect(prompt).toContain('stop and report the mismatch')
    expect(prompt).not.toContain('delete')
  })

  it('falls back to a manual review when no checksum is supplied', () => {
    expect(buildSetupPrompt(options)).toContain('Read the downloaded file before running it')
  })

  it('honours a custom bridge path and rejects a relative one', () => {
    expect(buildSetupPrompt({ ...options, bridgePath: '/assets/bridge.mjs' }))
      .toContain('https://acme.example/assets/bridge.mjs')
    expect(() => buildSetupPrompt({ ...options, bridgePath: 'assets/bridge.mjs' }))
      .toThrow(/must start with/)
  })

  it('appends extra instructions as a final step', () => {
    expect(buildSetupPrompt({ ...options, extraInstructions: 'Say hi when done.' }))
      .toContain('7. Say hi when done.')
  })
})

describe('setup entry points', () => {
  it('builds an encoded ChatGPT desktop deep link', () => {
    const link = buildDesktopDeepLink(options)
    expect(link.startsWith('codex://threads/new?prompt=')).toBe(true)
    expect(decodeURIComponent(link.slice('codex://threads/new?prompt='.length)))
      .toBe(buildSetupPrompt(options))
  })

  it('single-quotes the CLI fallback so backticks are not executed', () => {
    const command = buildCliCommand(options)
    expect(command.startsWith("codex '")).toBe(true)
    expect(command.endsWith("'")).toBe(true)
    // The prompt contains `codex` in backticks; it must survive as literal text.
    expect(command).toContain('`codex`')
  })

  it('escapes a single quote in the app name', () => {
    const command = buildCliCommand({ ...options, appName: "Bob's Studio" })
    expect(command).toContain(`Bob'\\''s Studio`)
    expect(command.match(/^codex '/)).not.toBeNull()
  })
})

describe('bridge checksum', () => {
  it('hashes deterministically', async () => {
    expect(await computeBridgeSha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
