import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common'
import { RateLimiter } from '../common/rate-limiter'
import { institutionTimeZone } from './timezone'
import { normalizeVoiceDraft, type VoiceDraftResult } from './voice-draft'
import { VOICE_DRAFT_PROVIDER, type VoiceDraftExtraction, type VoiceDraftProvider } from './voice-draft.provider'

export const MAX_AUDIO_BYTES = 5 * 1024 * 1024
export const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']

const MAX_REQUESTS_PER_WINDOW = 10
const RATE_WINDOW_MS = 60_000
const MAX_FUTURE_SKEW_MS = 5 * 60_000
// Un estudiante puede pasar días sin señal antes de que la nota se envíe.
const MAX_AGE_MS = 30 * 24 * 60 * 60_000

export interface UploadedAudio {
  buffer: Buffer
  mimetype: string
  size: number
}

type ValidatedAudio = UploadedAudio & { mimeType: string }

@Injectable()
export class VoiceDraftService {
  private readonly logger = new Logger(VoiceDraftService.name)
  private readonly rateLimiter = new RateLimiter(MAX_REQUESTS_PER_WINDOW, RATE_WINDOW_MS, 'demasiadas notas de voz seguidas; espera un minuto')

  constructor(@Inject(VOICE_DRAFT_PROVIDER) private readonly provider: VoiceDraftProvider) {}

  async createDraft(
    userId: number,
    file: UploadedAudio | undefined,
    recordedAtRaw: string,
  ): Promise<{ transcript: string } & VoiceDraftResult> {
    this.rateLimiter.assertWithinLimit(userId)
    const audio = this.validateAudio(file)
    const recordedAt = this.parseRecordedAt(recordedAtRaw)

    const startedAt = Date.now()
    const { transcript, ...fields } = await this.extractOrFail(userId, audio, recordedAt)
    const normalized = normalizeVoiceDraft(fields, { recordedAt })

    // Solo metadatos: ni el audio ni la transcripción se escriben en logs.
    this.logger.log(`voice-draft usuario=${userId} bytes=${audio.size} ms=${Date.now() - startedAt}`)

    return { transcript, ...normalized }
  }

  private validateAudio(file: UploadedAudio | undefined): ValidatedAudio {
    if (!file) throw new BadRequestException('falta el archivo de audio (campo "audio")')
    if (file.size > MAX_AUDIO_BYTES) throw new PayloadTooLargeException('el audio supera los 5 MB')
    // MediaRecorder envía parámetros, por ejemplo "audio/webm;codecs=opus".
    const mimeType = file.mimetype.split(';')[0].trim().toLowerCase()
    if (!ALLOWED_AUDIO_TYPES.includes(mimeType)) {
      throw new BadRequestException(`tipo de audio no permitido: ${mimeType}`)
    }
    return { ...file, mimeType }
  }

  private parseRecordedAt(raw: string): Date {
    const recordedAt = new Date(raw)
    if (Number.isNaN(recordedAt.getTime())) throw new BadRequestException('recordedAt no es una fecha válida')
    const now = Date.now()
    if (recordedAt.getTime() > now + MAX_FUTURE_SKEW_MS) {
      throw new BadRequestException('recordedAt no puede estar en el futuro')
    }
    if (recordedAt.getTime() < now - MAX_AGE_MS) {
      throw new BadRequestException('recordedAt tiene más de 30 días de antigüedad')
    }
    return recordedAt
  }

  private async extractOrFail(userId: number, audio: ValidatedAudio, recordedAt: Date): Promise<VoiceDraftExtraction> {
    try {
      return await this.provider.extract({
        audio: audio.buffer,
        mimeType: audio.mimeType,
        recordedAt,
        timeZone: institutionTimeZone(),
      })
    } catch (error) {
      // Los errores HTTP del proveedor (p. ej. 503 sin configurar) se respetan.
      if (error instanceof HttpException) throw error
      // Nunca se devuelve ni se registra el mensaje crudo del proveedor.
      this.logger.warn(`el proveedor de voz falló (usuario ${userId}): ${error instanceof Error ? error.name : 'error'}`)
      throw new BadGatewayException('no se pudo interpretar la nota de voz')
    }
  }
}
