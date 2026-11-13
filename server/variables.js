import { VARIABLE_FIELDS } from './fields.js'

export function declaredVariables() {
  return VARIABLE_FIELDS.map((field) => ({ name: field.name, placeholder: '' }))
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
