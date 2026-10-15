const DEFAULT_TIME_ZONE = 'America/Guayaquil'

/** Zona horaria de la institución. Configurable con `HOUR_LOG_TIME_ZONE`. */
export function institutionTimeZone(): string {
  return process.env.HOUR_LOG_TIME_ZONE ?? DEFAULT_TIME_ZONE
}

export function toInstitutionCalendarDay(instant: Date, timeZone: string = institutionTimeZone()): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // 'en-CA' formatea como YYYY-MM-DD.
  const [year, month, day] = formatter.format(instant).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/** El día calendario de "ahora" en la zona horaria de la institución. */
export function institutionToday(timeZone: string = institutionTimeZone()): Date {
  return toInstitutionCalendarDay(new Date(), timeZone)
}

/** Formatea un día calendario (ya anclado con `toInstitutionCalendarDay`) como YYYY-MM-DD. */
export function formatCalendarDay(day: Date): string {
  return day.toISOString().slice(0, 10)
}

export function truncateToUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}