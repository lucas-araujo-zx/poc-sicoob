const SKIP_VARIABLE = /^(system__|secret__|sip_)/i
const TOKEN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

function textsOf(agent) {
  const texts = [
    agent?.conversation_config?.agent?.prompt?.prompt,
    agent?.conversation_config?.agent?.first_message,
  ]
  const nodes = agent?.workflow?.nodes
  if (nodes && typeof nodes === 'object') {
    for (const node of Object.values(nodes)) {
      texts.push(node?.additional_prompt)
      texts.push(node?.conversation_config?.agent?.prompt?.prompt)
      texts.push(node?.conversation_config?.agent?.first_message)
    }
  }
  return texts
}

export function collectVariables(agent) {
  const map = agent?.conversation_config?.agent?.dynamic_variables?.dynamic_variable_placeholders
  const declared =
    map && typeof map === 'object' && !Array.isArray(map)
      ? Object.entries(map)
          .filter(([name]) => name && !SKIP_VARIABLE.test(name))
          .map(([name, placeholder]) => ({
            name,
            placeholder: placeholder == null ? '' : String(placeholder),
          }))
      : []
  const seen = new Set(declared.map((item) => item.name))
  const extras = []
  for (const text of textsOf(agent)) {
    if (typeof text !== 'string') continue
    for (const match of text.matchAll(TOKEN)) {
      const name = match[1]
      if (!name || SKIP_VARIABLE.test(name) || seen.has(name)) continue
      seen.add(name)
      extras.push({ name, placeholder: '' })
    }
  }
  return [...declared, ...extras]
}

export function readVariableValues(declared, input) {
  const values = {}
  const missing = []
  const source = input && typeof input === 'object' ? input : {}
  for (const variable of declared || []) {
    const value = String(source[variable.name] ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .trim()
      .slice(0, 1000)
    if (!value) missing.push(variable.name)
    else values[variable.name] = value
  }
  return { values, missing }
}

export function criteriaDefinitions(agent) {
  const list = agent?.platform_settings?.evaluation?.criteria
  if (!Array.isArray(list)) return []
  return list
    .map((item) => {
      const id = String(item?.id ?? '').trim()
      if (!id) return null
      const mode = String(item?.scoring_mode ?? 'binary').toLowerCase()
      return {
        id,
        name: String(item?.name ?? id).trim() || id,
        scoringMode: mode === 'binary' ? 'binary' : 'numeric',
      }
    })
    .filter(Boolean)
}
