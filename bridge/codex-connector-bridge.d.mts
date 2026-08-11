export const BRIDGE_PROTOCOL_VERSION: 1

export interface BridgeConfig {
  version: 1
  serviceId: string
  serviceName: string
  pairingToken: string
  allowedOrigin: string
  controlSecret: string
}

export type BridgeCommand =
  | { type: 'help' }
  | { type: 'serve' | 'stop'; serviceId: string }
  | {
    type: 'start'
    serviceId: string
    serviceName: string
    pairingToken: string | null
    readTokenFromStdin: boolean
    allowedOrigin: string
  }

export function isValidServiceId(value: unknown): value is string

export function serviceCandidatePorts(serviceId: string): number[]

export function normalizeOrigin(value: string): string | null

export function assertPairingToken(value: unknown): string

export function parseBridgeCommand(args: string[]): BridgeCommand

export function isAuthorizedBridgeRequest(options: {
  requestOrigin?: string | undefined
  authorization?: string | undefined
  config: Pick<BridgeConfig, 'allowedOrigin' | 'pairingToken'>
}): boolean

export function restrictRpcMessage(
  message: Record<string, unknown>,
  workspacePath: string,
  serviceName: string,
): Record<string, unknown> | null

export function parseConfig(value: unknown): BridgeConfig | null
