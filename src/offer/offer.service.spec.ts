import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OfferService } from './offer.service'

const prisma = {
  offer: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  application: { count: vi.fn() },
  user: { findUnique: vi.fn() },
}

describe('OfferService', () => {
  let service: OfferService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new OfferService(prisma as never)
  })

  describe('create (H-05)', () => {
    const mockDto = {
      companyId: 2,
      title: 'Oferta Frontend',
      description: 'Pasantía Frontend',
      modality: 'REMOTO',
      seats: 2,
      requiredHours: 240,
      periodStart: new Date('2027-01-01'),
      periodEnd: new Date('2027-06-30'),
    }

    it('rejects creating an offer with a different companyId for COMPANY role (H-05)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 10, companyId: 1 })

      await expect(service.create(mockDto, 10, Role.COMPANY)).rejects.toThrow(ForbiddenException)
      expect(prisma.offer.create).not.toHaveBeenCalled()
    })

    it('rejects creating an offer if the company user has no associated company', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 10, companyId: null })

      await expect(service.create(mockDto, 10, Role.COMPANY)).rejects.toThrow(ForbiddenException)
      expect(prisma.offer.create).not.toHaveBeenCalled()
    })

    it('creates an offer for own company when authenticated as COMPANY', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 10, companyId: 2 })
      prisma.offer.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))

      const result = await service.create(mockDto, 10, Role.COMPANY)

      expect(result.id).toBe(1)
      expect(result.status).toBe('DRAFT')
      expect(result.companyId).toBe(2)
      expect(prisma.offer.create).toHaveBeenCalledWith({
        data: { ...mockDto, status: 'DRAFT' },
      })
    })

    it('allows COORDINATOR to create an offer for any company', async () => {
      prisma.offer.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))

      const result = await service.create(mockDto, 999, Role.COORDINATOR)

      expect(result.id).toBe(1)
      expect(result.companyId).toBe(2)
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })
  })

  describe('publish (H-06)', () => {
    it('rejects publishing an offer that belongs to another company (H-06)', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 37, companyId: 2, status: 'DRAFT' })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 10, companyId: 1 })

      await expect(service.publish(37, 10, Role.COMPANY)).rejects.toThrow(ForbiddenException)
      expect(prisma.offer.update).not.toHaveBeenCalled()
    })

    it('publishes a DRAFT offer for the owning company', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 1, status: 'DRAFT' })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 10, companyId: 1 })
      prisma.offer.update.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))

      const result = await service.publish(1, 10, Role.COMPANY)

      expect(result.status).toBe('PUBLISHED')
      expect(result.publishedAt).toBeInstanceOf(Date)
    })

    it('allows COORDINATOR to publish an offer regardless of company', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 37, companyId: 2, status: 'DRAFT' })
      prisma.offer.update.mockImplementation(({ data }) => Promise.resolve({ id: 37, ...data }))

      const result = await service.publish(37, 999, Role.COORDINATOR)

      expect(result.status).toBe('PUBLISHED')
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('rejects publishing a non-existent offer', async () => {
      prisma.offer.findUnique.mockResolvedValue(null)

      await expect(service.publish(999, 10, Role.COMPANY)).rejects.toThrow(NotFoundException)
    })

    it('rejects publishing an offer that is not DRAFT', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 1, status: 'CLOSED' })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 10, companyId: 1 })

      await expect(service.publish(1, 10, Role.COMPANY)).rejects.toThrow(BadRequestException)
    })
  })

  describe('close (H-07)', () => {
    it('rejects closing an offer that belongs to another company (H-07)', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 4, companyId: 2, status: 'PUBLISHED' })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 10, companyId: 1 })

      await expect(service.close(4, 10, Role.COMPANY)).rejects.toThrow(ForbiddenException)
      expect(prisma.offer.update).not.toHaveBeenCalled()
    })

    it('closes a PUBLISHED offer for the owning company', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 4, companyId: 1, status: 'PUBLISHED' })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 10, companyId: 1 })
      prisma.offer.update.mockImplementation(({ data }) => Promise.resolve({ id: 4, ...data }))

      const result = await service.close(4, 10, Role.COMPANY)

      expect(result.status).toBe('CLOSED')
    })

    it('allows COORDINATOR to close an offer regardless of company', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 4, companyId: 2, status: 'PUBLISHED' })
      prisma.offer.update.mockImplementation(({ data }) => Promise.resolve({ id: 4, ...data }))

      const result = await service.close(4, 999, Role.COORDINATOR)

      expect(result.status).toBe('CLOSED')
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('rejects closing a non-existent offer', async () => {
      prisma.offer.findUnique.mockResolvedValue(null)

      await expect(service.close(999, 10, Role.COMPANY)).rejects.toThrow(NotFoundException)
    })

    it('rejects closing an offer that is not PUBLISHED', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 4, companyId: 1, status: 'DRAFT' })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 10, companyId: 1 })

      await expect(service.close(4, 10, Role.COMPANY)).rejects.toThrow(BadRequestException)
    })
  })

  describe('other operations', () => {
    it('lists all PUBLISHED offers in findAll', async () => {
      const mockOffers = [{ id: 1, status: 'PUBLISHED' }]
      prisma.offer.findMany.mockResolvedValue(mockOffers)

      const result = await service.findAll()

      expect(prisma.offer.findMany).toHaveBeenCalledWith({
        where: { status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        include: { company: true },
      })
      expect(result).toEqual(mockOffers)
    })

    it('finds one offer by id', async () => {
      const mockOffer = { id: 1, title: 'Oferta 1', status: 'PUBLISHED' }
      prisma.offer.findUnique.mockResolvedValue(mockOffer)

      const result = await service.findOne(1)

      expect(prisma.offer.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { company: true },
      })
      expect(result).toEqual(mockOffer)
    })

    it('throws NotFoundException when findOne cannot find the offer', async () => {
      prisma.offer.findUnique.mockResolvedValue(null)

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException)
    })

    it('counts accepted applications for an offer', async () => {
      prisma.application.count.mockResolvedValue(3)

      await expect(service.acceptedCount(1)).resolves.toBe(3)
      expect(prisma.application.count).toHaveBeenCalledWith({
        where: { offerId: 1, status: 'ACCEPTED' },
      })
    })

    it('lists all offers of the company tied to the authenticated user, any status', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId: 7 })
      prisma.offer.findMany.mockResolvedValue([{ id: 1, companyId: 7, status: 'DRAFT' }])

      const result = await service.findAllForCompanyUser(42)

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 42 }, select: { companyId: true } })
      expect(prisma.offer.findMany).toHaveBeenCalledWith({
        where: { companyId: 7 },
        orderBy: { createdAt: 'desc' },
        include: { company: true, applications: { select: { status: true } } },
      })
      expect(result).toEqual([{ id: 1, companyId: 7, status: 'DRAFT' }])
    })

    it('rejects listing offers for a user with no company', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId: null })

      await expect(service.findAllForCompanyUser(42)).rejects.toThrow('el usuario no tiene una empresa asociada')
    })
  })

  describe('findOne (H-04)', () => {
    it('returns a PUBLISHED offer to a student with normal visibility', async () => {
      const offer = { id: 1, title: 'Oferta Publicada', status: 'PUBLISHED', companyId: 10 }
      prisma.offer.findUnique.mockResolvedValue(offer)

      const result = await service.findOne(1, 22, Role.STUDENT)

      expect(result).toEqual(offer)
      expect(prisma.offer.findUnique).toHaveBeenCalledWith({ where: { id: 1 }, include: { company: true } })
    })

    it('rejects with NotFoundException when a student requests an offer in DRAFT (H-04)', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 37, title: 'Oferta Borrador', status: 'DRAFT', companyId: 10 })

      await expect(service.findOne(37, 22, Role.STUDENT)).rejects.toThrow(NotFoundException)
    })

    it('allows coordinator to read an offer in DRAFT', async () => {
      const draftOffer = { id: 37, title: 'Oferta Borrador', status: 'DRAFT', companyId: 10 }
      prisma.offer.findUnique.mockResolvedValue(draftOffer)

      const result = await service.findOne(37, 1, Role.COORDINATOR)

      expect(result).toEqual(draftOffer)
    })

    it('allows the owner company to read its own offer in DRAFT', async () => {
      const draftOffer = { id: 37, title: 'Oferta Borrador', status: 'DRAFT', companyId: 10 }
      prisma.offer.findUnique.mockResolvedValue(draftOffer)
      prisma.user.findUnique.mockResolvedValueOnce({ id: 5, companyId: 10 })

      const result = await service.findOne(37, 5, Role.COMPANY)

      expect(result).toEqual(draftOffer)
    })

    it('rejects with NotFoundException when another company requests an offer in DRAFT', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 37, title: 'Oferta Borrador', status: 'DRAFT', companyId: 10 })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 6, companyId: 99 })

      await expect(service.findOne(37, 6, Role.COMPANY)).rejects.toThrow(NotFoundException)
    })

    it('throws NotFoundException if the offer does not exist', async () => {
      prisma.offer.findUnique.mockResolvedValue(null)

      await expect(service.findOne(999, 1, Role.COORDINATOR)).rejects.toThrow(NotFoundException)
    })
  })
})
