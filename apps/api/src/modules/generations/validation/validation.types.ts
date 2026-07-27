import type {
  CandidatePostContext,
  CandidateVisionContext,
  GeneratedCandidate,
} from '../candidates/candidate.types';
import type { ResolvedNichePolicy } from '../niche/niche-policy.interface';
import type { EmojiLevel, ReplyLength } from '../types/style.types';

/**
 * Contract của Phase 5 — validation, safety, duplicate.
 *
 * Toàn bộ phase này deterministic: không một LLM call nào, không chạm network.
 */

/** Mã lý do reject. Ổn định để log/analytics đếm được, không phải câu văn. */
export const REJECT_CODES = [
  'missing_text',
  'missing_referenced_concept',
  'generic_referenced_concept',
  'length_out_of_band',
  'emoji_over_limit',
  'user_blocked_phrase',
  'cliche_opener',
  'niche_safety',
  'global_safety',
  'fabricated_specifics',
  'duplicate_exact',
  'duplicate_jaccard',
  'duplicate_embedding',
] as const;

export type RejectCode = (typeof REJECT_CODES)[number];

export interface RejectReason {
  code: RejectCode;
  /** Một câu người đọc log hiểu được, kèm bằng chứng cụ thể. */
  detail: string;
}

/**
 * Cảnh báo mức batch — không loại candidate nào, nhưng Phase 6 và response
 * `warnings[]` đều đọc.
 */
export const WARNING_CODES = [
  'vision_not_referenced',
  'batch_opener_repetition',
  'below_target_count',
  'length_band_relaxed',
] as const;

export type WarningCode = (typeof WARNING_CODES)[number];

export interface ValidationWarning {
  code: WarningCode;
  message: string;
}

/**
 * Tín hiệu mức penalty: candidate vẫn hợp lệ nhưng Phase 6 phải trừ điểm.
 *
 * Doc Phase 5 chỉ có `validCandidates`/`rejectedCandidates`, tức mọi thứ "sáo
 * rỗng nhưng chưa tới mức loại" bị mất trắng giữa hai phase. Đây là kênh giữ
 * lại chúng.
 */
export interface CandidatePenalty {
  candidateId: string;
  /** `cliche_phrase`, `batch_opener_repetition`, `niche_safety`, … */
  code: string;
  detail: string;
}

export interface VisionAlignment {
  candidateId: string;
  /** Candidate có bám vào chi tiết chỉ có trong ảnh hay không. */
  aligned: boolean;
}

export type DuplicateMethod = 'exact' | 'jaccard';

export interface DuplicatePair {
  candidateAId: string;
  candidateBId: string;
  method: DuplicateMethod;
  /** `1` cho exact; Jaccard/cosine giữ nguyên giá trị đo được. */
  score: number;
}

export interface RejectedCandidate {
  candidate: GeneratedCandidate;
  reasons: RejectReason[];
}

export interface CandidateValidationInput {
  postContext: CandidatePostContext;
  visionContext?: CandidateVisionContext;
  nichePolicy: ResolvedNichePolicy;
  userBlockedPhrases: string[];
  /** Hai ràng buộc đo được mà prompt đã nói cho model (`reply-constraints.ts`). */
  constraints: { length: ReplyLength; emojiLevel: EmojiLevel };
  candidates: GeneratedCandidate[];
}

export interface CandidateValidationResult {
  validCandidates: GeneratedCandidate[];
  rejectedCandidates: RejectedCandidate[];
  duplicatePairs: DuplicatePair[];
  penalties: CandidatePenalty[];
  visionAlignment: VisionAlignment[];
  warnings: ValidationWarning[];
  /** Còn dưới `MIN_REPLY_COUNT` candidate hợp lệ → pipeline gọi selective retry. */
  needSelectiveRetry: boolean;
}

/**
 * `referencedConcept` chung chung ngang với không có: candidate không neo vào
 * chi tiết thật nào của bài post.
 */
export const GENERIC_CONCEPTS: readonly string[] = [
  'the post',
  'this post',
  'the tweet',
  'this tweet',
  'the topic',
  'this topic',
  'the content',
  'the message',
  'the idea',
  'general',
  'n/a',
  'none',
  'bài viết',
  'bài post',
  'nội dung',
];
