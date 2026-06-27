import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class DetectPublishedCommentDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  userId?: string;

  @IsString()
  @MaxLength(120)
  postId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  suggestionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  parentPostUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  parentTweetId?: string;

  @IsString()
  @MaxLength(5000)
  commentText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  commentUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  commentTweetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  commentLanguage?: string;

  @IsOptional()
  @IsBoolean()
  wasAiGenerated?: boolean;

  @IsOptional()
  @IsBoolean()
  wasEdited?: boolean;

  @IsIn(['dom_after_send', 'manual_paste', 'user_confirmed'])
  detectedBy!: 'dom_after_send' | 'manual_paste' | 'user_confirmed';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  detectionConfidence?: number;

  @IsOptional()
  @IsObject()
  rawDetection?: Record<string, unknown>;
}
