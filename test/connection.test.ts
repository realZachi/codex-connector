import { describe, expect, it } from 'vitest'
import {
  connectionStorageKey,
  createConnection,
  createPairingToken,
  isValidPairingToken,
  normalizeAppOrigin,
  parseConnection,
  readConnection,
  removeConnection,
  writeConnection,
} from '../src/connection'

const createStorage = () => {
  const entries = new Map<string, string>()
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) },
  }
}

describe('pairing tokens', () => {
  it('generates 256-bit base64url tokens', () => {
    const token = createPairingToken()
    expect(isValidPairingToken(token)).toBe(true)
    expect(token).toHaveLength(43)
    expect(createPairingToken()).not.toBe(token)
  })

  it('rejects malformed tokens', () => {
    expect(isValidPairingToken('short')).toBe(false)
    expect(isValidPairingToken(`${'a'.repeat(42)}+`)).toBe(false)
    expect(isValidPairingToken(null)).toBe(false)
  })
})

describe('app origins', () => {
  it('allows HTTPS and loopback development origins', () => {
    expect(normalizeAppOrigin('https://acme.example/app?x=1')).toBe('https://acme.example')
    expect(normalizeAppOrigin('http://localhost:5173')).toBe('http://localhost:5173')
    expect(normalizeAppOrigin('http://acme.example')).toBeNull()
    expect(normalizeAppOrigin('ftp://acme.example')).toBeNull()
  })
})

describe('connection storage', () => {
  it('round-trips a connection scoped by service id', () => {
    const storage = createStorage()
    const connection = createConnection({ serviceId: 'acme-studio', appOrigin: 'https://acme.example' })
    expect(writeConnection(connection, storage)).toBe(true)
    expect(storage.entries.has(connectionStorageKey('acme-studio'))).toBe(true)
    expect(readConnection('acme-studio', storage)).toEqual(connection)
    expect(readConnection('other-app', storage)).toBeNull()
  })

  it('remembers the discovered port', () => {
    const storage = createStorage()
    const connection = createConnection({ serviceId: 'acme-studio', appOrigin: 'https://acme.example' })
    expect(connection.port).toBeNull()
    writeConnection({ ...connection, port: 47_601 }, storage)
    expect(readConnection('acme-studio', storage)?.port).toBe(47_601)
  })

  it('drops a tampered or stale entry instead of trusting it', () => {
    const storage = createStorage()
    storage.setItem(connectionStorageKey('acme-studio'), 'not json')
    expect(readConnection('acme-studio', storage)).toBeNull()
    storage.setItem(connectionStorageKey('acme-studio'), JSON.stringify({
      version: 1,
      serviceId: 'acme-studio',
      pairingToken: 'too-short',
      appOrigin: 'https://acme.example',
    }))
    expect(readConnection('acme-studio', storage)).toBeNull()
    expect(parseConnection(JSON.stringify({
      version: 99,
      serviceId: 'acme-studio',
      pairingToken: 'a'.repeat(43),
      appOrigin: 'https://acme.example',
    }))).toBeNull()
  })

  it('removes a connection', () => {
    const storage = createStorage()
    const connection = createConnection({ serviceId: 'acme-studio', appOrigin: 'https://acme.example' })
    writeConnection(connection, storage)
    expect(removeConnection('acme-studio', storage)).toBe(true)
    expect(readConnection('acme-studio', storage)).toBeNull()
  })

  it('refuses to pair from a non-secure origin', () => {
    expect(() => createConnection({ serviceId: 'acme-studio', appOrigin: 'http://acme.example' }))
      .toThrow(/HTTPS/)
  })
})
