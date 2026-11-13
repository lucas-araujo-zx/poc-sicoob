import assert from 'node:assert/strict'
import test from 'node:test'
import { cashAmount, installmentAmount, parseNumber } from './negotiation.js'
import { calcularParcela } from '../tools/calcular_parcela.mjs'

test('desconto de 15 por cento reduz o saldo à vista', () => {
  assert.equal(cashAmount(1000, 15), 850)
  assert.equal(cashAmount(1850, 0), 1850)
})

test('parcela sem juros divide o saldo', () => {
  assert.equal(installmentAmount(1200, 2, 0), 600)
})

test('parcela com juros compostos usa a tabela price', () => {
  const value = installmentAmount(1000, 2, 10)
  assert.equal(value, 576.19)
  assert.deepEqual(calcularParcela({
    saldo_divida: 'R$ 1.000,00',
    parcelas: 2,
    max_parcelas: 6,
    juros: 10,
  }), {
    parcelas: 2,
    juros_percentual: 10,
    valor_parcela: 576.19,
    valor_total: 1152.38,
  })
})

test('a ferramenta recusa parcela acima do máximo', () => {
  const result = calcularParcela({ saldo_divida: 1000, parcelas: 7, max_parcelas: 6, juros: 0 })
  assert.equal(result.error, 'parcelas fora da faixa')
  assert.equal(result.maximo, 6)
})

test('entende saldo escrito em reais', () => {
  assert.equal(parseNumber('R$ 1.850,00'), 1850)
})
