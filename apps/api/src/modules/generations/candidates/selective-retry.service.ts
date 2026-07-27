import { Injectable, Logger } from '@nestjs/common';
import type { AiProvider } from '../../../ai/providers/ai-provider.interface';
import { CandidatePromptBuilder } from './candidate-prompt.builder';
import { parseCandidates } from './candidate-output.parser';
import {
  CANDIDATE_TIMEOUT_MS,
  type CandidateGenerationInput,
  type GeneratedCandidate,
  type StrategySlot,
} from './candidate.types';

export interface SelectiveRetryContext {
  input: CandidateGenerationInput;
  existing: GeneratedCandidate[];
  missingSlots: StrategySlot[];
  provider: AiProvider;
  fallbackNiche: GeneratedCandidate['niche'];
  fallbackNicheConfidence: number;
}

export interface SelectiveRetryResult {
  candidates: GeneratedCandidate[];
  /**
   * Đã thực sự gọi provider hay chưa. Tách khỏi `candidates.length` để metadata
   * phân biệt được "gọi rồi nhưng thất bại" với "không có slot nào để gọi" —
   * bản cũ báo `retryUsed: true` cho cả hai.
   */
  attempted: boolean;
}

/**
 * Ngoại lệ duy nhất được phép vượt ngân sách "1 LLM call": chỉ sinh bù đúng
 * phần slot còn thiếu, tối đa 1 lần, và chỉ khi validation đã kéo số candidate
 * hợp lệ xuống dưới ngưỡng. Không bao giờ regenerate cả batch.
 */
@Injectable()
export class SelectiveRetryService {
  private readonly logger = new Logger(SelectiveRetryService.name);

  constructor(private readonly promptBuilder: CandidatePromptBuilder) {}

  async retryMissing(
    context: SelectiveRetryContext,
  ): Promise<SelectiveRetryResult> {
    const { input, existing, missingSlots, provider } = context;

    if (missingSlots.length === 0 || !provider.generateStructured) {
      return { candidates: [], attempted: false };
    }

    const basePrompt = this.promptBuilder.build(input, missingSlots, {
      includeAnalysis: false,
    });
    const alreadyWritten = existing
      .map((candidate) => `- ${candidate.text}`)
      .join('\n');

    const prompt = alreadyWritten
      ? `${basePrompt}\n\n═══ ALREADY WRITTEN ═══\n` +
        'These replies already exist. Do not repeat their angle, their opening, ' +
        `or their referenced detail:\n${alreadyWritten}`
      : basePrompt;

    try {
      const result = await provider.generateStructured(prompt, {
        timeoutMs: CANDIDATE_TIMEOUT_MS,
      });

      const parsed = parseCandidates(result.content, {
        slots: missingSlots,
        // Niche đã chốt ở call đầu; retry không được phép đổi lại.
        expectNicheDecision: false,
        length: input.options.length,
        energy: input.options.energy,
        fallbackNiche: context.fallbackNiche,
        fallbackNicheConfidence: context.fallbackNicheConfidence,
        attempt: 2,
      });

      return { candidates: parsed.candidates, attempted: true };
    } catch (error) {
      // Retry thất bại không được làm hỏng kết quả đã có — caller trả về những
      // gì đang cầm, theo error contract của Phase 1.
      this.logger.warn(
        `Selective retry failed: ${(error as Error).message}. ` +
          `Returning ${existing.length} candidate(s) from the first call.`,
      );
      return { candidates: [], attempted: true };
    }
  }
}
