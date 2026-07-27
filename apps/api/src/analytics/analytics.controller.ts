import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AnalyticsService } from './analytics.service';
import { DetectPublishedCommentDto } from './dto/detect-published-comment.dto';
import { LogCommentActionDto } from './dto/log-comment-action.dto';
import { SaveFullContextDto } from './dto/save-full-context.dto';
import { TrackUsageEventDto } from './dto/track-usage-event.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @UseGuards(AuthGuard)
  @Post('events')
  track(@Body() dto: TrackUsageEventDto, @CurrentUser() user: AuthUser) {
    return this.analyticsService.track(dto, user.userId);
  }

  @UseGuards(AuthGuard)
  @Get('summary')
  getSummary() {
    return this.analyticsService.getSummary();
  }

  @UseGuards(AuthGuard)
  @Post('full-context')
  saveFullContext(
    @Body() dto: SaveFullContextDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analyticsService.saveFullContext({
      ...dto,
      userId: user.userId,
    });
  }

  @UseGuards(AuthGuard)
  @Post('comment-actions')
  logCommentAction(
    @Body() dto: LogCommentActionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analyticsService.logCommentAction({
      ...dto,
      userId: user.userId,
    });
  }

  @UseGuards(AuthGuard)
  @Post('published-comments/detect')
  detectPublishedComment(
    @Body() dto: DetectPublishedCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analyticsService.detectPublishedComment({
      ...dto,
      userId: user.userId,
    });
  }

  @UseGuards(AuthGuard)
  @Get('comment-overview')
  getCommentOverview(
    @CurrentUser() user: AuthUser,
    @Query('userId') _userId?: string,
  ) {
    return this.analyticsService.getCommentOverview(user.userId);
  }

  @UseGuards(AuthGuard)
  @Get('comment-history')
  getCommentHistory(
    @CurrentUser() user: AuthUser,
    @Query('userId') _userId?: string,
    @Query('language') language?: string,
    @Query('tone') tone?: string,
    @Query('used') used?: string,
    @Query('postType') postType?: string,
    @Query('actionType') actionType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analyticsService.getCommentHistory({
      userId: user.userId,
      language,
      tone,
      used,
      postType,
      actionType,
      limit,
    });
  }

  @UseGuards(AuthGuard)
  @Get('growth-report')
  getGrowthReport(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.analyticsService.getGrowthReport(
      user.userId,
      Math.min(Number(days ?? 30), 90),
    );
  }

  @UseGuards(AuthGuard)
  @Post('draft-post')
  draftPost(
    @Body() body: { topic?: string; language: string; count?: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.analyticsService.draftPost(
      user.userId,
      body.topic,
      body.language,
      body.count ?? 3,
    );
  }
}
