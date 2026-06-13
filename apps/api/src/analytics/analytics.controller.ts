import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { DetectPublishedCommentDto } from './dto/detect-published-comment.dto';
import { LogCommentActionDto } from './dto/log-comment-action.dto';
import { SaveFullContextDto } from './dto/save-full-context.dto';
import { TrackUsageEventDto } from './dto/track-usage-event.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('events')
  track(@Body() dto: TrackUsageEventDto) {
    return this.analyticsService.track(dto);
  }

  @Get('summary')
  getSummary() {
    return this.analyticsService.getSummary();
  }

  @Post('full-context')
  saveFullContext(@Body() dto: SaveFullContextDto) {
    return this.analyticsService.saveFullContext(dto);
  }

  @Post('comment-actions')
  logCommentAction(@Body() dto: LogCommentActionDto) {
    return this.analyticsService.logCommentAction(dto);
  }

  @Post('published-comments/detect')
  detectPublishedComment(@Body() dto: DetectPublishedCommentDto) {
    return this.analyticsService.detectPublishedComment(dto);
  }

  @Get('comment-overview')
  getCommentOverview(@Query('userId') userId?: string) {
    return this.analyticsService.getCommentOverview(userId);
  }

  @Get('comment-history')
  getCommentHistory(
    @Query('userId') userId?: string,
    @Query('language') language?: string,
    @Query('tone') tone?: string,
    @Query('used') used?: string,
    @Query('postType') postType?: string,
    @Query('actionType') actionType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analyticsService.getCommentHistory({ userId, language, tone, used, postType, actionType, limit });
  }
}
