import { ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { UnconfiguredVoiceDraftProvider } from './voice-draft.provider'

describe('UnconfiguredVoiceDraftProvider (VOZ-02)', () => {
  it('responde 503 con un mensaje claro cuando no hay proveedor de IA configurado', async () => {
    const provider = new UnconfiguredVoiceDraftProvider()

    const result = provider.extract()

    await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(result).rejects.toThrow('la interpretación por voz no está configurada')
  })
})
