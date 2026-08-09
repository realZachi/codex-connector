import { serviceCandidatePorts } from './service'
import type { CodexConnection } from './connection'

export const DEFAULT_BRIDGE_PATH = '/codex/codex-connector-bridge.mjs'

export type SetupPromptOptions = {
  connection: CodexConnection
  /** Product name shown to the user inside Codex. */
  appName: string
  /** Absolute path on your origin where the bridge module is served. */
  bridgePath?: string
  /**
   * SHA-256 of the served bridge file as lowercase hex. When set, Codex is told
   * to verify the download before running it, which turns a wrong-URL or
   * tampered-response mistake into a hard stop.
   */
  bridgeSha256?: string
  /** Extra sentences appended verbatim, e.g. an install hint for your users. */
  extraInstructions?: string
}

const bridgeSourceUrl = (options: SetupPromptOptions): string => {
  const path = options.bridgePath ?? DEFAULT_BRIDGE_PATH
  if (!path.startsWith('/')) throw new Error('bridgePath must start with "/"')
  return `${options.connection.appOrigin}${path}`
}

export const bridgeInstallPath = (serviceId: string): string =>
  `~/.local/share/codex-connector-bridge/${serviceId}/codex-connector-bridge.mjs`

const downloadInstruction = (options: SetupPromptOptions): string => {
  const installPath = bridgeInstallPath(options.connection.serviceId)
  if (options.connection.appOrigin.startsWith('https://')) {
    return `Download the connector source from the exact HTTPS URL above to \`${installPath}\`. Do not downgrade it to HTTP, do not use another host, and do not pipe a remote script into a shell.`
  }
  return `This is a loopback-only local development origin. You are explicitly authorized to download the connector source from the exact HTTP URL above to \`${installPath}\`. Do not rewrite the URL to HTTPS and do not use another host. This HTTP exception applies only to this 127.0.0.1/localhost source. Do not pipe the script into a shell.`
}

const integrityStep = (options: SetupPromptOptions): string => {
  if (!options.bridgeSha256) {
    return `Read the downloaded file before running it. Confirm that it binds only to 127.0.0.1, never reads \`~/.codex/auth.json\`, and starts \`codex app-server\` over stdio. Stop if any of that is untrue.`
  }
  return `Verify the download before running it: \`shasum -a 256 ${bridgeInstallPath(options.connection.serviceId)}\` must print \`${options.bridgeSha256}\`. If it does not match, delete the file and stop. Then read it and confirm that it binds only to 127.0.0.1, never reads \`~/.codex/auth.json\`, and starts \`codex app-server\` over stdio.`
}

/**
 * The prompt the end user runs inside ChatGPT/Codex. It is written for an agent,
 * not for a shell: Codex picks the runtime, reviews the file and reports back.
 */
export const buildSetupPrompt = (options: SetupPromptOptions): string => {
  const { connection } = options
  const ports = serviceCandidatePorts(connection.serviceId)
  const installPath = bridgeInstallPath(connection.serviceId)
  const extra = options.extraInstructions?.trim()

  return `Set up the local Codex connector for ${options.appName}.

App origin: ${connection.appOrigin}
Service id: ${connection.serviceId}
Pairing token: ${connection.pairingToken}
Connector source: ${bridgeSourceUrl(options)}

Please do the following:
1. Confirm that \`codex\` is available and choose an installed JavaScript runtime: use \`node\` when available, otherwise \`bun\`. Store that command as <RUNTIME>. If neither exists, explain that requirement and stop instead of installing one silently.
2. ${downloadInstruction(options)}
3. ${integrityStep(options)}
4. Run this command with the selected runtime, substituting the exact values above and without printing the pairing token again:
   \`<RUNTIME> ${installPath} start --pairing-token <PAIRING_TOKEN> --allowed-origin ${connection.appOrigin} --service-id ${connection.serviceId} --service-name "${options.appName.replace(/"/g, '')}"\`
5. The command must run without sudo, store its config with user-only permissions, and start the connector as a detached user process.
6. Confirm the connector answers on one of http://127.0.0.1:${ports[0] ?? 0}/v1/hello or the next three ports, then tell me to return to ${options.appName} and click “Check connection”.
${extra ? `7. ${extra}\n` : ''}
Do not copy, print or inspect ChatGPT/Codex access tokens. The local Codex App Server manages authentication itself. This connector only serves ${connection.appOrigin} and only exposes a fixed allowlist of Codex methods inside an empty read-only workspace.`
}

/** Opens the prompt prefilled in the ChatGPT desktop app. */
export const buildDesktopDeepLink = (options: SetupPromptOptions): string =>
  `codex://threads/new?prompt=${encodeURIComponent(buildSetupPrompt(options))}`

/**
 * One-liner for users who prefer the terminal. Single-quoted on purpose: the
 * prompt contains backticks, which a double-quoted shell string would execute.
 */
export const buildCliCommand = (options: SetupPromptOptions): string =>
  `codex '${buildSetupPrompt(options).replace(/'/g, `'\\''`)}'`

/** SHA-256 of the bridge file you serve, for `bridgeSha256`. */
export const computeBridgeSha256 = async (source: string | ArrayBuffer): Promise<string> => {
  const bytes = typeof source === 'string' ? new TextEncoder().encode(source) : new Uint8Array(source)
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
