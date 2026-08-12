import { describe, expect, it } from 'vitest'
import * as bridge from '../bridge/codex-connector-bridge.mjs'

const validToken = 'a'.repeat(43)
const config = {
  version: 1,
  serviceId: 'acme-studio',
  serviceName: 'Acme Studio',
  pairingToken: validToken,
  allowedOrigin: 'https://acme.example',
  controlSecret: 'f'.repeat(64),
}

describe('bridge origin handling', () => {
  it('accepts HTTPS and loopback HTTP only', () => {
    expect(bridge.normalizeOrigin('https://acme.example/app')).toBe('https://acme.example')
    expect(bridge.normalizeOrigin('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173')
    expect(bridge.normalizeOrigin('http://localhost:5173')).toBe('http://localhost:5173')
    expect(bridge.normalizeOrigin('http://acme.example')).toBeNull()
    expect(bridge.normalizeOrigin('file:///etc/passwd')).toBeNull()
    expect(bridge.normalizeOrigin('https://user:pw@acme.example')).toBeNull()
    expect(bridge.normalizeOrigin('not a url')).toBeNull()
  })
})

describe('bridge authorization', () => {
  const authorize = (requestOrigin?: string, authorization?: string) =>
    bridge.isAuthorizedBridgeRequest({ requestOrigin, authorization, config })

  it('requires the paired origin and the exact pairing token', () => {
    expect(authorize('https://acme.example', `Bearer ${validToken}`)).toBe(true)
  })

  it('rejects another origin, a missing header and a wrong token', () => {
    expect(authorize('https://evil.example', `Bearer ${validToken}`)).toBe(false)
    expect(authorize(undefined, `Bearer ${validToken}`)).toBe(false)
    expect(authorize('https://acme.example', undefined)).toBe(false)
    expect(authorize('https://acme.example', `Bearer ${'b'.repeat(43)}`)).toBe(false)
    expect(authorize('https://acme.example', validToken)).toBe(false)
  })
})

describe('bridge RPC restriction', () => {
  const restrict = (message: Record<string, unknown>) =>
    bridge.restrictRpcMessage(message, '/tmp/workspace', 'Acme Studio')

  it('allows the documented methods with an id', () => {
    expect(restrict({ id: 1, method: 'account/read', params: {} })).not.toBeNull()
    expect(restrict({ id: 'x', method: 'turn/interrupt', params: {} })).not.toBeNull()
  })

  it('drops anything outside the allowlist', () => {
    expect(restrict({ id: 1, method: 'exec/command', params: {} })).toBeNull()
    expect(restrict({ id: 1, method: 'thread/list', params: {} })).toBeNull()
    expect(restrict({ method: 'account/read', params: {} })).toBeNull()
    expect(restrict({ id: 1 })).toBeNull()
  })

  it('passes tool-call responses back through', () => {
    expect(restrict({ id: 7, result: { success: true } })).toEqual({ id: 7, result: { success: true } })
  })

  it('forces the sandbox on thread/start even when the page asks for more', () => {
    const message = restrict({
      id: 1,
      method: 'thread/start',
      params: {
        cwd: '/Users/someone',
        ephemeral: false,
        sandbox: 'danger-full-access',
        approvalPolicy: 'never',
      },
    })
    expect(message?.params).toMatchObject({
      approvalPolicy: 'never',
      cwd: '/tmp/workspace',
      environments: [],
      ephemeral: true,
      sandbox: 'read-only',
      serviceName: 'Acme Studio',
    })
  })

  it('forces read-only and no network on turn/start', () => {
    const message = restrict({
      id: 2,
      method: 'turn/start',
      params: { sandboxPolicy: { type: 'dangerFullAccess', networkAccess: true } },
    })
    expect(message?.params).toMatchObject({
      approvalPolicy: 'never',
      cwd: '/tmp/workspace',
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
    })
  })
})

describe('bridge command parsing', () => {
  it('parses a start command with stdin token flag', () => {
    expect(bridge.parseBridgeCommand([
      'start',
      '--pairing-token-stdin',
      '--service-id',
      'my-app',
      '--allowed-origin',
      'https://my.app',
      '--service-name',
      'My App',
    ])).toEqual({
      type: 'start',
      serviceId: 'my-app',
      pairingToken: null,
      readTokenFromStdin: true,
      allowedOrigin: 'https://my.app',
      serviceName: 'My App',
    })
  })

  it('parses a start command with argv token (for compatibility)', () => {
    expect(bridge.parseBridgeCommand([
      'start',
      '--pairing-token', validToken,
      '--allowed-origin', 'https://acme.example/app',
      '--service-id', 'acme-studio',
      '--service-name', 'Acme Studio',
    ])).toEqual({
      type: 'start',
      serviceId: 'acme-studio',
      serviceName: 'Acme Studio',
      pairingToken: validToken,
      readTokenFromStdin: false,
      allowedOrigin: 'https://acme.example',
    })
  })

  it('falls back to the service id as the display name', () => {
    const command = bridge.parseBridgeCommand([
      'start',
      '--pairing-token', validToken,
      '--allowed-origin', 'https://acme.example',
      '--service-id', 'acme-studio',
    ])
    expect(command.type).toBe('start')
    if (command.type !== 'start') throw new Error('Expected a start command')
    expect(command.serviceName).toBe('acme-studio')
  })

  it('rejects a bad token, origin or service id', () => {
    const base = ['start', '--pairing-token', validToken, '--allowed-origin', 'https://acme.example']
    expect(() => bridge.parseBridgeCommand([...base, '--service-id', '../etc'])).toThrow(/service-id/)
    expect(() => bridge.parseBridgeCommand([
      'start', '--pairing-token', 'short', '--allowed-origin', 'https://acme.example',
      '--service-id', 'acme-studio',
    ])).toThrow(/pairing-token/)
    expect(() => bridge.parseBridgeCommand([
      'start', '--pairing-token', validToken, '--allowed-origin', 'http://acme.example',
      '--service-id', 'acme-studio',
    ])).toThrow(/allowed-origin/)
  })

  it('parses serve and stop, and defaults to help', () => {
    expect(bridge.parseBridgeCommand(['serve', '--service-id', 'acme-studio']))
      .toEqual({ type: 'serve', serviceId: 'acme-studio' })
    expect(bridge.parseBridgeCommand(['stop', '--service-id', 'acme-studio']))
      .toEqual({ type: 'stop', serviceId: 'acme-studio' })
    expect(bridge.parseBridgeCommand([])).toEqual({ type: 'help' })
  })
})

describe('bridge config parsing', () => {
  it('accepts a well-formed config', () => {
    expect(bridge.parseConfig(config)?.serviceId).toBe('acme-studio')
  })

  it('rejects a config with a tampered field', () => {
    expect(bridge.parseConfig({ ...config, version: 99 })).toBeNull()
    expect(bridge.parseConfig({ ...config, pairingToken: 'nope' })).toBeNull()
    expect(bridge.parseConfig({ ...config, controlSecret: 'nope' })).toBeNull()
    expect(bridge.parseConfig({ ...config, allowedOrigin: 'http://acme.example' })).toBeNull()
    expect(bridge.parseConfig({ ...config, serviceId: '../etc' })).toBeNull()
    expect(bridge.parseConfig(null)).toBeNull()
  })
})
