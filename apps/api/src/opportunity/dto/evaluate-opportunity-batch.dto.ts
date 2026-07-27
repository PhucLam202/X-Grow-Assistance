import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator';
import {
  EvaluatePostDto,
  EvaluateContextDto,
} from './evaluate-opportunity.dto';

export class EvaluateOpportunityBatchRequestDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EvaluatePostDto)
  posts: EvaluatePostDto[];

  @ValidateNested()
  @Type(() => EvaluateContextDto)
  context?: EvaluateContextDto;
}
