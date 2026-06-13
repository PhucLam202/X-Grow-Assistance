import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IngestActionLogDto } from './dto/ingest-action-log.dto';
import { ManualPerformanceUpdateDto } from './dto/manual-performance-update.dto';
import { PersonalRecommendationService } from './personal-recommendation.service';

@Controller()
export class PersonalRecommendationController {
  constructor(private readonly personalRecommendationService: PersonalRecommendationService) {}

  @Get('personal-profile')
  getPersonalProfile(@Query('userId') userId?: string) {
    return this.personalRecommendationService.getPersonalProfile(userId);
  }

  @Post('performance/manual-update')
  manualUpdate(@Body() dto: ManualPerformanceUpdateDto) {
    return this.personalRecommendationService.manualPerformanceUpdate(dto);
  }

  @Post('personal-recommendation/ingest-action-log')
  ingestActionLog(@Body() dto: IngestActionLogDto) {
    return this.personalRecommendationService.ingestActionLog(dto);
  }

  @Get('comment-memory')
  getCommentMemory(@Query('userId') userId?: string) {
    return this.personalRecommendationService.getCommentMemory(userId);
  }

  @Post('comment-memory/rebuild')
  rebuildCommentMemory(@Body('userId') userId?: string) {
    return this.personalRecommendationService.rebuildCommentMemory(userId);
  }

  @Post('comment-memory/check-similarity')
  checkCommentSimilarity(
    @Body('commentText') commentText: string,
    @Body('userId') userId?: string,
  ) {
    return this.personalRecommendationService.checkCommentSimilarity(commentText, userId);
  }
}
