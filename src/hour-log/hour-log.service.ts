import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { HourLogStatus, PlacementStatus, Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateHourLogDto } from './dto/create-hour-log.dto'
import { formatCalendarDay, institutionToday, toInstitutionCalendarDay, truncateToUtcDay } from './timezone'
import { HourLogExportService } from './hour-log-export.service'
import { HourLogNotificationService } from './hour-log-notification.service'
import { HourLogReportService } from './hour-log-report.service'
import { validateHoursValue } from './hour-log-rules'

// D-02 (deuda sembrada, documentada a propósito): este servicio es un
// "god service". `create` valida el DTO, persiste el registro y dispara
// una notificación al tutor; `review` maneja la máquina de estados de
// aprobación; `approvedHours`/`progressReport`/`weeklySummary`/`exportRows`
// agregan y transforman datos para reportes. Todo vive en el mismo archivo
// a propósito: no lo dividas en `HourLogValidationService`,
// `HourLogNotificationService` ni `HourLogReportService`. El objetivo de
// producto es que el equipo que reciba el template identifique el problema
// de mantenibilidad y decida cómo (y cuándo) separarlo — no que nazca ya
// separado.
@Injectable()
export class HourLogService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationService: HourLogNotificationService = new HourLogNotificationService(),
    @Optional() private readonly exportService: HourLogExportService = new HourLogExportService(prisma),
    @Optional() private readonly reportService: HourLogReportService = new HourLogReportService(prisma),
  ) {}

  /**
   * Registra una jornada de horas para el placement del estudiante.
   *
   * Hace tres cosas en un solo método (síntoma de D-02): revalida el rango
   * de horas y el orden de `startTime`/`endTime` (ver D-06), persiste el
   * registro en estado `SUBMITTED`, y dispara la notificación al tutor.
   *
   * @param dto DTO ya validado por `ValidationPipe` a nivel de HTTP.
   * @param studentId id del usuario autenticado que registra la jornada.
   */
  async create(dto: CreateHourLogDto, studentId: number) {
    const placement = await this.prisma.placement.findUnique({ where: { id: dto.placementId } })
    if (!placement) throw new NotFoundException('placement no encontrado')
    if (placement.studentId !== studentId) throw new BadRequestException('el placement no es tuyo')
    if (placement.status !== PlacementStatus.ACTIVE) {
      throw new BadRequestException('el placement no está activo')
    }

    // E6-01: regla única — ver src/hour-log/hour-log-rules.ts
    const hoursError = validateHoursValue(dto.hours)
    if (hoursError) throw new BadRequestException(hoursError)

    const [startHour, startMinute] = dto.startTime.split(':').map(Number)
    const [endHour, endMinute] = dto.endTime.split(':').map(Number)
    if (startHour * 60 + startMinute >= endHour * 60 + endMinute) {
      throw new BadRequestException('la hora de inicio debe ser anterior a la de fin')
    }

    const normalizedDate = toInstitutionCalendarDay(dto.date)
    const today = institutionToday()
    if (normalizedDate > today) {
      throw new BadRequestException('no se pueden registrar horas con fecha futura')
    }

    const placementStart = truncateToUtcDay(placement.startDate)
    const placementEnd = truncateToUtcDay(placement.endDate)
    if (normalizedDate < placementStart || normalizedDate > placementEnd) {
      throw new BadRequestException(
        `la fecha debe estar entre ${formatCalendarDay(placementStart)} y ${formatCalendarDay(placementEnd)}`,
      )
    }

    const created = await this.prisma.hourLog.create({
      data: {
        placementId: dto.placementId,
        date: normalizedDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        hours: dto.hours,
        activity: dto.activity,
        status: HourLogStatus.SUBMITTED,
      },
    })

    this.notificationService.notifyTutor(placement.tutorId, created.id)
    return created
  }

  /**
   * Verifica que quien consulta un placement sea el estudiante dueño, su
   * tutor asignado, o un coordinador.
   */
  async assertPlacementAccess(placementId: number, userId: number, role: Role): Promise<void> {
    const placement = await this.prisma.placement.findUnique({ where: { id: placementId } })
    if (!placement) throw new NotFoundException('placement no encontrado')
    const allowed = role === Role.COORDINATOR || placement.studentId === userId || placement.tutorId === userId
    if (!allowed) throw new ForbiddenException('no tienes acceso a este placement')
  }

  /** Lista el libro de horas completo de un placement, más reciente primero. */
  listForPlacement(placementId: number) {
    return this.prisma.hourLog.findMany({
      where: { placementId, deletedAt: null },
      orderBy: { date: 'desc' },
    })
  }

    /**
   * Aprueba o rechaza un registro de horas.
   *
   * Valida pertenencia: solo el tutor asignado a la práctica del registro
   * puede revisarlo (E3-02 / H-03 del inventario de permisos). Después
   * valida la máquina de estados: solo se revisan registros que están en
   * `SUBMITTED`; de ahí pasan a `APPROVED` o `REJECTED`.
   */
  async review(id: number, status: HourLogStatus, reviewerId: number, note?: string) {
    const log = await this.prisma.hourLog.findUnique({ where: { id }, include: { placement: true } })
    if (!log) throw new NotFoundException('registro de horas no encontrado')
    if (log.placement.tutorId !== reviewerId) {
      throw new ForbiddenException('no eres el tutor asignado a esta práctica')
    }
    if (log.status !== HourLogStatus.SUBMITTED) {
      throw new BadRequestException('solo se revisan registros en SUBMITTED')
    }
    return this.prisma.hourLog.update({
      where: { id },
      data: {
        status,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: note,
        version: { increment: 1 },
      },
    })
  }

  /**
   * Suma las horas ya `APPROVED` de un placement delegando en HourLogReportService.
   */
  approvedHours(placementId: number): Promise<number> {
    return this.reportService.approvedHours(placementId)
  }

  /**
   * Reporte de avance de un placement delegando en HourLogReportService.
   */
  progressReport(placementId: number) {
    return this.reportService.progressReport(placementId)
  }

  /**
   * Resumen semanal de horas delegando en HourLogReportService.
   */
  weeklySummary(placementId: number) {
    return this.reportService.weeklySummary(placementId)
  }

  exportRows(placementId: number): Promise<(string | number)[][]> {
    return this.exportService.exportRows(placementId)
  }
}
