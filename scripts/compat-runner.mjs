#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = path.join(repoRoot, 'fixtures/compat/.tmp')
const packageDirectory = path.join(tempRoot, 'package')
const tarball = path.join(packageDirectory, 'codex-connector.tgz')
const bridgeFileName = 'codex-connector-bridge.mjs'
const bridgePath = '/codex/codex-connector-bridge.mjs'

const matrix = JSON.parse(
  await readFile(path.join(repoRoot, 'fixtures/compat/matrix.json'), 'utf8'),
)

const run = (command, args, cwd) => new Promise((resolve, reject) => {
  process.stdout.write(`\n[compat] ${path.basename(cwd)}: ${command} ${args.join(' ')}\n`)
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, CI: '1' },
    stdio: 'inherit',
  })
  child.on('error', reject)
  child.on('close', (code) => {
    if (code === 0) resolve()
    else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? 'no status'}`))
  })
})

const writeJson = (target, value) =>
  writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8')

const packageSpec = (major, minimum = '0.0') => `>=${major}.${minimum} <${major + 1}`

const preparePackage = async () => {
  await rm(packageDirectory, { recursive: true, force: true })
  await mkdir(packageDirectory, { recursive: true })
  await run('bun', [
    'pm',
    'pack',
    '--filename', tarball,
    '--ignore-scripts',
    '--quiet',
  ], repoRoot)
}

const projectDirectory = (kind, target, major) =>
  path.join(tempRoot, 'runs', `${kind}-${target}-${major}`)

const createProject = async (kind, target, major, packageJson, files) => {
  const directory = projectDirectory(kind, target, major)
  await rm(directory, { recursive: true, force: true })
  await mkdir(directory, { recursive: true })
  await writeJson(path.join(directory, 'package.json'), packageJson)
  await Promise.all(Object.entries(files).map(async ([relative, source]) => {
    const targetFile = path.join(directory, relative)
    await mkdir(path.dirname(targetFile), { recursive: true })
    await writeFile(targetFile, source, 'utf8')
  }))
  return directory
}

const readInstalledVersion = async (directory, packageName) => {
  const packageFile = path.join(directory, 'node_modules', ...packageName.split('/'), 'package.json')
  const pkg = JSON.parse(await readFile(packageFile, 'utf8'))
  return pkg.version
}

const assertInstalledMajor = async (directory, packageName, expectedMajor) => {
  const version = await readInstalledVersion(directory, packageName)
  assert.equal(
    Number.parseInt(version.split('.')[0] ?? '', 10),
    expectedMajor,
    `${packageName}: expected major ${expectedMajor}, installed ${version}`,
  )
  process.stdout.write(`[compat] ${packageName}@${version}\n`)
}

const sha256 = (source) => createHash('sha256').update(source).digest('hex')
const expectedBridge = await readFile(path.join(repoRoot, 'bridge', bridgeFileName))
const expectedBridgeSha256 = sha256(expectedBridge)

const findFiles = async (directory, fileName) => {
  try {
    if (!(await stat(directory)).isDirectory()) return []
  } catch {
    return []
  }

  const matches = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) matches.push(...await findFiles(target, fileName))
    else if (entry.isFile() && entry.name === fileName) matches.push(target)
  }
  return matches
}

const assertBuiltBridge = async (directories) => {
  const matches = (await Promise.all(directories.map((directory) =>
    findFiles(directory, bridgeFileName)
  ))).flat()
  assert(matches.length > 0, `no ${bridgeFileName} found below ${directories.join(', ')}`)
  for (const match of matches) {
    assert.equal(sha256(await readFile(match)), expectedBridgeSha256, `digest mismatch: ${match}`)
  }
  process.stdout.write(`[compat] verified bridge asset: ${matches[0]}\n`)
}

const treeContains = async (directory, needle) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (await treeContains(target, needle)) return true
    } else if (entry.isFile() && entry.name !== bridgeFileName) {
      const info = await stat(target)
      if (info.size <= 5_000_000) {
        const source = await readFile(target, 'utf8')
        if (source.includes(needle)) return true
      }
    }
  }
  return false
}

const install = (directory) => run('bun', ['install'], directory)

const runAdapter = async (target, major) => {
  if (target === 'vite') {
    const directory = await createProject('adapter', target, major, {
      name: `compat-vite-${major}`,
      private: true,
      type: 'module',
      scripts: { build: 'vite build' },
      dependencies: { 'codex-connector': `file:${tarball}` },
      devDependencies: { vite: packageSpec(major) },
    }, {
      'index.html': '<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>\n',
      'main.js': `import { resolveBridgeConfig } from 'codex-connector'\ndocument.body.textContent = JSON.stringify(resolveBridgeConfig())\n`,
      'vite.config.mjs': `import { defineConfig } from 'vite'\nimport { codexConnector } from 'codex-connector/vite'\nexport default defineConfig({ base: '/compat/', plugins: [codexConnector()] })\n`,
    })
    await install(directory)
    await assertInstalledMajor(directory, 'vite', major)
    await run('bun', ['run', 'build'], directory)
    await assertBuiltBridge([path.join(directory, 'dist')])
    const assets = path.join(directory, 'dist', 'assets')
    const sources = await Promise.all((await readdir(assets)).filter((name) => name.endsWith('.js'))
      .map((name) => readFile(path.join(assets, name), 'utf8')))
    assert(sources.some((source) => source.includes('/compat/codex/codex-connector-bridge.mjs')))
    assert(sources.some((source) => source.includes(expectedBridgeSha256)))
    return
  }

  if (target === 'next') {
    const reactMajor = major === 15 ? 18 : 19
    const reactSpec = packageSpec(reactMajor)
    const directory = await createProject('adapter', target, major, {
      name: `compat-next-${major}`,
      private: true,
      type: 'module',
      scripts: { build: 'next build' },
      dependencies: {
        'codex-connector': `file:${tarball}`,
        next: packageSpec(major),
        react: reactSpec,
        'react-dom': reactSpec,
      },
    }, {
      'next.config.mjs': `import { withCodexConnector } from 'codex-connector/next'\nexport default withCodexConnector({ output: 'export', basePath: '/compat' })\n`,
      'app/layout.jsx': `export default function Layout({ children }) { return <html lang="en"><body>{children}</body></html> }\n`,
      'app/page.jsx': `'use client'\nimport { resolveBridgeConfig } from 'codex-connector'\nexport default function Page() { return <main>{JSON.stringify(resolveBridgeConfig())}</main> }\n`,
    })
    await install(directory)
    await assertInstalledMajor(directory, 'next', major)
    await run('bun', ['run', 'build'], directory)
    const output = path.join(directory, 'out')
    await assertBuiltBridge([path.join(directory, 'public')])
    await assertBuiltBridge([output])
    assert(await treeContains(output, '/compat/codex/codex-connector-bridge.mjs'))
    assert(await treeContains(output, expectedBridgeSha256))
    return
  }

  if (target === 'nuxt') {
    const directory = await createProject('adapter', target, major, {
      name: `compat-nuxt-${major}`,
      private: true,
      type: 'module',
      scripts: { build: 'nuxt generate' },
      dependencies: {
        'codex-connector': `file:${tarball}`,
        nuxt: major === 3 ? packageSpec(3, '5.0') : packageSpec(4),
        vue: packageSpec(3),
      },
    }, {
      'nuxt.config.ts': `export default defineNuxtConfig({ app: { baseURL: '/compat/' }, modules: ['codex-connector/nuxt'] })\n`,
      'app.vue': `<template><main>Nuxt compatibility smoke</main></template>\n`,
    })
    await install(directory)
    await assertInstalledMajor(directory, 'nuxt', major)
    await run('bun', ['run', 'build'], directory)
    const output = path.join(directory, '.output/public')
    await assertBuiltBridge([output])
    assert(await treeContains(output, '/compat/codex/codex-connector-bridge.mjs'))
    assert(await treeContains(output, expectedBridgeSha256))
    return
  }

  throw new Error(`unknown adapter: ${target}`)
}

const bindingSmokeSource = {
  react: `import assert from 'node:assert/strict'\nimport React from 'react'\nimport { renderToString } from 'react-dom/server'\nimport { useCodexConnector } from 'codex-connector/react'\nfunction App() { const value = useCodexConnector({ serviceId: 'compat-react', appName: 'React' }); return React.createElement('span', null, value.status.state) }\nassert.match(renderToString(React.createElement(App)), /notPaired/)\n`,
  vue: `import assert from 'node:assert/strict'\nimport { effectScope } from 'vue'\nimport { useCodexConnector } from 'codex-connector/vue'\nconst scope = effectScope(); let value; scope.run(() => { value = useCodexConnector({ serviceId: 'compat-vue', appName: 'Vue' }) }); assert.equal(value.status.value.state, 'notPaired'); scope.stop()\n`,
  svelte: `import assert from 'node:assert/strict'\nimport { createCodexConnectorStore } from 'codex-connector/svelte'\nconst store = createCodexConnectorStore({ serviceId: 'compat-svelte', appName: 'Svelte' }); let state; const stop = store.subscribe((value) => { state = value.status.state }); assert.equal(state, 'notPaired'); stop()\n`,
  solid: `import assert from 'node:assert/strict'\nimport { createRoot } from 'solid-js'\nimport { createCodexConnector } from 'codex-connector/solid'\ncreateRoot((dispose) => { const value = createCodexConnector({ serviceId: 'compat-solid', appName: 'Solid' }); assert.equal(value.status().state, 'notPaired'); dispose() })\n`,
}

const bindingPackages = {
  react: (major) => ({ react: packageSpec(major), 'react-dom': packageSpec(major) }),
  vue: (major) => ({ vue: packageSpec(major) }),
  svelte: (major) => ({ svelte: packageSpec(major) }),
  solid: (major) => ({ 'solid-js': packageSpec(major, '8.0') }),
}

const runBinding = async (target, major) => {
  const source = bindingSmokeSource[target]
  const packages = bindingPackages[target]
  if (!source || !packages) throw new Error(`unknown binding: ${target}`)
  const dependencies = {
    'codex-connector': `file:${tarball}`,
    ...packages(major),
  }
  const directory = await createProject('binding', target, major, {
    name: `compat-binding-${target}-${major}`,
    private: true,
    type: 'module',
    scripts: { smoke: 'node smoke.mjs' },
    dependencies,
  }, { 'smoke.mjs': source })
  await install(directory)
  const frameworkPackage = target === 'solid' ? 'solid-js' : target
  await assertInstalledMajor(directory, frameworkPackage, major)
  await run('bun', ['run', 'smoke'], directory)
}

const recipeVersions = {
  astro: (major) => ({ astro: packageSpec(major) }),
  sveltekit: () => ({
    '@sveltejs/adapter-static': packageSpec(3),
    '@sveltejs/kit': packageSpec(2),
    '@sveltejs/vite-plugin-svelte': packageSpec(7),
    svelte: packageSpec(5),
    vite: packageSpec(8),
  }),
  'react-router': (major) => ({
    '@react-router/dev': packageSpec(major),
    '@react-router/node': packageSpec(major),
    react: packageSpec(19),
    'react-dom': packageSpec(19),
    'react-router': packageSpec(major),
    vite: packageSpec(8),
  }),
  'solid-start': (major) => ({
    '@solidjs/start': packageSpec(major),
    nitro: '>=3.0.0-beta <4',
    'solid-js': packageSpec(1, '9.0'),
    vite: packageSpec(8),
  }),
  qwik: (major) => ({
    '@builder.io/qwik': packageSpec(major, '20.0'),
    '@builder.io/qwik-city': packageSpec(major, '20.0'),
    typescript: packageSpec(5, '9.0'),
    vite: packageSpec(7),
  }),
  angular: (major) => ({
    '@angular/build': packageSpec(major),
    '@angular/cli': packageSpec(major),
    '@angular/common': packageSpec(major),
    '@angular/core': packageSpec(major),
    '@angular/platform-browser': packageSpec(major),
    rxjs: packageSpec(7, '8.0'),
    tslib: packageSpec(2, '8.0'),
    typescript: packageSpec(6),
  }),
}

const recipeOutputs = {
  astro: ['dist'],
  sveltekit: ['.svelte-kit/output'],
  'react-router': ['build'],
  'solid-start': ['.output', 'dist'],
  qwik: ['dist'],
  angular: ['dist'],
}

const angular22SupportsCurrentNode = () => {
  const [nodeMajor = 0, nodeMinor = 0, nodePatch = 0] = process.versions.node
    .split('.')
    .map((part) => Number.parseInt(part, 10))
  if (nodeMajor === 22) return nodeMinor > 22 || (nodeMinor === 22 && nodePatch >= 3)
  if (nodeMajor === 24) return nodeMinor >= 15
  return nodeMajor >= 26
}

const runRecipe = async (target, major) => {
  const versions = recipeVersions[target]
  if (!versions) throw new Error(`unknown recipe: ${target}`)
  const source = path.join(repoRoot, 'fixtures/compat/recipes', target)
  const directory = projectDirectory('recipe', target, major)
  await rm(directory, { recursive: true, force: true })
  await mkdir(path.dirname(directory), { recursive: true })
  await cp(source, directory, { recursive: true })

  const packageFile = path.join(directory, 'package.json')
  const pkg = JSON.parse(await readFile(packageFile, 'utf8'))
  const dependencies = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  delete pkg.devDependencies
  pkg.dependencies = {
    ...dependencies,
    ...versions(major),
    'codex-connector': `file:${tarball}`,
  }
  await writeJson(packageFile, pkg)

  await install(directory)
  const primaryPackage = {
    astro: 'astro',
    sveltekit: '@sveltejs/kit',
    'react-router': 'react-router',
    'solid-start': '@solidjs/start',
    qwik: '@builder.io/qwik',
    angular: '@angular/core',
  }[target]
  await assertInstalledMajor(directory, primaryPackage, major)
  if (target === 'angular' && major === 22 && !angular22SupportsCurrentNode()) {
    process.stdout.write(
      `[compat] Node ${process.versions.node} is below Angular 22's CLI floor; ` +
      'using an isolated Node 24.15 process\n',
    )
    await run('bun', ['run', 'eject'], directory)
    await run('npx', [
      '--yes',
      '--package=node@24.15.0',
      '--',
      'node',
      'node_modules/@angular/cli/bin/ng.js',
      'build',
    ], directory)
  } else {
    await run('bun', ['run', 'build'], directory)
  }
  await assertBuiltBridge(recipeOutputs[target].map((output) => path.join(directory, output)))
}

const allJobs = [
  ...matrix.adapters.flatMap((entry) => entry.majors.map((major) => ['adapter', entry.id, major])),
  ...matrix.bindings.flatMap((entry) => entry.majors.map((major) => ['binding', entry.id, major])),
  ...matrix.recipes.map((entry) => ['recipe', entry.id, entry.major]),
]

const runJob = async (kind, target, rawMajor) => {
  const major = Number(rawMajor)
  assert(Number.isInteger(major) && major > 0, `invalid major: ${rawMajor}`)
  process.stdout.write(`\n[compat] running ${kind}/${target}@${major}\n`)
  if (kind === 'adapter') return runAdapter(target, major)
  if (kind === 'binding') return runBinding(target, major)
  if (kind === 'recipe') return runRecipe(target, major)
  throw new Error(`unknown compatibility job kind: ${kind}`)
}

const [kind, target, major] = process.argv.slice(2)
await preparePackage()

if (!kind || kind === 'all') {
  for (const job of allJobs) await runJob(...job)
} else {
  assert(target && major, 'usage: compat-runner.mjs <adapter|binding|recipe> <id> <major>')
  await runJob(kind, target, major)
}

process.stdout.write('\n[compat] all requested jobs passed\n')
