import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { labApiPlugin } from './server/plugin.js'

const root = path.dirname(fileURLToPath(import.meta.url))

function elevenLabsEntry() {
  const base = path.resolve(root, 'node_modules/@elevenlabs/client')
  const entry = ['dist/lib.modern.js', 'dist/platform/web/index.js', 'dist/index.js']
    .map((file) => path.join(base, file))
    .find((file) => fs.existsSync(file))
  return {
    name: 'elevenlabs-client-entry',
    enforce: 'pre',
    resolveId(id) {
      if (id === '@elevenlabs/client' && entry) return entry
      return null
    },
  }
}

function dryRun(value) {
  return /^(1|true|yes)$/i.test(String(value ?? '').trim())
}

export default defineConfig(({ mode }) => {
  const labEnv = loadEnv(mode, root, '')
  return {
    plugins: [
      elevenLabsEntry(),
      react(),
      labApiPlugin({
        loginToken: labEnv.SICOOB_LOGIN_TOKEN,
        apiKey: labEnv.ELEVENLABS_API_KEY,
        voiceAgentId: labEnv.SICOOB_VOICE_AGENT,
        dialerId: labEnv.SICOOB_DIALER_ID,
        atendeApiKey: labEnv.ATENDESIMPLES_API_KEY,
        atendeDialerToken: labEnv.ATENDESIMPLES_DIALER_TOKEN,
        atendeBaseUrl: labEnv.ATENDESIMPLES_BASE_URL,
        dryRun: dryRun(labEnv.ATENDESIMPLES_DRY_RUN),
      }),
    ],
    resolve: {
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.cjs'],
      alias: {
        react: path.resolve(root, 'node_modules/react'),
        'react-dom': path.resolve(root, 'node_modules/react-dom'),
      },
      dedupe: ['react', 'react-dom'],
    },
    server: { port: 5190, strictPort: true },
    preview: { port: 5190, strictPort: true },
  }
})
