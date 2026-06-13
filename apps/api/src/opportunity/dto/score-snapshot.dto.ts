import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

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

export class ScoreSnapshotDto {
  @IsString()
  @MaxLength(120)
  snapshotId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OpportunityUserContextDto)
  userContext?: OpportunityUserContextDto;
}
