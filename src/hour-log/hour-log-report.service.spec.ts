import { NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HourLogReportService } from './hour-log-report.service'

const prisma = {
  hourLog: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  placement: { findUnique: vi.fn() },
}

describe('HourLogReportService', () => {
  let service: HourLogReportService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new HourLogReportService(prisma as never)
  })

  it('calculates approved hours sum for a placement', async () => {
    prisma.hourLog.aggregate.mockResolvedValue({ _sum: { hours: 24 } })

    const total = await service.approvedHours(5)

    expect(total).toBe(24)
    expect(prisma.hourLog.aggregate).toHaveBeenCalledWith({
      where: { placementId: 5, status: 'APPROVED', deletedAt: null },
      _sum: { hours: true },
    })
  })

  it('returns 0 when there are no approved hours', async () => {
    prisma.hourLog.aggregate.mockResolvedValue({ _sum: { hours: null } })

    const total = await service.approvedHours(5)

    expect(total).toBe(0)
  })

  it('generates a progress report with percentage', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 5, requiredHours: 100 })
    prisma.hourLog.aggregate.mockResolvedValue({ _sum: { hours: 40 } })
    prisma.hourLog.count.mockResolvedValue(2)

    const report = await service.progressReport(5)

    expect(report).toEqual({
      placementId: 5,
      requiredHours: 100,
      approvedHours: 40,
      pendingLogs: 2,
      percentage: 40,
    })
  })

  it('throws NotFoundException in progressReport when placement is missing', async () => {
    prisma.placement.findUnique.mockResolvedValue(null)

    await expect(service.progressReport(999)).rejects.toThrow(NotFoundException)
  })

  it('generates a weekly summary correctly grouped and sorted', async () => {
    prisma.placement.findUnique.mockResolvedValue({
      id: 5,
      requiredHours: 80,
      startDate: new Date(2026, 4, 1),
      endDate: new Date(2026, 4, 31),
    })

    prisma.hourLog.findMany.mockResolvedValue([
      {
        id: 1,
        date: new Date(2026, 4, 4),
        hours: 6,
        status: 'APPROVED',
      },
      {
        id: 2,
        date: new Date(2026, 4, 5),
        hours: 4,
        status: 'SUBMITTED',
      },
      {
        id: 3,
        date: new Date(2026, 4, 11),
        hours: 8,
        status: 'APPROVED',
      },
    ])

    const summary = await service.weeklySummary(5)

    expect(summary).toHaveLength(2)
    expect(summary[0].week).toBe('2026-W19')
    expect(summary[0].approvedHours).toBe(6)
    expect(summary[0].submittedHours).toBe(4)
    expect(summary[0].logsCount).toBe(2)

    expect(summary[1].week).toBe('2026-W20')
    expect(summary[1].approvedHours).toBe(8)
  })

  it('formats ISO week labels accurately', () => {
    const label1 = service.isoWeekLabel(new Date(2026, 0, 1))
    expect(label1).toMatch(/^2026-W\d{2}$/)

    const label2 = service.isoWeekLabel(new Date(2026, 4, 4))
    expect(label2).toBe('2026-W19')
  })
})
