import { UnauthorizedException } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'
import { JwtAuthGuard } from './guards/jwt-auth.guard'

describe('SessionExpiration (Token Expirado)', () => {
  it('throws UnauthorizedException when the JWT has expired', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1ms' },
        }),
      ],
      providers: [JwtAuthGuard],
    }).compile()

    const jwtService = module.get<JwtService>(JwtService)
    const guard = module.get<JwtAuthGuard>(JwtAuthGuard)

    const token = await jwtService.signAsync({ sub: 1, email: 'test@miyura.com', role: 'STUDENT' })

    // Esperar 10ms para asegurar que el token de 1ms haya expirado
    await new Promise((resolve) => setTimeout(resolve, 15))

    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization: `Bearer ${token}`,
          },
        }),
      }),
    }

    await expect(guard.canActivate(mockExecutionContext as never)).rejects.toThrow(UnauthorizedException)
  })

  it('allows access when the JWT is valid and not expired', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [JwtAuthGuard],
    }).compile()

    const jwtService = module.get<JwtService>(JwtService)
    const guard = module.get<JwtAuthGuard>(JwtAuthGuard)

    const token = await jwtService.signAsync({ sub: 1, email: 'test@miyura.com', role: 'STUDENT' })

    const mockRequest: { headers: { authorization: string }; user?: unknown } = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    }

    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    }

    const result = await guard.canActivate(mockExecutionContext as never)
    expect(result).toBe(true)
    expect(mockRequest.user).toMatchObject({ sub: 1, email: 'test@miyura.com', role: 'STUDENT' })
  })
})
