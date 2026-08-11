import { component$ } from '@builder.io/qwik'
import { resolveBridgeConfig } from 'codex-connector'

export default component$(() => {
  const bridge = resolveBridgeConfig()
  return <h1>Bridge: {bridge.bridgePath}</h1>
})
