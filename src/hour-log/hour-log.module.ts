import { Module } from '@nestjs/common'
import { HourLogController } from './hour-log.controller'
import { HourLogNotificationService } from './hour-log-notification.service'
import { HourLogService } from './hour-log.service'

@Module({
  controllers: [HourLogController],
  providers: [HourLogService, HourLogNotificationService],
  exports: [HourLogService, HourLogNotificationService],
})
export class HourLogModule {}
