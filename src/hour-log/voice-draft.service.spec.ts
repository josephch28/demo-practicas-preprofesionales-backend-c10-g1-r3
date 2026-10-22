import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { institutionTimeZone } from './timezone'
import type { VoiceDraftExtraction, VoiceDraftProvider } from './voice-draft.provider'
import { MAX_AUDIO_BYTES, type UploadedAudio, VoiceDraftService } from './voice-draft.service'

const NOW = new Date('2026-10-21T15:00:00.000Z')
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

const extraction: VoiceDraftExtraction = {
  transcript: 'hoy de dos a seis ayudé con los sensores',
  date: '2026-10-21',
  startTime: '14:00',
  endTime: '18:00',
  hours: 4,
  activity: 'Configuración de sensores',
}

const audio = (overrides: Partial<UploadedAudio> = {}): UploadedAudio => ({
  buffer: Buffer.from('audio'),
  mimetype: 'audio/webm',
  size: 5,
  ...overrides,
})

const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString()

describe('VoiceDraftService (VOZ-02)', () => {
  let provider: { extract: ReturnType<typeof vi.fn> }
  let service: VoiceDraftService

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    provider = { extract: vi.fn().mockResolvedValue(extraction) }
    service = new VoiceDraftService(provider as unknown as VoiceDraftProvider)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('camino feliz', () => {
    it('devuelve la transcripción y el borrador normalizado', async () => {
      const result = await service.createDraft(7, audio(), at(-MINUTE))

      expect(result).toEqual({
        transcript: extraction.transcript,
        draft: {
          date: '2026-10-21',
          startTime: '14:00',
          endTime: '18:00',
          hours: 4,
          activity: 'Configuración de sensores',
        },
        missing: [],
        warnings: [],
      })
    })

    it('llama al proveedor con el audio, el tipo, la fecha de grabación y la zona horaria', async () => {
      const file = audio()

      await service.createDraft(7, file, at(-MINUTE))

      expect(provider.extract).toHaveBeenCalledWith({
        audio: file.buffer,
        mimeType: 'audio/webm',
        recordedAt: new Date(at(-MINUTE)),
        timeZone: institutionTimeZone(),
      })
    })

    it('acepta el tipo con parámetros que envía MediaRecorder y lo pasa limpio', async () => {
      await service.createDraft(7, audio({ mimetype: 'audio/webm;codecs=opus' }), at(-MINUTE))

      expect(provider.extract).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'audio/webm' }))
    })

    it('marca como faltante lo que la IA no entendió, sin inventarlo', async () => {
      provider.extract.mockResolvedValue({
        transcript: 'trabajé un rato',
        date: null,
        startTime: null,
        endTime: null,
        hours: null,
        activity: null,
      })

      const result = await service.createDraft(7, audio(), at(-MINUTE))

      expect(result.transcript).toBe('trabajé un rato')
      expect([...result.missing].sort()).toEqual(['activity', 'endTime', 'hours', 'startTime'])
      expect(result.draft.hours).toBeNull()
    })
  })

  describe('validación del archivo', () => {
    it('rechaza cuando falta el archivo', async () => {
      await expect(service.createDraft(7, undefined, at(-MINUTE))).rejects.toBeInstanceOf(BadRequestException)
      expect(provider.extract).not.toHaveBeenCalled()
    })

    it('rechaza un tipo de archivo no permitido', async () => {
      await expect(
        service.createDraft(7, audio({ mimetype: 'application/pdf' }), at(-MINUTE)),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(provider.extract).not.toHaveBeenCalled()
    })

    it.each(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'])('acepta %s', async (mimetype) => {
      await expect(service.createDraft(7, audio({ mimetype }), at(-MINUTE))).resolves.toBeDefined()
    })

    it('acepta un audio de exactamente 5 MB (borde)', async () => {
      await expect(service.createDraft(7, audio({ size: MAX_AUDIO_BYTES }), at(-MINUTE))).resolves.toBeDefined()
    })

    it('rechaza un audio de más de 5 MB con 413', async () => {
      await expect(
        service.createDraft(7, audio({ size: MAX_AUDIO_BYTES + 1 }), at(-MINUTE)),
      ).rejects.toBeInstanceOf(PayloadTooLargeException)
      expect(provider.extract).not.toHaveBeenCalled()
    })
  })

  describe('validación de recordedAt', () => {
    it('rechaza una fecha que no es válida', async () => {
      await expect(service.createDraft(7, audio(), 'no-es-fecha')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('acepta una grabación unos minutos en el futuro (reloj del dispositivo adelantado)', async () => {
      await expect(service.createDraft(7, audio(), at(4 * MINUTE))).resolves.toBeDefined()
    })

    it('rechaza una grabación a más de 5 minutos en el futuro', async () => {
      await expect(service.createDraft(7, audio(), at(5 * MINUTE + 1))).rejects.toBeInstanceOf(BadRequestException)
    })

    it('acepta una nota de hace 29 días (estudiante sin señal por días)', async () => {
      await expect(service.createDraft(7, audio(), at(-29 * DAY))).resolves.toBeDefined()
    })

    it('acepta una nota de exactamente 30 días (borde)', async () => {
      await expect(service.createDraft(7, audio(), at(-30 * DAY))).resolves.toBeDefined()
    })

    it('rechaza una nota de más de 30 días', async () => {
      await expect(service.createDraft(7, audio(), at(-30 * DAY - 1))).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('errores del proveedor', () => {
    it('responde 502 con mensaje genérico y no filtra el error del proveedor', async () => {
      provider.extract.mockRejectedValue(new Error('rate limit de groq: key gsk_secreta'))

      const result = service.createDraft(7, audio(), at(-MINUTE))

      await expect(result).rejects.toBeInstanceOf(BadGatewayException)
      await expect(result).rejects.toThrow('no se pudo interpretar la nota de voz')
      await expect(result).rejects.not.toThrow(/groq|gsk_/)
    })

    it('respeta el error HTTP del proveedor, por ejemplo 503 sin configurar', async () => {
      provider.extract.mockRejectedValue(new ServiceUnavailableException('la interpretación por voz no está configurada'))

      await expect(service.createDraft(7, audio(), at(-MINUTE))).rejects.toBeInstanceOf(ServiceUnavailableException)
    })

    it('no registra el mensaje del error del proveedor en los logs', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
      provider.extract.mockRejectedValue(new Error('contiene la transcripción: hoy de dos a seis'))

      await service.createDraft(7, audio(), at(-MINUTE)).catch(() => undefined)

      expect(JSON.stringify(warn.mock.calls)).not.toContain('transcripción')
      expect(JSON.stringify(warn.mock.calls)).not.toContain('dos a seis')
    })
  })

  describe('límite de peticiones', () => {
    const call = (userId: number) => service.createDraft(userId, audio(), at(-MINUTE))

    it('permite 10 peticiones por minuto y rechaza la 11 con 429', async () => {
      for (let i = 0; i < 10; i++) await call(7)

      const eleventh = call(7)

      await expect(eleventh).rejects.toBeInstanceOf(HttpException)
      await expect(eleventh).rejects.toMatchObject({ status: 429 })
    })

    it('no afecta a otro usuario', async () => {
      for (let i = 0; i < 10; i++) await call(7)

      await expect(call(8)).resolves.toBeDefined()
    })

    it('vuelve a permitir peticiones cuando pasa la ventana de un minuto', async () => {
      for (let i = 0; i < 10; i++) await call(7)

      vi.setSystemTime(new Date(NOW.getTime() + MINUTE + 1))

      await expect(service.createDraft(7, audio(), at(MINUTE))).resolves.toBeDefined()
    })

    it('cuenta también las peticiones inválidas, para proteger el endpoint', async () => {
      for (let i = 0; i < 10; i++) await service.createDraft(7, undefined, at(-MINUTE)).catch(() => undefined)

      await expect(call(7)).rejects.toMatchObject({ status: 429 })
    })
  })

  describe('privacidad', () => {
    it('no escribe la transcripción en los logs, solo metadatos', async () => {
      const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

      await service.createDraft(7, audio(), at(-MINUTE))

      const logged = JSON.stringify(log.mock.calls)
      expect(logged).not.toContain('sensores')
      expect(logged).not.toContain('dos a seis')
      expect(logged).toContain('usuario=7')
    })
  })
})
