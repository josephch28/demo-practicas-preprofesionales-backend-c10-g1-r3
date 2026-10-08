import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ApplicationStatus, OfferStatus, Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateOfferDto } from './dto/create-offer.dto'

@Injectable()
export class OfferService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOfferDto, userId: number, role: Role) {
    if (role !== Role.COORDINATOR) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } })
      if (!user?.companyId || user.companyId !== dto.companyId) {
        throw new ForbiddenException('no tienes permiso para crear ofertas para otra empresa')
      }
    }
    return this.prisma.offer.create({ data: { ...dto, status: OfferStatus.DRAFT } })
  }

  findAll() {
    return this.prisma.offer.findMany({
      where: { status: OfferStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
      include: { company: true },
    })
  }

  async findOne(id: number, userId?: number, role?: Role) {
    const offer = await this.prisma.offer.findUnique({ where: { id }, include: { company: true } })
    if (!offer) throw new NotFoundException('oferta no encontrada')

    // H-04: Las ofertas no publicadas (DRAFT, etc.) solo son visibles para
    // la coordinación y para la empresa propietaria de la oferta.
    // Un estudiante u otro usuario ajeno recibe 404 como si no existiera.
    if (offer.status !== OfferStatus.PUBLISHED) {
      if (role === Role.COORDINATOR) {
        return offer
      }

      if (role === Role.COMPANY && userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } })
        if (user?.companyId === offer.companyId) {
          return offer
        }
      }

      throw new NotFoundException('oferta no encontrada')
    }

    return offer
  }

  // Ofertas de la empresa del usuario autenticado, en cualquier estado —
  // a diferencia de findAll() (solo PUBLISHED, para el catálogo del estudiante).
  // Incluye el estado de las postulaciones para que la empresa vea cupos
  // ocupados sin que el front tenga que pedir una lista aparte por oferta.
  async findAllForCompanyUser(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } })
    if (!user?.companyId) throw new NotFoundException('el usuario no tiene una empresa asociada')
    return this.prisma.offer.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: 'desc' },
      include: { company: true, applications: { select: { status: true } } },
    })
  }

  private async assertOfferOwnership(offerCompanyId: number, userId: number, role: Role) {
    if (role === Role.COORDINATOR) return

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } })
    if (!user?.companyId || offerCompanyId !== user.companyId) {
      throw new ForbiddenException('la oferta no pertenece a tu empresa')
    }
  }

  async publish(id: number, userId: number, role: Role) {
    const offer = await this.prisma.offer.findUnique({ where: { id } })
    if (!offer) throw new NotFoundException('oferta no encontrada')

    await this.assertOfferOwnership(offer.companyId, userId, role)

    if (offer.status !== OfferStatus.DRAFT) {
      throw new BadRequestException('solo se publican ofertas en DRAFT')
    }
    return this.prisma.offer.update({
      where: { id },
      data: { status: OfferStatus.PUBLISHED, publishedAt: new Date() },
    })
  }

  async close(id: number, userId: number, role: Role) {
    const offer = await this.prisma.offer.findUnique({ where: { id } })
    if (!offer) throw new NotFoundException('oferta no encontrada')

    await this.assertOfferOwnership(offer.companyId, userId, role)

    if (offer.status !== OfferStatus.PUBLISHED) {
      throw new BadRequestException('solo se cierran ofertas publicadas')
    }
    return this.prisma.offer.update({ where: { id }, data: { status: OfferStatus.CLOSED } })
  }

  // Cuenta las postulaciones ya aceptadas para una oferta.
  acceptedCount(offerId: number): Promise<number> {
    return this.prisma.application.count({
      where: { offerId, status: ApplicationStatus.ACCEPTED },
    })
  }
}
