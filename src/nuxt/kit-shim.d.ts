/**
 * Ambient shims so this adapter typechecks without `nuxt` / `@nuxt/kit` installed.
 * At runtime the consuming Nuxt app provides these packages (optional peer).
 */

declare module 'nuxt/kit' {
  export type Nuxt = {
    options: {
      buildDir: string
      app: {
        baseURL: string
      }
      [key: string]: unknown
    }
    // Loosely typed — real @nuxt/kit has a large hook map.
    hook: (name: string, fn: (...args: unknown[]) => unknown) => void
  }

  export type NuxtModule<Options = Record<string, never>> = {
    (options: Options, nuxt: Nuxt): void | Promise<void>
    getOptions?: unknown
    getMeta?: unknown
  }

  export type ModuleDefinition<Options = Record<string, never>> = {
    meta?: {
      name?: string
      configKey?: string
      compatibility?: Record<string, string>
    }
    defaults?: Options | (() => Options)
    setup?: (options: Options, nuxt: Nuxt) => void | Promise<void>
  }

  export type Resolver = {
    resolve: (...pathSegments: string[]) => string
  }

  export type NuxtTemplate = {
    filename?: string
    dst?: string
    getContents?: () => string | Promise<string>
    write?: boolean
  }

  export function defineNuxtModule<Options = Record<string, never>>(
    definition: ModuleDefinition<Options>,
  ): NuxtModule<Options>

  export function createResolver(base: string): Resolver

  export function addTemplate(template: NuxtTemplate): { dst: string; filename: string }

  export function addPlugin(plugin: {
    src: string
    mode?: 'all' | 'server' | 'client'
    filename?: string
  }): void
}

declare module 'nuxt/app' {
  export function defineNuxtPlugin(plugin: () => void): unknown
}
