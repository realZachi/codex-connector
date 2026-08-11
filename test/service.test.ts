import { describe, expect, it } from 'vitest'
import * as bridge from '../bridge/codex-connector-bridge.mjs'
import {
  PORT_RANGE_SPAN,
  PORT_RANGE_START,
  assertValidServiceId,
  bridgeOrigin,
  isValidServiceId,
  serviceCandidatePorts,
} from '../src/service'

describe('service identity', () => {
  it('accepts realistic ids and rejects unsafe ones', () => {
    expect(isValidServiceId('acme-studio')).toBe(true)
    expect(isValidServiceId('shotluma')).toBe(true)
    expect(isValidServiceId('Acme')).toBe(false)
    expect(isValidServiceId('-acme')).toBe(false)
    expect(isValidServiceId('acme-')).toBe(false)
    expect(isValidServiceId('ab')).toBe(false)
    expect(isValidServiceId('../etc')).toBe(false)
    expect(isValidServiceId('a'.repeat(41))).toBe(false)
  })

  it('explains the rule when an id is invalid', () => {
    expect(() => assertValidServiceId('Bad Id')).toThrow(/lowercase letters/)
  })

  it('keeps every candidate port inside the reserved range', () => {
    for (const serviceId of ['acme-studio', 'shotluma', 'a-b-c', 'zzz']) {
      const ports = serviceCandidatePorts(serviceId)
      expect(ports).toHaveLength(4)
      expect(new Set(ports).size).toBe(4)
      for (const port of ports) {
        expect(port).toBeGreaterThanOrEqual(PORT_RANGE_START)
        expect(port).toBeLessThan(PORT_RANGE_START + PORT_RANGE_SPAN)
      }
    }
  })

  it('derives ports deterministically and distinctly per service', () => {
    expect(serviceCandidatePorts('acme-studio')).toEqual(serviceCandidatePorts('acme-studio'))
    expect(serviceCandidatePorts('acme-studio')[0]).not.toBe(serviceCandidatePorts('shotluma')[0])
  })

  it('matches the bridge implementation exactly', () => {
    // The bridge is a standalone download and cannot import the package, so the
    // derivation is duplicated. Discovery breaks silently if they ever diverge.
    for (const serviceId of ['acme-studio', 'shotluma', 'my-app-123', 'q'.repeat(40)]) {
      expect(bridge.serviceCandidatePorts(serviceId)).toEqual(serviceCandidatePorts(serviceId))
    }
  })

  it('builds a loopback origin', () => {
    expect(bridgeOrigin(47_600)).toBe('http://127.0.0.1:47600')
  })
})
