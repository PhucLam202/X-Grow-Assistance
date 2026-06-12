import { Body, Controller, Get, Post } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
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
}
