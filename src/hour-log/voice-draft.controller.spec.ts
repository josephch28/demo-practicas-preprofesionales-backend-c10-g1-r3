import { GUARDS_METADATA, HTTP_CODE_METADATA, INTERCEPTORS_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { Role } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { ROLES_KEY } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { VoiceDraftController } from './voice-draft.controller'
import type { VoiceDraftService } from './voice-draft.service'

describe('VoiceDraftController (VOZ-02)', () => {
  const service = { createDraft: vi.fn().mockResolvedValue({ transcript: 't' }) }
  const controller = new VoiceDraftController(service as unknown as VoiceDraftService)

  it('delega en el servicio con el usuario, el archivo y recordedAt', async () => {
    const file = { buffer: Buffer.from('a'), mimetype: 'audio/webm', size: 1 }

    const result = await controller.create(file, { recordedAt: '2026-10-21T14:00:00.000Z' }, { user: { sub: 22 } })

    expect(service.createDraft).toHaveBeenCalledWith(22, file, '2026-10-21T14:00:00.000Z')
    expect(result).toEqual({ transcript: 't' })
  })

  // Solo estudiantes: si alguien cambia o quita el @Roles, este test falla.
  it('solo permite al rol STUDENT', () => {
    const roles = new Reflector().get<Role[]>(ROLES_KEY, VoiceDraftController.prototype.create)

    expect(roles).toEqual([Role.STUDENT])
  })

  it('exige sesión y rol: tiene JwtAuthGuard y RolesGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, VoiceDraftController) as unknown[]

    expect(guards).toEqual([JwtAuthGuard, RolesGuard])
  })

  it('se expone en POST /hour-logs/voice-draft', () => {
    expect(Reflect.getMetadata(PATH_METADATA, VoiceDraftController)).toBe('hour-logs')
    expect(Reflect.getMetadata(PATH_METADATA, VoiceDraftController.prototype.create)).toBe('voice-draft')
  })

  // Devuelve un borrador y no crea ningún recurso: el contrato documenta 200,
  // no el 201 que Nest usa por defecto en un POST.
  it('responde 200 y no 201', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, VoiceDraftController.prototype.create)).toBe(200)
  })

  it('recibe el archivo por multipart con un interceptor', () => {
    const interceptors = Reflect.getMetadata(INTERCEPTORS_METADATA, VoiceDraftController.prototype.create) as unknown[]

    expect(interceptors).toHaveLength(1)
  })
})
