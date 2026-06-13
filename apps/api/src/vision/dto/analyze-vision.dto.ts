import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
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

export class VisionPostDto {
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

export class VisionMediaDto {
  @IsIn(['image'])
  type: 'image';

  @IsUrl({ require_tld: true }, { message: 'media url must be a valid URL' })
  url: string;

  @IsOptional()
  @IsString()
  altText?: string;
}

export class VisionOptionsDto {
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

export class AnalyzeVisionDto {
  @ValidateNested()
  @Type(() => VisionPostDto)
  post: VisionPostDto;

  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => VisionMediaDto)
  media: VisionMediaDto[];

  @IsOptional()
  @IsObject()
  postContext?: Record<string, unknown>;

  @ValidateNested()
  @Type(() => VisionOptionsDto)
  options: VisionOptionsDto;
}
