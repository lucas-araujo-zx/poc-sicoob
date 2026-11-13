export const FINANCIAL_DEFAULTS = {
  desconto_a_vista: '0',
  max_parcelas: '1',
  juros: '0',
}

export const FIELD_GROUPS = [
  {
    id: 'identity',
    title: 'Identificação',
    names: ['nome_cooperado', 'celular'],
  },
  {
    id: 'debt',
    title: 'Débito',
    names: ['saldo_divida', 'dias_vencidos'],
  },
  {
    id: 'deal',
    title: 'Condições liberadas para negociação',
    names: ['desconto_a_vista', 'max_parcelas', 'juros'],
  },
]

export function groupVariables(variables) {
  const byName = new Map((variables || []).map((item) => [item.name, item]))
  const used = new Set()
  const groups = FIELD_GROUPS.map((group) => {
    const fields = group.names.filter((name) => byName.has(name)).map((name) => byName.get(name))
    fields.forEach((field) => used.add(field.name))
    return { ...group, fields }
  }).filter((group) => group.fields.length)
  const rest = (variables || []).filter((item) => !used.has(item.name))
  if (rest.length) groups.push({ id: 'other', title: 'Outros dados', names: rest.map((item) => item.name), fields: rest })
  return groups
}

export function parseNumber(raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(/[^\d,.-]/g, '')
  if (!text) return null
  const value = text.includes(',') && text.includes('.')
    ? Number(text.replace(/\./g, '').replace(',', '.'))
    : text.includes(',')
      ? Number(text.replace(',', '.'))
      : Number(text)
  return Number.isFinite(value) ? value : null
}

export function cashAmount(saldo, descontoPercent) {
  if (saldo == null || descontoPercent == null) return null
  const fraction = Math.min(100, Math.max(0, descontoPercent)) / 100
  return Math.round(saldo * (1 - fraction) * 100) / 100
}

export function installmentAmount(saldo, parcelas, jurosPercent) {
  if (saldo == null || !parcelas || parcelas < 1) return null
  const rate = (jurosPercent ?? 0) / 100
  const raw = rate === 0
    ? saldo / parcelas
    : (saldo * (rate * (1 + rate) ** parcelas)) / ((1 + rate) ** parcelas - 1)
  return Math.round((raw + Number.EPSILON) * 100) / 100
}

export function formatBrl(value) {
  if (value == null || Number.isNaN(value)) return ''
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
