function roundCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function numberFrom(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value ?? '')
    .trim()
    .replace(/[^\d,.-]/g, '')
  if (!text) return Number.NaN
  if (text.includes(',') && text.includes('.')) {
    return Number(text.replace(/\./g, '').replace(',', '.'))
  }
  if (text.includes(',')) return Number(text.replace(',', '.'))
  return Number(text)
}

export function calcularParcela({ saldo_divida, parcelas, max_parcelas, juros }) {
  const saldo = numberFrom(saldo_divida)
  const vezes = Math.trunc(numberFrom(parcelas))
  const maximo = Math.trunc(numberFrom(max_parcelas))
  const taxa = numberFrom(juros)

  if (!Number.isFinite(saldo) || saldo <= 0) {
    return { error: 'saldo_divida invalido' }
  }
  if (!Number.isFinite(maximo) || maximo < 1) {
    return { error: 'max_parcelas invalido' }
  }
  if (!Number.isFinite(vezes) || vezes < 1 || vezes > maximo) {
    return { error: 'parcelas fora da faixa', minimo: 1, maximo }
  }
  if (!Number.isFinite(taxa) || taxa < 0) {
    return { error: 'juros invalido' }
  }

  const rate = taxa / 100
  const bruta = rate === 0 ? saldo / vezes : saldo * ((rate * (1 + rate) ** vezes) / ((1 + rate) ** vezes - 1))
  const valor_parcela = roundCents(bruta)
  return {
    parcelas: vezes,
    juros_percentual: taxa,
    valor_parcela,
    valor_total: roundCents(valor_parcela * vezes),
  }
}

export default async function calcularParcelaTool(ctx) {
  return calcularParcela(ctx?.args ?? {})
}
