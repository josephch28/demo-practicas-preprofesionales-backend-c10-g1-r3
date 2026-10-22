import { describe, expect, it } from 'vitest'
import {
  HOUR_LOG_MAX_HOURS_PER_DAY,
  HOUR_LOG_MIN_HOURS_PER_DAY,
} from './hour-log-rules'
import {
  normalizeVoiceDraft,
  VOICE_DRAFT_WARNINGS,
  VoiceDraftContext,
} from './voice-draft'

describe('normalizeVoiceDraft (VOZ-01 / G1-59)', () => {
  const defaultContext: VoiceDraftContext = {
    recordedAt: new Date('2026-10-20T15:00:00.000Z'), // 10:00 en Guayaquil (UTC-5)
    timeZone: 'America/Guayaquil',
  }

  describe('Pureza, determinismo e inmutabilidad', () => {
    it('no muta el objeto raw original (verificado con Object.freeze)', () => {
      const raw = Object.freeze({
        date: '2026-10-19',
        startTime: '08:00',
        endTime: '12:00',
        hours: 4,
        activity: 'Desarrollo de pruebas unitarias',
      })

      const result = normalizeVoiceDraft(raw, defaultContext)

      expect(result.draft).toEqual({
        date: '2026-10-19',
        startTime: '08:00',
        endTime: '12:00',
        hours: 4,
        activity: 'Desarrollo de pruebas unitarias',
      })
      expect(result.missing).toEqual([])
      expect(result.warnings).toEqual([])
    })

    it('es completamente determinista: dos llamadas con el mismo contexto dan el mismo resultado', () => {
      const raw = {
        date: null,
        startTime: '09:00',
        endTime: '14:00',
        hours: null,
        activity: 'Revisión de requerimientos',
      }

      const res1 = normalizeVoiceDraft(raw, defaultContext)
      const res2 = normalizeVoiceDraft(raw, defaultContext)

      expect(res1).toEqual(res2)
    })

    it('soporta raw como null o undefined sin lanzar errores', () => {
      const resNull = normalizeVoiceDraft(null, defaultContext)
      expect(resNull.draft.date).toBe('2026-10-20')
      expect(resNull.missing).toEqual(['startTime', 'endTime', 'hours', 'activity'])

      const resUndefined = normalizeVoiceDraft(undefined, defaultContext)
      expect(resUndefined.draft.date).toBe('2026-10-20')
      expect(resUndefined.missing).toEqual(['startTime', 'endTime', 'hours', 'activity'])
    })

    it('usa institutionTimeZone() por defecto cuando context.timeZone no se especifica', () => {
      const contextWithoutTz: VoiceDraftContext = {
        recordedAt: new Date('2026-10-20T15:00:00.000Z'),
      }
      const res = normalizeVoiceDraft({ date: null }, contextWithoutTz)
      expect(res.draft.date).toBe('2026-10-20')
    })
  })

  describe('Fecha, fechas futuras y zona horaria', () => {
    it('cuando date es null o vacía, usa el día calendario de context.recordedAt en la zona horaria configurada', () => {
      const result = normalizeVoiceDraft({ date: null }, defaultContext)

      expect(result.draft.date).toBe('2026-10-20')
      expect(result.missing).not.toContain('date')
      expect(result.warnings).not.toContain(VOICE_DRAFT_WARNINGS.FUTURE_DATE)

      const resultWhitespace = normalizeVoiceDraft({ date: '   ' }, defaultContext)
      expect(resultWhitespace.draft.date).toBe('2026-10-20')
      expect(resultWhitespace.missing).not.toContain('date')
    })

    it('acepta una fecha pasada válida y la normaliza a YYYY-MM-DD', () => {
      const resultString = normalizeVoiceDraft({ date: '2026-10-15' }, defaultContext)
      expect(resultString.draft.date).toBe('2026-10-15')
      expect(resultString.missing).not.toContain('date')

      const resultIsoString = normalizeVoiceDraft({ date: '2026-10-15T10:00:00Z' }, defaultContext)
      expect(resultIsoString.draft.date).toBe('2026-10-15')
      expect(resultIsoString.missing).not.toContain('date')

      const resultDate = normalizeVoiceDraft(
        { date: new Date('2026-10-15T10:00:00-05:00') },
        defaultContext,
      )
      expect(resultDate.draft.date).toBe('2026-10-15')
      expect(resultDate.missing).not.toContain('date')
    })

    it('detecta fecha futura respecto a context.recordedAt y emite future_date', () => {
      // recordedAt es 2026-10-20. 2026-10-21 es mañana.
      const result = normalizeVoiceDraft({ date: '2026-10-21' }, defaultContext)

      expect(result.draft.date).toBeNull()
      expect(result.missing).toContain('date')
      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.FUTURE_DATE)
    })

    it('detecta fecha futura provista como Date object', () => {
      const futureDate = new Date('2026-10-25T10:00:00-05:00')
      const result = normalizeVoiceDraft({ date: futureDate }, defaultContext)

      expect(result.draft.date).toBeNull()
      expect(result.missing).toContain('date')
      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.FUTURE_DATE)
    })

    it('marca invalid_date cuando la fecha tiene formato o tipo inválido', () => {
      const result = normalizeVoiceDraft({ date: 'fecha-invalida' }, defaultContext)
      expect(result.draft.date).toBeNull()
      expect(result.missing).toContain('date')
      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.INVALID_DATE)

      const resultBadCalendar = normalizeVoiceDraft({ date: '2026-02-31' }, defaultContext)
      expect(resultBadCalendar.draft.date).toBeNull()
      expect(resultBadCalendar.missing).toContain('date')
      expect(resultBadCalendar.warnings).toContain(VOICE_DRAFT_WARNINGS.INVALID_DATE)

      const resultBadIso = normalizeVoiceDraft({ date: '2026-99-99T99:99:99Z' }, defaultContext)
      expect(resultBadIso.draft.date).toBeNull()
      expect(resultBadIso.missing).toContain('date')
      expect(resultBadIso.warnings).toContain(VOICE_DRAFT_WARNINGS.INVALID_DATE)

      const resultBadDateObj = normalizeVoiceDraft({ date: new Date('invalid') }, defaultContext)
      expect(resultBadDateObj.draft.date).toBeNull()
      expect(resultBadDateObj.missing).toContain('date')
      expect(resultBadDateObj.warnings).toContain(VOICE_DRAFT_WARNINGS.INVALID_DATE)

      const resultBadType = normalizeVoiceDraft({ date: 12345 as unknown as string }, defaultContext)
      expect(resultBadType.draft.date).toBeNull()
      expect(resultBadType.missing).toContain('date')
      expect(resultBadType.warnings).toContain(VOICE_DRAFT_WARNINGS.INVALID_DATE)
    })

    it('resuelve correctamente la fecha alrededor de medianoche según distintas zonas horarias', () => {
      // 2026-10-15T01:00:00.000Z
      // En Guayaquil (UTC-5) son las 20:00 del 2026-10-14.
      // En Tokio (UTC+9) son las 10:00 del 2026-10-15.
      const instantNearMidnight = new Date('2026-10-15T01:00:00.000Z')

      const draftGuayaquil = normalizeVoiceDraft(
        { date: null },
        { recordedAt: instantNearMidnight, timeZone: 'America/Guayaquil' },
      )
      expect(draftGuayaquil.draft.date).toBe('2026-10-14')

      const draftTokyo = normalizeVoiceDraft(
        { date: null },
        { recordedAt: instantNearMidnight, timeZone: 'Asia/Tokyo' },
      )
      expect(draftTokyo.draft.date).toBe('2026-10-15')

      // Para esa misma hora, la fecha "2026-10-15" es futura en Guayaquil, pero es hoy en Tokio
      const candidateDate = '2026-10-15'
      const checkGuayaquil = normalizeVoiceDraft(
        { date: candidateDate },
        { recordedAt: instantNearMidnight, timeZone: 'America/Guayaquil' },
      )
      expect(checkGuayaquil.warnings).toContain(VOICE_DRAFT_WARNINGS.FUTURE_DATE)
      expect(checkGuayaquil.draft.date).toBeNull()

      const checkTokyo = normalizeVoiceDraft(
        { date: candidateDate },
        { recordedAt: instantNearMidnight, timeZone: 'Asia/Tokyo' },
      )
      expect(checkTokyo.warnings).not.toContain(VOICE_DRAFT_WARNINGS.FUTURE_DATE)
      expect(checkTokyo.draft.date).toBe('2026-10-15')
    })
  })

  describe('Formatos de HH:MM para startTime y endTime', () => {
    it('acepta formatos válidos HH:MM (de 00:00 a 23:59)', () => {
      const result = normalizeVoiceDraft(
        { startTime: '08:30', endTime: '12:45' },
        defaultContext,
      )
      expect(result.draft.startTime).toBe('08:30')
      expect(result.draft.endTime).toBe('12:45')
      expect(result.missing).not.toContain('startTime')
      expect(result.missing).not.toContain('endTime')
      expect(result.warnings).not.toContain(VOICE_DRAFT_WARNINGS.INVALID_TIME_FORMAT)
    })

    it('rechaza formato sin ceros a la izquierda (ej. "8")', () => {
      const result = normalizeVoiceDraft({ startTime: '8', endTime: '12:00' }, defaultContext)
      expect(result.draft.startTime).toBeNull()
      expect(result.missing).toContain('startTime')
      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.INVALID_TIME_FORMAT)
    })

    it('rechaza formato de 12 horas con am/pm (ej. "8am")', () => {
      const result = normalizeVoiceDraft({ startTime: '8am', endTime: '12:00' }, defaultContext)
      expect(result.draft.startTime).toBeNull()
      expect(result.missing).toContain('startTime')
      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.INVALID_TIME_FORMAT)
    })

    it('rechaza horas mayores a 23 (ej. "25:00", "24:00")', () => {
      const result25 = normalizeVoiceDraft({ startTime: '25:00' }, defaultContext)
      expect(result25.draft.startTime).toBeNull()
      expect(result25.missing).toContain('startTime')
      expect(result25.warnings).toContain(VOICE_DRAFT_WARNINGS.INVALID_TIME_FORMAT)

      const result24 = normalizeVoiceDraft({ endTime: '24:00' }, defaultContext)
      expect(result24.draft.endTime).toBeNull()
      expect(result24.missing).toContain('endTime')
      expect(result24.warnings).toContain(VOICE_DRAFT_WARNINGS.INVALID_TIME_FORMAT)
    })

    it('rechaza minutos mayores a 59 (ej. "12:60")', () => {
      const result = normalizeVoiceDraft({ endTime: '12:60' }, defaultContext)
      expect(result.draft.endTime).toBeNull()
      expect(result.missing).toContain('endTime')
      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.INVALID_TIME_FORMAT)
    })

    it('rechaza tipos no string para tiempos', () => {
      const result = normalizeVoiceDraft({ startTime: 800 as unknown as string }, defaultContext)
      expect(result.draft.startTime).toBeNull()
      expect(result.missing).toContain('startTime')
      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.INVALID_TIME_FORMAT)
    })

    it('no duplica el warning invalid_time_format si ambos son inválidos', () => {
      const result = normalizeVoiceDraft({ startTime: '8', endTime: '25:00' }, defaultContext)
      const invalidWarnings = result.warnings.filter(
        w => w === VOICE_DRAFT_WARNINGS.INVALID_TIME_FORMAT,
      )
      expect(invalidWarnings).toHaveLength(1)
      expect(result.missing).toContain('startTime')
      expect(result.missing).toContain('endTime')
    })
  })

  describe('Relación de horarios: fin anterior o igual al inicio', () => {
    it('detecta fin anterior al inicio (ej. 12:00 a 08:00)', () => {
      const result = normalizeVoiceDraft(
        { startTime: '12:00', endTime: '08:00' },
        defaultContext,
      )

      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.END_BEFORE_START)
      expect(result.draft.startTime).toBe('12:00')
      expect(result.draft.endTime).toBeNull()
      expect(result.missing).toContain('endTime')
    })

    it('detecta fin igual al inicio (ej. 10:00 a 10:00)', () => {
      const result = normalizeVoiceDraft(
        { startTime: '10:00', endTime: '10:00' },
        defaultContext,
      )

      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.END_BEFORE_START)
      expect(result.draft.endTime).toBeNull()
      expect(result.missing).toContain('endTime')
    })

    it('no calcula horas si el fin es anterior al inicio', () => {
      const result = normalizeVoiceDraft(
        { startTime: '15:00', endTime: '11:00', hours: null },
        defaultContext,
      )

      expect(result.draft.hours).toBeNull()
      expect(result.missing).toContain('hours')
    })
  })

  describe('Cálculo, validación de horas y discrepancias (mismatch)', () => {
    it('calcula automáticamente las horas a partir de startTime y endTime cuando hours es null', () => {
      const result = normalizeVoiceDraft(
        { startTime: '08:00', endTime: '12:30', hours: null },
        defaultContext,
      )

      expect(result.draft.hours).toBe(4.5)
      expect(result.missing).not.toContain('hours')
      expect(result.warnings).not.toContain(VOICE_DRAFT_WARNINGS.HOURS_MISMATCH)
    })

    it('acepta horas exactamente en el mínimo permitido (0.5 h)', () => {
      expect(HOUR_LOG_MIN_HOURS_PER_DAY).toBe(0.5)

      // Por cálculo
      const resultCalculated = normalizeVoiceDraft(
        { startTime: '08:00', endTime: '08:30' },
        defaultContext,
      )
      expect(resultCalculated.draft.hours).toBe(0.5)
      expect(resultCalculated.missing).not.toContain('hours')
      expect(resultCalculated.warnings).not.toContain(VOICE_DRAFT_WARNINGS.HOURS_OUT_OF_RANGE)

      // Directo por raw.hours
      const resultDirect = normalizeVoiceDraft(
        { hours: 0.5 },
        defaultContext,
      )
      expect(resultDirect.draft.hours).toBe(0.5)
      expect(resultDirect.missing).not.toContain('hours')
      expect(resultDirect.warnings).not.toContain(VOICE_DRAFT_WARNINGS.HOURS_OUT_OF_RANGE)
    })

    it('acepta horas exactamente en el máximo permitido (8.0 h)', () => {
      expect(HOUR_LOG_MAX_HOURS_PER_DAY).toBe(8)

      // Por cálculo
      const resultCalculated = normalizeVoiceDraft(
        { startTime: '08:00', endTime: '16:00' },
        defaultContext,
      )
      expect(resultCalculated.draft.hours).toBe(8)
      expect(resultCalculated.missing).not.toContain('hours')
      expect(resultCalculated.warnings).not.toContain(VOICE_DRAFT_WARNINGS.HOURS_OUT_OF_RANGE)

      // Directo por raw.hours
      const resultDirect = normalizeVoiceDraft(
        { hours: 8 },
        defaultContext,
      )
      expect(resultDirect.draft.hours).toBe(8)
      expect(resultDirect.missing).not.toContain('hours')
      expect(resultDirect.warnings).not.toContain(VOICE_DRAFT_WARNINGS.HOURS_OUT_OF_RANGE)
    })

    it('rechaza horas por debajo del mínimo (ej. 0.25 h o 0.4 h)', () => {
      const result = normalizeVoiceDraft(
        { startTime: '08:00', endTime: '08:15', hours: null },
        defaultContext,
      )
      expect(result.draft.hours).toBeNull()
      expect(result.missing).toContain('hours')
      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.HOURS_OUT_OF_RANGE)

      const resultDirect = normalizeVoiceDraft({ hours: 0.4 }, defaultContext)
      expect(resultDirect.draft.hours).toBeNull()
      expect(resultDirect.missing).toContain('hours')
      expect(resultDirect.warnings).toContain(VOICE_DRAFT_WARNINGS.HOURS_OUT_OF_RANGE)
    })

    it('rechaza horas por encima del máximo (ej. 8.5 h o 10 h)', () => {
      const result = normalizeVoiceDraft(
        { startTime: '08:00', endTime: '18:00', hours: null },
        defaultContext,
      )
      expect(result.draft.hours).toBeNull()
      expect(result.missing).toContain('hours')
      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.HOURS_OUT_OF_RANGE)

      const resultDirect = normalizeVoiceDraft({ hours: 9 }, defaultContext)
      expect(resultDirect.draft.hours).toBeNull()
      expect(resultDirect.missing).toContain('hours')
      expect(resultDirect.warnings).toContain(VOICE_DRAFT_WARNINGS.HOURS_OUT_OF_RANGE)
    })

    it('no activa hours_mismatch si la divergencia entre calculado y modelo es <= 0.25 h', () => {
      // Calculado: 4.0 h (08:00 a 12:00)
      // Modelo: 4.25 h (|4.0 - 4.25| = 0.25)
      const result = normalizeVoiceDraft(
        { startTime: '08:00', endTime: '12:00', hours: 4.25 },
        defaultContext,
      )
      expect(result.draft.hours).toBe(4)
      expect(result.warnings).not.toContain(VOICE_DRAFT_WARNINGS.HOURS_MISMATCH)

      // Modelo: 3.8 h (|4.0 - 3.8| = 0.20 <= 0.25)
      const resultUnder = normalizeVoiceDraft(
        { startTime: '08:00', endTime: '12:00', hours: 3.8 },
        defaultContext,
      )
      expect(resultUnder.draft.hours).toBe(4)
      expect(resultUnder.warnings).not.toContain(VOICE_DRAFT_WARNINGS.HOURS_MISMATCH)
    })

    it('activa hours_mismatch cuando la divergencia es estrictamente mayor a 0.25 h', () => {
      // Calculado: 4.0 h (08:00 a 12:00)
      // Modelo: 4.3 h (|4.0 - 4.3| = 0.30 > 0.25)
      const resultSmallMismatch = normalizeVoiceDraft(
        { startTime: '08:00', endTime: '12:00', hours: 4.3 },
        defaultContext,
      )
      expect(resultSmallMismatch.draft.hours).toBe(4)
      expect(resultSmallMismatch.warnings).toContain(VOICE_DRAFT_WARNINGS.HOURS_MISMATCH)

      // Modelo: 5.0 h
      const resultLargeMismatch = normalizeVoiceDraft(
        { startTime: '08:00', endTime: '12:00', hours: 5 },
        defaultContext,
      )
      expect(resultLargeMismatch.draft.hours).toBe(4)
      expect(resultLargeMismatch.warnings).toContain(VOICE_DRAFT_WARNINGS.HOURS_MISMATCH)

      // Modelo: 3.0 h
      const resultNegativeMismatch = normalizeVoiceDraft(
        { startTime: '08:00', endTime: '12:00', hours: 3 },
        defaultContext,
      )
      expect(resultNegativeMismatch.draft.hours).toBe(4)
      expect(resultNegativeMismatch.warnings).toContain(VOICE_DRAFT_WARNINGS.HOURS_MISMATCH)
    })

    it('acepta hours provisto como string numérico', () => {
      const result = normalizeVoiceDraft({ hours: '5' }, defaultContext)
      expect(result.draft.hours).toBe(5)
      expect(result.missing).not.toContain('hours')
    })

    it('trata hours no numérico como null y lo reporta en missing', () => {
      const result = normalizeVoiceDraft({ hours: 'no-es-numero' }, defaultContext)
      expect(result.draft.hours).toBeNull()
      expect(result.missing).toContain('hours')
    })
  })

  describe('Actividad: vacía, válida y truncamiento', () => {
    it('detecta actividad vacía, null o con puros espacios y la coloca en missing', () => {
      const resNull = normalizeVoiceDraft({ activity: null }, defaultContext)
      expect(resNull.draft.activity).toBeNull()
      expect(resNull.missing).toContain('activity')

      const resEmpty = normalizeVoiceDraft({ activity: '' }, defaultContext)
      expect(resEmpty.draft.activity).toBeNull()
      expect(resEmpty.missing).toContain('activity')

      const resSpaces = normalizeVoiceDraft({ activity: '    ' }, defaultContext)
      expect(resSpaces.draft.activity).toBeNull()
      expect(resSpaces.missing).toContain('activity')

      const resNonString = normalizeVoiceDraft({ activity: 999 as unknown as string }, defaultContext)
      expect(resNonString.draft.activity).toBeNull()
      expect(resNonString.missing).toContain('activity')
    })

    it('acepta actividades válidas de hasta 500 caracteres sin truncar ni emitir warnings', () => {
      const text500 = 'a'.repeat(500)
      const result = normalizeVoiceDraft({ activity: text500 }, defaultContext)

      expect(result.draft.activity).toBe(text500)
      expect(result.draft.activity?.length).toBe(500)
      expect(result.missing).not.toContain('activity')
      expect(result.warnings).not.toContain(VOICE_DRAFT_WARNINGS.ACTIVITY_TRUNCATED)
    })

    it('trunca actividades de 501 caracteres a 500 caracteres y activa activity_truncated', () => {
      const text501 = 'b'.repeat(501)
      const result = normalizeVoiceDraft({ activity: text501 }, defaultContext)

      expect(result.draft.activity).toBe('b'.repeat(500))
      expect(result.draft.activity?.length).toBe(500)
      expect(result.missing).not.toContain('activity')
      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.ACTIVITY_TRUNCATED)
    })
  })

  describe('Integración de casos completos', () => {
    it('borrador perfecto sin inconsistencias', () => {
      const result = normalizeVoiceDraft(
        {
          date: '2026-10-18',
          startTime: '08:00',
          endTime: '12:00',
          hours: 4,
          activity: 'Documentación de arquitectura técnica',
        },
        defaultContext,
      )

      expect(result.draft).toEqual({
        date: '2026-10-18',
        startTime: '08:00',
        endTime: '12:00',
        hours: 4,
        activity: 'Documentación de arquitectura técnica',
      })
      expect(result.missing).toEqual([])
      expect(result.warnings).toEqual([])
    })

    it('borrador con múltiples faltantes y advertencias acumuladas', () => {
      const result = normalizeVoiceDraft(
        {
          date: '2026-10-25', // futuro
          startTime: '16:00',
          endTime: '09:00', // fin antes de inicio
          hours: 15, // fuera de rango
          activity: 'x'.repeat(505), // truncado
        },
        defaultContext,
      )

      expect(result.draft.date).toBeNull()
      expect(result.draft.startTime).toBe('16:00')
      expect(result.draft.endTime).toBeNull()
      expect(result.draft.hours).toBeNull()
      expect(result.draft.activity?.length).toBe(500)

      expect(result.missing).toContain('date')
      expect(result.missing).toContain('endTime')
      expect(result.missing).toContain('hours')

      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.FUTURE_DATE)
      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.END_BEFORE_START)
      expect(result.warnings).toContain(VOICE_DRAFT_WARNINGS.ACTIVITY_TRUNCATED)
    })
  })
})
