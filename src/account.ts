import { CodexConnectorClient } from './client'
import type { CodexConnection } from './connection'

export type CodexAccount =
  | { status: 'connected'; email: string | null; planType: string }
  | { status: 'signedOut' }
  | { status: 'apiKey' }
  | { status: 'unsupported' }

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const parseAccount = (value: unknown): CodexAccount => {
  if (!isObject(value)) return { status: 'unsupported' }
  const account = value['account']
  if (account === null) return { status: 'signedOut' }
  if (!isObject(account) || typeof account['type'] !== 'string') return { status: 'unsupported' }
  if (account['type'] === 'apiKey') return { status: 'apiKey' }
  if (account['type'] !== 'chatgpt' || typeof account['planType'] !== 'string') {
    return { status: 'unsupported' }
  }
  return {
    status: 'connected',
    email: typeof account['email'] === 'string' ? account['email'] : null,
    planType: account['planType'],
  }
}

export type ReadAccountResult = { account: CodexAccount; port: number }

/**
 * Confirms the connector is up and the user is signed in with a ChatGPT plan.
 * Returns the discovered port so the caller can cache it.
 */
export const readCodexAccount = async (options: {
  connection: CodexConnection
  signal?: AbortSignal
}): Promise<ReadAccountResult> => {
  const client = new CodexConnectorClient(options.connection)
  try {
    const status = await client.connect(options.signal)
    if (!status.appServerReady) {
      throw new Error(status.appServerError ?? 'Codex App Server is still starting')
    }
    const result = await client.request('account/read', { refreshToken: false }, options.signal)
    return { account: parseAccount(result), port: status.port }
  } finally {
    client.close()
  }
}

export const accountErrorMessage = (account: CodexAccount): string | null => {
  if (account.status === 'connected') return null
  if (account.status === 'signedOut') {
    return 'Codex is signed out. Run `codex login` and choose ChatGPT, then check the connection again.'
  }
  if (account.status === 'apiKey') {
    return 'Codex is using an API key. Sign in with ChatGPT to use your subscription.'
  }
  return 'The Codex account could not be verified.'
}
