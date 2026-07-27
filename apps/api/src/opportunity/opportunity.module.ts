import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FeedIntelligenceModule } from '../feed-intelligence/feed-intelligence.module';
import { OpportunityController } from './opportunity.controller';
import { OpportunityService } from './opportunity.service';
import { TopOpportunitiesSelector } from './selectors/top-opportunities.selector';
import { InMemoryCacheService } from '../infrastructure/cache/in-memory-cache.service';

@Module({
  imports: [AuthModule, FeedIntelligenceModule],
  controllers: [OpportunityController],
  providers: [
    OpportunityService,
    TopOpportunitiesSelector,
    InMemoryCacheService,
  ],
})
export class OpportunityModule {}
