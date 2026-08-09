// Manual end-to-end smoke test against a real local Codex App Server.
// Not part of `bun run test`: it needs a signed-in Codex and burns real quota.
//
//   node bridge/codex-connector-bridge.mjs start --pairing-token <t> \
//     --allowed-origin https://demo.example --service-id smoke-test-app
//   node test/e2e-smoke.mjs
//
// Node's fetch does not send an Origin header, so the paired origin is added
// here to imitate a browser.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { runCodexTurn } from '../src/run.ts'
import { CodexConnectorClient } from '../src/client.ts'
import { listCodexModels } from '../src/models.ts'

const serviceId = 'smoke-test-app'
const appOrigin = 'https://demo.example'
const config = JSON.parse(readFileSync(
  path.join(homedir(), '.local', 'share', 'codex-connector-bridge', serviceId, 'bridge.json'),
  'utf8',
))
const connection = {
  version: 1,
  serviceId,
  pairingToken: config.pairingToken,
  appOrigin,
  port: null,
}
const browserFetch = (input, init = {}) =>
  fetch(input, { ...init, headers: { ...init.headers, Origin: appOrigin } })

const models = await listCodexModels({ connection, fetcher: browserFetch })
console.log('models:', models.map(({ id }) => id).join(', '))
if (models.length === 0) throw new Error('No models available for this account')

const notes = []
const result = await runCodexTurn({
  connection,
  client: new CodexConnectorClient(connection, browserFetch),
  model: process.env.CODEX_MODEL ?? models[0].id,
  reasoningEffort: 'low',
  input: 'Call add_note exactly once with text "connector works", then reply with just OK.',
  tools: {
    add_note: {
      description: 'Add a note to the page',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
      execute: ({ text }) => {
        notes.push(text)
        return { ok: true, noteCount: notes.length }
      },
    },
  },
  onEvent: (event) => {
    if (event.type === 'tool-call') console.log(`tool-call ${event.name}`, event.arguments)
    if (event.type === 'account') console.log(`account: ChatGPT ${event.account.planType}`)
  },
})

console.log('notes:', notes)
console.log('final text:', JSON.stringify(result.text))
if (notes.length === 0) throw new Error('The tool was never executed')
console.log('E2E smoke test passed')
