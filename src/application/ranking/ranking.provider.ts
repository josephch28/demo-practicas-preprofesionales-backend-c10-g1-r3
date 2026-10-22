import { Injectable, ServiceUnavailableException } from '@nestjs/common'

export interface RankingOffer {
  title: string
  description: string
  modality: string
}

/** Un postulante anonimizado: la IA solo conoce su alias y lo que escribió. */
export interface RankingCandidate {
  alias: string
  motivation: string
}

export interface RankingProviderInput {
  offer: RankingOffer
  candidates: RankingCandidate[]
}

/**
 * Contrato entre el servicio y la IA. Devuelve los elementos tal como los dio
 * el modelo, sin confiar en ellos: `normalizeRanking` los valida después.
 */
export interface RankingProvider {
  rank(input: RankingProviderInput): Promise<unknown[]>
}

export const RANKING_PROVIDER = Symbol('RANKING_PROVIDER')

/** Proveedor por defecto: sin API key la app arranca y el endpoint responde 503. */
@Injectable()
export class UnconfiguredRankingProvider implements RankingProvider {
  rank(): Promise<unknown[]> {
    return Promise.reject(new ServiceUnavailableException('la sugerencia de postulantes no está configurada'))
  }
}
