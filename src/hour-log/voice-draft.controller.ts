import { Body, Controller, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Role } from '@prisma/client'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { VoiceDraftBodyDto } from './dto/voice-draft.dto'
import { MAX_AUDIO_BYTES, type UploadedAudio, VoiceDraftService } from './voice-draft.service'

@Controller('hour-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VoiceDraftController {
  constructor(private readonly service: VoiceDraftService) {}

  @Post('voice-draft')
  @Roles(Role.STUDENT)
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } }))
  create(
    @UploadedFile() file: UploadedAudio | undefined,
    @Body() body: VoiceDraftBodyDto,
    @Req() req: { user: { sub: number } },
  ) {
    return this.service.createDraft(req.user.sub, file, body.recordedAt)
  }
}
