import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiConfigService } from '../ai.config';
import { VisionAnalyzeService } from '../../vision/vision-analyze.service';
import { LanguageDetectorService } from '../../common/language/language-detector.service';
import { GenerationRunRepository } from '../../modules/generations/generation-run.repository';
import { AnalyticsService } from '../../analytics/analytics.service';
import { NormalizedReplyPackRequest } from '../../modules/generations/mappers/legacy-request.mapper';
import { ReplyPackResponse } from '../../modules/generations/dto/reply-pack-response.dto';
import { ReplyAnalysisDto } from '../../modules/generations/dto/reply-analysis.dto';
import { NicheClassifierService } from '../../modules/generations/niche/niche-classifier.service';
import { NichePolicyResolver } from '../../modules/generations/niche/niche-policy.resolver';
import type { NicheDetectionResult } from '../../modules/generations/niche/niche.types';
import { ReplyPackPipelineService } from '../../modules/generations/pipeline/reply-pack-pipeline.service';
import { toCandidateVisionContext } from '../../modules/generations/candidates/candidate.types';
import {
  CANDIDATE_PROMPT_VERSION,
  type CandidateAnalysis,
} from '../../modules/generations/candidates/candidate.types';
import { toSuggestionDto } from '../../modules/generations/mappers/scored-candidate.mapper';
import { toReplyLanguage } from '../../modules/generations/types/style.types';
import {
  GenerationRun,
  PersistedSuggestion,
} from '../../modules/generations/types/generation-run.types';
import { VisionContext } from '../../vision/types/vision.types';
import { AnalyzeVisionDto } from '../../vision/dto/analyze-vision.dto';
import { RequestContext } from '../../common/types/request-context.types';
import { ErrorCodes } from '../../common/errors/error-codes';
import { ApplicationError } from '../../common/errors/application.error';
import { AiExecutionMetadata, AiExecutionResult } from '../ai.types';

import { IdempotencyService } from '../../modules/generations/idempotency.service';

function extractStableErrorCode(error: unknown): string {
  if (error instanceof ApplicationError) {
    return error.code;
  }
  if (error instanceof BadRequestException) {
    return ErrorCodes.INVALID_POST_CONTEXT;
  }
  if (error instanceof HttpException) {
    const status = error.getStatus();
    if (status === 400) return ErrorCodes.INVALID_POST_CONTEXT;
    if (status === 429) return ErrorCodes.AI_PROVIDER_RATE_LIMITED;
    if (status === 504) return ErrorCodes.AI_PROVIDER_TIMEOUT;
  }
  const knownCodes: readonly string[] = Object.values(ErrorCodes);
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as Record<string, unknown>).code === 'string'
  ) {
    const codeVal = (error as Record<string, unknown>).code as string;
    if (knownCodes.includes(codeVal)) {
      return codeVal;
    }
  }
  return ErrorCodes.GENERATION_FAILED;
}

/**
 * Ghép `analysis` của candidate call với vision context.
 *
 * Thứ tự ưu tiên: model nói gì trong cùng call sinh candidate → cái gì vision
 * analysis đã nói → bỏ trống. Không bao giờ gọi thêm LLM để lấp.
 */
function pickAnalysisFields(
  analysis: CandidateAnalysis | undefined,
  visionContext: VisionContext | undefined,
): Pick<
  ReplyPackResponse,
  | 'summary'
  | 'topic'
  | 'theme'
  | 'sentiment'
  | 'translation'
  | 'commentStrategy'
  | 'context'
> {
  const pick = (...values: Array<string | undefined>): string | undefined =>
    values.find((value) => Boolean(value && value.trim()));

  const fields = {
    summary: pick(analysis?.summary, visionContext?.summary),
    topic: pick(analysis?.topic, visionContext?.topic),
    theme: pick(visionContext?.theme),
    sentiment: pick(analysis?.sentiment, visionContext?.sentiment),
    translation: pick(analysis?.translation, visionContext?.translation),
    commentStrategy: pick(
      analysis?.commentStrategy,
      visionContext?.combinedContext?.commentStrategy,
    ),
    context: pick(visionContext?.combinedContext?.explanation),
  };

  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}

