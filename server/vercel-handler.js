import { dispatchApi } from './plugin.js'
import { SHARED_DIALER_ID } from './agents.js'

function headerValue(req, name) {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()]
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

function apiTarget(value, searchParams) {
  if (!value || value.includes('://') || value.includes('..')) return null
  const url = new URL(value, 'http://localhost')
  if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return null
  searchParams?.forEach((item, key) => {
    if (!url.searchParams.has(key)) url.searchParams.append(key, item)
  })
  return url
}

function requestTarget(req) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const hinted = apiTarget(headerValue(req, 'x-sicoob-path'), url.searchParams)
  const method = (req.method ?? 'GET').toUpperCase()
  const rewritten =
    url.pathname === '/api' ||
    url.pathname === '/api/' ||
    url.pathname.includes('[') ||
    (url.pathname === '/api/login' && method !== 'POST')
  if (!rewritten && url.pathname.startsWith('/api/')) return url
  return hinted ?? url
}

async function jsonBody(req) {
  const body = req.body
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body
  if (typeof body === 'string') return body.trim() ? JSON.parse(body) : {}
  if (Buffer.isBuffer(body)) {
    const raw = body.toString('utf8')
    return raw.trim() ? JSON.parse(raw) : {}
  }
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw.trim() ? JSON.parse(raw) : {}
}

function dryRun(value) {
  return /^(1|true|yes)$/i.test(String(value ?? '').trim())
}

export default async function handler(req, res) {
  try {
    const url = requestTarget(req)
    let body
    try {
      body = await jsonBody(req)
    } catch {
      res.status(400).json({ error: 'Não consegui ler o pedido.' })
      return
    }
    const result = await dispatchApi(
      {
        method: req.method ?? 'GET',
        pathname: url.pathname,
        searchParams: url.searchParams,
        token: headerValue(req, 'x-sicoob-token'),
        body,
      },
      {
        loginToken:
          process.env.SICOOB_LOGIN_TOKEN ||
          process.env.VIVEO_LOGIN_TOKEN ||
          process.env.ALMAVIVA_LOGIN_TOKEN ||
          process.env.ICATU_LOGIN_TOKEN ||
          '',
        apiKey: process.env.ELEVENLABS_API_KEY ?? '',
        voiceAgentId: process.env.SICOOB_VOICE_AGENT ?? '',
        dialerId: process.env.SICOOB_DIALER_ID || SHARED_DIALER_ID,
        atendeApiKey: process.env.ATENDESIMPLES_API_KEY ?? '',
        atendeDialerToken: process.env.ATENDESIMPLES_DIALER_TOKEN ?? '',
        atendeBaseUrl: process.env.ATENDESIMPLES_BASE_URL ?? '',
        dryRun: dryRun(process.env.ATENDESIMPLES_DRY_RUN),
      },
    )
    res.status(result?.status ?? 404).json(result?.payload ?? { error: 'Não encontrado.' })
  } catch {
    if (!res.headersSent) res.status(500).json({ error: 'Falha interna.' })
  }
}
