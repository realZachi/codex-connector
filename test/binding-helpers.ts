import { connectionStorageKey } from '../src/connection'

export const bindingConfig = {
  serviceId: 'acme-studio',
  appName: 'Acme Studio',
  appOrigin: 'https://acme.example',
} as const

export const installLocalStorage = () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) },
    clear: () => entries.clear(),
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() { return entries.size },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
  return entries
}

export const hasStoredPairing = (entries: Map<string, string>) =>
  entries.has(connectionStorageKey('acme-studio'))
