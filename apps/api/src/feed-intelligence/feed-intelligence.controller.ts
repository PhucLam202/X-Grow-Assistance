import { Body, Controller, Post } from '@nestjs/common';
import { SubmitFeedSnapshotDto } from './dto/submit-feed-snapshot.dto';
import { FeedIntelligenceService } from './feed-intelligence.service';

@Controller('feed')
export class FeedIntelligenceController {
  constructor(
    private readonly feedIntelligenceService: FeedIntelligenceService,
  ) {}

  @Post('snapshot')
  submitSnapshot(@Body() dto: SubmitFeedSnapshotDto) {
    return this.feedIntelligenceService.submitSnapshot(dto);
  }
}
