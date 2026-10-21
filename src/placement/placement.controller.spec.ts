import { Reflector } from '@nestjs/core'
import { Role } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { ROLES_KEY } from '../auth/decorators/roles.decorator'
import type { AccreditationService } from './accreditation.service'
import { PlacementController } from './placement.controller'
import type { PlacementService } from './placement.service'

describe('PlacementController — informe de inconsistencias (E5-03)', () => {
  const accreditationService = { inconsistenciesForPeriod: vi.fn() } as unknown as AccreditationService
  const controller = new PlacementController({} as PlacementService, accreditationService)

  it('delega en el servicio con el periodo pedido', () => {
    controller.inconsistencies({ period: '2026-1' })

    expect(accreditationService.inconsistenciesForPeriod).toHaveBeenCalledWith('2026-1')
  })

  // Datos de auditoria: solo la coordinacion. Si alguien quita o cambia el
  // @Roles, este test falla antes de que otro rol pueda leerlos.
  it('solo permite al rol COORDINATOR', () => {
    const roles = new Reflector().get<Role[]>(ROLES_KEY, PlacementController.prototype.inconsistencies)

    expect(roles).toEqual([Role.COORDINATOR])
  })
})
