export const MAX_REASON_LENGTH = 200

export interface RankedAlias {
  alias: string
  score: number
  reason: string
}

export interface NormalizedRanking {
  ranked: RankedAlias[]
  unranked: string[]
}

function toScore(value: unknown): number | null {
  const score = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  return Math.min(100, Math.max(0, Math.round(score)))
}

function toReason(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_REASON_LENGTH) : ''
}

/**
 * Convierte la respuesta del modelo en algo seguro de mostrar. `aliases` va en
 * el orden de desempate (la postulación más antigua primero): lo que el modelo
 * no devuelva, o devuelva mal, queda en `unranked` en ese mismo orden.
 */
export function normalizeRanking(raw: unknown[], aliases: string[]): NormalizedRanking {
  const valid = new Set(aliases)
  const seen = new Map<string, RankedAlias>()

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const { id, score, reason } = item as Record<string, unknown>
    const normalizedScore = toScore(score)
    if (typeof id !== 'string' || !valid.has(id) || seen.has(id) || normalizedScore === null) continue
    seen.set(id, { alias: id, score: normalizedScore, reason: toReason(reason) })
  }

  const order = new Map(aliases.map((alias, index) => [alias, index]))
  const ranked = [...seen.values()].sort(
    (a, b) => b.score - a.score || (order.get(a.alias) ?? 0) - (order.get(b.alias) ?? 0),
  )
  const unranked = aliases.filter((alias) => !seen.has(alias))

  return { ranked, unranked }
}
