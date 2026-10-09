import { Role } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OfferController } from './offer.controller'
import type { OfferService } from './offer.service'

describe('OfferController', () => {
  let controller: OfferController
  let service: OfferService

  beforeEach(() => {
    service = {
      findAll: vi.fn(),
      findAllForCompanyUser: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      publish: vi.fn(),
      close: vi.fn(),
      acceptedCount: vi.fn(),
    } as unknown as OfferService

    controller = new OfferController(service)
  })

  it('delegates findAll to service', () => {
    controller.findAll()
    expect(service.findAll).toHaveBeenCalled()
  })

  it('delegates findMine to service with user sub', () => {
    controller.findMine({ user: { sub: 10 } })
    expect(service.findAllForCompanyUser).toHaveBeenCalledWith(10)
  })

  it('delegates findOne to service with id, user sub and role', () => {
    controller.findOne(1, { user: { sub: 22, role: Role.STUDENT } })
    expect(service.findOne).toHaveBeenCalledWith(1, 22, Role.STUDENT)
  })

  it('delegates create to service with dto and auth user', () => {
    const dto = { companyId: 2 } as never
    controller.create(dto, { user: { sub: 10, role: Role.COMPANY } })
    expect(service.create).toHaveBeenCalledWith(dto, 10, Role.COMPANY)
  })

  it('delegates publish to service with id and auth user', () => {
    controller.publish(1, { user: { sub: 10, role: Role.COMPANY } })
    expect(service.publish).toHaveBeenCalledWith(1, 10, Role.COMPANY)
  })

  it('delegates close to service with id and auth user', () => {
    controller.close(1, { user: { sub: 10, role: Role.COMPANY } })
    expect(service.close).toHaveBeenCalledWith(1, 10, Role.COMPANY)
  })
})
