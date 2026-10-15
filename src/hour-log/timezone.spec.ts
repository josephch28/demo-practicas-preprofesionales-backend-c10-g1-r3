import { describe, expect, it } from 'vitest'
import { formatCalendarDay, institutionToday, toInstitutionCalendarDay, truncateToUtcDay } from './timezone'

const GUAYAQUIL = 'America/Guayaquil' // UTC-5, sin horario de verano

describe('toInstitutionCalendarDay', () => {

  it('un instante tarde en el día local sigue cayendo en el día local, no en el día UTC', () => {
    const instant = new Date('2026-10-15T01:00:00.000Z') // 2026-10-14 20:00 en Guayaquil
    const day = toInstitutionCalendarDay(instant, GUAYAQUIL)

    expect(formatCalendarDay(day)).toBe('2026-10-14')
  })

  it('dos dispositivos en zonas horarias distintas que registran el mismo instante real obtienen el mismo día', () => {

    const fromDeviceInEcuador = new Date('2026-10-14T20:00:00-05:00')
    const fromDeviceInJapan = new Date('2026-10-15T10:00:00+09:00')

    expect(fromDeviceInEcuador.getTime()).toBe(fromDeviceInJapan.getTime())

    const dayA = toInstitutionCalendarDay(fromDeviceInEcuador, GUAYAQUIL)
    const dayB = toInstitutionCalendarDay(fromDeviceInJapan, GUAYAQUIL)

    expect(formatCalendarDay(dayA)).toBe('2026-10-14')
    expect(formatCalendarDay(dayB)).toBe('2026-10-14')
  })

  it('un instante temprano en el día local cae un día antes que su fecha UTC', () => {
    const instant = new Date('2026-10-14T03:00:00.000Z') // 2026-10-13 22:00 en Guayaquil
    const day = toInstitutionCalendarDay(instant, GUAYAQUIL)

    expect(formatCalendarDay(day)).toBe('2026-10-13')
  })

  it('usa HOUR_LOG_TIME_ZONE cuando no se pasa una zona horaria explícita', () => {
    const original = process.env.HOUR_LOG_TIME_ZONE
    process.env.HOUR_LOG_TIME_ZONE = 'Asia/Tokyo' // UTC+9
    try {
      const instant = new Date('2026-10-14T20:00:00.000Z') // 2026-10-15 05:00 en Tokio
      expect(formatCalendarDay(toInstitutionCalendarDay(instant))).toBe('2026-10-15')
    } finally {
      process.env.HOUR_LOG_TIME_ZONE = original
    }
  })
})

describe('truncateToUtcDay', () => {

  it('no mueve un día calendario a otro día, a diferencia de toInstitutionCalendarDay', () => {
    const placementStart = new Date('2026-09-16') // medianoche UTC: así se guardó la fecha, no un instante

    expect(formatCalendarDay(truncateToUtcDay(placementStart))).toBe('2026-09-16')
    // Esta es la trampa: tratarlo como instante real en Guayaquil (UTC-5) lo movería al 15.
    expect(formatCalendarDay(toInstitutionCalendarDay(placementStart, GUAYAQUIL))).toBe('2026-09-15')
  })
})

describe('institutionToday', () => {
  it('devuelve un día anclado a medianoche UTC', () => {
    const today = institutionToday(GUAYAQUIL)
    expect(today.getUTCHours()).toBe(0)
    expect(today.getUTCMinutes()).toBe(0)
  })
})