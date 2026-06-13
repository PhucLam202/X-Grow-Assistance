import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const CONTENT_TYPES = [
  'text',
  'image',
  'image_meme_candidate',
  'mixed',
  'unknown',
] as const;

class OpportunityMetricsDto {
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
}

class OpportunityTimestampDto {
  @IsOptional()
  @IsString()
  postedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  postedAtText?: string;

  @IsString()
  extractedAt: string;
}

class OpportunityMediaDto {
  @IsIn(['image'])
  type: 'image';

  @IsUrl({ require_tld: true }, { message: 'media url must be a valid URL' })
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string;
}

class OpportunityCandidateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  id?: string;

  @IsOptional()
  @IsUrl({ require_tld: true }, { message: 'postUrl must be a valid URL' })
  postUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tweetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorName?: string;

  @IsString()
  @MaxLength(4000)
  text: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  detectedLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  detectedNiche?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  detectedTopic?: string;

  @IsOptional()
  @IsIn(CONTENT_TYPES)
  contentType?: (typeof CONTENT_TYPES)[number];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpportunityMediaDto)
  media?: OpportunityMediaDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  mediaCount?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => OpportunityMetricsDto)
  metrics?: OpportunityMetricsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OpportunityTimestampDto)
  timestamps?: OpportunityTimestampDto;

  @IsOptional()
  @IsBoolean()
  hasQuestion?: boolean;

  @IsOptional()
  @IsBoolean()
  needsVisionAnalysis?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  feedScore?: number;
}

class OpportunityUserContextDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetNiches?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredCommentLanguages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recentUsedComments?: string[];
}

export class ScorePostDto {
  @ValidateNested()
  @Type(() => OpportunityCandidateDto)
  candidate: OpportunityCandidateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OpportunityUserContextDto)
  userContext?: OpportunityUserContextDto;
}
