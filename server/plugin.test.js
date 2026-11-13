import assert from 'node:assert/strict'
import test from 'node:test'
import { tokensMatch } from './agents.js'
import { encodeCardInfo3, normalizeBrPhone } from './placeCall.js'
import { dispatchApi } from './plugin.js'

const env = {
  loginToken: 'token-da-bancada',
  apiKey: 'chave',
  voiceAgentId: 'agent_3201m780raakfbzbm55ntd1v00hq',
  dialerId: 'dialer_teste',
  atendeApiKey: 'key',
  atendeDialerToken: 'token',
  dryRun: true,
}

const agentBody = {
  name: 'Sicoob - Ciro - Cobrança',
  conversation_config: {
    agent: {
      dynamic_variables: {
        dynamic_variable_placeholders: {
          nome_cooperado: 'Ana Souza',
          celular: '61999990000',
          saldo_divida: '1850.00',
          dias_vencidos: '42',
          desconto_a_vista: '0',
          max_parcelas: '1',
          juros: '0',
        },
      },
      prompt: { prompt: 'Olá {{nome_cooperado}}' },
      first_message: '',
    },
  },
}

function call(method, pathname, token, search = '', body) {
  return dispatchApi(
    { method, pathname, searchParams: new URLSearchParams(search), token, body },
    env,
  )
}

test('o token da bancada entra e outro token não', async () => {
  assert.equal(tokensMatch(env.loginToken, env.loginToken), true)
  const denied = await call('POST', '/api/login', '', '', { token: 'errado' })
  assert.equal(denied.status, 401)
  const ok = await call('POST', '/api/login', '', '', { token: env.loginToken })
  assert.equal(ok.payload.ok, true)
})

test('o catálogo devolve as variáveis do Ciro', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).includes('/agents/')) {
      return new Response(JSON.stringify(agentBody), { status: 200 })
    }
    return new Response('no', { status: 500 })
  }
  try {
    const catalog = await call('GET', '/api/catalog', env.loginToken)
    assert.equal(catalog.status, 200)
    assert.equal(catalog.payload.agent.name, 'Sicoob - Ciro - Cobrança')
    assert.deepEqual(
      catalog.payload.variables.map((item) => item.name),
      ['nome_cooperado', 'celular', 'saldo_divida', 'dias_vencidos', 'desconto_a_vista', 'max_parcelas', 'juros'],
    )
  } finally {
    globalThis.fetch = original
  }
})

test('a sessão e a ligação exigem os campos', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes('get-signed-url')) {
      return new Response(JSON.stringify({ signed_url: 'wss://sessao' }), { status: 200 })
    }
    if (href.includes('/agents/')) {
      return new Response(JSON.stringify(agentBody), { status: 200 })
    }
    return new Response('no', { status: 500 })
  }
  try {
    const blocked = await call('POST', '/api/session', env.loginToken, '', { variables: {} })
    assert.equal(blocked.status, 400)
    const phone = await call('POST', '/api/call', env.loginToken, '', {
      variables: { nome_cooperado: 'Ana', celular: '11999', saldo_divida: '10', dias_vencidos: '3' },
    })
    assert.equal(phone.status, 400)
    const queued = await call('POST', '/api/call', env.loginToken, '', {
      variables: {
        nome_cooperado: 'Ana Souza',
        celular: '11999998888',
        saldo_divida: 'R$ 1.850,00',
        dias_vencidos: '42',
        desconto_a_vista: '0',
        max_parcelas: '1',
        juros: '0',
      },
    })
    assert.equal(queued.status, 200)
    assert.equal(queued.payload.status, 'dry_run')
    assert.match(queued.payload.call_id, /^sicoob_/)
  } finally {
    globalThis.fetch = original
  }
})

test('a ficha da AtendeSimples usa o mesmo formato DH01', () => {
  assert.equal(normalizeBrPhone('+55 (11) 99999-8888'), '11999998888')
  const encoded = encodeCardInfo3([
    { name: 'nome_cooperado', value: 'Ana Souza' },
    { name: 'saldo_divida', value: 'R$ 1.850,00' },
  ])
  assert.equal(encoded.value, 'DH01:nome_cooperado:Ana Souza#saldo_divida:R$ 1.850,00')
})
