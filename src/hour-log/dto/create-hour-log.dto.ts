import { Type } from 'class-transformer'
import { IsDate, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import {
  HOUR_LOG_MAX_HOURS_PER_DAY,
  HOUR_LOG_MIN_HOURS_PER_DAY,
  HOUR_LOG_RANGE_MESSAGE,
} from '../hour-log-rules'

export class CreateHourLogDto {
  @IsInt() placementId!: number

  @Type(() => Date) @IsDate() date!: Date

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string

  // E6-01: regla única — ver src/hour-log/hour-log-rules.ts
  @Min(HOUR_LOG_MIN_HOURS_PER_DAY, { message: HOUR_LOG_RANGE_MESSAGE })
  @Max(HOUR_LOG_MAX_HOURS_PER_DAY, { message: HOUR_LOG_RANGE_MESSAGE })
  hours!: number

  @IsString() @MaxLength(500) activity!: string
}
