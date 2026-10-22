import { HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { ApplicationStatus, Role } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLES_KEY } from '../auth/decorators/roles.decorator'
import { ApplicationController } from './application.controller'
import type { ApplicationService } from './application.service'
import type { ApplicationRankingService } from './ranking/application-ranking.service'

describe('ApplicationController', () => {
  let controller: ApplicationController
  let service: ApplicationService
  let ranking: ApplicationRankingService

  beforeEach(() => {
    service = {
      apply: vi.fn(),
      listByOffer: vi.fn(),
      listForStudent: vi.fn(),
      decide: vi.fn(),
      assertOfferAccess: vi.fn(),
    } as unknown as ApplicationService

    ranking = { rank: vi.fn() } as unknown as ApplicationRankingService
    controller = new ApplicationController(service, ranking)
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

  describe('rank (IA-01)', () => {
    it('delega en el servicio con la oferta, el usuario y su rol', () => {
      controller.rank(5, { user: { sub: 42, role: Role.COMPANY } })
      expect(ranking.rank).toHaveBeenCalledWith(5, 42, Role.COMPANY)
    })

    it('solo permite a empresa y coordinador', () => {
      const roles = new Reflector().get<Role[]>(ROLES_KEY, ApplicationController.prototype.rank)
      expect(roles).toEqual([Role.COMPANY, Role.COORDINATOR])
    })

    it('se expone en POST offers/:offerId/applications/rank y responde 200', () => {
      expect(Reflect.getMetadata(PATH_METADATA, ApplicationController.prototype.rank)).toBe('offers/:offerId/applications/rank')
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, ApplicationController.prototype.rank)).toBe(200)
    })
  })
})
