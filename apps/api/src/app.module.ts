import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { CommentIntelligenceModule } from './comment-intelligence/comment-intelligence.module';
import { FeedIntelligenceModule } from './feed-intelligence/feed-intelligence.module';
import { GenerationsModule } from './modules/generations/generations.module';
import { OpportunityModule } from './opportunity/opportunity.module';
import { PersonalRecommendationModule } from './personal-recommendation/personal-recommendation.module';
import { VisionModule } from './vision/vision.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    // ponytail: 30 req/min global; tighten per-endpoint with @Throttle() when needed
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    AnalyticsModule,
    AuthModule,
    CommentIntelligenceModule,
    FeedIntelligenceModule,
    GenerationsModule,
    OpportunityModule,
    PersonalRecommendationModule,
    VisionModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
