import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EvaluationService } from './evaluation.service'

// D-03: el módulo de evaluaciones no tenía tests. Este archivo no intenta
// cerrar esa deuda entera (ver KNOWN_ISSUES.md) — solo cubre el cambio de
// E3-06: acotar la consulta del evaluador de COMPANY a `companyId`.
const prisma = {
  placement: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  evaluation: { create: vi.fn() },
}

describe('EvaluationService.submit · evaluación de tipo COMPANY', () => {
  let service: EvaluationService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new EvaluationService(prisma as never)
  })

  const dto = {
    placementId: 1,
    kind: 'COMPANY' as never,
    period: '2026-1',
    scores: { technical: 5, communication: 5, punctuality: 5 },
  }

  // E3-06 criterio: "cada consulta que devuelve usuarios acota
  // explícitamente los campos". Antes se traía el usuario completo
  // (incluida la contraseña) solo para leer `companyId`.
  it('acota la consulta del evaluador a companyId', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, companyId: 1, tutorId: 7, studentId: 5 })
    prisma.user.findUnique.mockResolvedValue({ companyId: 1 })
    prisma.evaluation.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))

    await service.submit(dto, 10, 'COMPANY' as never)

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 10 },
      select: { companyId: true },
    })
  })
})