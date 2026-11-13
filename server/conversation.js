const CONVERSATION_ID = /^conv_[a-zA-Z0-9]{8,}$/

export function isConversationId(value) {
  return CONVERSATION_ID.test(String(value ?? '').trim())
}

function asRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value
}

function text(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return ''
  return value.trim()
}

function skipVariable(key) {
  const name = key.trim().toLowerCase()
  return !name || name.startsWith('system__')
}

export function outcome(value) {
  if (value === true || value === 'success' || value === 'successful') return 'success'
  if (value === false || value === 'failure' || value === 'failed') return 'failure'
  return 'unknown'
}

function numeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function criteriaFrom(analysis) {
  const items = []
  const seen = new Set()
  const mapped = asRecord(analysis.evaluation_criteria_results) ?? {}
  const list = Array.isArray(analysis.evaluation_criteria_results_list)
    ? analysis.evaluation_criteria_results_list
    : []

  function add(id, value) {
    const record = asRecord(value)
    const name = text(record?.criteria_id) || text(id)
    if (!name || seen.has(name.toLowerCase())) return
    seen.add(name.toLowerCase())
    const raw = record?.result ?? value
    const score = numeric(record?.score) ?? numeric(record?.value) ?? (typeof raw === 'number' ? raw : numeric(raw))
    const binary = outcome(raw)
    items.push({
      id: name,
      result: typeof raw === 'number' ? 'unknown' : binary,
      score: typeof raw === 'number' || (binary === 'unknown' && score != null) ? score : numeric(record?.score),
      rationale: text(record?.rationale),
    })
  }

  for (const item of list) add('', item)
  for (const [key, value] of Object.entries(mapped)) add(key, value)
  return items
}

function collectionFrom(analysis) {
  const items = []
  const seen = new Set()
  const mapped = asRecord(analysis.data_collection_results) ?? {}
  const list = Array.isArray(analysis.data_collection_results_list)
    ? analysis.data_collection_results_list
    : []

  function add(id, value) {
    const record = asRecord(value)
    if (record?.is_omitted === true) return
    const name = text(record?.data_collection_id) || text(id)
    if (!name || seen.has(name.toLowerCase())) return
    seen.add(name.toLowerCase())
    const extracted = record && 'value' in record ? record.value : value
    items.push({ id: name, value: extracted ?? null })
  }

  for (const item of list) add('', item)
  for (const [key, value] of Object.entries(mapped)) add(key, value)
  return items
}

function variablesFrom(conversation) {
  const sources = [
    asRecord(asRecord(conversation.conversation_initiation_client_data)?.dynamic_variables),
    asRecord(asRecord(conversation.metadata)?.dynamic_variables),
  ]
  const items = []
  const seen = new Set()
  for (const source of sources) {
    if (!source) continue
    for (const [key, value] of Object.entries(source)) {
      if (skipVariable(key) || seen.has(key.toLowerCase())) continue
      seen.add(key.toLowerCase())
      items.push({ id: key, value })
    }
  }
  return items
}

export function presentConversation(conversation, fallbackId = '') {
  const body = asRecord(conversation) ?? {}
  const analysis = asRecord(body.analysis) ?? {}
  const status = text(body.status).toLowerCase()
  const duration = asRecord(body.metadata)?.call_duration_secs
  return {
    conversationId: text(body.conversation_id) || text(fallbackId),
    status,
    ready: status === 'done' || status === 'failed' || status === 'completed',
    summary: text(analysis.transcript_summary),
    callSuccessful: text(analysis.call_successful),
    durationSecs: typeof duration === 'number' && Number.isFinite(duration) ? duration : null,
    criteria: criteriaFrom(analysis),
    dataCollection: collectionFrom(analysis),
    variables: variablesFrom(body),
  }
}

function round(value) {
  return Math.round(value * 10) / 10
}

export function summarizeCriteria(definitions, conversations) {
  const byId = new Map()
  for (const definition of definitions || []) {
    byId.set(definition.id, {
      id: definition.id,
      name: definition.name || definition.id,
      scoringMode: definition.scoringMode === 'numeric' ? 'numeric' : 'binary',
      samples: [],
    })
  }
  let pending = 0
  let analyzed = 0
  for (const conversation of conversations || []) {
    if (!conversation?.ready) {
      pending += 1
      continue
    }
    analyzed += 1
    for (const item of conversation.criteria || []) {
      if (!byId.has(item.id)) {
        const numericSample = typeof item.score === 'number'
        byId.set(item.id, {
          id: item.id,
          name: item.id,
          scoringMode: numericSample && item.result === 'unknown' ? 'numeric' : 'binary',
          samples: [],
        })
      }
      byId.get(item.id).samples.push(item)
    }
  }
  const criteria = [...byId.values()].map((entry) => {
    if (entry.scoringMode === 'numeric') {
      const values = entry.samples
        .map((item) => (typeof item.score === 'number' ? item.score : null))
        .filter((item) => item != null)
      const average = values.length
        ? round(values.reduce((sum, item) => sum + item, 0) / values.length)
        : null
      return {
        id: entry.id,
        name: entry.name,
        kind: 'numeric',
        count: values.length,
        average,
      }
    }
    const success = entry.samples.filter((item) => item.result === 'success').length
    const failure = entry.samples.filter((item) => item.result === 'failure').length
    const unknown = entry.samples.filter((item) => item.result !== 'success' && item.result !== 'failure').length
    const decided = success + failure
    return {
      id: entry.id,
      name: entry.name,
      kind: 'binary',
      success,
      failure,
      unknown,
      decided,
      percent: decided ? round((success / decided) * 100) : null,
    }
  })
  return { analyzed, pending, criteria }
}
