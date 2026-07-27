import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import {
  COMMENT_NICHES,
  COMMENT_TONES,
  TARGET_COMMENT_LANGUAGES,
} from '../types/reply-pack.types';
import type {
  CommentNiche,
  CommentTone,
  TargetCommentLanguage,
} from '../types/reply-pack.types';

export class GenerateReplyPackDto {
  @IsIn(['x'])
  platform: 'x';

  @IsString()
  @MinLength(1)
  postText: string;

  @IsOptional()
  @IsObject()
  postContext?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  authorName?: string;

  @IsOptional()
  @IsString()
  authorHandle?: string;

  @IsOptional()
  @IsUrl({ require_tld: true }, { message: 'postUrl must be a valid URL' })
  postUrl?: string;

  @IsIn(TARGET_COMMENT_LANGUAGES)
  targetCommentLanguage: string;

  @IsOptional()
  @IsIn(['vi', 'en'])
  explanationLanguage?: 'vi' | 'en';

  @IsIn(COMMENT_TONES)
  tone: string;

  @IsIn(COMMENT_NICHES)
  niche: string;

  @IsInt()
  @Min(1)
  @Max(5)
  maxSuggestions: number;
}
