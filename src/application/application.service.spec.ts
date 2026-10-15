import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationService } from './application.service'

const prisma = {
  application: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  offer: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
}
const offers = { acceptedCount: vi.fn() }

describe('ApplicationService', () => {
  let service: ApplicationService

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma))
    prisma.$queryRaw.mockResolvedValue([])
    service = new ApplicationService(prisma as never, offers as never)
  })

  it('accepts an application when there are seats left', async () => {
    prisma.application.findUnique.mockResolvedValue({ id: 7, offerId: 1, status: 'SUBMITTED' })
    prisma.offer.findUnique.mockResolvedValue({ id: 1, seats: 3, status: 'PUBLISHED', companyId: 99 })
    prisma.user.findUnique.mockResolvedValueOnce({ id: 42, companyId: 99 })
    offers.acceptedCount.mockResolvedValue(2)
    prisma.application.update.mockImplementation(({ data }) => Promise.resolve({ id: 7, ...data }))

    const result = await service.decide(7, 'ACCEPTED' as never, 42, 'COMPANY' as never)

    expect(result.status).toBe('ACCEPTED')
    expect(result.decidedAt).toBeInstanceOf(Date)
  })

  it('rejects accepting when the offer is already full', async () => {
    prisma.application.findUnique.mockResolvedValue({ id: 7, offerId: 1, status: 'SUBMITTED' })
    prisma.offer.findUnique.mockResolvedValue({ id: 1, seats: 3, status: 'PUBLISHED', companyId: 99 })
    prisma.user.findUnique.mockResolvedValueOnce({ id: 42, companyId: 99 })
    offers.acceptedCount.mockResolvedValue(3)

    await expect(service.decide(7, 'ACCEPTED' as never, 42, 'COMPANY' as never)).rejects.toThrow(BadRequestException)
  })

  it('throws ForbiddenException when a company decides on an offer from another company', async () => {
    prisma.application.findUnique.mockResolvedValue({ id: 7, offerId: 1, status: 'SUBMITTED' })
    prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 99 })
    prisma.user.findUnique.mockResolvedValueOnce({ id: 42, companyId: 100 }) // different companyId

    await expect(service.decide(7, 'ACCEPTED' as never, 42, 'COMPANY' as never)).rejects.toThrow(ForbiddenException)
  })

  it('allows a coordinator to decide regardless of company', async () => {
    prisma.application.findUnique.mockResolvedValue({ id: 7, offerId: 1, status: 'SUBMITTED' })
    prisma.offer.findUnique.mockResolvedValue({ id: 1, seats: 3, status: 'PUBLISHED', companyId: 99 })
    offers.acceptedCount.mockResolvedValue(2)
    prisma.application.update.mockImplementation(({ data }) => Promise.resolve({ id: 7, ...data }))

    const result = await service.decide(7, 'ACCEPTED' as never, 42, 'COORDINATOR' as never)

    expect(result.status).toBe('ACCEPTED')
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('garantiza que nunca se acepten más postulaciones que cupos ante dos aceptaciones simultáneas', async () => {
    prisma.offer.findUnique.mockResolvedValue({ id: 1, seats: 1, status: 'PUBLISHED' })

    prisma.application.findUnique.mockImplementation(async ({ where: { id } }) => {
      return { id, offerId: 1, status: 'SUBMITTED' }
    })

    let dbAcceptedCount = 0

    // Simula la serialización transaccional/bloqueo de fila que garantiza la base de datos
    let transactionQueue = Promise.resolve()
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => {
      const run = async () => callback(prisma)
      const result = transactionQueue.then(run, run)
      transactionQueue = result.then(
        () => {},
        () => {},
      )
      return result
    })

    offers.acceptedCount.mockImplementation(async () => {
      const currentCount = dbAcceptedCount
      await new Promise((resolve) => setTimeout(resolve, 20))
      return currentCount
    })

    prisma.application.update.mockImplementation(async ({ where: { id }, data }) => {
      dbAcceptedCount++
      return { id, ...data }
    })

    const results = await Promise.allSettled([
      service.decide(1, 'ACCEPTED' as never, 1, 'COORDINATOR' as never),
      service.decide(2, 'ACCEPTED' as never, 1, 'COORDINATOR' as never),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    if (fulfilled[0]?.status === 'fulfilled') {
      expect(fulfilled[0].value.status).toBe('ACCEPTED')
    }
    if (rejected[0]?.status === 'rejected') {
      expect(rejected[0].reason).toBeInstanceOf(BadRequestException)
      expect(rejected[0].reason.message).toBe('la oferta ya no tiene cupos')
    }

    expect(dbAcceptedCount).toBe(1)
  })

  it('lists applications of an offer with their student', async () => {
    prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 99 })
    prisma.application.findMany.mockResolvedValue([
      { id: 1, studentId: 10, status: 'SUBMITTED' },
      { id: 2, studentId: 11, status: 'SUBMITTED' },
    ])
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 42, companyId: 99 }) // For assertOfferAccess
      .mockResolvedValueOnce({ id: 10, fullName: 'Estudiante 10' })
      .mockResolvedValueOnce({ id: 11, fullName: 'Estudiante 11' })

    const result = await service.listByOffer(1, 42, 'COMPANY' as never)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 1, student: { fullName: 'Estudiante 10' } })
  })
})
