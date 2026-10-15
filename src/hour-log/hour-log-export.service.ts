import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { validateHoursValue } from './hour-log-rules'

/**
 * Servicio encargado de generar la exportación tabular del libro de horas
 * de un placement en formato CSV compatible con RFC 4180.
 */
@Injectable()
export class HourLogExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportRows(placementId: number): Promise<(string | number)[][]> {
    const logs = await this.prisma.hourLog.findMany({
      where: { placementId, deletedAt: null },
      orderBy: { date: 'asc' },
    })

    const header = ['id', 'fecha', 'inicio', 'fin', 'horas', 'actividad', 'estado', 'revisadoPor']
    const rows: (string | number)[][] = [header]

    for (const dto of logs) {
      const hoursError = validateHoursValue(dto.hours)
      if (hoursError) throw new BadRequestException(hoursError)

      const [startHour, startMinute] = dto.startTime.split(':').map(Number)
      const [endHour, endMinute] = dto.endTime.split(':').map(Number)
      if (startHour * 60 + startMinute >= endHour * 60 + endMinute) {
        throw new BadRequestException('la hora de inicio debe ser anterior a la de fin')
      }

      rows.push([
        dto.id,
        dto.date.toISOString().slice(0, 10),
        dto.startTime,
        dto.endTime,
        dto.hours,
        this.escapeCsvField(dto.activity),
        dto.status,
        dto.reviewedById ?? '',
      ])
    }

    let totalHours = 0
    for (const row of rows.slice(1)) {
      const hoursCell = row[4]
      if (typeof hoursCell === 'number') totalHours += hoursCell
    }
    rows.push(['', '', '', '', totalHours, 'TOTAL', '', ''])

    return rows
  }

  escapeCsvField(value: string): string {
    const needsQuoting = value.includes(',') || value.includes('"') || value.includes('\n')
    if (!needsQuoting) return value
    return `"${value.replace(/"/g, '""')}"`
  }
}
