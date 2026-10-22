import { IsISO8601 } from 'class-validator'

export class VoiceDraftBodyDto {
  @IsISO8601({ strict: true }, { message: 'recordedAt debe ser una fecha y hora ISO válida' })
  recordedAt!: string
}
