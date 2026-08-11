/** Ambient fallback when the optional `solid-js` peer is not installed. */
declare module 'solid-js' {
  export function createSignal<T>(
    value: T,
  ): [() => T, (next: T | ((prev: T) => T)) => void]
  export function getOwner(): object | null
  export function onCleanup(fn: () => void): void
}
