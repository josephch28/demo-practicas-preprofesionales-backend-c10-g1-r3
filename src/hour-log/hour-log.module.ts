import { Module } from '@nestjs/common'
import { HourLogController } from './hour-log.controller'
import { HourLogExportService } from './hour-log-export.service'
import { HourLogNotificationService } from './hour-log-notification.service'
import { HourLogReportService } from './hour-log-report.service'
import { HourLogService } from './hour-log.service'
import { VoiceDraftController } from './voice-draft.controller'
import { UnconfiguredVoiceDraftProvider, VOICE_DRAFT_PROVIDER } from './voice-draft.provider'
import { VoiceDraftService } from './voice-draft.service'

@Module({
  controllers: [HourLogController, VoiceDraftController],
  providers: [
    HourLogService,
    HourLogNotificationService,
    HourLogExportService,
    HourLogReportService,
    VoiceDraftService,
    // VOZ-08 reemplaza este proveedor por el real cuando hay API key.
    { provide: VOICE_DRAFT_PROVIDER, useClass: UnconfiguredVoiceDraftProvider },
  ],
  exports: [
    HourLogService,
    HourLogNotificationService,
    HourLogExportService,
    HourLogReportService,
  ],
})
export class HourLogModule {}
