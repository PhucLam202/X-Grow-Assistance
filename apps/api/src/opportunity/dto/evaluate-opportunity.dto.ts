import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const CONTENT_TYPES = ['text', 'image', 'video', 'mixed', 'unknown'] as const;

const POST_TYPES = ['original', 'reply', 'quote', 'repost'] as const;

export class EvaluateMetricsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  replies?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reposts?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  likes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  views?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bookmarks?: number;
}

export class EvaluatePostDto {
  @IsIn(['x'])
  platform: 'x';

  @IsString()
  @MaxLength(120)
  postId: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EvaluateMetricsDto)
  metrics?: EvaluateMetricsDto;

  @IsIn(CONTENT_TYPES)
  contentType: (typeof CONTENT_TYPES)[number];

  @IsIn(POST_TYPES)
  postType: (typeof POST_TYPES)[number];

  @IsOptional()
  @IsString()
  createdAt?: string;
}

export class EvaluateContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  niche?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  preferredTopics?: string[];
}

export class EvaluateOpportunityRequestDto {
  @ValidateNested()
  @Type(() => EvaluatePostDto)
  post: EvaluatePostDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EvaluateContextDto)
  context?: EvaluateContextDto;
}
