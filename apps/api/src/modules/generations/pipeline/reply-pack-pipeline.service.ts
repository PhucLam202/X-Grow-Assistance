import { Injectable, Logger } from '@nestjs/common';
import type { AiExecutionMetadata } from '../../../ai/ai.types';
import { ApplicationError } from '../../../common/errors/application.error';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { CandidateGenerationService } from '../candidates/candidate-generation.service';
import { SelectiveRetryService } from '../candidates/selective-retry.service';
import type {
  CandidateAnalysis,
  CandidateGenerationInput,
  CandidateNicheDecision,
  GeneratedCandidate,
} from '../candidates/candidate.types';
import { DiversityRankingService } from '../scoring/diversity-ranking.service';
import { FinalScoreService } from '../scoring/final-score.service';
import type { ScoredCandidate } from '../scoring/scoring.types';
import { MIN_REPLY_COUNT } from '../types/style.types';
import { CandidateValidatorService } from '../validation/candidate-validator.service';
import type {
  CandidatePenalty,
  CandidateValidationResult,
  ValidationWarning,
} from '../validation/validation.types';

export interface ReplyPackPipelineResult {
  suggestions: ScoredCandidate[];
  /** Penalty mức mềm của Phase 5 — mapper dùng để tính `risk`. */
  penalties: CandidatePenalty[];
  analysis?: CandidateAnalysis;
  resolvedNiche?: CandidateNicheDecision;
  execution: AiExecutionMetadata;
  warnings: string[];
  stats: {
    generated: number;
    rejected: number;
    duplicates: number;
    retryUsed: boolean;
    /** Mọi candidate trả về đều dùng cùng một phương pháp, nên đây là một giá trị. */
    scoringMethod: ScoredCandidate['scoringMethod'] | 'mixed';
  };
}

/**
 * Chuỗi Phase 4 → 5 → 6, và là NƠI DUY NHẤT quyết định có retry hay không.
 *
 * Vì sao quyết định đó không nằm ở `CandidateGenerationService`: chỉ sau khi
 * validation chạy mới biết còn mấy candidate DÙNG ĐƯỢC. Bản trước đây retry dựa
 * trên số candidate parse được, nên một batch 4 cái mà 3 cái bị validation loại
 * thì không bao giờ được sinh bù — đúng ngược lại ý của doc Phase 5.
 *
 * Ngân sách LLM: 1 call (+1 nếu provider chính lỗi retryable, +1 selective retry
 * tối đa một lần). Phase 5 và 6 không gọi LLM.
 */
@Injectable()
export class ReplyPackPipelineService {
  private readonly logger = new Logger(ReplyPackPipelineService.name);

  constructor(
    private readonly generation: CandidateGenerationService,
    private readonly selectiveRetry: SelectiveRetryService,
    private readonly validator: CandidateValidatorService,
    private readonly scoring: FinalScoreService,
    private readonly ranking: DiversityRankingService,
  ) {}

