import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const FEED_SNAPSHOT_SOURCES = [
  'x_home_feed',
  'x_search_feed',
  'x_profile_feed',
  'x_unknown_feed',
] as const;

class FeedPostMediaDto {
  @IsIn(['image'])
  type: 'image';

  @IsUrl({ require_tld: true }, { message: 'media url must be a valid URL' })
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string;
}

class FeedPostMetricsDto {
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

class FeedPostTimestampsDto {
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

class FeedPostCandidateDto {
  @IsString()
  @MaxLength(240)
  localId: string;

  @IsIn(['x'])
  platform: 'x';

  @IsOptional()
  @IsUrl({ require_tld: true }, { message: 'postUrl must be a valid URL' })
  postUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tweetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  username?: string;

  @IsString()
  @MaxLength(4000)
  text: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeedPostMediaDto)
  media: FeedPostMediaDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => FeedPostMetricsDto)
  metrics?: FeedPostMetricsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FeedPostTimestampsDto)
  timestamps?: FeedPostTimestampsDto;

  @IsString()
  detectedAt: string;

  @IsIn(['feed_scan'])
  source: 'feed_scan';
}

export class SubmitFeedSnapshotDto {
  @IsString()
  @MaxLength(120)
  snapshotId: string;

  @IsIn(FEED_SNAPSHOT_SOURCES)
  source: (typeof FEED_SNAPSHOT_SOURCES)[number];

  @IsString()
  capturedAt: string;

  @IsInt()
  @Min(0)
  @Max(100)
  visiblePostCount: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeedPostCandidateDto)
  posts: FeedPostCandidateDto[];
}
