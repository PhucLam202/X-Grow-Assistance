import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ManualPerformanceUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  actionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  candidateId?: string;

  @IsOptional()
  @IsUrl({ require_tld: true }, { message: 'postUrl must be a valid URL' })
  postUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  commentText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  niche?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tone?: string;

  @IsObject()
  metrics!: {
    likes?: number;
    replies?: number;
    reposts?: number;
    views?: number;
    profileVisits?: number;
    postLikes?: number;
    postReplies?: number;
    postReposts?: number;
    postViews?: number;
  };

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
