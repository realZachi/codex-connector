import { resolveBridgeConfig } from 'codex-connector'

/** Browser entry for the Vite emit smoke — keep side-effect free at import time. */
export const resolved = resolveBridgeConfig()

document.body.textContent = `bridge=${resolved.bridgePath}`
