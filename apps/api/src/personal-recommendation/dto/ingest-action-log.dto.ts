import { IsIn, IsNumber, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';

export class IngestActionLogDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;

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
  @MaxLength(80)
  username?: string;

  @IsIn([
    'generated_comment',
    'copied_comment',
    'inserted_comment',
    'manually_sent_comment',
    'marked_done',
    'saved_as_idea',
    'skipped',
  ])
  actionType!:
    | 'generated_comment'
    | 'copied_comment'
    | 'inserted_comment'
    | 'manually_sent_comment'
    | 'marked_done'
    | 'saved_as_idea'
    | 'skipped';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  recommendedAction?: string;

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseOpportunityScore?: number;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
