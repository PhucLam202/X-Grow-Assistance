import {
  IsBoolean,
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
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  deviceId?: string;

  @IsIn(USAGE_EVENT_NAMES)
  eventName: UsageEventName;

  @IsOptional()
  @IsIn(['x'])
  platform?: 'x';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  requestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  generationRunId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  postId?: string;

  @IsOptional()
  @IsIn(['text', 'vision', 'text_only_fallback'])
  analysisMode?: 'text' | 'vision' | 'text_only_fallback';

  @IsOptional()
  @IsBoolean()
  fallbackUsed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  errorCode?: string;

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
