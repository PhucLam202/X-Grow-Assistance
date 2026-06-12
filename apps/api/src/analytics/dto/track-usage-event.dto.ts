import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { USAGE_EVENT_NAMES } from '../types/usage-event.types';
import type { UsageEventName } from '../types/usage-event.types';

export class TrackUsageEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  deviceId: string;

  @IsIn(USAGE_EVENT_NAMES)
  eventName: UsageEventName;

  @IsIn(['x'])
  platform: 'x';

  @IsOptional()
  @IsUrl({ require_tld: true }, { message: 'postUrl must be a valid URL' })
  postUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  niche?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  translationLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  targetCommentLanguage?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120000)
  latencyMs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  errorMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  feedback?: string;
}
