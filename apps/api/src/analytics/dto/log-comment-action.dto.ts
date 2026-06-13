import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class LogCommentActionDto {
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

  @IsIn(['generated', 'copied', 'inserted', 'edited', 'sent_manually', 'sent_detected', 'mark_as_sent', 'skipped', 'saved', 'regenerated'])
  actionType!:
    | 'generated'
    | 'copied'
    | 'inserted'
    | 'edited'
    | 'sent_manually'
    | 'sent_detected'
    | 'mark_as_sent'
    | 'skipped'
    | 'saved'
    | 'regenerated';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  commentText?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
