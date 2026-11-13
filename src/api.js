const TOKEN_KEY = 'sicoob.lab.token'

export function readToken() {
  return sessionStorage.getItem(TOKEN_KEY) ?? ''
}

export function writeToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}

async function request(path, { method = 'GET', token = '', body } = {}) {
  const headers = { 'x-sicoob-path': path }
  if (token) headers['x-sicoob-token'] = token
  if (body) headers['Content-Type'] = 'application/json'
  const response = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    throw new Error('A API não respondeu JSON. Publique a bancada de novo.')
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir o pedido.')
  return payload
}

export function login(token) {
  return request('/api/login', { method: 'POST', body: { token } })
}

export function catalog(token) {
  return request('/api/catalog', { token })
}

export function openSession(token, variables) {
  return request('/api/session', { method: 'POST', token, body: { variables } })
}

export function placeCall(token, variables) {
  return request('/api/call', { method: 'POST', token, body: { variables } })
}

export function conversationResult(token, conversationId) {
  return request(`/api/conversation?conversation_id=${encodeURIComponent(conversationId)}`, { token })
}

export function conversationByCall(token, callId) {
  return request(`/api/conversation?call_id=${encodeURIComponent(callId)}`, { token })
}
