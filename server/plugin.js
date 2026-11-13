import { agentDisplayName, resolveAgent, tokensMatch } from './agents.js'
import { isConversationId, presentConversation } from './conversation.js'
import { placeCall } from './placeCall.js'
import { collectVariables, readVariableValues } from './variables.js'

const CALL_ID = /^[A-Za-z0-9_]{6,80}$/

function requestUrl(req) {
  return new URL(req.url ?? '/', 'http://localhost')
}

function headerValue(req, name) {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()]
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 200_000) {
        reject(new Error('payload'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('json'))
      }
    })
    req.on('error', reject)
  })
}

function authError(token, env) {
  if (!env.loginToken) {
    return { status: 503, error: 'O acesso desta bancada ainda não foi configurado.' }
  }
  if (!tokensMatch(token, env.loginToken)) {
    return { status: 401, error: 'Token inválido.' }
  }
  return null
}

function elevenMessage(status, body) {
  const detail = body?.detail
  const text = typeof detail === 'string' ? detail : detail?.message || detail?.status || ''
  if (status === 401) return 'A chave da ElevenLabs foi recusada.'
  if (status === 404) return 'Não encontrei esse recurso na ElevenLabs.'
  if (status === 429) return 'A ElevenLabs pediu uma pausa. Espere um instante e tente de novo.'
  if (text) return 'Não foi possível falar com a ElevenLabs.'
  return 'Não foi possível falar com a ElevenLabs.'
}

