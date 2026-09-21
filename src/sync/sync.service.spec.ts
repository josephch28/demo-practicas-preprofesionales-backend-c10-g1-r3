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
    prisma.syncOperation.findUnique.mockResolvedValue(null)

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

  it('does not apply the operation if clientOpId already exists in sync_operations', async () => {
    prisma.syncOperation.findUnique.mockResolvedValue({
      clientOpId: 'already-processed',
      userId: 5,
      response: { status: 'applied', clientOpId: 'already-processed', server: { id: 99 }, reason: null },
    })

    const result = await service.push(5, [
      {
        clientOpId: 'already-processed',
        entity: 'hourLog',
        op: 'create',
        baseVersion: null,
        payload: { placementId: 1, date: '2026-04-02', startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' },
      },
    ])

    expect(result.results[0]).toMatchObject({ status: 'applied', server: { id: 99 } })
    // Verify business logic (applyOperation) was skipped
    expect(prisma.hourLog.create).not.toHaveBeenCalled()
    // Verify it didn't try to save to sync_operations again
    expect(prisma.syncOperation.create).not.toHaveBeenCalled()
  })

  it('handles concurrent submissions of the same operation cleanly', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, studentId: 5 })
    prisma.hourLog.create.mockResolvedValue({ id: 88, version: 1 })
    prisma.syncOperation.findUnique.mockResolvedValue(null) // Initially not found
    
    // Simulate delay in DB to ensure promises overlap
    prisma.syncOperation.create.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return {}
    })

    const op = {
      clientOpId: 'concurrent-123',
      entity: 'hourLog' as const,
      op: 'create' as const,
      baseVersion: null,
      payload: { placementId: 1, date: '2026-04-02', startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' },
    }

    // Two parallel push calls for the exact same op
    const [res1, res2] = await Promise.all([
      service.push(5, [op]),
      service.push(5, [op])
    ])

    expect(res1.results[0]).toMatchObject({ status: 'applied' })
    expect(res2.results[0]).toMatchObject({ status: 'applied' })

    // Business logic should only run ONCE
    expect(prisma.hourLog.create).toHaveBeenCalledTimes(1)
    
    // It should only try to insert to syncOperation ONCE
    expect(prisma.syncOperation.create).toHaveBeenCalledTimes(1)
  })
})
