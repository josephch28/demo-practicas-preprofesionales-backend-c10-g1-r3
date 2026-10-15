import { Module } from '@nestjs/common'
import { HourLogController } from './hour-log.controller'
import { HourLogExportService } from './hour-log-export.service'
import { HourLogNotificationService } from './hour-log-notification.service'
import { HourLogReportService } from './hour-log-report.service'
import { HourLogService } from './hour-log.service'

@Module({
  controllers: [HourLogController],
  providers: [
    HourLogService,
    HourLogNotificationService,
    HourLogExportService,
    HourLogReportService,
  ],
  exports: [
    HourLogService,
    HourLogNotificationService,
    HourLogExportService,
    HourLogReportService,
  ],
})
export class HourLogModule {}
