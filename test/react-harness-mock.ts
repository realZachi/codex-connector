/**
 * DOM-free React hook harness for binding tests (no react-dom required).
 * useMemo is dep-cached; useSyncExternalStore subscribes and caches snapshots.
 */

const memoCache = new Map<string, unknown>()
const storeCache = new Map<
  (onStoreChange: () => void) => () => void,
  { value: unknown; unsub: (() => void) | null }
>()

export const reactHarness = {
  useMemo: <T>(factory: () => T, deps?: readonly unknown[]): T => {
    const key = JSON.stringify(deps ?? [])
    if (!memoCache.has(key)) memoCache.set(key, factory())
    return memoCache.get(key) as T
  },

  useSyncExternalStore: <T>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
  ): T => {
    if (typeof window === 'undefined') {
      return (getServerSnapshot ?? getSnapshot)()
    }
    let entry = storeCache.get(subscribe)
    if (!entry) {
      entry = { value: getSnapshot(), unsub: null }
      entry.unsub = subscribe(() => {
        entry!.value = getSnapshot()
      })
      entry.value = getSnapshot()
      storeCache.set(subscribe, entry)
    }
    return entry.value as T
  },

  reset: () => {
    for (const entry of storeCache.values()) entry.unsub?.()
    storeCache.clear()
    memoCache.clear()
  },
}
