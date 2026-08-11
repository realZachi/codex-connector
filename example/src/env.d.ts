/// <reference types="vite/client" />

/**
 * Optional compile-time injects from `codexConnector()`. The demo app does not
 * reference these in source; `resolveBridgeConfig` reads them when present.
 */
declare const __CODEX_BRIDGE_PATH__: string | undefined
declare const __CODEX_BRIDGE_SHA256__: string | undefined