  async run(input: CandidateGenerationInput): Promise<ReplyPackPipelineResult> {
    const generated = await this.generation.generate(input);

    const constraints = {
      length: input.options.length,
      emojiLevel: input.options.emojiLevel,
    };

    const validateBatch = (
      candidates: GeneratedCandidate[],
    ): Promise<CandidateValidationResult> =>
      this.validator.validate({
        postContext: input.postContext,
        ...(input.visionContext ? { visionContext: input.visionContext } : {}),
        nichePolicy: input.nichePolicy,
        userBlockedPhrases: input.userStyle?.blockedPhrases ?? [],
        constraints,
        candidates,
      });

    let validation = await validateBatch(generated.candidates);
    let retryUsed = false;

    if (validation.needSelectiveRetry) {
      const kept = new Set(validation.validCandidates.map((c) => c.slotId));
      const missingSlots = generated.slots.filter(
        (slot) => !kept.has(slot.slotId),
      );

      const retry = await this.selectiveRetry.retryMissing({
        input,
        existing: validation.validCandidates,
        missingSlots,
        provider: generated.provider,
        fallbackNiche:
          generated.resolvedNiche?.niche ?? input.nichePolicy.niche,
        fallbackNicheConfidence:
          generated.resolvedNiche?.confidence ?? input.nicheResult.confidence,
      });

      retryUsed = retry.attempted;

      if (retry.candidates.length > 0) {
        // Validate lại CẢ BỘ, không chỉ phần mới: candidate mới có thể trùng với
        // candidate cũ, và duplicate chỉ nhìn thấy được khi so cả hai.
        validation = await validateBatch([
          ...validation.validCandidates,
          ...retry.candidates,
        ]);
      }
    }

    if (validation.validCandidates.length === 0) {
      throw new ApplicationError(
        ErrorCodes.GENERATION_FAILED,
        'Every generated reply was rejected by validation. ' +
          this.summariseRejections(validation),
        true,
        502,
      );
    }

    const scored = this.scoring.scoreAll({
      postContext: input.postContext,
      ...(input.visionContext ? { visionContext: input.visionContext } : {}),
      nichePolicy: input.nichePolicy,
      ...(input.userStyle ? { userStyle: input.userStyle } : {}),
      candidates: validation.validCandidates,
      penalties: validation.penalties,
      visionAlignment: validation.visionAlignment,
    });

    const ranked = this.ranking.rank({
      candidates: scored,
      target: input.options.replyCount,
      hasVision: Boolean(input.visionContext),
    });

    if (ranked.selected.length < MIN_REPLY_COUNT) {
      // Không phải lỗi: doc Phase 1 nói `replyCount` là mục tiêu, không phải cam
      // kết. Trả phần hợp lệ kèm cảnh báo.
      this.logger.warn(
        `Returning ${ranked.selected.length} replies (target ` +
          `${input.options.replyCount}). ${this.summariseRejections(validation)}`,
      );
    }

    return {
      suggestions: ranked.selected,
      penalties: validation.penalties,
      ...(generated.analysis ? { analysis: generated.analysis } : {}),
      ...(generated.resolvedNiche
        ? { resolvedNiche: generated.resolvedNiche }
        : {}),
      execution: generated.execution,
      warnings: this.buildWarnings(
        validation,
        ranked.selected.length,
        input,
        generated.candidates.length,
      ),
      stats: {
        generated: generated.candidates.length,
        rejected: validation.rejectedCandidates.length,
        duplicates: validation.duplicatePairs.length,
        retryUsed,
        scoringMethod: this.summariseScoringMethod(ranked.selected),
      },
    };
  }

  private buildWarnings(
    validation: CandidateValidationResult,
    returned: number,
    input: CandidateGenerationInput,
    generated: number,
  ): string[] {
    const warnings = validation.warnings.map(
      (warning: ValidationWarning) => warning.message,
    );

    const target = input.options.replyCount;

    if (returned < target) {
      // Phân biệt hai nguyên nhân khác nhau hẳn: model sinh ít, hay validation
      // loại bớt. Gộp chúng thành một câu "did not pass validation" là báo sai
      // khi rejected = 0.
      const cause =
        validation.rejectedCandidates.length === 0 && generated <= returned
          ? 'the model returned fewer than requested'
          : `${validation.rejectedCandidates.length} did not pass validation`;

      warnings.push(
        `Returned ${returned} of ${target} requested replies; ${cause}.`,
      );
    }

    return warnings;
  }

  private summariseScoringMethod(
    candidates: ScoredCandidate[],
  ): ScoredCandidate['scoringMethod'] | 'mixed' {
    const methods = new Set(candidates.map((c) => c.scoringMethod));
    if (methods.size === 1) return [...methods][0];
    return 'mixed';
  }

  /** Gom lý do reject thành một câu đủ để debug từ log production. */
  private summariseRejections(validation: CandidateValidationResult): string {
    const counts = new Map<string, number>();

    for (const rejected of validation.rejectedCandidates) {
      for (const reason of rejected.reasons) {
        counts.set(reason.code, (counts.get(reason.code) ?? 0) + 1);
      }
    }

    if (counts.size === 0) return 'No rejection reasons were recorded.';

    return `Reasons: ${[...counts]
      .map(([code, count]) => `${code}×${count}`)
      .join(', ')}.`;
  }
}
