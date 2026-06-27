import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class PostSegmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;
}

class MediaContextDto {
  @IsIn(['image', 'video_thumbnail', 'gif', 'unknown'])
  type: 'image' | 'video_thumbnail' | 'gif' | 'unknown';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  altText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ocrText?: string;
}

class AuthorContinuationDto extends PostSegmentDto {
  @IsNumber()
  @Min(0)
  @Max(20)
  orderIndex: number;
}

class ExtractionDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsArray()
  @IsString({ each: true })
  warnings: string[];

  @IsArray()
  @IsString({ each: true })
  missingFields: string[];
}

class ContextStateDto {
  @IsIn([true, false])
  isExpanded: boolean;

  @IsArray()
  @IsString({ each: true })
  expansionSources: string[];

  @IsOptional()
  @IsIn([true, false])
  needsMoreContext?: boolean;
}

export class DriverInputDto {
  @IsIn(['x'])
  platform: 'x';

  @ValidateNested()
  @Type(() => PostSegmentDto)
  mainPost: PostSegmentDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaContextDto)
  media?: MediaContextDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PostSegmentDto)
  quotedPost?: PostSegmentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PostSegmentDto)
  repostedPost?: PostSegmentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PostSegmentDto)
  parentPost?: PostSegmentDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AuthorContinuationDto)
  authorContinuations?: AuthorContinuationDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AuthorContinuationDto)
  availableReplies?: AuthorContinuationDto[];

  @ValidateNested()
  @Type(() => ExtractionDto)
  extraction: ExtractionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContextStateDto)
  contextState?: ContextStateDto;
}
