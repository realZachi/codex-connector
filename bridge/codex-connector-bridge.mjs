#!/usr/bin/env node
// Codex Connector Bridge
//
// Runs on the end user's own computer and exposes a deliberately tiny slice of
// the local Codex App Server to exactly one paired website.
//
// Security boundary (read this before running it):
//   * binds 127.0.0.1 only, never a routable interface
//   * serves only the one browser origin it was paired with
//   * requires a 256-bit bearer pairing token on every real request
//   * allowlists a fixed set of App Server RPC methods
//   * forces every thread into an empty read-only workspace with approvals off
//     and network access off
//   * never reads, prints or forwards ChatGPT/Codex credentials; the local
//     Codex App Server owns authentication
//
// Commands:
//   start --pairing-token-stdin --allowed-origin <o> --service-id <id> [--service-name <name>]
//         (or --pairing-token <t>, but stdin is preferred: argv is visible in ps)
//   serve  --service-id <id>
//   stop   --service-id <id>

import { spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const BRIDGE_PROTOCOL_VERSION = 1
const BRIDGE_HOST = '127.0.0.1'
const PORT_RANGE_START = 47_600
const PORT_RANGE_SPAN = 64
const PORT_CANDIDATE_COUNT = 4
const MAX_REQUEST_BYTES = 48 * 1024 * 1024
const MAX_EVENT_COUNT = 1_000
const LONG_POLL_TIMEOUT_MS = 20_000
const READY_ATTEMPTS = 40
const PAIRING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const CONTROL_SECRET_PATTERN = /^[A-Fa-f0-9]{64}$/
const SERVICE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/
const INITIALIZE_ID = 'codex-connector-initialize'

const ALLOWED_RPC_METHODS = new Set([
  'account/read',
  'account/rateLimits/read',
  'model/list',
  'thread/start',
  'thread/delete',
  'turn/start',
  'turn/interrupt',
])

const usage = `Codex Connector Bridge

Commands:
  start --pairing-token <token> --allowed-origin <origin> --service-id <id> [--service-name <name>]
  serve --service-id <id>
  stop --service-id <id>
`

const isObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const isValidServiceId = (value) =>
  typeof value === 'string' && SERVICE_ID_PATTERN.test(value)

const hashServiceId = (serviceId) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < serviceId.length; index += 1) {
    hash ^= serviceId.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

export const serviceCandidatePorts = (serviceId) => {
  if (!isValidServiceId(serviceId)) throw new Error('The service id is invalid')
  const base = hashServiceId(serviceId) % PORT_RANGE_SPAN
  return Array.from(
    { length: PORT_CANDIDATE_COUNT },
    (_unused, offset) => PORT_RANGE_START + ((base + offset) % PORT_RANGE_SPAN),
  )
}

const isLoopbackHostname = (hostname) => {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '127.0.0.1'
    || normalized === '[::1]'
}

export const normalizeOrigin = (value) => {
  let url
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

// Deliberately not `~/.local/share/codex-connector`: other OpenAI-adjacent
// tooling already uses that name, and this must never share a directory with
// something that stores its own keys.
const dataRoot = path.join(homedir(), '.local', 'share', 'codex-connector-bridge')
const serviceDirectory = (serviceId) => {
  if (!isValidServiceId(serviceId)) throw new Error('The service id is invalid')
  return path.join(dataRoot, serviceId)
}
const configPathFor = (serviceId) => path.join(serviceDirectory(serviceId), 'bridge.json')
const workspacePathFor = (serviceId) => path.join(serviceDirectory(serviceId), 'workspace')
const bridgeScriptPath = fileURLToPath(import.meta.url)

const readFlag = (args, flag) => {
  const index = args.indexOf(flag)
  if (index < 0) return null
  return args[index + 1] ?? null
}

export const assertPairingToken = (value) => {
  if (typeof value !== 'string' || !PAIRING_TOKEN_PATTERN.test(value)) {
    throw new Error('The pairing token is missing or invalid')
  }
  return value
}

/**
 * Reads the token from the first line of stdin. Preferred over the argv flag: a
 * token in argv is visible in `ps` for as long as the bridge runs.
 */
const readPairingTokenFromStdin = async () => {
  const lines = createInterface({ input: process.stdin })
  try {
    for await (const line of lines) return line.trim()
  } finally {
    lines.close()
  }
  throw new Error(
    'No pairing token arrived on stdin. Pipe it in, for example: printf \'%s\\n\' "$TOKEN" | ... start --pairing-token-stdin ...',
  )
}

export const parseBridgeCommand = (args) => {
  const [command = 'help'] = args
  if (command !== 'serve' && command !== 'stop' && command !== 'start') return { type: 'help' }

  const serviceId = readFlag(args, '--service-id')
  if (!isValidServiceId(serviceId)) throw new Error('The --service-id value is missing or invalid')
  if (command === 'serve' || command === 'stop') return { type: command, serviceId }

  const wantsStdinToken = args.includes('--pairing-token-stdin')
  const pairingToken = readFlag(args, '--pairing-token')
  const allowedOriginValue = readFlag(args, '--allowed-origin')
  const allowedOrigin = allowedOriginValue ? normalizeOrigin(allowedOriginValue) : null
  const serviceNameValue = readFlag(args, '--service-name')
  if (!wantsStdinToken && (!pairingToken || !PAIRING_TOKEN_PATTERN.test(pairingToken))) {
    throw new Error(
      'Provide the pairing token with --pairing-token-stdin (preferred) or --pairing-token <token>',
    )
  }
  if (!allowedOrigin) throw new Error('The --allowed-origin value is missing or invalid')
  return {
    type: 'start',
    serviceId,
    // Resolved from stdin in main() so it never appears in argv.
    pairingToken: wantsStdinToken ? null : pairingToken,
    readTokenFromStdin: wantsStdinToken,
    allowedOrigin,
    serviceName: typeof serviceNameValue === 'string' && serviceNameValue.trim()
      ? serviceNameValue.trim().slice(0, 60)
      : serviceId,
  }
}

const equalSecret = (actual, expected) => {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes)
}

export const isAuthorizedBridgeRequest = (options) => {
  if (options.requestOrigin !== options.config.allowedOrigin) return false
  const prefix = 'Bearer '
  if (!options.authorization?.startsWith(prefix)) return false
  return equalSecret(options.authorization.slice(prefix.length), options.config.pairingToken)
}

const isAllowedRpcMessage = (message) => {
  const hasId = typeof message['id'] === 'string' || typeof message['id'] === 'number'
  if (typeof message['method'] === 'string') {
    return ALLOWED_RPC_METHODS.has(message['method']) && hasId
  }
  return hasId && ('result' in message || 'error' in message)
}

/**
 * Drops anything outside the allowlist and overwrites the sandbox-relevant
 * params so a compromised page cannot widen the workspace, enable network
 * access or turn approvals back on.
 */
export const restrictRpcMessage = (message, workspacePath, serviceName) => {
  if (!isObject(message) || !isAllowedRpcMessage(message)) return null
  const method = message['method']
  const params = isObject(message['params']) ? message['params'] : {}
  if (method === 'thread/start') {
    return {
      ...message,
      params: {
        ...params,
        approvalPolicy: 'never',
        cwd: workspacePath,
        environments: [],
        sandbox: 'read-only',
        serviceName,
      },
    }
  }
  if (method === 'turn/start') {
    return {
      ...message,
      params: {
        ...params,
        approvalPolicy: 'never',
        cwd: workspacePath,
        environments: [],
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
      },
    }
  }
  return message
}

export const parseConfig = (value) => {
  if (!isObject(value)) return null
  const allowedOrigin = typeof value['allowedOrigin'] === 'string'
    ? normalizeOrigin(value['allowedOrigin'])
    : null
  if (
    value['version'] !== BRIDGE_PROTOCOL_VERSION
    || !isValidServiceId(value['serviceId'])
    || typeof value['pairingToken'] !== 'string'
    || !PAIRING_TOKEN_PATTERN.test(value['pairingToken'])
    || typeof value['controlSecret'] !== 'string'
    || !CONTROL_SECRET_PATTERN.test(value['controlSecret'])
    || !allowedOrigin
  ) return null
  return {
    version: BRIDGE_PROTOCOL_VERSION,
    serviceId: value['serviceId'],
    serviceName: typeof value['serviceName'] === 'string' && value['serviceName']
      ? value['serviceName']
      : value['serviceId'],
    pairingToken: value['pairingToken'],
    allowedOrigin,
    controlSecret: value['controlSecret'],
  }
}

const readConfig = async (serviceId) => {
  try {
    return parseConfig(JSON.parse(await readFile(configPathFor(serviceId), 'utf8')))
  } catch {
    return null
  }
}

const saveConfig = async (config) => {
  await mkdir(serviceDirectory(config.serviceId), { recursive: true, mode: 0o700 })
  await mkdir(workspacePathFor(config.serviceId), { recursive: true, mode: 0o700 })
  const target = configPathFor(config.serviceId)
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  await chmod(target, 0o600)
}

const readRequestBody = async (request) => {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk)
    size += bytes.length
    if (size > MAX_REQUEST_BYTES) throw new Error('Request body exceeds the bridge limit')
    chunks.push(bytes)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const writeJson = (response, statusCode, body, headers = {}) => {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  })
  response.end(JSON.stringify(body))
}

