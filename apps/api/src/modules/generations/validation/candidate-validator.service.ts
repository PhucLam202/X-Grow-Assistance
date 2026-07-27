import { Injectable } from '@nestjs/common';
import type { GeneratedCandidate } from '../candidates/candidate.types';
import {
  EMOJI_MAX,
  LENGTH_WORD_BANDS,
  countEmoji,
  countWords,
} from '../types/reply-constraints';
import { MIN_REPLY_COUNT } from '../types/style.types';
import { detectCliches } from './ai-cliche-detector';
import { CandidateRetentionService } from './candidate-retention.service';
import { findExactDuplicates } from './exact-duplicate-detector';
import { FactualityFilterService } from './factuality-filter.service';
import { findJaccardDuplicates } from './jaccard-duplicate-detector';
import { SafetyFilterService } from './safety-filter.service';
import { normalizeForCompare } from './text-normalizer';
import { checkVisionAlignment } from './vision-alignment-checker';
import {
  GENERIC_CONCEPTS,
  type CandidatePenalty,
  type CandidateValidationInput,
  type CandidateValidationResult,
  type DuplicatePair,
  type RejectReason,
  type ValidationWarning,
} from './validation.types';

/**
 * Phase 5 — cổng duy nhất mà pipeline gọi.
 *
 * Thứ tự có chủ đích: mọi filter RẺ chạy trước, duplicate chạy sau cùng. Hai
 * lý do — candidate đã bị loại vì length/safety thì không cần đem đi so trùng,
 * và (quan trọng hơn) một candidate đã chết không được phép loại tiếp ai (xem
 * `candidate-retention.service.ts`).
 *
 * Không có LLM call nào trong phase này.
 */
@Injectable()
export class CandidateValidatorService {
  constructor(
    private readonly safetyFilter: SafetyFilterService,
    private readonly factualityFilter: FactualityFilterService,
    private readonly retention: CandidateRetentionService,
  ) {}

  async validate(
    input: CandidateValidationInput,
  ): Promise<CandidateValidationResult> {
    const rejects = new Map<string, RejectReason[]>();
    const penalties: CandidatePenalty[] = [];
    const warnings: ValidationWarning[] = [];

    // ── Tầng 1: schema + ràng buộc đo được ─────────────────────────────────
    for (const candidate of input.candidates) {
      const reasons = this.checkShape(candidate, input);
      if (reasons.length > 0) rejects.set(candidate.id, reasons);
    }

    const shapeOk = input.candidates.filter((c) => !rejects.has(c.id));

    // ── Tầng 2: giọng AI / blocked phrase ──────────────────────────────────
    const cliche = detectCliches({
      candidates: shapeOk,
      policyAvoidPhrases: input.nichePolicy.avoidPhrases,
      userBlockedPhrases: input.userBlockedPhrases,
    });

    merge(rejects, cliche.rejects);
    penalties.push(...cliche.penalties);

    if (cliche.batchOpenerRepeated) {
      warnings.push({
        code: 'batch_opener_repetition',
        message:
          'More than half of the generated replies opened the same way; the ' +
          'batch reads repetitive.',
      });
    }

    // ── Tầng 3: safety theo niche ──────────────────────────────────────────
    const alive = () => input.candidates.filter((c) => !rejects.has(c.id));

    const safety = this.safetyFilter.filter(alive(), input.nichePolicy);
    merge(rejects, safety.rejects);
    penalties.push(...safety.penalties);

    // ── Tầng 4: bịa đặt ────────────────────────────────────────────────────
    merge(
      rejects,
      this.factualityFilter.filter({
        candidates: alive(),
        postContext: input.postContext,
        visionContext: input.visionContext,
        nichePolicy: input.nichePolicy,
      }),
    );

    // ── Tầng 5: vision alignment (cảnh báo, không loại) ────────────────────
    const survivors = alive();
    const vision = checkVisionAlignment(survivors, input.visionContext);

    if (vision.noneAligned) {
      warnings.push({
        code: 'vision_not_referenced',
        message:
          'The post has an image but no reply engages anything that only ' +
          'appears in it.',
      });
    }

    // ── Tầng 6: duplicate ──────────────────────────────────────────────────
    // ponytail: exact + lexical only. Semantic (embedding) duplicate detection
    // goes back in when an embedding provider actually exists.
    const duplicatePairs: DuplicatePair[] = [
      ...findExactDuplicates(survivors),
      ...findJaccardDuplicates(survivors),
    ];

    let retained = this.retention.retain({
      candidates: input.candidates,
      rejects,
      duplicatePairs: dedupePairs(duplicatePairs),
    });

    // ── Van an toàn: length không được phép xoá sạch batch ─────────────────
    const relaxable = this.relaxableForLength(retained);

    if (relaxable.length > 0) {
      for (const candidate of relaxable) rejects.delete(candidate.id);

      retained = this.retention.retain({
        candidates: input.candidates,
        rejects,
        duplicatePairs: dedupePairs(duplicatePairs),
      });

      warnings.push({
        code: 'length_band_relaxed',
        message:
          `Every reply fell outside the ${input.constraints.length} word ` +
          'band, so the band was relaxed rather than returning nothing. The ' +
          'replies may read longer or shorter than requested.',
      });
    }

    if (retained.needSelectiveRetry) {
      warnings.push({
        code: 'below_target_count',
        message:
          `Only ${retained.validCandidates.length} of ` +
          `${input.candidates.length} replies passed validation ` +
          `(minimum ${MIN_REPLY_COUNT}).`,
      });
    }

    return {
      validCandidates: retained.validCandidates,
      rejectedCandidates: retained.rejectedCandidates,
      duplicatePairs: dedupePairs(duplicatePairs),
      // Penalty của candidate đã bị loại không còn ý nghĩa với Phase 6.
      penalties: penalties.filter((p) =>
        retained.validCandidates.some((c) => c.id === p.candidateId),
      ),
      visionAlignment: vision.alignment,
      warnings,
      needSelectiveRetry: retained.needSelectiveRetry,
    };
  }

