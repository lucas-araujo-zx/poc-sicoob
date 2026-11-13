const CARD_INFO_3_MAX_LENGTH = 255
const DH01_PREFIX = 'DH01:'
const VALUE_EXTRA = new Set(':/=?._,!&$%+'.split(''))
const DIALER_CARDS_PATH = '/dialer-automatic/cards'

export function stripAccents(input) {
  return String(input ?? '').normalize('NFD').replace(/\p{M}/gu, '')
}

export function sanitizeSipName(raw) {
  return stripAccents(raw)
    .replace(/-/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
}

export function sanitizeSipValue(raw, maxLength) {
  const stripped = stripAccents(raw).replace(/#/g, ' ')
  let next = ''
  for (const char of stripped) {
    if (/[A-Za-z0-9 ]/.test(char) || VALUE_EXTRA.has(char)) next += char
    else next += ' '
  }
  next = next.replace(/\s+/g, ' ').trim()
  if (maxLength && next.length > maxLength) next = next.slice(0, maxLength).trim()
  return next
}

export function encodeCardInfo3(pairs) {
  const included = []
  const dropped = []
  let encoded = DH01_PREFIX
  for (const pair of pairs) {
    const name = sanitizeSipName(pair.name)
    const value = sanitizeSipValue(pair.value)
    if (!name || !value) {
      dropped.push({ name: name || pair.name, value: value || pair.value })
      continue
    }
    const next = encoded === DH01_PREFIX ? `${DH01_PREFIX}${name}:${value}` : `${encoded}#${name}:${value}`
    if (next.length > CARD_INFO_3_MAX_LENGTH) {
      dropped.push({ name, value })
      continue
    }
    encoded = next
    included.push({ name, value })
  }
  if (!included.length) return { value: '', included, dropped }
  return { value: encoded, included, dropped }
}

export function normalizeBrPhone(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2)
  }
  if (digits.length === 10 || digits.length === 11) return digits
  return ''
}

export function buildCard({ fields, dialerId, callIdPrefix = 'sicoob' }) {
  const phone = normalizeBrPhone(fields?.celular)
  if (!phone) {
    const error = new Error('Informe o celular com DDD.')
    error.status = 400
    throw error
  }
  const pairs = []
  for (const [name, raw] of Object.entries(fields || {})) {
    const value = String(raw ?? '').trim()
    if (!value) continue
    const sipValue = /celular|phone|tel|whatsapp|mobile/i.test(name)
      ? normalizeBrPhone(value) || value.replace(/\D/g, '')
      : sanitizeSipValue(value)
    if (sipValue) pairs.push({ name, value: sipValue })
  }
  const encoded = encodeCardInfo3(pairs)
  const safe = String(callIdPrefix).replace(/[^A-Za-z0-9_]/g, '').slice(0, 8) || 'sicoob'
  const callId = `${safe}_${Date.now().toString(36)}`
  return {
    callId,
    card: {
      dialer_id: dialerId,
      number_primary: phone,
      numbers_alternatives: [],
      priority: 10,
      card_info_1: callId,
      card_info_2: '',
      card_info_3: encoded.value,
      token: '',
    },
  }
}

export async function placeCall(env, fields) {
  const dialerId = String(env.dialerId ?? '').trim()
  if (!dialerId) {
    return { ok: false, status: 503, error: 'O discador desta demonstração ainda não foi configurado.' }
  }
  let built
  try {
    built = buildCard({ fields, dialerId })
  } catch (error) {
    return { ok: false, status: error.status || 400, error: error.message }
  }
  if (env.dryRun) {
    return { ok: true, status: 200, payload: { status: 'dry_run', call_id: built.callId } }
  }
  const apiKey = String(env.atendeApiKey ?? '').trim()
  const dialerToken = String(env.atendeDialerToken ?? '').trim()
  if (!apiKey || !dialerToken) {
    return {
      ok: false,
      status: 503,
      error: 'Discador não configurado. Defina ATENDESIMPLES_API_KEY e ATENDESIMPLES_DIALER_TOKEN.',
    }
  }
  const base = (String(env.atendeBaseUrl ?? '').trim() || 'https://api.atendesimples.com').replace(/\/+$/, '')
  const card = { ...built.card, token: dialerToken }
  let response
  try {
    response = await fetch(`${base}${DIALER_CARDS_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(card),
    })
  } catch {
    return { ok: false, status: 502, error: 'Não foi possível solicitar o contato. Tente novamente.' }
  }
  if (!response.ok) {
    return { ok: false, status: 502, error: 'AtendeSimples rejeitou a ficha de discagem.' }
  }
  return { ok: true, status: 200, payload: { status: 'queued', call_id: built.callId } }
}
