import { Injectable } from '@nestjs/common'

/**
 * Servicio encargado exclusivamente de notificar a los tutores sobre
 * eventos del libro de horas de sus estudiantes.
 */
@Injectable()
export class HourLogNotificationService {
  notifyTutor(tutorId: number, hourLogId: number): void {
    console.log(`[notificación] tutor ${tutorId}: nueva hora registrada #${hourLogId}`)
  }
}
