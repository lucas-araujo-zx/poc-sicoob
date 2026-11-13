import assert from 'node:assert/strict'
import test from 'node:test'
import { tokensMatch } from './agents.js'
import { buildCard, encodeCardInfo3, normalizeBrPhone } from './placeCall.js'
import { dispatchApi } from './plugin.js'

const env = {
  loginToken: 'token-da-bancada',
  apiKey: 'chave',
  voiceAgentId: 'agent_teste_sicoob',
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
    { name: 'nomecooperado', value: 'Ana Souza' },
    { name: 'saldodivida', value: 'R$ 1.850,00' },
  ])
  assert.equal(encoded.value, 'DH01:nomecooperado:Ana Souza#saldodivida:R$ 1.850,00')
})

test('a ficha manda os nomes SIP sem underscore, que viram {{sip_...}} no agente', () => {
  const built = buildCard({
    fields: {
      nome_cooperado: 'Ana Souza',
      celular: '(11) 99999-8888',
      saldo_divida: 'R$ 1.850,00',
      dias_vencidos: '42',
      desconto_a_vista: '10',
      max_parcelas: '5',
      juros: '1,5',
    },
    dialerId: 'dialer_teste',
  })
  assert.equal(built.card.number_primary, '11999998888')
  assert.equal(built.card.card_info_1, built.callId)
  assert.equal(
    built.card.card_info_3,
    'DH01:nomecooperado:Ana Souza#celular:11999998888#saldodivida:R$ 1.850,00#diasvencidos:42#descontoavista:10#maxparcelas:5#juros:1,5',
  )
})

test('o valor digitado chega à ligação, não o padrão', () => {
  const built = buildCard({
    fields: { nome_cooperado: 'Rodriguito', celular: '21997929787', saldo_divida: '100' },
    dialerId: 'dialer_teste',
  })
  assert.match(built.card.card_info_3, /nomecooperado:Rodriguito/)
  assert.doesNotMatch(built.card.card_info_3, /Ana Souza|1850/)
})

test('a conversa da ligação é achada pelo call_sid e pela janela de tempo', async () => {
  const callId = `sicoob_${Date.now().toString(36)}`
  const original = globalThis.fetch
  const seen = []
  globalThis.fetch = async (url) => {
    const href = String(url)
    seen.push(href)
    if (href.includes('/v1/convai/conversations?')) {
      return new Response(JSON.stringify({ conversations: [{ conversation_id: 'conv_outraligacao1' }, { conversation_id: 'conv_ligacao0001' }] }), { status: 200 })
    }
    if (href.endsWith('conv_outraligacao1')) {
      return new Response(JSON.stringify({ agent_id: 'agent_teste_sicoob', status: 'done', metadata: { phone_call: { call_sid: 'sicoob_outra' } } }), { status: 200 })
    }
    if (href.endsWith('conv_ligacao0001')) {
      return new Response(JSON.stringify({
        conversation_id: 'conv_ligacao0001',
        agent_id: 'agent_teste_sicoob',
        status: 'processing',
        metadata: { phone_call: { call_sid: callId } },
      }), { status: 200 })
    }
    return new Response('no', { status: 500 })
  }
  try {
    const found = await call('GET', '/api/conversation', env.loginToken, `call_id=${callId}`)
    assert.equal(found.status, 200)
    assert.equal(found.payload.found, true)
    assert.equal(found.payload.conversationId, 'conv_ligacao0001')
    assert.equal(found.payload.ready, false)
    assert.equal(found.payload.status, 'processing')
    const list = seen.find((href) => href.includes('/v1/convai/conversations?'))
    assert.match(list, /call_start_after_unix=\d+/)
  } finally {
    globalThis.fetch = original
  }
})