const corsHeaders = (allowedOrigin) => ({
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Private-Network': 'true',
  Vary: 'Origin',
})

/** Owns the `codex app-server` child process and its event backlog. */
class AppServerPipe {
  constructor() {
    this.events = []
    this.nextSequence = 1
    this.droppedThrough = 0
    this.waiters = new Set()
    this.initializationError = null
    this.isInitialized = false
    this.child = spawn('codex', ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child.once('error', (error) => {
      this.fail(`Unable to start Codex App Server: ${error.message}`)
    })
    this.child.once('exit', (code) => {
      this.fail(`Codex App Server stopped${code === null ? '' : ` with code ${String(code)}`}`)
    })
    this.child.stdin.on('error', (error) => {
      this.fail(`Codex App Server input failed: ${error.message}`)
    })
    this.child.stderr.resume()
    createInterface({ input: this.child.stdout }).on('line', (line) => this.handleLine(line))
    this.write({
      id: INITIALIZE_ID,
      method: 'initialize',
      params: {
        clientInfo: {
          name: 'codex-connector',
          title: 'Codex Connector',
          version: String(BRIDGE_PROTOCOL_VERSION),
        },
        capabilities: { experimentalApi: true },
      },
    })
  }

  getStatus() {
    return {
      ready: this.isInitialized,
      error: this.initializationError,
      sequence: this.nextSequence - 1,
    }
  }

  send(message) {
    if (!this.isInitialized) {
      throw new Error(this.initializationError ?? 'Codex App Server is not ready')
    }
    this.write(message)
  }

  async readEvents(after) {
    if (this.events.some((event) => event.sequence > after)) return this.eventBatch(after)
    if (this.initializationError) throw new Error(this.initializationError)
    await new Promise((resolve) => {
      const done = () => {
        clearTimeout(timeout)
        this.waiters.delete(done)
        resolve()
      }
      const timeout = setTimeout(done, LONG_POLL_TIMEOUT_MS)
      this.waiters.add(done)
    })
    if (!this.events.some((event) => event.sequence > after) && this.initializationError) {
      throw new Error(this.initializationError)
    }
    return this.eventBatch(after)
  }

  stop() {
    this.child.kill('SIGTERM')
  }

  fail(message) {
    this.initializationError = message
    this.isInitialized = false
    this.wakeWaiters()
  }

  handleLine(line) {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (!isObject(message)) return
    if (message['id'] === INITIALIZE_ID) {
      if ('error' in message) {
        this.fail('Codex App Server rejected the connector handshake')
        return
      }
      try {
        this.write({ method: 'initialized', params: {} })
        this.isInitialized = true
        this.wakeWaiters()
      } catch (error) {
        this.fail(error instanceof Error ? error.message : 'Codex App Server input is unavailable')
      }
      return
    }
    this.events.push({ sequence: this.nextSequence, message })
    this.nextSequence += 1
    while (this.events.length > MAX_EVENT_COUNT) {
      const dropped = this.events.shift()
      if (dropped) this.droppedThrough = dropped.sequence
    }
    this.wakeWaiters()
  }

  write(message) {
    if (this.child.stdin.destroyed || !this.child.stdin.writable) {
      throw new Error(this.initializationError ?? 'Codex App Server input is unavailable')
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  eventBatch(after) {
    return {
      events: this.events.filter((event) => event.sequence > after),
      sequence: this.nextSequence - 1,
      droppedThrough: this.droppedThrough,
    }
  }

  wakeWaiters() {
    for (const resolve of this.waiters) resolve()
    this.waiters.clear()
  }
}

const isControlRequest = (request, config) => {
  const value = request.headers['x-codex-connector-control']
  return typeof value === 'string' && equalSecret(value, config.controlSecret)
}

const handleControlRequest = async (options) => {
  const { request, response, requestUrl, config, onReload, onStop } = options
  if (requestUrl.pathname === '/v1/control/reload' && request.method === 'POST') {
    if (!isControlRequest(request, config)) {
      writeJson(response, 401, { error: 'Unauthorized' })
      return true
    }
    const nextConfig = await readConfig(config.serviceId)
    if (nextConfig?.controlSecret !== config.controlSecret) {
      writeJson(response, 409, { error: 'Config reload failed' })
      return true
    }
    onReload(nextConfig)
    writeJson(response, 200, { reloaded: true })
    return true
  }
  if (requestUrl.pathname !== '/v1/control/stop' || request.method !== 'POST') return false
  if (!isControlRequest(request, config)) {
    writeJson(response, 401, { error: 'Unauthorized' })
    return true
  }
  writeJson(response, 200, { stopped: true })
  onStop()
  return true
}

const handleRpcRequest = async (options, headers) => {
  const { request, response, config, appServer } = options
  try {
    const parsed = JSON.parse(await readRequestBody(request))
    const message = restrictRpcMessage(
      parsed,
      workspacePathFor(config.serviceId),
      config.serviceName,
    )
    if (!message) {
      writeJson(response, 400, { error: 'RPC method is not allowed' }, headers)
      return
    }
    appServer.send(message)
    writeJson(response, 202, { accepted: true }, headers)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid RPC body'
    writeJson(response, appServer.getStatus().ready ? 400 : 503, { error: message }, headers)
  }
}

const handleAuthorizedRequest = async (options, headers) => {
  const { request, response, requestUrl, config, appServer } = options
  if (requestUrl.pathname === '/v1/status' && request.method === 'GET') {
    writeJson(response, 200, {
      bridgeVersion: BRIDGE_PROTOCOL_VERSION,
      serviceId: config.serviceId,
      appServer: appServer.getStatus(),
    }, headers)
    return
  }
  if (requestUrl.pathname === '/v1/events' && request.method === 'GET') {
    const afterValue = Number(requestUrl.searchParams.get('after') ?? 0)
    const after = Number.isSafeInteger(afterValue) && afterValue >= 0 ? afterValue : 0
    try {
      writeJson(response, 200, await appServer.readEvents(after), headers)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Codex App Server is unavailable'
      writeJson(response, 503, { error: message }, headers)
    }
    return
  }
  if (requestUrl.pathname === '/v1/rpc' && request.method === 'POST') {
    await handleRpcRequest(options, headers)
    return
  }
  writeJson(response, 404, { error: 'Not found' }, headers)
}

const handleBridgeRequest = async (options) => {
  const { request, response, requestUrl, config, appServer } = options
  // Unauthenticated discovery. Returns only the service id and protocol
  // version so the browser can tell "wrong bridge" from "no bridge" without
  // ever sending its pairing token to a stranger on another port.
  if (requestUrl.pathname === '/v1/hello' && request.method === 'GET') {
    writeJson(response, 200, {
      bridgeVersion: BRIDGE_PROTOCOL_VERSION,
      serviceId: config.serviceId,
      ready: appServer.getStatus().ready,
    }, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Private-Network': 'true',
    })
    return
  }
  if (requestUrl.pathname === '/readyz' && request.method === 'GET') {
    const status = appServer.getStatus()
    writeJson(response, status.ready ? 200 : 503, { ready: status.ready })
    return
  }
  if (request.method === 'OPTIONS') {
    const isHello = requestUrl.pathname === '/v1/hello'
    response.writeHead(204, isHello
      ? {
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Private-Network': 'true',
        }
      : corsHeaders(config.allowedOrigin))
    response.end()
    return
  }
  if (await handleControlRequest(options)) return

  const headers = corsHeaders(config.allowedOrigin)
  if (!isAuthorizedBridgeRequest({
    requestOrigin: request.headers.origin,
    authorization: request.headers.authorization,
    config,
  })) {
    writeJson(response, 401, { error: 'Unauthorized' }, headers)
    return
  }
  await handleAuthorizedRequest(options, headers)
}

const listenOnCandidatePort = async (server, serviceId) => {
  const candidates = serviceCandidatePorts(serviceId)
  for (const port of candidates) {
    try {
      await new Promise((resolve, reject) => {
        const handleError = (error) => reject(error)
        server.once('error', handleError)
        server.listen(port, BRIDGE_HOST, () => {
          server.off('error', handleError)
          resolve()
        })
      })
      return port
    } catch (error) {
      if (error?.code !== 'EADDRINUSE') throw error
    }
  }
  throw new Error(`All connector ports for this service are in use (${candidates.join(', ')})`)
}

const startHttpBridge = async (serviceId) => {
  const storedConfig = await readConfig(serviceId)
  if (!storedConfig) throw new Error(`Missing or invalid bridge config at ${configPathFor(serviceId)}`)
  let config = storedConfig
  const appServer = new AppServerPipe()
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    void handleBridgeRequest({
      request,
      response,
      requestUrl,
      config,
      appServer,
      onReload: (nextConfig) => { config = nextConfig },
      onStop: () => {
        appServer.stop()
        server.close()
      },
    }).catch((error) => {
      if (response.headersSent) return
      const message = error instanceof Error ? error.message : 'Bridge request failed'
      console.error(`Codex Connector Bridge request failed: ${message}`)
      writeJson(response, 500, { error: 'Bridge request failed' })
    })
  })
  try {
    await listenOnCandidatePort(server, serviceId)
  } catch (error) {
    appServer.stop()
    throw error
  }
  server.on('error', (error) => {
    appServer.stop()
    console.error(`Codex Connector Bridge server failed: ${error.message}`)
    process.exitCode = 1
  })
}

