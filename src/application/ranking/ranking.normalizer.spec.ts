import { describe, expect, it } from 'vitest'
import { MAX_REASON_LENGTH, normalizeRanking } from './ranking.normalizer'

const aliases = ['c1', 'c2', 'c3']

describe('normalizeRanking (IA-01)', () => {
  it('ordena de mayor a menor puntuación', () => {
    const { ranked, unranked } = normalizeRanking(
      [
        { id: 'c1', score: 40, reason: 'a' },
        { id: 'c2', score: 90, reason: 'b' },
        { id: 'c3', score: 70, reason: 'c' },
      ],
      aliases,
    )

    expect(ranked.map((item) => item.alias)).toEqual(['c2', 'c3', 'c1'])
    expect(unranked).toEqual([])
  })

  it('desempata por el orden de los alias (la postulación más antigua primero)', () => {
    const { ranked } = normalizeRanking(
      [
        { id: 'c3', score: 80, reason: '' },
        { id: 'c1', score: 80, reason: '' },
        { id: 'c2', score: 80, reason: '' },
      ],
      aliases,
    )

    expect(ranked.map((item) => item.alias)).toEqual(['c1', 'c2', 'c3'])
  })

  it('redondea y acota la puntuación a 0..100 y acepta números como texto', () => {
    const { ranked } = normalizeRanking(
      [
        { id: 'c1', score: 150, reason: '' },
        { id: 'c2', score: -5, reason: '' },
        { id: 'c3', score: '72.6', reason: '' },
      ],
      aliases,
    )

    expect(Object.fromEntries(ranked.map((item) => [item.alias, item.score]))).toEqual({ c1: 100, c2: 0, c3: 73 })
  })

  it('manda a unranked lo que falta o llega con datos inválidos', () => {
    const { ranked, unranked } = normalizeRanking(
      [{ id: 'c1', score: 'mucho' }, { id: 'c2', score: Number.NaN }, null, 'texto', { score: 50 }, { id: 'c3', score: null }],
      aliases,
    )

    expect(ranked).toEqual([])
    expect(unranked).toEqual(['c1', 'c2', 'c3'])
  })

  it('ignora alias desconocidos y se queda con el primero de un alias repetido', () => {
    const { ranked, unranked } = normalizeRanking(
      [
        { id: 'c9', score: 99, reason: 'inventado' },
        { id: 'c1', score: 60, reason: 'primero' },
        { id: 'c1', score: 100, reason: 'repetido' },
      ],
      aliases,
    )

    expect(ranked).toEqual([{ alias: 'c1', score: 60, reason: 'primero' }])
    expect(unranked).toEqual(['c2', 'c3'])
  })

  it('recorta el motivo y lo deja vacío si no es texto', () => {
    const { ranked } = normalizeRanking(
      [
        { id: 'c1', score: 50, reason: `  ${'x'.repeat(MAX_REASON_LENGTH + 50)}  ` },
        { id: 'c2', score: 40, reason: { malicioso: true } },
      ],
      aliases,
    )

    expect(ranked[0].reason).toHaveLength(MAX_REASON_LENGTH)
    expect(ranked[1].reason).toBe('')
  })
})
