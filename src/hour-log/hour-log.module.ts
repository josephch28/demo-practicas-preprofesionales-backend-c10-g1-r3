import { Module } from '@nestjs/common'
import { HourLogController } from './hour-log.controller'
import { HourLogExportService } from './hour-log-export.service'
import { HourLogNotificationService } from './hour-log-notification.service'
import { HourLogService } from './hour-log.service'

@Module({
  controllers: [HourLogController],
  providers: [HourLogService, HourLogNotificationService, HourLogExportService],
  exports: [HourLogService, HourLogNotificationService, HourLogExportService],
})
export class HourLogModule {}
