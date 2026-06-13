import { Body, Controller, Post } from '@nestjs/common';
import { ScorePostDto } from './dto/score-post.dto';
import { ScoreSnapshotDto } from './dto/score-snapshot.dto';
import { OpportunityService } from './opportunity.service';

@Controller('opportunities')
export class OpportunityController {
  constructor(private readonly opportunityService: OpportunityService) {}

  @Post('score-post')
  scorePost(@Body() dto: ScorePostDto) {
    return this.opportunityService.scorePost(dto);
  }

  @Post('score-snapshot')
  scoreSnapshot(@Body() dto: ScoreSnapshotDto) {
    return this.opportunityService.scoreSnapshot(dto);
  }
}
