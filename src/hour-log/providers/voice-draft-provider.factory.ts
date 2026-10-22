import { Logger } from '@nestjs/common'
import { type VoiceDraftProvider, UnconfiguredVoiceDraftProvider } from '../voice-draft.provider'
import { DEFAULT_LLM_MODEL, DEFAULT_STT_MODEL, GroqVoiceDraftProvider } from './groq-voice-draft.provider'

/**
 * Elige el proveedor de IA según el entorno: con GROQ_API_KEY usa Groq y sin
 * ella la app arranca igual y el endpoint responde 503. Los modelos se pueden
 * cambiar sin tocar código con GROQ_STT_MODEL y GROQ_LLM_MODEL.
 */
export function createVoiceDraftProvider(
  env: NodeJS.ProcessEnv = process.env,
  fetchFn?: typeof fetch,
): VoiceDraftProvider {
  const logger = new Logger('VoiceDraftProvider')
  const apiKey = env.GROQ_API_KEY?.trim()

  if (!apiKey) {
    logger.warn('GROQ_API_KEY no está definida: el registro de horas por voz responderá 503')
    return new UnconfiguredVoiceDraftProvider()
  }

  const sttModel = env.GROQ_STT_MODEL?.trim() || DEFAULT_STT_MODEL
  const llmModel = env.GROQ_LLM_MODEL?.trim() || DEFAULT_LLM_MODEL
  // La key nunca se registra: solo qué modelos se van a usar.
  logger.log(`registro de horas por voz con Groq (transcripción: ${sttModel}, extracción: ${llmModel})`)
  return new GroqVoiceDraftProvider({ apiKey, sttModel, llmModel, fetchFn })
}
