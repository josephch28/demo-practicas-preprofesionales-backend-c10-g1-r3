/**
 * Reglas de validación de registros de horas (E6-01).
 *
 * Esta es la ÚNICA definición en este repo de qué es un registro de horas
 * válido en términos de rango. El DTO y el service la importan desde aquí;
 * ninguno de los dos vuelve a escribir el número ni el mensaje a mano.
 *
 * Los valores por defecto (8 h máximo, 0.5 h mínimo) los fijó la unidad de
 * vinculación: una jornada estándar de prácticas no supera las 8 horas, y
 * se permiten bloques de media hora para reuniones cortas o turnos partidos.
 *
 * Para cambiar el límite:
 *
 *   1. Edita el default aquí (una sola línea), o
 *   2. Define `HOUR_LOG_MAX_HOURS_PER_DAY` / `HOUR_LOG_MIN_HOURS_PER_DAY`
 *      en el entorno antes de arrancar la app.
 *
 * El repo del frontend tiene su propio archivo espejo con los mismos
 * valores (ver `src/offline/hour-log-rules.ts` allá). Cuando cambies acá,
 * cámbialo allá — no hay forma automática de compartirlos entre repos.
 */

const DEFAULT_MIN_HOURS_PER_DAY = 0.5
const DEFAULT_MAX_HOURS_PER_DAY = 8

function readPositiveNumber(envName: string, fallback: number): number {
  const raw = process.env[envName]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return value
}

export const HOUR_LOG_MIN_HOURS_PER_DAY = readPositiveNumber(
  'HOUR_LOG_MIN_HOURS_PER_DAY',
  DEFAULT_MIN_HOURS_PER_DAY,
)

export const HOUR_LOG_MAX_HOURS_PER_DAY = readPositiveNumber(
  'HOUR_LOG_MAX_HOURS_PER_DAY',
  DEFAULT_MAX_HOURS_PER_DAY,
)

/**
 * Mensaje único de error de rango. Se interpola con los límites vigentes
 * para que un cambio en los límites se refleje en el texto sin editar el
 * mensaje a mano.
 */
export const HOUR_LOG_RANGE_MESSAGE =
  `las horas deben estar entre ${HOUR_LOG_MIN_HOURS_PER_DAY} y ${HOUR_LOG_MAX_HOURS_PER_DAY}`

/**
 * Devuelve `null` si el valor es un registro de horas válido, o el mensaje
 * de error (único) si no lo es. Función pura para que el DTO, el service
 * y los tests consuman la misma regla.
 */
export function validateHoursValue(value: unknown): string | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return HOUR_LOG_RANGE_MESSAGE
  if (n < HOUR_LOG_MIN_HOURS_PER_DAY) return HOUR_LOG_RANGE_MESSAGE
  if (n > HOUR_LOG_MAX_HOURS_PER_DAY) return HOUR_LOG_RANGE_MESSAGE
  return null
}
