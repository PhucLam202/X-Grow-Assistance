import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module';
import { AuthModule } from '../../auth/auth.module';
import { LanguageModule } from '../../common/language/language.module';
import { VisionModule } from '../../vision/vision.module';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { GenerationOrchestrator } from '../../ai/orchestrator/generation-orchestrator';
import { ReplyPacksController } from './reply-packs.controller';
import { GenerationRunRepository } from './generation-run.repository';
import { IdempotencyRepository } from './idempotency.repository';
import { IdempotencyService } from './idempotency.service';
import { ContextNormalizerService } from './niche/context-normalizer.service';
import { LightweightClassifierService } from './niche/lightweight-classifier.service';
import { NicheClassifierService } from './niche/niche-classifier.service';
import { NicheConfidenceService } from './niche/niche-confidence.service';
import { NichePolicyResolver } from './niche/niche-policy.resolver';
import { CandidateGenerationService } from './candidates/candidate-generation.service';
import { CandidatePromptBuilder } from './candidates/candidate-prompt.builder';
import { SelectiveRetryService } from './candidates/selective-retry.service';
import { CandidateValidatorService } from './validation/candidate-validator.service';
import { CandidateRetentionService } from './validation/candidate-retention.service';
import { FactualityFilterService } from './validation/factuality-filter.service';
import { SafetyFilterService } from './validation/safety-filter.service';
import { DiversityRankingService } from './scoring/diversity-ranking.service';
import { EmpathyFitScorer } from './scoring/empathy-fit.scorer';
import { FinalScoreService } from './scoring/final-score.service';
import { RuleScoringService } from './scoring/rule-scoring.service';
import { ScoringFeatureExtractor } from './scoring/scoring-feature.extractor';
import { ReplyPackPipelineService } from './pipeline/reply-pack-pipeline.service';

@Module({
  imports: [
    AiModule,
    AuthModule,
    LanguageModule,
    VisionModule,
    AnalyticsModule,
  ],
  controllers: [ReplyPacksController],
  providers: [
    GenerationOrchestrator,
    GenerationRunRepository,
    IdempotencyRepository,
    IdempotencyService,
    ContextNormalizerService,
    LightweightClassifierService,
    NicheConfidenceService,
    NicheClassifierService,
    NichePolicyResolver,
    // Phase 4 — sinh candidate bằng 1 LLM call.
    CandidatePromptBuilder,
    SelectiveRetryService,
    CandidateGenerationService,
    // Phase 5 — validation/safety/duplicate (exact + lexical).
    SafetyFilterService,
    FactualityFilterService,
    CandidateRetentionService,
    CandidateValidatorService,
    // Phase 6 — scoring/ranking, không LLM call.
    EmpathyFitScorer,
    ScoringFeatureExtractor,
    RuleScoringService,
    FinalScoreService,
    DiversityRankingService,
    // Chuỗi 4 → 5 → 6, và là nơi duy nhất quyết định selective retry.
    ReplyPackPipelineService,
  ],
  exports: [
    GenerationOrchestrator,
    IdempotencyService,
    NicheClassifierService,
    NichePolicyResolver,
    CandidateGenerationService,
    ReplyPackPipelineService,
  ],
})
export class GenerationsModule {}
