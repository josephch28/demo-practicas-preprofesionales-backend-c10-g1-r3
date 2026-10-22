import {
  BadGatewayException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ApplicationStatus, Role } from '@prisma/client'
import { RateLimiter } from '../../common/rate-limiter'
import { PrismaService } from '../../prisma/prisma.service'
import { ApplicationService } from '../application.service'
import { normalizeRanking } from './ranking.normalizer'
import { RANKING_PROVIDER, type RankingProvider } from './ranking.provider'

export const MAX_RANKED_APPLICATIONS = 50
export const MAX_MOTIVATION_LENGTH = 1000
const MAX_REQUESTS_PER_WINDOW = 5
const RATE_WINDOW_MS = 60_000

export interface ApplicationRanking {
  offerId: number
  ranking: { applicationId: number; score: number; reason: string }[]
  unranked: number[]
  truncated: boolean
}

@Injectable()
export class ApplicationRankingService {
  private readonly logger = new Logger(ApplicationRankingService.name)
  private readonly rateLimiter = new RateLimiter(MAX_REQUESTS_PER_WINDOW, RATE_WINDOW_MS, 'demasiadas sugerencias seguidas; espera un minuto')

  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationService,
    @Inject(RANKING_PROVIDER) private readonly provider: RankingProvider,
  ) {}

  /**
   * Sugiere un orden de afinidad entre las postulaciones aún sin decidir. Solo
   * ordena: no cambia el estado de nadie, y al modelo no le llegan nombres,
   * correos ni ids, únicamente un alias y lo que el postulante escribió.
   */
  async rank(offerId: number, userId: number, role: Role): Promise<ApplicationRanking> {
    this.rateLimiter.assertWithinLimit(userId)
    await this.applications.assertOfferAccess(offerId, userId, role)

    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } })
    if (!offer) throw new NotFoundException('oferta no encontrada')

    // Se pide una más del tope para saber si hubo recorte.
    const found = await this.prisma.application.findMany({
      where: { offerId, status: { in: [ApplicationStatus.SUBMITTED, ApplicationStatus.INTERVIEW] } },
      orderBy: { submittedAt: 'desc' },
      take: MAX_RANKED_APPLICATIONS + 1,
      select: { id: true, motivation: true },
    })
    const truncated = found.length > MAX_RANKED_APPLICATIONS
    // La más antigua primero: es también el orden de desempate.
    const pending = found.slice(0, MAX_RANKED_APPLICATIONS).reverse()

    if (pending.length === 0) return { offerId, ranking: [], unranked: [], truncated: false }

    const candidates = pending.map((application, index) => ({
      alias: `c${index + 1}`,
      motivation: application.motivation.slice(0, MAX_MOTIVATION_LENGTH),
    }))
    const idByAlias = new Map(candidates.map((candidate, index) => [candidate.alias, pending[index].id]))

    const raw = await this.rankOrFail(userId, {
      offer: { title: offer.title, description: offer.description, modality: offer.modality },
      candidates,
    })
    const { ranked, unranked } = normalizeRanking(
      raw,
      candidates.map((candidate) => candidate.alias),
    )

    // Solo metadatos: ni las motivaciones ni los motivos de la IA se escriben en logs.
    this.logger.log(`ranking usuario=${userId} oferta=${offerId} candidatos=${candidates.length} sin_puntuar=${unranked.length}`)

    return {
      offerId,
      ranking: ranked.map((item) => ({
        applicationId: idByAlias.get(item.alias) as number,
        score: item.score,
        reason: item.reason,
      })),
      unranked: unranked.map((alias) => idByAlias.get(alias) as number),
      truncated,
    }
  }

  private async rankOrFail(userId: number, input: Parameters<RankingProvider['rank']>[0]): Promise<unknown[]> {
    try {
      return await this.provider.rank(input)
    } catch (error) {
      // Los errores HTTP del proveedor (p. ej. 503 sin configurar) se respetan.
      if (error instanceof HttpException) throw error
      // Nunca se devuelve ni se registra el mensaje crudo del proveedor.
      this.logger.warn(`el proveedor de ranking falló (usuario ${userId}): ${error instanceof Error ? error.name : 'error'}`)
      throw new BadGatewayException('no se pudo generar la sugerencia de postulantes')
    }
  }
}
