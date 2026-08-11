/** Ambient fallback when the optional `vue` peer is not installed. */
declare module 'vue' {
  export type ComputedRef<T> = { readonly value: T }

  export function shallowRef<T>(value: T): { value: T }
  export function computed<T>(getter: () => T): ComputedRef<T>
  export function readonly<T>(value: T): T
  export function getCurrentScope(): object | undefined
  export function onScopeDispose(fn: () => void): void
}
