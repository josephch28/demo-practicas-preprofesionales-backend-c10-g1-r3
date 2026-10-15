import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HourLogService } from './hour-log.service'

const prisma = {
  hourLog: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
  placement: { findUnique: vi.fn() },
}

describe('HourLogService', () => {
  let service: HourLogService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new HourLogService(prisma as never)
  })

  it('creates an hour log in SUBMITTED for an active placement', async () => {
    prisma.placement.findUnique.mockResolvedValue({
      id: 1,
      studentId: 5,
      tutorId: 7,
      status: 'ACTIVE',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    })
    prisma.hourLog.create.mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }))

    const result = await service.create(
      { placementId: 1, date: new Date('2026-04-01'), startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Desarrollo de módulo de reportes' },
      5,
    )

    expect(result.status).toBe('SUBMITTED')
    expect(result.hours).toBe(4)
  })

  // E6-05 criterio: "una fecha fuera del rango de la práctica se rechaza con un mensaje que dice cuál es el rango válido".
  it('rejects an hour log dated before the placement started', async () => {
    prisma.placement.findUnique.mockResolvedValue({
      id: 1,
      studentId: 5,
      tutorId: 7,
      status: 'ACTIVE',
      startDate: new Date('2026-09-16'),
      endDate: new Date('2026-12-16'),
    })
    await expect(
      service.create(
        { placementId: 1, date: new Date('2026-08-01'), startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Antes de empezar' },
        5,
      ),
    ).rejects.toThrow('la fecha debe estar entre 2026-09-16 y 2026-12-16')
  })

  // E6-05 criterio: "no se pueden registrar horas con fecha futura".
  it('rejects an hour log dated in the future', async () => {
    const farFuture = new Date()
    farFuture.setFullYear(farFuture.getFullYear() + 1)
    prisma.placement.findUnique.mockResolvedValue({
      id: 1,
      studentId: 5,
      tutorId: 7,
      status: 'ACTIVE',
      startDate: new Date('2020-01-01'),
      endDate: farFuture,
    })
    await expect(
      service.create(
        { placementId: 1, date: farFuture, startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Del futuro' },
        5,
      ),
    ).rejects.toThrow('no se pueden registrar horas con fecha futura')
  })

  // E6-05 criterio: "existen tests con dispositivos en zonas horarias distintas que producen el mismo resultado" — a nivel del servicio completo, no solo de la función pura de timezone.ts.
  it('guarda el mismo día para el mismo instante real sin importar el offset del dispositivo', async () => {
    prisma.placement.findUnique.mockResolvedValue({
      id: 1,
      studentId: 5,
      tutorId: 7,
      status: 'ACTIVE',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    })
    prisma.hourLog.create.mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }))
    const base = { placementId: 1, startTime: '20:00', endTime: '22:00', hours: 2, activity: 'Jornada nocturna' }
    const fromEcuador = await service.create({ ...base, date: new Date('2026-10-14T20:00:00-05:00') }, 5)
    const fromJapan = await service.create({ ...base, date: new Date('2026-10-15T10:00:00+09:00') }, 5)
    expect(fromEcuador.date.toISOString().slice(0, 10)).toBe('2026-10-14')
    expect(fromJapan.date.toISOString().slice(0, 10)).toBe('2026-10-14')
  })

  it('rejects an hour log with more hours than the service allows', async () => {
    prisma.placement.findUnique.mockResolvedValue({
      id: 1,
      studentId: 5,
      tutorId: 7,
      status: 'ACTIVE',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    })

    await expect(
      service.create(
        { placementId: 1, date: new Date('2026-04-01'), startTime: '08:00', endTime: '20:00', hours: 11, activity: 'Jornada larga de soporte' },
        5,
      ),
    ).rejects.toThrow(BadRequestException)
  })

  it('approves a submitted hour log when the reviewer is the assigned tutor', async () => {
    prisma.hourLog.findUnique.mockResolvedValue({
      id: 99,
      placementId: 1,
      status: 'SUBMITTED',
      version: 1,
      placement: { id: 1, tutorId: 7 },
    })
    prisma.hourLog.update.mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }))

    const result = await service.review(99, 'APPROVED' as never, 7, 'ok')

    expect(result.status).toBe('APPROVED')
    expect(result.reviewedById).toBe(7)
  })

  // E3-02 / H-03: un tutor que no es el asignado a la práctica no puede
  // aprobar ni rechazar sus horas.
  it('rejects review from a tutor who is not assigned to the placement', async () => {
    prisma.hourLog.findUnique.mockResolvedValue({
      id: 99,
      placementId: 1,
      status: 'SUBMITTED',
      version: 1,
      placement: { id: 1, tutorId: 7 },
    })

    await expect(service.review(99, 'APPROVED' as never, 999, 'ok')).rejects.toThrow(ForbiddenException)
    expect(prisma.hourLog.update).not.toHaveBeenCalled()
  })
})