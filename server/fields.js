// Campos da ligação e da conversa web. `name` é o campo que aparece no formulário.
// `sip` é o nome que vai no cabeçalho SIP (X-<sip>) e vira {{sip_<sip>}} no agente.
// Sem underscore: a AtendeSimples/ElevenLabs transformam `_` em `__` no nome da variável.
export const VARIABLE_FIELDS = [
  { name: 'nome_cooperado', sip: 'nomecooperado' },
  { name: 'celular', sip: 'celular' },
  { name: 'saldo_divida', sip: 'saldodivida' },
  { name: 'dias_vencidos', sip: 'diasvencidos' },
  { name: 'desconto_a_vista', sip: 'descontoavista' },
  { name: 'max_parcelas', sip: 'maxparcelas' },
  { name: 'juros', sip: 'juros' },
]

const BY_NAME = new Map(VARIABLE_FIELDS.map((field) => [field.name, field]))

export function sipNameOf(name) {
  return BY_NAME.get(name)?.sip ?? ''
}

// Nome da variável dinâmica no agente: sip_<sip>.
export function promptVariableOf(name) {
  const sip = sipNameOf(name)
  return sip ? `sip_${sip}` : ''
}

export function promptVariables(values) {
  const out = {}
  for (const [name, value] of Object.entries(values || {})) {
    const key = promptVariableOf(name)
    if (key) out[key] = value
  }
  return out
}
