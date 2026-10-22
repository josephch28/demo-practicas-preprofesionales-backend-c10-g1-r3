import { Module } from '@nestjs/common'
import { HourLogController } from './hour-log.controller'
import { HourLogExportService } from './hour-log-export.service'
import { HourLogNotificationService } from './hour-log-notification.service'
import { HourLogReportService } from './hour-log-report.service'
import { HourLogService } from './hour-log.service'
import { VoiceDraftController } from './voice-draft.controller'
import { createVoiceDraftProvider } from './providers/voice-draft-provider.factory'
import { VOICE_DRAFT_PROVIDER } from './voice-draft.provider'
import { VoiceDraftService } from './voice-draft.service'

@Module({
  controllers: [HourLogController, VoiceDraftController],
  providers: [
    HourLogService,
    HourLogNotificationService,
    HourLogExportService,
    HourLogReportService,
    VoiceDraftService,
    // Groq si hay GROQ_API_KEY; si no, un proveedor que responde 503.
    { provide: VOICE_DRAFT_PROVIDER, useFactory: () => createVoiceDraftProvider() },
  ],
  exports: [
    HourLogService,
    HourLogNotificationService,
    HourLogExportService,
    HourLogReportService,
  ],
})
export class HourLogModule {}