async function elevenFetch(env, path, init) {
  if (!env.apiKey) {
    return { ok: false, status: 503, error: 'A ElevenLabs ainda não foi configurada.' }
  }
  let response
  try {
    response = await fetch(`https://api.elevenlabs.io${path}`, {
      ...init,
      headers: {
        'xi-api-key': env.apiKey,
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    return { ok: false, status: 502, error: 'Não foi possível falar com a ElevenLabs.' }
  }
  const text = await response.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }
  if (response.ok) return { ok: true, status: response.status, body }
  return { ok: false, status: response.status, body, error: elevenMessage(response.status, body) }
}

async function loadAgent(env, agent) {
  const remote = await elevenFetch(env, `/v1/convai/agents/${agent.id}`)
  if (!remote.ok) return { error: remote }
  return { agent: remote.body, name: agentDisplayName(remote.body) || agent.name }
}

function containsCallId(conversation, callId) {
  const packet = conversation?.conversation_initiation_client_data
  if (!packet) return false
  return JSON.stringify(packet).includes(callId)
}

async function findConversation(env, agentId, callId) {
  const remote = await elevenFetch(
    env,
    `/v1/convai/conversations?agent_id=${encodeURIComponent(agentId)}&page_size=8`,
  )
  if (!remote.ok) return { error: remote }
  const list = Array.isArray(remote.body?.conversations) ? remote.body.conversations : []
  for (const item of list) {
    const id = typeof item?.conversation_id === 'string' ? item.conversation_id : ''
    if (!isConversationId(id)) continue
    const detail = await elevenFetch(env, `/v1/convai/conversations/${encodeURIComponent(id)}`)
    if (!detail.ok) continue
    const owner = typeof detail.body?.agent_id === 'string' ? detail.body.agent_id : ''
    if (owner && owner !== agentId) continue
    if (!containsCallId(detail.body, callId)) continue
    return { conversation: presentConversation(detail.body, id) }
  }
  return { conversation: null }
}

export async function dispatchApi({ method, pathname, searchParams, token, body }, env) {
  const path = pathname.replace(/\/+$/, '') || '/'
  const voice = resolveAgent(env)

  if (path === '/api/login' && method === 'POST') {
    const error = authError(String(body?.token ?? '').trim(), env)
    if (error) return { status: error.status, payload: { error: error.error } }
    return { status: 200, payload: { ok: true } }
  }

  if (!path.startsWith('/api/')) return null

  const denied = authError(token, env)
  if (denied) return { status: denied.status, payload: { error: denied.error } }

  if (path === '/api/catalog' && method === 'GET') {
    const loaded = await loadAgent(env, voice)
    if (loaded.error) return { status: loaded.error.status, payload: { error: loaded.error.error } }
    return {
      status: 200,
      payload: {
        agent: { id: voice.id, name: loaded.name },
        variables: collectVariables(loaded.agent),
      },
    }
  }

  if (path === '/api/session' && method === 'POST') {
    const loaded = await loadAgent(env, voice)
    if (loaded.error) return { status: loaded.error.status, payload: { error: loaded.error.error } }
    const declared = collectVariables(loaded.agent)
    const filled = readVariableValues(declared, body?.variables)
    if (filled.missing.length) {
      return { status: 400, payload: { error: 'Preencha os campos para prosseguir.', missing: filled.missing } }
    }
    const remote = await elevenFetch(
      env,
      `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(voice.id)}`,
    )
    if (!remote.ok) return { status: remote.status, payload: { error: remote.error } }
    if (typeof remote.body?.signed_url !== 'string' || !remote.body.signed_url) {
      return { status: 502, payload: { error: 'A ElevenLabs não devolveu a sessão.' } }
    }
    return {
      status: 200,
      payload: { signedUrl: remote.body.signed_url, dynamicVariables: filled.values },
    }
  }

  if (path === '/api/call' && method === 'POST') {
    const loaded = await loadAgent(env, voice)
    if (loaded.error) return { status: loaded.error.status, payload: { error: loaded.error.error } }
    const declared = collectVariables(loaded.agent)
    const filled = readVariableValues(declared, body?.variables)
    if (filled.missing.length) {
      return { status: 400, payload: { error: 'Preencha os campos para prosseguir.', missing: filled.missing } }
    }
    const sent = await placeCall(env, filled.values)
    if (!sent.ok) return { status: sent.status, payload: { error: sent.error } }
    return { status: sent.status, payload: sent.payload }
  }

  if (path === '/api/conversation' && method === 'GET') {
    const callId = searchParams.get('call_id') ?? ''
    if (CALL_ID.test(callId)) {
      const found = await findConversation(env, voice.id, callId)
      if (found.error) return { status: found.error.status, payload: { error: found.error.error } }
      if (!found.conversation) return { status: 200, payload: { found: false, callId } }
      return { status: 200, payload: { found: true, callId, ...found.conversation } }
    }
    const conversationId = searchParams.get('conversation_id') ?? ''
    if (!isConversationId(conversationId)) {
      return { status: 400, payload: { error: 'Informe o ID da conversa.' } }
    }
    const remote = await elevenFetch(env, `/v1/convai/conversations/${encodeURIComponent(conversationId)}`)
    if (!remote.ok) return { status: remote.status, payload: { error: remote.error } }
    const owner = typeof remote.body?.agent_id === 'string' ? remote.body.agent_id : ''
    if (owner && owner !== voice.id) {
      return { status: 404, payload: { error: 'Conversa não encontrada.' } }
    }
    return { status: 200, payload: { found: true, ...presentConversation(remote.body, conversationId) } }
  }

  if (path.startsWith('/api/') && method !== 'GET' && method !== 'POST') {
    return { status: 405, payload: { error: 'Método não permitido.' } }
  }
  return { status: 404, payload: { error: 'Não encontrado.' } }
}

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function labApiPlugin(env) {
  const safe = {
    loginToken: env.loginToken?.trim() ?? '',
    apiKey: env.apiKey?.trim() ?? '',
    voiceAgentId: env.voiceAgentId?.trim() ?? '',
    dialerId: env.dialerId?.trim() ?? '',
    atendeApiKey: env.atendeApiKey?.trim() ?? '',
    atendeDialerToken: env.atendeDialerToken?.trim() ?? '',
    atendeBaseUrl: env.atendeBaseUrl?.trim() ?? '',
    dryRun: Boolean(env.dryRun),
  }
  const attach = (middlewares) => {
    middlewares.use((req, res, next) => {
      const url = requestUrl(req)
      if (!url.pathname.startsWith('/api/')) {
        next()
        return
      }
      void (async () => {
        const payload = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
        return dispatchApi(
          {
            method: req.method ?? 'GET',
            pathname: url.pathname,
            searchParams: url.searchParams,
            token: headerValue(req, 'x-sicoob-token'),
            body: payload,
          },
          safe,
        )
      })()
        .then((result) => {
          if (!result) {
            next()
            return
          }
          json(res, result.status, result.payload)
        })
        .catch((error) => {
          if (!res.headersSent) {
            const invalid = error instanceof Error && (error.message === 'json' || error.message === 'payload')
            json(res, invalid ? 400 : 500, {
              error: invalid ? 'Não consegui ler o pedido.' : 'Falha interna.',
            })
          }
        })
    })
  }
  return {
    name: 'sicoob-lab-api',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}
