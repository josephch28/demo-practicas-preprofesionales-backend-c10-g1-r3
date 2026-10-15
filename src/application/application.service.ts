import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ApplicationStatus, Prisma, Role } from '@prisma/client'
import { OfferService } from '../offer/offer.service'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offers: OfferService,
  ) {}

  apply(offerId: number, studentId: number, motivation: string) {
    return this.prisma.application.create({
      data: { offerId, studentId, motivation, status: ApplicationStatus.SUBMITTED },
    })
  }

  // Postulaciones del propio estudiante, con la oferta y la empresa incluidas
  // para que la pantalla no tenga que resolverlas con llamadas aparte.
  listForStudent(studentId: number) {
    return this.prisma.application.findMany({
      where: { studentId },
      orderBy: { submittedAt: 'desc' },
      include: { offer: { include: { company: true } } },
    })
  }

  async assertOfferAccess(offerId: number, userId: number, role: Role, tx?: Prisma.TransactionClient) {
    if (role === Role.COORDINATOR) return

    const client = tx ?? this.prisma
    const offer = await client.offer.findUnique({ where: { id: offerId } })
    if (!offer) throw new NotFoundException('oferta no encontrada')

    const user = await client.user.findUnique({ where: { id: userId }, select: { companyId: true } })
    if (!user || offer.companyId !== user.companyId) {
      throw new ForbiddenException('no tienes acceso a las postulaciones de esta oferta')
    }
  }

  async listByOffer(offerId: number, userId: number, role: Role) {
    await this.assertOfferAccess(offerId, userId, role)
    return this.prisma.application.findMany({
      where: { offerId },
      include: {
        student: {
          select: { id: true, email: true, fullName: true },
        },
      },
    })
  }

  async decide(id: number, status: ApplicationStatus, userId: number, role: Role) {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.application.findUnique({ where: { id } })
      if (!application) throw new NotFoundException('postulación no encontrada')

      await this.assertOfferAccess(application.offerId, userId, role, tx)

      if (application.status !== ApplicationStatus.SUBMITTED && application.status !== ApplicationStatus.INTERVIEW) {
        throw new BadRequestException('la postulación ya fue decidida')
      }

      if (status === ApplicationStatus.ACCEPTED) {
        // Bloqueo pesimista a nivel de fila sobre la oferta en PostgreSQL para
        // serializar decisiones concurrentes y garantizar que no se sobrepasen los cupos.
        if (typeof tx.$queryRaw === 'function') {
          await tx.$queryRaw`SELECT id FROM offers WHERE id = ${application.offerId} FOR UPDATE`
        }

        const offer = await tx.offer.findUnique({ where: { id: application.offerId } })
        if (!offer) throw new NotFoundException('oferta no encontrada')

        // Verifica que la oferta todavía tenga cupos antes de aceptar la postulación.
        const accepted = await this.offers.acceptedCount(application.offerId, tx)
        if (accepted >= offer.seats) throw new BadRequestException('la oferta ya no tiene cupos')
      }

      return tx.application.update({
        where: { id },
        data: { status, decidedAt: new Date() },
      })
    })
  }
}
