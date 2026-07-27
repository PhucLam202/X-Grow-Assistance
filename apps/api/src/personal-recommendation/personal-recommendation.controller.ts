import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { IngestActionLogDto } from './dto/ingest-action-log.dto';
import { ManualPerformanceUpdateDto } from './dto/manual-performance-update.dto';
import { PersonalRecommendationService } from './personal-recommendation.service';

@Controller()
@UseGuards(AuthGuard)
export class PersonalRecommendationController {
  constructor(
    private readonly personalRecommendationService: PersonalRecommendationService,
  ) {}

  @Get('personal-profile')
  getPersonalProfile(@CurrentUser() user: AuthUser) {
    return this.personalRecommendationService.getPersonalProfile(user.userId);
  }

  @Post('performance/manual-update')
  manualUpdate(
    @Body() dto: ManualPerformanceUpdateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.personalRecommendationService.manualPerformanceUpdate({
      ...dto,
      userId: user.userId,
    });
  }

  @Post('personal-recommendation/ingest-action-log')
  ingestActionLog(
    @Body() dto: IngestActionLogDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.personalRecommendationService.ingestActionLog({
      ...dto,
      userId: user.userId,
    });
  }

  @Get('comment-memory')
  getCommentMemory(@CurrentUser() user: AuthUser) {
    return this.personalRecommendationService.getCommentMemory(user.userId);
  }

  @Post('comment-memory/rebuild')
  rebuildCommentMemory(@CurrentUser() user: AuthUser) {
    return this.personalRecommendationService.rebuildCommentMemory(user.userId);
  }

  @Post('comment-memory/check-similarity')
  checkCommentSimilarity(
    @Body('commentText') commentText: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.personalRecommendationService.checkCommentSimilarity(
      commentText,
      user.userId,
    );
  }
}
