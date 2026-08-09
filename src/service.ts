export const CONNECTOR_PROTOCOL_VERSION = 1

/**
 * Every website gets its own bridge process, config directory and port so two
 * connector-enabled sites can never read each other's pairing or share a
 * Codex thread. The port is derived from the service id so the browser can find
 * the bridge again without a discovery file it is not allowed to read.
 */
export const PORT_RANGE_START = 47_600
export const PORT_RANGE_SPAN = 64
export const PORT_CANDIDATE_COUNT = 4

const SERVICE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

export const isValidServiceId = (value: unknown): value is string =>
  typeof value === 'string' && SERVICE_ID_PATTERN.test(value)

export const assertValidServiceId = (value: string): string => {
  if (!isValidServiceId(value)) {
    throw new Error(
      'serviceId must be 3-40 characters of lowercase letters, digits and dashes, e.g. "acme-studio"',
    )
  }
  return value
}

/** FNV-1a keeps the derivation identical in the browser and in the bridge. */
const hashServiceId = (serviceId: string): number => {
  let hash = 0x811c9dc5
  for (let index = 0; index < serviceId.length; index += 1) {
    hash ^= serviceId.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/**
 * Ports the bridge is allowed to bind, in order. The bridge walks this list on
 * `EADDRINUSE`; the browser probes the same list, so no port is ever guessed.
 */
export const serviceCandidatePorts = (serviceId: string): number[] => {
  assertValidServiceId(serviceId)
  const base = hashServiceId(serviceId) % PORT_RANGE_SPAN
  return Array.from(
    { length: PORT_CANDIDATE_COUNT },
    (_unused, offset) => PORT_RANGE_START + ((base + offset) % PORT_RANGE_SPAN),
  )
}

export const bridgeOrigin = (port: number): string => `http://127.0.0.1:${String(port)}`
