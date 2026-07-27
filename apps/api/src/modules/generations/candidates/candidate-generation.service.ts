import { Injectable, Logger } from '@nestjs/common';
import { AiConfigService } from '../../../ai/ai.config';
import { AiProviderRegistry } from '../../../ai/ai-provider.registry';
import { AiProviderError } from '../../../ai/ai.types';
import type {
  AiExecutionMetadata,
  AiProviderResult,
} from '../../../ai/ai.types';
import type { AiProvider } from '../../../ai/providers/ai-provider.interface';
import { ApplicationError } from '../../../common/errors/application.error';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { resolveCandidateCount } from './candidate-count.resolver';
import { parseCandidates } from './candidate-output.parser';
import { CandidatePromptBuilder } from './candidate-prompt.builder';
import { buildStrategySlots } from './strategy-slot.builder';
import {
  CANDIDATE_TIMEOUT_MS,
  type CandidateGenerationInput,
  type CandidateGenerationResult,
  type GeneratedCandidate,
} from './candidate.types';

/**
 * Sinh 3–4 candidate bằng MỘT LLM call, kèm self-score, analysis của bài post,
 * và (khi Phase 2 chưa chắc chắn) cả quyết định niche cuối cùng.
 *
 * Ngân sách call, tính theo lượt gọi provider:
 *   1 call chính  (+1 nếu phải fallback sang provider dự phòng — chỉ khi lỗi
 *                  retryable, y hệt `ai-reply-pack.service.ts`)
 *
 * Selective retry KHÔNG nằm ở đây. Chỉ sau validation (Phase 5) mới biết còn
 * mấy candidate thực sự dùng được, nên `ReplyPackPipelineService` sở hữu quyết
 * định đó và service này trả kèm `slots` + `provider` để nó chạy được.
 */
@Injectable()
export class CandidateGenerationService {
  private readonly logger = new Logger(CandidateGenerationService.name);

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly providerRegistry: AiProviderRegistry,
    private readonly promptBuilder: CandidatePromptBuilder,
  ) {}

  async generate(
    input: CandidateGenerationInput,
  ): Promise<CandidateGenerationResult> {
    const count = resolveCandidateCount({
      postContext: input.postContext,
      visionContext: input.visionContext,
      requested: input.options.replyCount,
    });

    const slots = buildStrategySlots(count, {
      tone: input.options.tone,
      intent: input.options.intent,
      policy: input.nichePolicy,
    });

    const prompt = this.promptBuilder.build(input, slots);
    const { result, execution, provider } = await this.callProvider(prompt);

    const parsed = parseCandidates(result.content, {
      slots,
      expectNicheDecision: input.nicheResult.needsGenerationTimeClassification,
      length: input.options.length,
      energy: input.options.energy,
      fallbackNiche: input.nichePolicy.niche,
      fallbackNicheConfidence: input.nicheResult.confidence,
      attempt: 1,
    });

    return {
      candidates: this.sortBySlot(parsed.candidates, slots),
      ...(parsed.analysis ? { analysis: parsed.analysis } : {}),
      ...(parsed.resolvedNiche ? { resolvedNiche: parsed.resolvedNiche } : {}),
      execution,
      slots,
      provider,
    };
  }

  /**
   * Chọn provider + fallback. Provider không implement `generateStructured`
   * (openrouter chỉ làm vision) được coi như không dùng được và nhường cho
   * fallback, thay vì crash.
   */
  private async callProvider(prompt: string): Promise<{
    result: AiProviderResult;
    execution: AiExecutionMetadata;
    provider: AiProvider;
  }> {
    const primaryName = this.aiConfig.getTextProviderName();
    const primaryModel = this.aiConfig.getTextProviderEndpoint().model;

    const fallbackConfig = this.aiConfig.getTextFallbackConfig();
    const canAttemptFallback =
      fallbackConfig !== null && fallbackConfig.provider !== primaryName;

    const base: AiExecutionMetadata = {
      primaryProvider: primaryName,
      primaryModel,
      finalProvider: primaryName,
      finalModel: primaryModel,
      fallbackUsed: false,
      attemptCount: 1,
    };

    let primaryError: unknown;

    try {
      const provider = this.providerRegistry.get(primaryName);
      const result = await this.run(provider, prompt);
      return {
        result,
        provider,
        execution: { ...base, replyPackUsage: result.usage },
      };
    } catch (error) {
      primaryError = error;
    }

    const retryable =
      primaryError instanceof AiProviderError && primaryError.isRetryable;

    if (!canAttemptFallback || !retryable) {
      throw this.toApplicationError(primaryError, primaryName);
    }

    this.logger.warn(
      `Candidate generation falling back from ${primaryName} to ` +
        `${fallbackConfig.provider}: ${(primaryError as Error).message}`,
    );

    try {
      const provider = this.providerRegistry.get(fallbackConfig.provider);
      const result = await this.run(provider, prompt);
      return {
        result,
        provider,
        execution: {
          ...base,
          finalProvider: fallbackConfig.provider,
          finalModel: fallbackConfig.model,
          fallbackUsed: true,
          fallbackReason: (primaryError as Error).message,
          attemptCount: 2,
          replyPackUsage: result.usage,
        },
      };
    } catch (fallbackError) {
      throw this.toApplicationError(fallbackError, fallbackConfig.provider);
    }
  }

  private run(provider: AiProvider, prompt: string): Promise<AiProviderResult> {
    if (!provider.generateStructured) {
      // Retryable để fallback có cơ hội chạy — nhưng log warn, vì một provider
      // text được cấu hình mà không hỗ trợ structured là lỗi cấu hình, không
      // phải sự cố thoáng qua.
      this.logger.warn(
        `Provider ${provider.name} does not support generateStructured; ` +
          'candidate generation will try the fallback provider.',
      );
      return Promise.reject(
        new AiProviderError(
          `Provider ${provider.name} does not support structured generation`,
          {
            providerName: provider.name,
            code: ErrorCodes.AI_UNSUPPORTED_CAPABILITY,
            isRetryable: true,
          },
        ),
      );
    }

    return provider.generateStructured(prompt, {
      timeoutMs: CANDIDATE_TIMEOUT_MS,
    });
  }

  private toApplicationError(error: unknown, provider: string): Error {
    if (error instanceof ApplicationError) return error;

    if (error instanceof AiProviderError) {
      return new ApplicationError(
        error.code,
        error.message,
        error.isRetryable,
        error.statusCode ?? 502,
        error,
      );
    }

    return new ApplicationError(
      ErrorCodes.GENERATION_FAILED,
      `Candidate generation failed on ${provider}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
      false,
      502,
      error,
    );
  }

  private sortBySlot(
    candidates: GeneratedCandidate[],
    slots: { slotId: string }[],
  ): GeneratedCandidate[] {
    const order = new Map(slots.map((slot, index) => [slot.slotId, index]));
    return [...candidates].sort(
      (a, b) => (order.get(a.slotId) ?? 0) - (order.get(b.slotId) ?? 0),
    );
  }
}