const controlRequest = async (pathName, config) => {
  for (const port of serviceCandidatePorts(config.serviceId)) {
    try {
      const response = await fetch(`http://${BRIDGE_HOST}:${String(port)}${pathName}`, {
        method: 'POST',
        headers: { 'X-Codex-Connector-Control': config.controlSecret },
        signal: AbortSignal.timeout(1_500),
      })
      if (response.ok) return true
    } catch {
      // Try the next candidate port.
    }
  }
  return false
}

const waitUntilReady = async (serviceId) => {
  const candidates = serviceCandidatePorts(serviceId)
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
    for (const port of candidates) {
      try {
        const response = await fetch(`http://${BRIDGE_HOST}:${String(port)}/v1/hello`, {
          signal: AbortSignal.timeout(500),
        })
        if (!response.ok) continue
        const body = await response.json()
        if (body?.serviceId === serviceId && body?.ready === true) return port
      } catch {
        // The detached process is still starting.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return null
}

const startDetachedBridge = async (command) => {
  const pairingToken = command.readTokenFromStdin
    ? assertPairingToken(await readPairingTokenFromStdin())
    : command.pairingToken
  const existingConfig = await readConfig(command.serviceId)
  const config = {
    version: BRIDGE_PROTOCOL_VERSION,
    serviceId: command.serviceId,
    serviceName: command.serviceName,
    pairingToken,
    allowedOrigin: command.allowedOrigin,
    controlSecret: existingConfig?.controlSecret ?? randomBytes(32).toString('hex'),
  }
  await saveConfig(config)
  if (await controlRequest('/v1/control/reload', config)) {
    process.stdout.write(`Codex Connector pairing updated for ${config.serviceName}.\n`)
    return
  }

  const child = spawn(process.execPath, [bridgeScriptPath, 'serve', '--service-id', config.serviceId], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  const port = await waitUntilReady(config.serviceId)
  if (port === null) {
    throw new Error('The bridge started but Codex App Server did not become ready')
  }
  process.stdout.write(
    `Codex Connector Bridge for ${config.serviceName} is ready on 127.0.0.1:${String(port)}.\n`,
  )
}

const stopBridge = async (serviceId) => {
  const config = await readConfig(serviceId)
  if (!config || !await controlRequest('/v1/control/stop', config)) {
    process.stdout.write('Codex Connector Bridge is not running.\n')
    return
  }
  process.stdout.write('Codex Connector Bridge stopped.\n')
}

const main = async () => {
  const command = parseBridgeCommand(process.argv.slice(2))
  if (command.type === 'help') {
    process.stdout.write(usage)
    return
  }
  if (command.type === 'serve') {
    await startHttpBridge(command.serviceId)
    return
  }
  if (command.type === 'stop') {
    await stopBridge(command.serviceId)
    return
  }
  await startDetachedBridge(command)
}

const entryPath = process.argv[1]
if (entryPath && import.meta.url === pathToFileURL(path.resolve(entryPath)).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Codex Connector Bridge: ${message}`)
    process.exitCode = 1
  })
}
