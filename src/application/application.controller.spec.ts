import { ApplicationStatus, Role } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationController } from './application.controller'
import type { ApplicationService } from './application.service'

describe('ApplicationController', () => {
  let controller: ApplicationController
  let service: ApplicationService

  beforeEach(() => {
    service = {
      apply: vi.fn(),
      listByOffer: vi.fn(),
      listForStudent: vi.fn(),
      decide: vi.fn(),
      assertOfferAccess: vi.fn(),
    } as unknown as ApplicationService

    controller = new ApplicationController(service)
  })

  it('delegates apply to service with dto and user sub', () => {
    const dto = { offerId: 1, motivation: 'Quiero aprender' }
    controller.apply(dto, { user: { sub: 22 } })
    expect(service.apply).toHaveBeenCalledWith(1, 22, 'Quiero aprender')
  })

  it('delegates listByOffer to service with offerId, user sub, and role', () => {
    controller.listByOffer(5, { user: { sub: 42, role: Role.COMPANY } })
    expect(service.listByOffer).toHaveBeenCalledWith(5, 42, Role.COMPANY)
  })

  it('delegates listByOffer for coordinator role', () => {
    controller.listByOffer(5, { user: { sub: 99, role: Role.COORDINATOR } })
    expect(service.listByOffer).toHaveBeenCalledWith(5, 99, Role.COORDINATOR)
  })

  it('delegates findMine to service with user sub', () => {
    controller.findMine({ user: { sub: 22 } })
    expect(service.listForStudent).toHaveBeenCalledWith(22)
  })

  it('delegates decide to service with id, dto status, user sub and role', () => {
    const dto = { status: ApplicationStatus.ACCEPTED }
    controller.decide(10, dto, { user: { sub: 42, role: Role.COMPANY } })
    expect(service.decide).toHaveBeenCalledWith(10, ApplicationStatus.ACCEPTED, 42, Role.COMPANY)
  })
})
