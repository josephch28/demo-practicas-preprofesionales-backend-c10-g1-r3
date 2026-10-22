import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import type { RawVoiceDraft } from './voice-draft'

/** Lo que el proveedor de IA extrae de una nota de voz, sin validar todavía. */
export type VoiceDraftExtraction = RawVoiceDraft & { transcript: string }

export interface VoiceDraftProviderInput {
  audio: Buffer
  mimeType: string
  recordedAt: Date
  timeZone: string
}

/**
 * Contrato entre el endpoint y la IA. El endpoint no sabe qué modelo hay
 * detrás: VOZ-08 aporta la implementación real y los tests una falsa.
 */
export interface VoiceDraftProvider {
  extract(input: VoiceDraftProviderInput): Promise<VoiceDraftExtraction>
}

export const VOICE_DRAFT_PROVIDER = Symbol('VOICE_DRAFT_PROVIDER')

/** Proveedor por defecto: la app arranca sin API key y el endpoint responde 503. */
@Injectable()
export class UnconfiguredVoiceDraftProvider implements VoiceDraftProvider {
  extract(): Promise<VoiceDraftExtraction> {
    return Promise.reject(new ServiceUnavailableException('la interpretación por voz no está configurada'))
  }
}
