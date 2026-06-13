import { Module } from '@nestjs/common';
import { LanguageModule } from '../common/language/language.module';
import { MongoModule } from '../mongo/mongo.module';
import { FeedIntelligenceController } from './feed-intelligence.controller';
import { FeedIntelligenceService } from './feed-intelligence.service';

@Module({
  imports: [LanguageModule, MongoModule],
  controllers: [FeedIntelligenceController],
  providers: [FeedIntelligenceService],
  exports: [FeedIntelligenceService],
})
export class FeedIntelligenceModule {}