@Injectable()
export class GenerationOrchestrator {
  private readonly logger = new Logger(GenerationOrchestrator.name);

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly pipeline: ReplyPackPipelineService,
    private readonly visionAnalyzeService: VisionAnalyzeService,
    private readonly languageDetector: LanguageDetectorService,
    private readonly runRepository: GenerationRunRepository,
    private readonly nicheClassifier: NicheClassifierService,
    private readonly nichePolicyResolver: NichePolicyResolver,
    @Optional() private readonly analyticsService?: AnalyticsService,
    @Optional() private readonly idempotencyService?: IdempotencyService,
  ) {}

  async generate(
    request: NormalizedReplyPackRequest,
    context?: RequestContext,
  ): Promise<ReplyPackResponse> {
    const startTime = performance.now();
    const generationRunId = randomUUID();
    const requestId =
      context?.requestId && context.requestId.trim().length > 0
        ? context.requestId
        : randomUUID();

    const userId = context?.userId ?? 'anonymous';
    let idempotencyKeyHash: string | undefined;

    if (this.idempotencyService && context?.idempotencyKey) {
      const idempotencyResult = await this.idempotencyService.handleBegin(
        userId,
        context.idempotencyKey,
        request,
        generationRunId,
      );

      if (idempotencyResult.idempotencyActive) {
        if (idempotencyResult.isCompleted && idempotencyResult.storedResponse) {
          return idempotencyResult.storedResponse;
        }
        idempotencyKeyHash = idempotencyResult.keyHash;
      }
    }

    const hasMedia = request.post.media && request.post.media.length > 0;
    const visionEnabled = request.options.visionEnabled && hasMedia;

    let analysisMode: 'text' | 'vision' | 'text_only_fallback';
    let fallbackUsed = false;
    let detectedLanguage: ReturnType<LanguageDetectorService['detect']>;
    let targetLanguage: string;
    let translationLanguage: 'vi' | 'en';
    let visionContextResult: AiExecutionResult<VisionContext> | null = null;
    let visionLatencyMs: number | undefined;
    // Hoisted so a later failure (e.g. AI provider timeout) can still report
    // the niche that was already resolved before the failure happened.
    let nicheResult: NicheDetectionResult | undefined;

    // Determine initial primary provider and model for processing run creation
    const initialPrimaryProvider = visionEnabled
      ? this.aiConfig.getVisionProviderName()
      : this.aiConfig.getTextProviderName();
    const initialPrimaryModel = visionEnabled
      ? this.aiConfig.getProviderDefaultVisionModel(initialPrimaryProvider)
      : this.aiConfig.getTextProviderEndpoint().model;

    // 1. Persist initial processing run with primary provider/model BEFORE AI execution
    const initialRun: GenerationRun = {
      id: generationRunId,
      requestId,
      postId: request.post.postId,
      status: 'processing',
      suggestions: [],
      provider: initialPrimaryProvider,
      model: initialPrimaryModel,
      primaryProvider: initialPrimaryProvider,
      primaryModel: initialPrimaryModel,
      promptVersion: CANDIDATE_PROMPT_VERSION,
      latencyMs: 0,
      fallbackUsed: false,
      createdAt: new Date().toISOString(),
    };

    try {
      await this.runRepository.create(initialRun);
    } catch (repoError) {
      this.logger.warn(
        `Failed to create initial processing generation run: ${(repoError as Error).message}`,
      );
    }

    try {
      if (visionEnabled) {
        const visionStart = performance.now();
        const visionDto = this.buildVisionDto(request);
        visionContextResult =
          await this.visionAnalyzeService.analyzeContext(visionDto);
        visionLatencyMs = Math.round(performance.now() - visionStart);

        const vData = visionContextResult.data;

        if (vData.analysisMode === 'vision_context') {
          analysisMode = 'vision';
          detectedLanguage = vData.detectedLanguage;
          targetLanguage =
            request.options.targetLanguage === 'same_as_original'
              ? detectedLanguage
              : request.options.targetLanguage;
          translationLanguage = vData.translationLanguage;

          if (visionContextResult.execution.fallbackUsed) {
            fallbackUsed = true;
          }
        } else {
          if (!request.post.text || request.post.text.trim().length === 0) {
            throw new BadRequestException(
              'Vision analysis failed and no usable post text available for fallback',
            );
          }
          analysisMode = 'text_only_fallback';
          fallbackUsed = true;
          detectedLanguage = this.languageDetector.detect(request.post.text);
          targetLanguage =
            request.options.targetLanguage === 'same_as_original'
              ? detectedLanguage
              : request.options.targetLanguage;
          translationLanguage =
            request.options.explanationLanguage === 'en' ||
            request.options.explanationLanguage === 'vi'
              ? request.options.explanationLanguage
              : detectedLanguage === 'en'
                ? 'en'
                : 'vi';
        }
      } else {
        analysisMode = 'text';
        detectedLanguage = this.languageDetector.detect(request.post.text);
        targetLanguage =
          request.options.targetLanguage === 'same_as_original'
            ? detectedLanguage
            : request.options.targetLanguage;
        translationLanguage =
          request.options.explanationLanguage === 'en' ||
          request.options.explanationLanguage === 'vi'
            ? request.options.explanationLanguage
            : detectedLanguage === 'en'
              ? 'en'
              : 'vi';
      }

      // Runs after vision so image-derived text can feed the cascade, and
      // before generation so Phase 4 can consume the result. No extra LLM call.
      nicheResult = this.nicheClassifier.classify({
        postText: request.post.text,
        hashtags: request.post.hashtags,
        altText: request.post.media
          ?.map((media) => media.altText)
          .filter((text): text is string => Boolean(text))
          .join(' '),
        visionText: this.buildVisionText(visionContextResult?.data),
        requestedNiche: request.options.niche,
      });

      // Policy hiệu lực cho request này (Phase 3). Không gọi LLM.
      const nichePolicy =
        this.nichePolicyResolver.resolveFromDetection(nicheResult);

      const visionContext = toCandidateVisionContext(visionContextResult?.data);

      const aiStart = performance.now();
      const pipelineResult = await this.pipeline.run({
        postContext: {
          ...(request.post.text ? { text: request.post.text } : {}),
          language: detectedLanguage,
          // Sắc thái từ vision analysis nếu có; nếu không, chính candidate call
          // sẽ trả `analysis.sentiment` — nhưng nó về sau prompt, nên request
          // này chỉ dùng được nguồn vision.
          ...(visionContextResult?.data.sentiment
            ? { sentiment: visionContextResult.data.sentiment }
            : {}),
        },
        ...(visionContext ? { visionContext } : {}),
        nicheResult,
        nichePolicy,
        userStyle: {
          preferredLength: request.options.length,
        },
        options: {
          replyCount: request.options.replyCount,
          length: request.options.length,
          energy: request.options.energy,
          language: toReplyLanguage(targetLanguage),
          emojiLevel: request.options.emojiLevel,
          tone: request.options.toneSelection,
          intent: request.options.intent,
          explanationLanguage: translationLanguage,
        },
      });

      const aiLatencyMs = Math.round(performance.now() - aiStart);
      const totalLatencyMs = Math.round(performance.now() - startTime);

      const executionMeta: AiExecutionMetadata = pipelineResult.execution;
      const analysis = pipelineResult.analysis;

      // Model được phép chốt lại niche trong cùng call (Phase 4) — báo cáo kết
      // quả cuối, không phải phỏng đoán của Phase 2. Hàm này tự no-op khi Phase
      // 2 đã chắc chắn.
      nicheResult = this.nicheClassifier.applyGenerationTimeClassification(
        nicheResult,
        pipelineResult.resolvedNiche?.niche,
        pipelineResult.resolvedNiche?.confidence,
      );

      const suggestions = pipelineResult.suggestions.map((candidate, index) =>
        toSuggestionDto(candidate, index, {
          generationRunId,
          penalties: pipelineResult.penalties,
        }),
      );

      const persistedSuggestions: PersistedSuggestion[] = suggestions.map(
        (suggestion) => ({
          suggestionId: suggestion.suggestionId,
          text: suggestion.text,
          meaningVi: suggestion.meaningVi ?? '',
          whyItWorks: suggestion.whyItWorks ?? '',
          score: suggestion.score,
          risk: suggestion.risk,
          tone: suggestion.tone,
          niche: suggestion.niche,
          ...(suggestion.scores ? { scores: { ...suggestion.scores } } : {}),
          ...(suggestion.referencedConcept
            ? { referencedConcept: suggestion.referencedConcept }
            : {}),
        }),
      );

      const combinedFallbackUsed = fallbackUsed || executionMeta.fallbackUsed;
      const visionUsage = visionContextResult?.execution.visionUsage;
      const replyPackUsage = executionMeta.replyPackUsage;

      // Update completed run with actual final provider/model and execution metadata
      await this.runRepository.markCompleted(generationRunId, {
        suggestions: persistedSuggestions,
        analysisMode,
        fallbackUsed: combinedFallbackUsed,
        latencyMs: totalLatencyMs,
        aiLatencyMs,
        visionLatencyMs,
        provider: executionMeta.finalProvider,
        model: executionMeta.finalModel,
        primaryProvider: executionMeta.primaryProvider,
        primaryModel: executionMeta.primaryModel,
        fallbackReason: executionMeta.fallbackReason,
        attemptCount: executionMeta.attemptCount,
        replyPackUsage,
        visionUsage,
        primaryNiche: nicheResult.primaryNiche,
        nicheConfidence: nicheResult.confidence,
        nicheClassificationMethod: nicheResult.classificationMethod,
        candidatesGenerated: pipelineResult.stats.generated,
        candidatesRejected: pipelineResult.stats.rejected,
        duplicatesDetected: pipelineResult.stats.duplicates,
        retryUsed: pipelineResult.stats.retryUsed,
        scoringMethod: pipelineResult.stats.scoringMethod,
        resolvedPolicyVersion: nichePolicy.resolvedVersion,
      });

      if (this.analyticsService) {
        this.analyticsService
          .trackGenerationEvent({
            eventName: 'generation_completed',
            userId: context?.userId,
            requestId,
            generationRunId,
            postId: request.post.postId,
            promptVersion: CANDIDATE_PROMPT_VERSION,
            provider: executionMeta.finalProvider,
            model: executionMeta.finalModel,
            latencyMs: totalLatencyMs,
            analysisMode,
            fallbackUsed: combinedFallbackUsed,
            replyPackUsage,
            visionUsage,
            niche: nicheResult.primaryNiche,
            nicheConfidence: nicheResult.confidence,
            nicheClassificationMethod: nicheResult.classificationMethod,
            needsGenerationTimeClassification:
              nicheResult.needsGenerationTimeClassification,
            candidatesGenerated: pipelineResult.stats.generated,
            candidatesRejected: pipelineResult.stats.rejected,
            duplicatesDetected: pipelineResult.stats.duplicates,
            retryUsed: pipelineResult.stats.retryUsed,
            scoringMethod: pipelineResult.stats.scoringMethod,
            resolvedPolicyVersion: nichePolicy.resolvedVersion,
          })
          .catch((err) => {
            this.logger.warn(
              `Failed to track analytics completion event: ${(err as Error).message}`,
            );
          });
      }

      const response: ReplyPackResponse = {
        generationRunId,
        requestId,
        analysisMode,
        analysis: this.buildAnalysis(
          nicheResult,
          analysisMode,
          detectedLanguage,
          combinedFallbackUsed,
        ),
        detectedLanguage,
        // Analysis giờ đến từ CÙNG call sinh candidate (Phase 4 `analysis`
        // block), với vision context làm nguồn dự phòng khi model bỏ sót. Không
        // có LLM call thứ hai nào để lấy mấy field này.
        ...pickAnalysisFields(analysis, visionContextResult?.data),
        suggestions,
        metadata: {
          provider: executionMeta.finalProvider,
          model: executionMeta.finalModel,
          promptVersion: CANDIDATE_PROMPT_VERSION,
          latencyMs: totalLatencyMs,
          fallbackUsed: combinedFallbackUsed,
          pipeline: pipelineResult.stats,
        },
        warnings: this.buildWarnings(analysisMode, pipelineResult.warnings),
      };

      if (this.idempotencyService && idempotencyKeyHash) {
        await this.idempotencyService.handleComplete(
          userId,
          idempotencyKeyHash,
          response,
        );
      }

      return response;
    } catch (error) {
      const totalLatencyMs = Math.round(performance.now() - startTime);
      const errorCode = extractStableErrorCode(error);

      await this.runRepository.markFailed(generationRunId, {
        errorCode,
        latencyMs: totalLatencyMs,
      });

      if (this.analyticsService) {
        this.analyticsService
          .trackGenerationEvent({
            eventName: 'generation_failed',
            userId: context?.userId,
            requestId,
            generationRunId,
            postId: request.post.postId,
            provider: initialPrimaryProvider,
            model: initialPrimaryModel,
            latencyMs: totalLatencyMs,
            errorCode,
            analysisMode: visionEnabled ? 'vision' : 'text',
            fallbackUsed: false,
            // May be undefined: the failure can happen before classification
            // runs (e.g. vision analysis itself failing with no text to fall
            // back to).
            niche: nicheResult?.primaryNiche,
            nicheConfidence: nicheResult?.confidence,
            nicheClassificationMethod: nicheResult?.classificationMethod,
            needsGenerationTimeClassification:
              nicheResult?.needsGenerationTimeClassification,
          })
          .catch((err) => {
            this.logger.warn(
              `Failed to track analytics failure event: ${(err as Error).message}`,
            );
          });
      }

      if (this.idempotencyService && idempotencyKeyHash) {
        await this.idempotencyService
          .handleFailure(userId, idempotencyKeyHash)
          .catch((err) => {
            this.logger.warn(
              `Failed to delete idempotency record on failure: ${(err as Error).message}`,
            );
          });
      }

      throw error;
    }
  }

  /**
   * Cảnh báo của pipeline (validation, duplicate, thiếu candidate) cộng với cảnh
   * báo vision fallback vốn đã có. `undefined` khi không có gì để nói — client cũ
   * kiểm sự tồn tại của field này.
   */
  private buildWarnings(
    analysisMode: 'text' | 'vision' | 'text_only_fallback',
    pipelineWarnings: string[],
  ): string[] | undefined {
    const warnings = [
      ...(analysisMode === 'text_only_fallback'
        ? ['Vision analysis failed. Fallback to text-only analysis was used.']
        : []),
      ...pipelineWarnings,
    ];

    return warnings.length > 0 ? warnings : undefined;
  }

  private buildAnalysis(
    nicheResult: NicheDetectionResult,
    analysisMode: 'text' | 'vision' | 'text_only_fallback',
    detectedLanguage: string,
    fallbackUsed: boolean,
  ): ReplyAnalysisDto {
    return {
      detectedLanguage,
      primaryNiche: nicheResult.primaryNiche,
      secondaryNiches: nicheResult.secondaryNiches,
      nicheConfidence: nicheResult.confidence,
      classificationMethod: nicheResult.classificationMethod,
      nicheEvidence: nicheResult.evidence,
      needsGenerationTimeClassification:
        nicheResult.needsGenerationTimeClassification,
      analysisMode: analysisMode === 'vision' ? 'text_and_vision' : 'text_only',
      visionUsed: analysisMode === 'vision',
      fallbackUsed: fallbackUsed || nicheResult.fallbackUsed,
    };
  }

  /**
   * Flattens the vision analysis into plain text the niche cascade can scan.
   * Only the descriptive parts — never the generated reply strategy, which
   * would bias detection toward whatever the vision model already assumed.
   */
  private buildVisionText(visionContext?: VisionContext): string | undefined {
    if (!visionContext) return undefined;

    const parts = [
      visionContext.summary,
      visionContext.topic,
      visionContext.theme,
      visionContext.imageAnalysis?.summary,
      visionContext.imageAnalysis?.visibleText,
      ...(visionContext.imageAnalysis?.importantObjects ?? []),
      visionContext.combinedContext?.topic,
    ].filter((part): part is string => Boolean(part && part.trim()));

    return parts.length > 0 ? parts.join(' ') : undefined;
  }

  private buildVisionDto(
    request: NormalizedReplyPackRequest,
  ): AnalyzeVisionDto {
    const media = (request.post.media ?? [])
      .filter((m) => m.type === 'image')
      .map((m) => ({
        type: 'image' as const,
        url: m.url,
      }));

    // Options đã được `normalizeReplyPackRequest` chuẩn hoá — không cần narrow lại.
    const options = {
      tone: request.options.tone,
      niche: request.options.niche,
      maxSuggestions: request.options.maxSuggestions,
      targetCommentLanguage: request.options.targetLanguage,
      explanationLanguage: request.options.explanationLanguage,
    };

    const post = {
      platform: request.post.platform,
      text: request.post.text,
      authorName: request.post.author?.name,
      authorHandle: request.post.author?.handle,
      url: request.post.url,
    };

    return {
      post,
      media,
      options,
    };
  }
}