  /**
   * Candidate nào được cứu khi length là thứ DUY NHẤT giết cả batch.
   *
   * `LENGTH_WORD_BANDS` là ước lượng quy đổi theo hệ chữ, và luôn còn ngôn ngữ
   * chưa được hiệu chỉnh — chữ Tạng từng đếm ra 1 từ cho cả câu, đủ để mọi
   * request tiếng Tạng trả 502. Một reply hơi lệch độ dài vẫn dùng được; không
   * có reply nào thì không.
   *
   * Trả mảng rỗng khi còn candidate sống bình thường (band vẫn đang làm đúng
   * việc của nó) hoặc khi có candidate chết vì lý do khác — safety, bịa đặt và
   * trùng lặp không bao giờ được nới.
   */
  private relaxableForLength(
    retained: { validCandidates: GeneratedCandidate[] } & {
      rejectedCandidates: Array<{
        candidate: GeneratedCandidate;
        reasons: RejectReason[];
      }>;
    },
  ): GeneratedCandidate[] {
    if (retained.validCandidates.length > 0) return [];
    if (retained.rejectedCandidates.length === 0) return [];

    const allOnlyLength = retained.rejectedCandidates.every((rejected) =>
      rejected.reasons.every((reason) => reason.code === 'length_out_of_band'),
    );

    if (!allOnlyLength) return [];

    return retained.rejectedCandidates.map((rejected) => rejected.candidate);
  }

  /** Schema + length + emoji. Tất cả đều là dữ kiện đo được, không phán xét. */
  private checkShape(
    candidate: GeneratedCandidate,
    input: CandidateValidationInput,
  ): RejectReason[] {
    const reasons: RejectReason[] = [];

    if (!candidate.text.trim()) {
      reasons.push({ code: 'missing_text', detail: 'Reply text is empty.' });
      // Không đo length/emoji của chuỗi rỗng — mọi con số sau đó đều vô nghĩa.
      return reasons;
    }

    if (!candidate.referencedConcept.trim()) {
      reasons.push({
        code: 'missing_referenced_concept',
        detail: 'referencedConcept is empty.',
      });
    } else if (this.isGenericConcept(candidate.referencedConcept)) {
      reasons.push({
        code: 'generic_referenced_concept',
        detail:
          `referencedConcept "${candidate.referencedConcept}" names nothing ` +
          'concrete from the post.',
      });
    }

    const band = LENGTH_WORD_BANDS[input.constraints.length];
    const words = countWords(candidate.text);

    if (words < band.min || words > band.max) {
      reasons.push({
        code: 'length_out_of_band',
        detail:
          `${words} words is outside the ${input.constraints.length} band ` +
          `(${band.min}-${band.max}).`,
      });
    }

    const emojiLimit = EMOJI_MAX[input.constraints.emojiLevel];
    const emoji = countEmoji(candidate.text);

    if (emoji > emojiLimit) {
      reasons.push({
        code: 'emoji_over_limit',
        detail:
          `${emoji} emoji exceeds the ${input.constraints.emojiLevel} limit ` +
          `of ${emojiLimit}.`,
      });
    }

    return reasons;
  }

  private isGenericConcept(concept: string): boolean {
    const normalized = normalizeForCompare(concept);
    return GENERIC_CONCEPTS.some(
      (generic) => normalized === normalizeForCompare(generic),
    );
  }
}

function merge(
  target: Map<string, RejectReason[]>,
  source: Map<string, RejectReason[]>,
): void {
  for (const [id, reasons] of source) {
    target.set(id, [...(target.get(id) ?? []), ...reasons]);
  }
}

/**
 * Cùng một cặp có thể bị cả ba tầng bắt. Giữ lần bắt ĐẦU TIÊN theo thứ tự
 * exact → jaccard → embedding, tức phương pháp rẻ nhất và chắc nhất được ghi
 * công.
 */
function dedupePairs(pairs: DuplicatePair[]): DuplicatePair[] {
  const seen = new Set<string>();
  const out: DuplicatePair[] = [];

  for (const pair of pairs) {
    const key = [pair.candidateAId, pair.candidateBId].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pair);
  }

  return out;
}
