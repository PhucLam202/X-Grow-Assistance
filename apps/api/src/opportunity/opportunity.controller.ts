import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { EvaluateOpportunityRequestDto } from './dto/evaluate-opportunity.dto';
import { EvaluateOpportunityBatchRequestDto } from './dto/evaluate-opportunity-batch.dto';
import { ScorePostDto } from './dto/score-post.dto';
import { ScoreSnapshotDto } from './dto/score-snapshot.dto';
import {
  OpportunityBatchResponse,
  OpportunityScoreResponse,
} from './types/opportunity.types';
import { OpportunityService } from './opportunity.service';

@Controller('opportunities')
export class OpportunityController {
  constructor(private readonly opportunityService: OpportunityService) {}

  @Post('evaluate')
  @UseGuards(AuthGuard)
  async evaluate(
    @CurrentUser() user: AuthUser,
    @Body() dto: EvaluateOpportunityRequestDto,
  ): Promise<OpportunityScoreResponse> {
    return this.opportunityService.evaluate(user.userId, dto.post, dto.context);
  }

  @Post('evaluate-batch')
  @UseGuards(AuthGuard)
  async evaluateBatch(
    @CurrentUser() user: AuthUser,
    @Body() dto: EvaluateOpportunityBatchRequestDto,
  ): Promise<OpportunityBatchResponse> {
    return this.opportunityService.evaluateBatch(
      user.userId,
      dto.posts,
      dto.context,
    );
  }

  @Post('score-post')
  scorePost(@Body() dto: ScorePostDto) {
    return this.opportunityService.scorePost(dto);
  }

  @Post('score-snapshot')
  scoreSnapshot(@Body() dto: ScoreSnapshotDto) {
    return this.opportunityService.scoreSnapshot(dto);
  }
}
