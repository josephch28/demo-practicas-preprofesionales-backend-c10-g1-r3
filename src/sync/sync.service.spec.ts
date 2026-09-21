import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncService } from './sync.service'

const prisma = {
  placement: { findMany: vi.fn(), findUnique: vi.fn() },
  hourLog: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  document: { findMany: vi.fn() },
  evaluation: { findMany: vi.fn() },
  syncOperation: { create: vi.fn(), findUnique: vi.fn() },
}

describe('SyncService', () => {
  let service: SyncService

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.placement.findMany.mockResolvedValue([])
    prisma.document.findMany.mockResolvedValue([])
    prisma.evaluation.findMany.mockResolvedValue([])
    service = new SyncService(prisma as never)
  })

  it('returns changes and a checkpoint from the newest row', async () => {
    prisma.hourLog.findMany.mockResolvedValue([
      { id: 9, updatedAt: new Date('2026-04-01T12:00:00.000Z'), placementId: 1 },
    ])

    const result = await service.pull(5, undefined, 200)

    expect(result.changes.hourLogs).toHaveLength(1)
    expect(result.checkpoint).toBeTypeOf('string')
    expect(result.hasMore).toBe(false)
  })

  it('applies a create operation and returns applied', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, studentId: 5 })
    prisma.hourLog.create.mockResolvedValue({ id: 77, version: 1 })

    const result = await service.push(5, [
      {
        clientOpId: '11111111-1111-4111-8111-111111111111',
        entity: 'hourLog',
        op: 'create',
        baseVersion: null,
        payload: { placementId: 1, date: '2026-04-02', startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' },
      },
    ])

    expect(result.results[0]).toMatchObject({ status: 'applied' })
    expect(prisma.syncOperation.create).toHaveBeenCalled()
  })
  it('rechaza la edición y devuelve el estado si la hora ya fue aprobada por el tutor', async () => {
    // 1. Simulamos que en el servidor ya está aprobada
    prisma.hourLog.findUnique.mockResolvedValue({
      id: 99,
      status: 'APPROVED',
      version: 1,
      placement: { studentId: 5 }
    })

    // 2. Enviamos una operación de update
    const result = await service.push(5, [
      {
        clientOpId: '22222222-2222-4222-8222-222222222222',
        entity: 'hourLog',
        op: 'update',
        baseVersion: 1,
        payload: { id: 99, activity: 'Intento de edición tardía' },
      },
    ])

    // 3. Validamos que fue rechazada, que devuelve el motivo y que no se llamó a update
    expect(result.results[0].status).toBe('rejected')
    expect(result.results[0].reason).toContain('aprobó')
    expect(result.results[0].server).toMatchObject({ status: 'APPROVED' })
    expect(prisma.hourLog.update).not.toHaveBeenCalled()
  })

  it('devuelve conflicto si ambos están en borrador/enviada pero la versión del servidor es mayor', async () => {
    prisma.hourLog.findUnique.mockResolvedValue({
      id: 99,
      status: 'SUBMITTED',
      version: 2, 
      placement: { studentId: 5 }
    })
    const result = await service.push(5, [
      {
        clientOpId: '33333333-3333-4333-8333-333333333333',
        entity: 'hourLog',
        op: 'update',
        baseVersion: 1, 
        payload: { id: 99, activity: 'Edición sobre versión obsoleta' },
      },
    ])
    expect(result.results[0].status).toBe('conflict')
    expect(result.results[0].reason).toContain('versión más reciente')
    expect(result.results[0].server).toMatchObject({ version: 2 })
    expect(prisma.hourLog.update).not.toHaveBeenCalled()
  })
})
