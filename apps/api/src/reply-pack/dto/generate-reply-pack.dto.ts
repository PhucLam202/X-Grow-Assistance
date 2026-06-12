import {
  IsIn,
  IsInt,
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
  @IsString()
  authorName?: string;

  @IsOptional()
  @IsString()
  authorHandle?: string;

  @IsOptional()
  @IsUrl({ require_tld: true }, { message: 'postUrl must be a valid URL' })
  postUrl?: string;



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
