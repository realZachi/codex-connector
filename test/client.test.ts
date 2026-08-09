import { describe, expect, it, vi } from 'vitest'
import { discoverBridgePort, discoveryPorts, probeBridge } from '../src/client'
import { createConnection, type CodexConnection } from '../src/connection'
import { serviceCandidatePorts } from '../src/service'

const connection: CodexConnection = createConnection({
  serviceId: 'acme-studio',
  appOrigin: 'https://acme.example',
})
const ports = serviceCandidatePorts('acme-studio')

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const helloFetcher = (map: Record<number, unknown>) =>
  vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = new URL(String(input))
    const port = Number(url.port)
    if (url.pathname === '/v1/hello') {
      const body = map[port]
      if (!body) throw new TypeError('Failed to fetch')
      return jsonResponse(body)
    }
    if (url.pathname === '/v1/status') {
      return jsonResponse({
        bridgeVersion: 1,
        serviceId: 'acme-studio',
        appServer: { ready: true, error: null, sequence: 12 },
      })
    }
    throw new TypeError('Failed to fetch')
  })

describe('port discovery', () => {
  it('probes the cached port first', () => {
    const cached = ports[2] ?? 0
    expect(discoveryPorts({ ...connection, port: cached })[0]).toBe(cached)
    expect(discoveryPorts({ ...connection, port: cached })).toHaveLength(ports.length)
    expect(discoveryPorts({ ...connection, port: 1 })).toEqual(ports)
    expect(discoveryPorts(connection)).toEqual(ports)
  })

  it('finds the bridge that reports the matching service id', async () => {
    const fetcher = helloFetcher({
      [ports[1] ?? 0]: { bridgeVersion: 1, serviceId: 'acme-studio', ready: true },
    })
    await expect(discoverBridgePort({ connection, fetcher })).resolves.toBe(ports[1])
  })

  it('skips a bridge belonging to another app', async () => {
    const fetcher = helloFetcher({
      [ports[0] ?? 0]: { bridgeVersion: 1, serviceId: 'other-app', ready: true },
    })
    await expect(discoverBridgePort({ connection, fetcher })).resolves.toBeNull()
  })

  it('never sends the pairing token while probing', async () => {
    const fetcher = helloFetcher({
      [ports[0] ?? 0]: { bridgeVersion: 1, serviceId: 'other-app', ready: true },
    })
    await discoverBridgePort({ connection, fetcher })
    for (const call of fetcher.mock.calls) {
      expect(JSON.stringify(call[1] ?? {})).not.toContain(connection.pairingToken)
    }
  })

  it('returns null when nothing is listening', async () => {
    await expect(discoverBridgePort({ connection, fetcher: helloFetcher({}) })).resolves.toBeNull()
  })
})

describe('bridge probe', () => {
  it('reports the discovered port and App Server state', async () => {
    const fetcher = helloFetcher({
      [ports[0] ?? 0]: { bridgeVersion: 1, serviceId: 'acme-studio', ready: true },
    })
    await expect(probeBridge({ connection, fetcher })).resolves.toEqual({
      bridgeVersion: 1,
      serviceId: 'acme-studio',
      port: ports[0],
      appServerReady: true,
      appServerError: null,
      sequence: 12,
    })
  })

  it('sends the pairing token to the matching bridge only', async () => {
    const fetcher = helloFetcher({
      [ports[0] ?? 0]: { bridgeVersion: 1, serviceId: 'acme-studio', ready: true },
    })
    await probeBridge({ connection, fetcher })
    const statusCall = fetcher.mock.calls.find(([input]) => String(input).includes('/v1/status'))
    expect((statusCall?.[1]?.headers as Record<string, string>)['Authorization'])
      .toBe(`Bearer ${connection.pairingToken}`)
  })

  it('explains that the connector is not running', async () => {
    await expect(probeBridge({ connection, fetcher: helloFetcher({}) }))
      .rejects.toThrow(/not running yet/)
  })

  it('asks the user to re-run setup on a protocol mismatch', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/v1/hello') {
        return jsonResponse({ bridgeVersion: 2, serviceId: 'acme-studio', ready: true })
      }
      return jsonResponse({
        bridgeVersion: 2,
        serviceId: 'acme-studio',
        appServer: { ready: true, error: null, sequence: 0 },
      })
    })
    await expect(probeBridge({ connection, fetcher })).rejects.toThrow(/run the setup prompt again/)
  })

  it('rejects a bridge paired with another app', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/v1/hello') {
        return jsonResponse({ bridgeVersion: 1, serviceId: 'acme-studio', ready: true })
      }
      return jsonResponse({
        bridgeVersion: 1,
        serviceId: 'other-app',
        appServer: { ready: true, error: null, sequence: 0 },
      })
    })
    await expect(probeBridge({ connection, fetcher })).rejects.toThrow(/another app/)
  })

  it('surfaces a bridge error body', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/v1/hello') {
        return jsonResponse({ bridgeVersion: 1, serviceId: 'acme-studio', ready: true })
      }
      return jsonResponse({ error: 'Unauthorized' }, 401)
    })
    await expect(probeBridge({ connection, fetcher })).rejects.toThrow(/\(401\): Unauthorized/)
  })
})
