import { validateHoursValue } from './hour-log-rules'
import {
  formatCalendarDay,
  institutionTimeZone,
  toInstitutionCalendarDay,
} from './timezone'

export interface RawVoiceDraft {
  date?: string | Date | null
  startTime?: string | null
  endTime?: string | null
  hours?: number | string | null
  activity?: string | null
}

export interface VoiceDraftContext {
  recordedAt: Date
  timeZone?: string
}

export interface NormalizedVoiceDraft {
  date: string | null
  startTime: string | null
  endTime: string | null
  hours: number | null
  activity: string | null
}

export type VoiceDraftField = 'date' | 'startTime' | 'endTime' | 'hours' | 'activity'

export const VOICE_DRAFT_WARNINGS = {
  HOURS_MISMATCH: 'hours_mismatch',
  ACTIVITY_TRUNCATED: 'activity_truncated',
  FUTURE_DATE: 'future_date',
  END_BEFORE_START: 'end_before_start',
  HOURS_OUT_OF_RANGE: 'hours_out_of_range',
  INVALID_TIME_FORMAT: 'invalid_time_format',
  INVALID_DATE: 'invalid_date',
} as const

export type VoiceDraftWarning =
  (typeof VOICE_DRAFT_WARNINGS)[keyof typeof VOICE_DRAFT_WARNINGS]

export interface VoiceDraftResult {
  draft: NormalizedVoiceDraft
  missing: VoiceDraftField[]
  warnings: VoiceDraftWarning[]
}

const MAX_ACTIVITY_LENGTH = 500
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

function normalizeActivity(
  rawActivity: unknown,
  missing: VoiceDraftField[],
  warnings: VoiceDraftWarning[],
): string | null {
  if (typeof rawActivity !== 'string') {
    missing.push('activity')
    return null
  }
  const trimmed = rawActivity.trim()
  if (trimmed.length === 0) {
    missing.push('activity')
    return null
  }
  if (trimmed.length > MAX_ACTIVITY_LENGTH) {
    warnings.push(VOICE_DRAFT_WARNINGS.ACTIVITY_TRUNCATED)
    return trimmed.slice(0, MAX_ACTIVITY_LENGTH)
  }
  return trimmed
}

function parseCandidateDate(rawDate: unknown, timeZone: string): Date | null {
  if (rawDate instanceof Date) {
    return isNaN(rawDate.getTime()) ? null : toInstitutionCalendarDay(rawDate, timeZone)
  }
  if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number)
      const utcDate = new Date(Date.UTC(year, month - 1, day))
      const isValid =
        !isNaN(utcDate.getTime()) &&
        utcDate.getUTCFullYear() === year &&
        utcDate.getUTCMonth() === month - 1 &&
        utcDate.getUTCDate() === day
      return isValid ? utcDate : null
    }
    const parsed = new Date(trimmed)
    return isNaN(parsed.getTime()) ? null : toInstitutionCalendarDay(parsed, timeZone)
  }
  return null
}

function normalizeDate(
  rawDate: unknown,
  context: VoiceDraftContext,
  missing: VoiceDraftField[],
  warnings: VoiceDraftWarning[],
): string | null {
  const timeZone = context.timeZone ?? institutionTimeZone()
  const today = toInstitutionCalendarDay(context.recordedAt, timeZone)

  if (rawDate === null || rawDate === undefined || (typeof rawDate === 'string' && rawDate.trim() === '')) {
    return formatCalendarDay(today)
  }

  const candidate = parseCandidateDate(rawDate, timeZone)
  if (!candidate) {
    missing.push('date')
    warnings.push(VOICE_DRAFT_WARNINGS.INVALID_DATE)
    return null
  }

  if (candidate.getTime() > today.getTime()) {
    missing.push('date')
    warnings.push(VOICE_DRAFT_WARNINGS.FUTURE_DATE)
    return null
  }

  return formatCalendarDay(candidate)
}

