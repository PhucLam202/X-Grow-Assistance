import { IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SaveFullContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  postUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tweetId?: string;

  @IsIn(['original_post', 'reply', 'quote_post', 'repost', 'thread_post', 'unknown'])
  postType!: 'original_post' | 'reply' | 'quote_post' | 'repost' | 'thread_post' | 'unknown';

  @IsOptional()
  @IsString()
  @MaxLength(160)
  authorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  language?: string;

  @IsOptional()
  @IsObject()
  rawContext?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  extractionConfidence?: number;

  @IsOptional()
  @IsArray()
  extractionWarnings?: string[];

  @IsOptional()
  @IsArray()
  media?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsArray()
  relatedPosts?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsArray()
  relations?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsObject()
  analysis?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  suggestions?: Array<Record<string, unknown>>;
}
