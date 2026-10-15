import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HourLogExportService } from './hour-log-export.service'

const prisma = {
  hourLog: { findMany: vi.fn() },
}

describe('HourLogExportService', () => {
  let service: HourLogExportService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new HourLogExportService(prisma as never)
  })

  it('exports hour logs to CSV rows with header and total row', async () => {
    prisma.hourLog.findMany.mockResolvedValue([
      {
        id: 1,
        date: new Date('2026-05-10T00:00:00.000Z'),
        startTime: '09:00',
        endTime: '13:00',
        hours: 4,
        activity: 'Desarrollo de API, pruebas y "fixes"',
        status: 'APPROVED',
        reviewedById: 7,
      },
    ])

    const rows = await service.exportRows(10)

    expect(rows).toHaveLength(3) // header + 1 row + total
    expect(rows[0]).toEqual(['id', 'fecha', 'inicio', 'fin', 'horas', 'actividad', 'estado', 'revisadoPor'])
    expect(rows[1][0]).toBe(1)
    expect(rows[1][1]).toBe('2026-05-10')
    expect(rows[1][4]).toBe(4)
    expect(rows[1][5]).toBe('"Desarrollo de API, pruebas y ""fixes"""')
    expect(rows[2]).toEqual(['', '', '', '', 4, 'TOTAL', '', ''])
  })

  it('escapes fields requiring RFC 4180 quotes correctly', () => {
    expect(service.escapeCsvField('normal')).toBe('normal')
    expect(service.escapeCsvField('with,comma')).toBe('"with,comma"')
    expect(service.escapeCsvField('with"quotes"')).toBe('"with""quotes"""')
    expect(service.escapeCsvField('line\nbreak')).toBe('"line\nbreak"')
  })

  it('rejects rows with invalid hours', async () => {
    prisma.hourLog.findMany.mockResolvedValue([
      {
        id: 2,
        date: new Date('2026-05-10'),
        startTime: '09:00',
        endTime: '13:00',
        hours: 15, // inválido según reglas
        activity: 'Exceso',
        status: 'SUBMITTED',
        reviewedById: null,
      },
    ])

    await expect(service.exportRows(10)).rejects.toThrow(BadRequestException)
  })

  it('rejects rows where start time is not before end time', async () => {
    prisma.hourLog.findMany.mockResolvedValue([
      {
        id: 3,
        date: new Date('2026-05-10'),
        startTime: '14:00',
        endTime: '13:00',
        hours: 4,
        activity: 'Horario invertido',
        status: 'SUBMITTED',
        reviewedById: null,
      },
    ])

    await expect(service.exportRows(10)).rejects.toThrow(BadRequestException)
  })
})