function normalizeTimeField(
  rawTime: unknown,
  fieldName: 'startTime' | 'endTime',
  missing: VoiceDraftField[],
  warnings: VoiceDraftWarning[],
): string | null {
  if (rawTime === null || rawTime === undefined || (typeof rawTime === 'string' && rawTime.trim() === '')) {
    missing.push(fieldName)
    return null
  }
  if (typeof rawTime !== 'string' || !TIME_REGEX.test(rawTime.trim())) {
    missing.push(fieldName)
    if (!warnings.includes(VOICE_DRAFT_WARNINGS.INVALID_TIME_FORMAT)) {
      warnings.push(VOICE_DRAFT_WARNINGS.INVALID_TIME_FORMAT)
    }
    return null
  }
  return rawTime.trim()
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function normalizeTimeInterval(
  rawStartTime: unknown,
  rawEndTime: unknown,
  missing: VoiceDraftField[],
  warnings: VoiceDraftWarning[],
): { startTime: string | null; endTime: string | null; calculatedHours: number | null } {
  const startTime = normalizeTimeField(rawStartTime, 'startTime', missing, warnings)
  const endTime = normalizeTimeField(rawEndTime, 'endTime', missing, warnings)

  if (!startTime || !endTime) {
    return { startTime, endTime, calculatedHours: null }
  }

  const startMinutes = parseTimeToMinutes(startTime)
  const endMinutes = parseTimeToMinutes(endTime)

  if (endMinutes <= startMinutes) {
    warnings.push(VOICE_DRAFT_WARNINGS.END_BEFORE_START)
    missing.push('endTime')
    return { startTime, endTime: null, calculatedHours: null }
  }

  const rawDiffHours = (endMinutes - startMinutes) / 60
  const calculatedHours = Math.round(rawDiffHours * 100) / 100
  return { startTime, endTime, calculatedHours }
}

function parseModelHours(rawHours: unknown): number | null {
  if (rawHours === null || rawHours === undefined || rawHours === '') {
    return null
  }
  const n = typeof rawHours === 'number' ? rawHours : Number(rawHours)
  return Number.isFinite(n) ? n : null
}

function resolveHours(
  calculatedHours: number | null,
  rawHours: unknown,
  missing: VoiceDraftField[],
  warnings: VoiceDraftWarning[],
): number | null {
  const modelHours = parseModelHours(rawHours)

  if (calculatedHours !== null && modelHours !== null) {
    const diff = Math.abs(calculatedHours - modelHours)
    if (diff > 0.25) {
      warnings.push(VOICE_DRAFT_WARNINGS.HOURS_MISMATCH)
    }
  }

  const candidateHours = calculatedHours ?? modelHours
  if (candidateHours === null) {
    missing.push('hours')
    return null
  }

  const validationError = validateHoursValue(candidateHours)
  if (validationError !== null) {
    missing.push('hours')
    warnings.push(VOICE_DRAFT_WARNINGS.HOURS_OUT_OF_RANGE)
    return null
  }

  return candidateHours
}

/**
 * Normaliza y valida un borrador extraído por IA a partir de un registro de voz (VOZ-01 / G1-59).
 *
 * Función pura y determinista:
 * - Toda fecha de referencia proviene estrictamente de `context.recordedAt`.
 * - Nunca invoca internamente `new Date()` sin argumentos.
 * - No modifica el objeto `raw` original.
 */
export function normalizeVoiceDraft(
  raw: RawVoiceDraft | null | undefined,
  context: VoiceDraftContext,
): VoiceDraftResult {
  const safeRaw = raw ?? {}
  const missing: VoiceDraftField[] = []
  const warnings: VoiceDraftWarning[] = []

  const date = normalizeDate(safeRaw.date, context, missing, warnings)
  const { startTime, endTime, calculatedHours } = normalizeTimeInterval(
    safeRaw.startTime,
    safeRaw.endTime,
    missing,
    warnings,
  )
  const hours = resolveHours(calculatedHours, safeRaw.hours, missing, warnings)
  const activity = normalizeActivity(safeRaw.activity, missing, warnings)

  return {
    draft: {
      date,
      startTime,
      endTime,
      hours,
      activity,
    },
    missing,
    warnings,
  }
}
