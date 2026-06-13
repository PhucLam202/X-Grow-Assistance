import { Module } from '@nestjs/common';
import { FeedIntelligenceModule } from '../feed-intelligence/feed-intelligence.module';
import { OpportunityController } from './opportunity.controller';
import { OpportunityService } from './opportunity.service';
import { TopOpportunitiesSelector } from './selectors/top-opportunities.selector';

@Module({
  imports: [FeedIntelligenceModule],
  controllers: [OpportunityController],
  providers: [
    OpportunityService,
    TopOpportunitiesSelector,
  ],
})
export class OpportunityModule {}

