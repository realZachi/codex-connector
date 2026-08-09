import {
  CONNECTOR_PROTOCOL_VERSION,
  assertValidServiceId,
  isValidServiceId,
} from './service'

const PAIRING_TOKEN_BYTES = 32
const PAIRING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export type CodexConnection = {
  version: typeof CONNECTOR_PROTOCOL_VERSION
  serviceId: string
  pairingToken: string
  appOrigin: string
  /** Last port the bridge answered on. A cache only; discovery re-probes. */
  port: number | null
}

type KeyStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type RandomSource = Pick<Crypto, 'getRandomValues'>

export const connectionStorageKey = (serviceId: string): string =>
  `codex-connector:${assertValidServiceId(serviceId)}`

const getBrowserStorage = (): KeyStorage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const encodeBase64Url = (bytes: Uint8Array): string => {
  const characterAt = (index: number) => BASE64URL_ALPHABET[index] ?? ''
  let result = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    result += characterAt(first >> 2)
    result += characterAt(((first & 3) << 4) | ((second ?? 0) >> 4))
    if (second !== undefined) result += characterAt(((second & 15) << 2) | ((third ?? 0) >> 6))
    if (third !== undefined) result += characterAt(third & 63)
  }
  return result
}

export const isValidPairingToken = (value: unknown): value is string =>
  typeof value === 'string' && PAIRING_TOKEN_PATTERN.test(value)

const isLoopbackHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '127.0.0.1'
    || normalized === '[::1]'
}

/**
 * Only HTTPS origins pair, with a loopback exception for local development.
 * Without this a plain-HTTP site could be spoofed on a shared network and then
 * speak to a bridge that trusts its origin.
 */
export const normalizeAppOrigin = (value: string): string | null => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) return null
  if (url.username || url.password) return null
  return url.origin
}

export const createPairingToken = (
  randomSource: RandomSource = globalThis.crypto,
): string => {
  const bytes = new Uint8Array(PAIRING_TOKEN_BYTES)
  randomSource.getRandomValues(bytes)
  return encodeBase64Url(bytes)
}

export const createConnection = (options: {
  serviceId: string
  appOrigin: string
  randomSource?: RandomSource
}): CodexConnection => {
  const appOrigin = normalizeAppOrigin(options.appOrigin)
  if (!appOrigin) {
    throw new Error('Codex Connector needs an HTTPS origin or a loopback development origin')
  }
  return {
    version: CONNECTOR_PROTOCOL_VERSION,
    serviceId: assertValidServiceId(options.serviceId),
    pairingToken: createPairingToken(options.randomSource),
    appOrigin,
    port: null,
  }
}

export const parseConnection = (raw: string | null): CodexConnection | null => {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const appOrigin = typeof record['appOrigin'] === 'string'
    ? normalizeAppOrigin(record['appOrigin'])
    : null
  if (
    record['version'] !== CONNECTOR_PROTOCOL_VERSION
    || !isValidServiceId(record['serviceId'])
    || !isValidPairingToken(record['pairingToken'])
    || !appOrigin
  ) return null
  const port = record['port']
  return {
    version: CONNECTOR_PROTOCOL_VERSION,
    serviceId: record['serviceId'],
    pairingToken: record['pairingToken'],
    appOrigin,
    port: typeof port === 'number' && Number.isSafeInteger(port) && port > 0 ? port : null,
  }
}

export const readConnection = (
  serviceId: string,
  storage: KeyStorage | null = getBrowserStorage(),
): CodexConnection | null => {
  if (!storage) return null
  try {
    const connection = parseConnection(storage.getItem(connectionStorageKey(serviceId)))
    return connection?.serviceId === serviceId ? connection : null
  } catch {
    return null
  }
}

export const writeConnection = (
  connection: CodexConnection,
  storage: KeyStorage | null = getBrowserStorage(),
): boolean => {
  if (!storage) return false
  try {
    storage.setItem(connectionStorageKey(connection.serviceId), JSON.stringify(connection))
    return true
  } catch {
    return false
  }
}

export const removeConnection = (
  serviceId: string,
  storage: KeyStorage | null = getBrowserStorage(),
): boolean => {
  if (!storage) return false
  try {
    storage.removeItem(connectionStorageKey(serviceId))
    return true
  } catch {
    return false
  }
}
