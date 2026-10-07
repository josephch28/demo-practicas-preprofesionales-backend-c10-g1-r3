import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccreditationService } from './accreditation.service'

const prisma = {
  placement: { findMany: vi.fn() },
  hourLog: { aggregate: vi.fn() },
}

const basePlacement = {
  id: 1,
  status: 'ACTIVE',
  requiredHours: 240,
  student: { fullName: 'Estudiante 0' },
  documents: [
    { kind: 'AGREEMENT', status: 'VALIDATED' },
    { kind: 'INSURANCE', status: 'VALIDATED' },
  ],
  evaluations: [],
}

describe('AccreditationService.reportForPeriod', () => {
  let service: AccreditationService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new AccreditationService(prisma as never)
    prisma.hourLog.aggregate.mockResolvedValue({ _sum: { hours: 0 } })
  })

  // E3-06 criterio: "cada consulta que devuelve usuarios acota explícitamente
  // los campos". Esto falla si alguien vuelve a poner `student: true`.
  it('acota la consulta de placements a los campos no sensibles del estudiante', async () => {
    prisma.placement.findMany.mockResolvedValue([basePlacement])

    await service.reportForPeriod('2026-1')

    expect(prisma.placement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          student: { select: { fullName: true } },
        }),
      }),
    )
  })

  // E3-06 criterio: "ninguna respuesta incluye credenciales ni campos
  // internos". Simula una regresión en la capa de datos (la consulta real o
  // un mock en otro test vuelve a traer el usuario completo) y comprueba que
  // la respuesta igual no la deja pasar — una revisión manual no detectaría
  // esto en el siguiente PR, un test sobre la forma de la respuesta sí.
  it('nunca devuelve campos sensibles del estudiante, aunque la consulta los traiga', async () => {
    prisma.placement.findMany.mockResolvedValue([
      {
        ...basePlacement,
        student: {
          id: 22,
          fullName: 'Estudiante 0',
          email: 'estudiante0@miyura.com',
          // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- no es un secreto real, es un hash de ejemplo para el fixture del test
          password: '$2a$10$hashedpasswordvalue',
          createdAt: new Date('2026-01-01'),
        },
      },
    ])

    const [result] = await service.reportForPeriod('2026-1')

    expect(Object.keys(result).sort()).toEqual(
      ['placementId', 'studentName', 'level', 'reasons', 'completionPercentage'].sort(),
    )
    expect(result).not.toHaveProperty('password')
    expect(result).not.toHaveProperty('email')
    expect(result).not.toHaveProperty('createdAt')
  })
})