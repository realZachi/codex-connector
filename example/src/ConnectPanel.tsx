import { useState } from 'react'
import type { ConnectorStatus, SetupInstructions } from 'codex-connector/react'

export type ConnectPanelProps = {
  status: ConnectorStatus | { state: 'checking' }
  setup: SetupInstructions | null
  onCreateSetup: () => void
  onCheckConnection: () => void
  onDisconnect: () => void
}

const STATUS_LABEL: Record<string, string> = {
  notPaired: 'Not connected',
  checking: 'Checking…',
  offline: 'Connector not running',
  signedOut: 'Codex signed out',
  apiKey: 'Codex on API key',
  unsupported: 'Account unsupported',
  connected: 'Connected',
}

const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          },
          () => setCopied(false),
        )
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

export const ConnectPanel = ({
  status,
  setup,
  onCreateSetup,
  onCheckConnection,
  onDisconnect,
}: ConnectPanelProps) => {
  const [showPrompt, setShowPrompt] = useState(false)
  const message = 'message' in status ? status.message : null

  return (
    <section className="panel">
      <header className="panel__head">
        <h2>Your ChatGPT plan</h2>
        <span className={`badge badge--${status.state}`}>{STATUS_LABEL[status.state]}</span>
      </header>

      {status.state === 'connected'
        ? (
            <>
              <p className="muted">
                ChatGPT {status.planType}
                {status.email ? ` · ${status.email}` : ''}
              </p>
              <div className="row">
                <button type="button" onClick={onCheckConnection}>Re-check</button>
                <button type="button" className="ghost" onClick={onDisconnect}>Disconnect</button>
              </div>
            </>
          )
        : (
            <>
              <ol className="steps">
                <li>Create the setup prompt.</li>
                <li>Open it in ChatGPT and press Send. Codex starts the local connector.</li>
                <li>Come back and check the connection.</li>
              </ol>

              {!setup
                ? <button type="button" onClick={onCreateSetup}>Use my ChatGPT plan</button>
                : (
                    <>
                      <div className="row">
                        <a className="button" href={setup.desktopDeepLink}>Open in ChatGPT</a>
                        <CopyButton value={setup.prompt} label="Copy prompt" />
                        <CopyButton value={setup.cliCommand} label="Copy CLI command" />
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setShowPrompt((current) => !current)}
                        >
                          {showPrompt ? 'Hide prompt' : 'Show prompt'}
                        </button>
                      </div>
                      {showPrompt && <pre className="prompt">{setup.prompt}</pre>}
                      <div className="row">
                        <button
                          type="button"
                          onClick={onCheckConnection}
                          disabled={status.state === 'checking'}
                        >
                          {status.state === 'checking' ? 'Checking…' : 'Check connection'}
                        </button>
                        <button type="button" className="ghost" onClick={onDisconnect}>
                          Reset pairing
                        </button>
                      </div>
                      <p className="muted small">
                        ChatGPT didn’t open? Copy the prompt and paste it into Codex, or use the CLI command.
                      </p>
                    </>
                  )}
            </>
          )}

      {message && <p className="notice">{message}</p>}
    </section>
  )
}
