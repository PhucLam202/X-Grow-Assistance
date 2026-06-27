import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { CommentIntelligenceModule } from './comment-intelligence/comment-intelligence.module';
import { FeedIntelligenceModule } from './feed-intelligence/feed-intelligence.module';
import { OpportunityModule } from './opportunity/opportunity.module';
import { PersonalRecommendationModule } from './personal-recommendation/personal-recommendation.module';
import { VisionModule } from './vision/vision.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    AnalyticsModule,
    AuthModule,
    CommentIntelligenceModule,
    FeedIntelligenceModule,
    OpportunityModule,
    PersonalRecommendationModule,
    VisionModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
