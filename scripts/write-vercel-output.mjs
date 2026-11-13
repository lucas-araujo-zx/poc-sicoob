import { cp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, '.vercel/output')
const funcDir = join(output, 'functions/api/login.func')
const serverFiles = [
  'vercel-handler.js',
  'plugin.js',
  'agents.js',
  'conversation.js',
  'placeCall.js',
  'variables.js',
]

await rm(output, { recursive: true, force: true })
await mkdir(funcDir, { recursive: true })
await cp(join(root, 'dist'), join(output, 'static'), { recursive: true })
for (const file of serverFiles) {
  await cp(join(root, 'server', file), join(funcDir, file))
}
await writeFile(join(funcDir, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`)
await writeFile(
  join(funcDir, '.vc-config.json'),
  `${JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'vercel-handler.js',
      launcherType: 'Nodejs',
      shouldAddHelpers: true,
      maxDuration: 60,
    },
    null,
    2,
  )}\n`,
)

for (const alias of ['api/catalog.func', 'api/session.func', 'api/conversation.func', 'api/call.func', 'api/[...path].func']) {
  const dest = join(output, 'functions', alias)
  await mkdir(dirname(dest), { recursive: true })
  await symlink(relative(dirname(dest), funcDir), dest)
}

await writeFile(
  join(output, 'config.json'),
  `${JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api(?:/.*)?$', dest: '/api/login' },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  )}\n`,
)
