import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnconfiguredVoiceDraftProvider } from '../voice-draft.provider'
import { GroqVoiceDraftProvider } from './groq-voice-draft.provider'
import { createVoiceDraftProvider } from './voice-draft-provider.factory'

const FAKE_KEY = 'clave-falsa-solo-para-tests'
const input = { audio: Buffer.from('a'), mimeType: 'audio/mp4', recordedAt: new Date('2026-10-22T04:20:00.000Z'), timeZone: 'America/Guayaquil' }

describe('createVoiceDraftProvider (VOZ-08)', () => {
  let log: ReturnType<typeof vi.spyOn>
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sin GROQ_API_KEY devuelve el proveedor sin configurar, para que la app arranque', () => {
    expect(createVoiceDraftProvider({})).toBeInstanceOf(UnconfiguredVoiceDraftProvider)
  })

  it.each(['', '   '])('trata una GROQ_API_KEY vacía (%j) como no configurada', (value) => {
    expect(createVoiceDraftProvider({ GROQ_API_KEY: value })).toBeInstanceOf(UnconfiguredVoiceDraftProvider)
  })

  it('con GROQ_API_KEY devuelve el proveedor de Groq', () => {
    expect(createVoiceDraftProvider({ GROQ_API_KEY: FAKE_KEY })).toBeInstanceOf(GroqVoiceDraftProvider)
  })

  it('avisa en el log cuando no está configurada', () => {
    createVoiceDraftProvider({})

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('GROQ_API_KEY no está definida'))
  })

  it('usa los modelos de GROQ_STT_MODEL y GROQ_LLM_MODEL cuando se definen', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'hola' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify({ date: null, startTime: null, endTime: null, hours: null, activity: null }) } }] }),
          { status: 200 },
        ),
      )
    const provider = createVoiceDraftProvider(
      { GROQ_API_KEY: FAKE_KEY, GROQ_STT_MODEL: 'whisper-large-v3', GROQ_LLM_MODEL: 'openai/gpt-oss-20b' },
      fetchFn as unknown as typeof fetch,
    )

    await provider.extract(input)

    expect((fetchFn.mock.calls[0][1].body as FormData).get('model')).toBe('whisper-large-v3')
    expect(JSON.parse(fetchFn.mock.calls[1][1].body as string).model).toBe('openai/gpt-oss-20b')
  })

  it('nunca escribe la key en los logs', () => {
    createVoiceDraftProvider({ GROQ_API_KEY: FAKE_KEY })

    expect(JSON.stringify(log.mock.calls)).not.toContain(FAKE_KEY)
    expect(JSON.stringify(warn.mock.calls)).not.toContain(FAKE_KEY)
  })
})
