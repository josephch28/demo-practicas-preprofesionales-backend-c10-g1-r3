import { randomUUID } from 'node:crypto'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Role } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'

interface StoredRefreshToken {
  token: string
  userId: number
  expiresAt: number
}

@Injectable()
export class AuthService {
  // Almacén en memoria de refresh tokens activos. Al renovar, el token previo
  // se invalida de forma inmediata para cumplir con el criterio de rotación de tokens.
  private readonly refreshTokens = new Map<string, StoredRefreshToken>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private generateRefreshToken(userId: number): string {
    const token = randomUUID()
    // Refresh token válido por 7 días por defecto
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000
    this.refreshTokens.set(token, { token, userId, expiresAt })
    return token
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('credenciales inválidas')
    }
    const accessToken = await this.jwt.signAsync({ sub: user.id, email, role: user.role })
    const refreshToken = this.generateRefreshToken(user.id)
    return {
      accessToken,
      refreshToken,
      // companyId solo es relevante para Role.COMPANY (ver User.companyId en
      // el schema); el resto de roles lo trae null. El front lo necesita para
      // armar CreateOfferDto sin tener que adivinar o listar todas las empresas.
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role as Role, companyId: user.companyId },
    }
  }

  async refresh(oldRefreshToken: string) {
    const stored = this.refreshTokens.get(oldRefreshToken)
    if (!stored) {
      throw new UnauthorizedException('refresh token inválido o expirado')
    }

    if (Date.now() > stored.expiresAt) {
      this.refreshTokens.delete(oldRefreshToken)
      throw new UnauthorizedException('refresh token expirado')
    }

    // Invalida inmediatamente el token anterior (rotación de tokens)
    this.refreshTokens.delete(oldRefreshToken)

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } })
    if (!user) {
      throw new UnauthorizedException('usuario no encontrado')
    }

    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role })
    const newRefreshToken = this.generateRefreshToken(user.id)

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role as Role, companyId: user.companyId },
    }
  }

  revokeRefreshToken(token: string): boolean {
    return this.refreshTokens.delete(token)
  }
}
