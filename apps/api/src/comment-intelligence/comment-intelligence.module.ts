import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { LanguageModule } from '../common/language/language.module';
import { MongoModule } from '../mongo/mongo.module';
import { AiDriverService } from './ai-driver.service';
import { CommentComposerService } from './composer/comment-composer.service';
import { CommentQualityRankerService } from './composer/comment-quality-ranker.service';
import { CommentStyleMapperService } from './composer/comment-style-mapper.service';
import { DriverDecisionReplyPackAdapterService } from './composer/driver-decision-reply-pack-adapter.service';
import { CommentIntelligenceController } from './comment-intelligence.controller';
import { CommentStrategyEngineService } from './comment-strategy-engine.service';
import { CommentAiHarnessService } from './harness/comment-ai-harness.service';
import { HarnessLogRepository } from './harness/harness-log.repository';
import { ToolRegistryService } from './harness/tool-registry.service';
import { ToolRouterService } from './harness/tool-router.service';
import { AuthorContinuationExtractorService } from './tools/author-continuation-extractor.service';
import { ContextPackageNormalizerService } from './tools/context-package-normalizer.service';
import { ContinuationSignalDetectorService } from './tools/continuation-signal-detector.service';
import { RelationshipContextExtractorService } from './tools/relationship-context-extractor.service';

@Module({
  imports: [AiModule, AuthModule, LanguageModule, MongoModule],
  controllers: [CommentIntelligenceController],
  providers: [
    AiDriverService,
    CommentStrategyEngineService,
    ContinuationSignalDetectorService,
    AuthorContinuationExtractorService,
    RelationshipContextExtractorService,
    ContextPackageNormalizerService,
    CommentStyleMapperService,
    DriverDecisionReplyPackAdapterService,
    CommentQualityRankerService,
    CommentComposerService,
    ToolRegistryService,
    ToolRouterService,
    HarnessLogRepository,
    CommentAiHarnessService,
  ],
  exports: [
    AiDriverService,
    CommentStrategyEngineService,
    ContextPackageNormalizerService,
    CommentComposerService,
    CommentAiHarnessService,
  ],
})
export class CommentIntelligenceModule {}
