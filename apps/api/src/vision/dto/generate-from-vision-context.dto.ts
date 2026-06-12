import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  COMMENT_NICHES,
  COMMENT_TONES,
  TARGET_COMMENT_LANGUAGES,
} from '../../reply-pack/types/reply-pack.types';
import type {
  CommentNiche,
  CommentTone,
  TargetCommentLanguage,
} from '../../reply-pack/types/reply-pack.types';

export class VisionContextPostDto {
  @IsIn(['x'])
  platform: 'x';

  @IsString()
  @MinLength(1)
  text: string;

  @IsOptional()
  @IsUrl({ require_tld: true }, { message: 'url must be a valid URL' })
  url?: string;

  @IsOptional()
  @IsString()
  authorName?: string;

  @IsOptional()
  @IsString()
  authorHandle?: string;
}

export class VisionImageAnalysisDto {
  @IsString()
  summary: string;

  @IsString()
  visibleText: string;

  @IsString()
  visualTone: string;

  @IsArray()
  @IsString({ each: true })
  importantObjects: string[];

  @IsOptional()
  @IsString()
  uncertainty?: string;
}

export class CombinedContextDto {
  @IsString()
  topic: string;

  @IsString()
  intent: string;

  @IsString()
  sentiment: string;

  @IsString()
  explanation: string;

  @IsString()
  commentStrategy: string;

  @IsArray()
  @IsString({ each: true })
  avoid: string[];
}

export class VisionContextPayloadDto {
  @IsString()
  detectedLanguage: string;

  @IsIn(['vi', 'en'])
  translationLanguage: 'vi' | 'en';

  @IsString()
  translation: string;

  @IsString()
  summary: string;

  @IsString()
  context: string;

  @IsString()
  theme: string;

  @IsString()
  topic: string;

  @IsString()
  sentiment: string;

  @IsString()
  commentStrategy: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VisionImageAnalysisDto)
  imageAnalysis?: VisionImageAnalysisDto;

  @ValidateNested()
  @Type(() => CombinedContextDto)
  combinedContext: CombinedContextDto;
}

export class VisionContextCommentOptionsDto {
  @IsIn(['vi', 'en'])
  explanationLanguage: 'vi' | 'en';

  @IsIn(TARGET_COMMENT_LANGUAGES)
  targetCommentLanguage: TargetCommentLanguage;

  @IsIn(COMMENT_TONES)
  tone: CommentTone;

  @IsIn(COMMENT_NICHES)
  niche: CommentNiche;

  @IsInt()
  @Min(1)
  @Max(5)
  maxSuggestions: number;
}

export class GenerateFromVisionContextDto {
  @ValidateNested()
  @Type(() => VisionContextPostDto)
  post: VisionContextPostDto;

  @ValidateNested()
  @Type(() => VisionContextPayloadDto)
  visionContext: VisionContextPayloadDto;

  @ValidateNested()
  @Type(() => VisionContextCommentOptionsDto)
  options: VisionContextCommentOptionsDto;
}
