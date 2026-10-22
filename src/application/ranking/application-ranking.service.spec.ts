import { ForbiddenException, Logger, ServiceUnavailableException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationRankingService, MAX_MOTIVATION_LENGTH, MAX_RANKED_APPLICATIONS } from './application-ranking.service'

const prisma = { offer: { findUnique: vi.fn() }, application: { findMany: vi.fn() } }
const applications = { assertOfferAccess: vi.fn() }
const provider = { rank: vi.fn() }

// findMany devuelve primero la postulación más reciente (orden submittedAt desc).
const rows = (...items: [number, string][]) => items.map(([id, motivation]) => ({ id, motivation }))

describe('ApplicationRankingService (IA-01)', () => {
  let service: ApplicationRankingService
  let warn: ReturnType<typeof vi.spyOn>
  let log: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    applications.assertOfferAccess.mockResolvedValue(undefined)
    prisma.offer.findUnique.mockResolvedValue({ id: 7, title: 'Soporte TI', description: 'Atención', modality: 'Presencial', companyId: 1 })
    service = new ApplicationRankingService(prisma as never, applications as never, provider as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('devuelve el orden con el id real de cada postulación y deja la más antigua primero al desempatar', async () => {
    prisma.application.findMany.mockResolvedValue(rows([32, 'tercera'], [31, 'segunda'], [30, 'primera']))
    provider.rank.mockResolvedValue([
      { id: 'c1', score: 70, reason: 'a' },
      { id: 'c2', score: 70, reason: 'b' },
      { id: 'c3', score: 95, reason: 'c' },
    ])

    const result = await service.rank(7, 42, Role.COMPANY)

    expect(result).toEqual({
      offerId: 7,
      ranking: [
        { applicationId: 32, score: 95, reason: 'c' },
        { applicationId: 30, score: 70, reason: 'a' },
        { applicationId: 31, score: 70, reason: 'b' },
      ],
      unranked: [],
      truncated: false,
    })
  })

  it('al modelo solo le llegan la oferta y las motivaciones con alias, sin ids ni datos del estudiante', async () => {
    prisma.application.findMany.mockResolvedValue(rows([31, 'segunda'], [30, 'primera']))
    provider.rank.mockResolvedValue([])

    await service.rank(7, 42, Role.COMPANY)

    expect(provider.rank).toHaveBeenCalledWith({
      offer: { title: 'Soporte TI', description: 'Atención', modality: 'Presencial' },
      candidates: [
        { alias: 'c1', motivation: 'primera' },
        { alias: 'c2', motivation: 'segunda' },
      ],
    })
    expect(prisma.application.findMany.mock.calls[0][0].select).toEqual({ id: true, motivation: true })
  })

  it('solo evalúa las postulaciones sin decidir', async () => {
    prisma.application.findMany.mockResolvedValue([])

    await service.rank(7, 42, Role.COMPANY)

    expect(prisma.application.findMany.mock.calls[0][0].where).toEqual({
      offerId: 7,
      status: { in: ['SUBMITTED', 'INTERVIEW'] },
    })
  })

  it('sin postulaciones pendientes no llama al modelo', async () => {
    prisma.application.findMany.mockResolvedValue([])

    expect(await service.rank(7, 42, Role.COMPANY)).toEqual({ offerId: 7, ranking: [], unranked: [], truncated: false })
    expect(provider.rank).not.toHaveBeenCalled()
  })

  it('pasa a unranked lo que el modelo no devuelve o devuelve inválido', async () => {
    prisma.application.findMany.mockResolvedValue(rows([31, 'b'], [30, 'a']))
    provider.rank.mockResolvedValue([{ id: 'c1', score: 80, reason: 'ok' }, { id: 'c2', score: 'x' }])

    const result = await service.rank(7, 42, Role.COMPANY)

    expect(result.ranking.map((item) => item.applicationId)).toEqual([30])
    expect(result.unranked).toEqual([31])
  })

  it('evalúa como máximo 50 postulaciones, recorta las motivaciones y avisa con truncated', async () => {
    const many = Array.from({ length: MAX_RANKED_APPLICATIONS + 1 }, (_, i): [number, string] => [i + 1, 'x'.repeat(MAX_MOTIVATION_LENGTH + 500)])
    prisma.application.findMany.mockResolvedValue(rows(...many))
    provider.rank.mockResolvedValue([])

    const result = await service.rank(7, 42, Role.COMPANY)

    expect(prisma.application.findMany.mock.calls[0][0].take).toBe(MAX_RANKED_APPLICATIONS + 1)
    const sent = provider.rank.mock.calls[0][0].candidates
    expect(sent).toHaveLength(MAX_RANKED_APPLICATIONS)
    expect(sent[0].motivation).toHaveLength(MAX_MOTIVATION_LENGTH)
    expect(result.truncated).toBe(true)
  })

  it('no consulta nada si la empresa no tiene acceso a la oferta', async () => {
    applications.assertOfferAccess.mockRejectedValue(new ForbiddenException('sin acceso'))

    await expect(service.rank(7, 99, Role.COMPANY)).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.application.findMany).not.toHaveBeenCalled()
    expect(provider.rank).not.toHaveBeenCalled()
  })

  it('responde 404 si la oferta no existe (también para el coordinador)', async () => {
    prisma.offer.findUnique.mockResolvedValue(null)

    await expect(service.rank(7, 1, Role.COORDINATOR)).rejects.toMatchObject({ status: 404 })
  })

  it('respeta el 503 del proveedor sin configurar', async () => {
    prisma.application.findMany.mockResolvedValue(rows([30, 'a']))
    provider.rank.mockRejectedValue(new ServiceUnavailableException('no configurada'))

    await expect(service.rank(7, 42, Role.COMPANY)).rejects.toMatchObject({ status: 503 })
  })

  it('convierte un fallo del proveedor en 502 genérico y no registra su mensaje ni las motivaciones', async () => {
    prisma.application.findMany.mockResolvedValue(rows([30, 'motivación privada']))
    provider.rank.mockRejectedValue(new Error('detalle interno motivación privada'))

    await expect(service.rank(7, 42, Role.COMPANY)).rejects.toMatchObject({
      status: 502,
      message: 'no se pudo generar la sugerencia de postulantes',
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('motivación privada')
  })

  it('en el log solo deja metadatos', async () => {
    prisma.application.findMany.mockResolvedValue(rows([30, 'motivación privada']))
    provider.rank.mockResolvedValue([{ id: 'c1', score: 80, reason: 'razón privada' }])

    await service.rank(7, 42, Role.COMPANY)

    const logged = JSON.stringify(log.mock.calls)
    expect(logged).toContain('candidatos=1')
    expect(logged).not.toContain('motivación privada')
    expect(logged).not.toContain('razón privada')
  })

  it('limita a 5 sugerencias por minuto y usuario, y cada usuario cuenta aparte', async () => {
    prisma.application.findMany.mockResolvedValue([])
    for (let i = 0; i < 5; i++) await service.rank(7, 42, Role.COMPANY)

    await expect(service.rank(7, 42, Role.COMPANY)).rejects.toMatchObject({ status: 429 })
    await expect(service.rank(7, 43, Role.COMPANY)).resolves.toBeDefined()
  })

  it('el límite se libera pasado un minuto', async () => {
    vi.useFakeTimers()
    try {
      prisma.application.findMany.mockResolvedValue([])
      for (let i = 0; i < 5; i++) await service.rank(7, 42, Role.COMPANY)
      vi.advanceTimersByTime(61_000)

      await expect(service.rank(7, 42, Role.COMPANY)).resolves.toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
