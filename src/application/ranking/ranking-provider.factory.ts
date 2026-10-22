import { Logger } from '@nestjs/common'
import { DEFAULT_LLM_MODEL } from '../../hour-log/providers/groq-voice-draft.provider'
import { GroqRankingProvider } from './groq-ranking.provider'
import { type RankingProvider, UnconfiguredRankingProvider } from './ranking.provider'

/** Mismo criterio que el registro por voz: Groq con GROQ_API_KEY, y sin ella responde 503. */
export function createRankingProvider(env: NodeJS.ProcessEnv = process.env, fetchFn?: typeof fetch): RankingProvider {
  const logger = new Logger('RankingProvider')
  const apiKey = env.GROQ_API_KEY?.trim()

  if (!apiKey) {
    logger.warn('GROQ_API_KEY no está definida: la sugerencia de postulantes responderá 503')
    return new UnconfiguredRankingProvider()
  }

  const model = env.GROQ_LLM_MODEL?.trim() || DEFAULT_LLM_MODEL
  logger.log(`sugerencia de postulantes con Groq (modelo: ${model})`)
  return new GroqRankingProvider({ apiKey, model, fetchFn })
}
