import { Role } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { OfferService } from '../offer/offer.service'
import type { PrismaService } from '../prisma/prisma.service'
import { ApplicationService } from './application.service'

describe('ApplicationService - Prevención de N+1 (D-04)', () => {
  it('el número de llamadas a Prisma no crece con el número de postulaciones devueltas', async () => {
    let applicationFindManyCalls = 0
    let userFindUniqueCalls = 0

    const makePrismaMock = (applicationCount: number) => ({
      offer: {
        findUnique: vi.fn().mockResolvedValue({ id: 1, companyId: 10 }),
      },
      user: {
        findUnique: vi.fn().mockImplementation(() => {
          userFindUniqueCalls++
          return Promise.resolve({ id: 1, companyId: 10 })
        }),
      },
      application: {
        findMany: vi.fn().mockImplementation(() => {
          applicationFindManyCalls++
          return Promise.resolve(
            Array.from({ length: applicationCount }, (_, i) => ({
              id: i + 1,
              offerId: 1,
              studentId: i + 100,
              status: 'SUBMITTED',
              motivation: `Motivación ${i + 1}`,
              submittedAt: new Date(),
              decidedAt: null,
              student: {
                id: i + 100,
                email: `estudiante${i}@miyura.com`,
                fullName: `Estudiante ${i}`,
              },
            })),
          )
        }),
      },
    })

    const offerService = {} as unknown as OfferService

    // Prueba 1: Con 5 postulaciones
    applicationFindManyCalls = 0
    userFindUniqueCalls = 0
    const prismaSmall = makePrismaMock(5)
    const serviceSmall = new ApplicationService(prismaSmall as unknown as PrismaService, offerService)
    const resSmall = await serviceSmall.listByOffer(1, 1, Role.COMPANY)

    expect(resSmall).toHaveLength(5)
    expect(applicationFindManyCalls).toBe(1)
    expect(userFindUniqueCalls).toBe(1) // Solo para assertOfferAccess

    // Prueba 2: Con 200 postulaciones
    applicationFindManyCalls = 0
    userFindUniqueCalls = 0
    const prismaLarge = makePrismaMock(200)
    const serviceLarge = new ApplicationService(prismaLarge as unknown as PrismaService, offerService)
    const resLarge = await serviceLarge.listByOffer(1, 1, Role.COMPANY)

    expect(resLarge).toHaveLength(200)
    expect(applicationFindManyCalls).toBe(1)
    expect(userFindUniqueCalls).toBe(1) // Sigue siendo 1: O(1) total de consultas

    // Garantizar que la cantidad de consultas es idéntica en ambos casos
    expect(applicationFindManyCalls).toBe(1)
    expect(userFindUniqueCalls).toBe(1)
  })
})
