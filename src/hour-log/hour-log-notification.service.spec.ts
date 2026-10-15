import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HourLogNotificationService } from './hour-log-notification.service'

describe('HourLogNotificationService', () => {
  let service: HourLogNotificationService

  beforeEach(() => {
    service = new HourLogNotificationService()
  })

  it('notifies assigned tutor when an hour log is submitted', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    service.notifyTutor(12, 345)

    expect(consoleSpy).toHaveBeenCalledWith('[notificación] tutor 12: nueva hora registrada #345')
    consoleSpy.mockRestore()
  })
})
