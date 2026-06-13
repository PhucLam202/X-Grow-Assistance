import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AnalyticsModule } from './analytics/analytics.module';
import { FeedIntelligenceModule } from './feed-intelligence/feed-intelligence.module';
import { OpportunityModule } from './opportunity/opportunity.module';
import { PersonalRecommendationModule } from './personal-recommendation/personal-recommendation.module';
import { ReplyPackModule } from './reply-pack/reply-pack.module';
import { VisionModule } from './vision/vision.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    AnalyticsModule,
    FeedIntelligenceModule,
    OpportunityModule,
    PersonalRecommendationModule,
    ReplyPackModule,
    VisionModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
